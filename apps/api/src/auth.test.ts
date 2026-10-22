import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import { useTestDatabase } from './test-db.ts'

const root = mkdtempSync(join(tmpdir(), 'solstice-auth-'))
process.env.MAIL_DIR = join(root, 'mail')
process.env.NODE_ENV = 'test'
process.env.DEV_MAILBOX = '1'
delete process.env.TRUST_PROXY
delete process.env.SMTP_URL

// The pool captures DATABASE_URL at import time, so the test database has to exist
// before db.ts is loaded.
const testDb = await useTestDatabase()

const { createApp } = await import('./app.ts')
const { closePool, migrate, query, queryOne } = await import('./db.ts')
const { createMemoryStore } = await import('./rate-limit.ts')

await migrate()

after(async () => {
  await closePool()
  await testDb.drop()
  rmSync(root, { recursive: true, force: true })
})

const JSON_HEADERS = { 'content-type': 'application/json' }

// Each test gets its own limiter, otherwise the shared client key accumulates
// across tests and later cases start hitting 429.
function freshApp() {
  return createApp({ rateLimitStore: createMemoryStore() })
}

function post(app: ReturnType<typeof freshApp>, path: string, body: unknown, headers = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body),
  })
}

function sessionCookie(response: Response) {
  const header = response.headers.get('set-cookie')
  assert.ok(header, 'expected a Set-Cookie header')
  return header.split(';')[0] ?? ''
}

// Matched on recipient rather than position: the mailbox is shared across the
// whole file, so "the newest message" is not necessarily this test's message.
async function mailboxMessage(app: ReturnType<typeof freshApp>, email: string, subject: string) {
  const mailbox = await app.request('/api/dev/mailbox?limit=100')
  const { messages } = (await mailbox.json()) as {
    messages: { to: string; subject: string; text: string }[]
  }
  const message = messages.find((entry) => entry.to === email && entry.subject === subject)
  assert.ok(message, `expected a "${subject}" email for ${email}`)
  return message.text
}

async function verificationCode(app: ReturnType<typeof freshApp>, email: string) {
  // The code sits alone on its own line; a looser match would also catch a
  // six-digit run inside the confirmation link's token.
  const code = (
    await mailboxMessage(app, email, 'Confirm your VPS Panel email')
  ).match(/^\s*(\d{6})\s*$/m)?.[1]
  assert.ok(code, 'expected a 6-digit code on its own line')
  return code
}

async function verificationToken(app: ReturnType<typeof freshApp>, email: string) {
  const link = (
    await mailboxMessage(app, email, 'Confirm your VPS Panel email')
  ).match(/https?:\/\/\S*verify-email\S*/)?.[0]
  assert.ok(link, 'expected a confirmation link in the email')

  const token = new URL(link).searchParams.get('token')
  assert.ok(token, 'expected a token in the confirmation link')
  return token
}

async function loginCode(app: ReturnType<typeof freshApp>, email: string) {
  const code = (
    await mailboxMessage(app, email, 'Sign in to VPS Panel')
  ).match(/^\s*(\d{6})\s*$/m)?.[1]
  assert.ok(code, 'expected a 6-digit sign-in code on its own line')
  return code
}

async function loginLinkToken(app: ReturnType<typeof freshApp>, email: string) {
  const link = (await mailboxMessage(app, email, 'Sign in to VPS Panel')).match(
    /https?:\/\/\S*\/login\?token=\S*/,
  )?.[0]
  assert.ok(link, 'expected a sign-in link in the email')

  const token = new URL(link).searchParams.get('token')
  assert.ok(token, 'expected a token in the sign-in link')
  return token
}

async function userIdFor(email: string) {
  const row = await queryOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [
    email,
  ])
  assert.ok(row, `expected a user row for ${email}`)
  return row.id
}

function wrongCode(code: string) {
  return String((Number(code) + 1) % 1_000_000).padStart(6, '0')
}

async function registerAndVerify(app: ReturnType<typeof freshApp>, email: string) {
  const response = await post(app, '/api/auth/register', { name: 'Test User', email })
  assert.equal(response.status, 201)

  const code = await verificationCode(app, email)
  const verified = await post(app, '/api/auth/verify-email', { email, code })
  assert.equal(verified.status, 200)
  return sessionCookie(verified)
}

describe('health', () => {
  it('reports the database version and mail transport', async () => {
    const response = await freshApp().request('/api/health')
    assert.equal(response.status, 200)

    const body = (await response.json()) as { ok: boolean; database: string; mail: string }
    assert.equal(body.ok, true)
    assert.match(body.database, /^postgres /)
    assert.equal(body.mail, 'file')
  })
})

describe('register', () => {
  it('creates an unconfirmed account, emails a code, and issues no session', async () => {
    const app = freshApp()
    const response = await post(app, '/api/auth/register', {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })

    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), { email: 'ada@example.com' })
    assert.equal(response.headers.get('set-cookie'), null, 'registering must not sign anyone in')
    assert.match(await verificationCode(app, 'ada@example.com'), /^\d{6}$/)
  })

  it('rejects a duplicate address regardless of case', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'dupe@example.com')

    const response = await post(app, '/api/auth/register', {
      name: 'Other',
      email: 'DUPE@example.com',
    })

    assert.equal(response.status, 409)
    const body = (await response.json()) as { fieldErrors: Record<string, string> }
    assert.match(body.fieldErrors.email ?? '', /already registered/)
  })

  it('reports every invalid field at once', async () => {
    const response = await post(freshApp(), '/api/auth/register', {
      name: '',
      email: 'not-an-email',
    })

    assert.equal(response.status, 422)
    const body = (await response.json()) as { fieldErrors: Record<string, string> }
    assert.ok(body.fieldErrors.name)
    assert.ok(body.fieldErrors.email)
  })
})

describe('email verification', () => {
  async function registerUnverified(app: ReturnType<typeof freshApp>, email: string) {
    const response = await post(app, '/api/auth/register', { name: 'Test User', email })
    assert.equal(response.status, 201)
    return verificationCode(app, email)
  }

  it('confirms the account and signs in with the emailed code', async () => {
    const app = freshApp()
    const code = await registerUnverified(app, 'confirm@example.com')

    const verified = await post(app, '/api/auth/verify-email', {
      email: 'confirm@example.com',
      code,
    })
    assert.equal(verified.status, 200)

    const body = (await verified.json()) as { user: { email: string; emailVerifiedAt: string } }
    assert.equal(body.user.email, 'confirm@example.com')
    assert.ok(body.user.emailVerifiedAt, 'the account must come back confirmed')

    const me = await app.request('/api/auth/me', { headers: { cookie: sessionCookie(verified) } })
    assert.equal(me.status, 200)
  })

  it('rejects a wrong code without signing anyone in', async () => {
    const app = freshApp()
    const code = await registerUnverified(app, 'wrongcode@example.com')

    const response = await post(app, '/api/auth/verify-email', {
      email: 'wrongcode@example.com',
      code: wrongCode(code),
    })
    assert.equal(response.status, 400)
    assert.equal(response.headers.get('set-cookie'), null)
  })

  it('rejects a malformed code before it reaches the account', async () => {
    const app = freshApp()
    await registerUnverified(app, 'malformed@example.com')

    const response = await post(app, '/api/auth/verify-email', {
      email: 'malformed@example.com',
      code: 'abc',
    })
    assert.equal(response.status, 422)
  })

  it('refuses a code that was already spent', async () => {
    const app = freshApp()
    const code = await registerUnverified(app, 'replay@example.com')

    const first = await post(app, '/api/auth/verify-email', { email: 'replay@example.com', code })
    assert.equal(first.status, 200)

    // Un-confirming first so the request reaches the code check rather than the
    // already-confirmed branch — otherwise this would not test replay at all.
    await query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [
      await userIdFor('replay@example.com'),
    ])

    const replay = await post(app, '/api/auth/verify-email', { email: 'replay@example.com', code })
    assert.equal(replay.status, 400)
  })

  it('refuses an expired code and says so', async () => {
    const app = freshApp()
    const code = await registerUnverified(app, 'expired@example.com')

    await query('UPDATE email_verifications SET expires_at = $1 WHERE user_id = $2', [
      new Date(Date.now() - 1000).toISOString(),
      await userIdFor('expired@example.com'),
    ])

    const response = await post(app, '/api/auth/verify-email', {
      email: 'expired@example.com',
      code,
    })
    assert.equal(response.status, 400)
    assert.match(((await response.json()) as { message: string }).message, /expired/)
  })

  it('burns the code after the attempt cap, even for the right digits', async () => {
    const app = freshApp()
    const code = await registerUnverified(app, 'attempts@example.com')
    const wrong = wrongCode(code)

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await post(app, '/api/auth/verify-email', {
        email: 'attempts@example.com',
        code: wrong,
      })
      assert.equal(response.status, 400, `attempt ${attempt} should be a plain mismatch`)
    }

    const correct = await post(app, '/api/auth/verify-email', {
      email: 'attempts@example.com',
      code,
    })
    assert.equal(correct.status, 429, 'the cap must hold even once the right code arrives')
  })

  it('answers identically when resending to an unknown address', async () => {
    const response = await post(freshApp(), '/api/auth/resend-verification', {
      email: 'nobody@example.com',
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
  })

  it('resend supersedes the previous code', async () => {
    const app = freshApp()
    const first = await registerUnverified(app, 'resend@example.com')

    const resent = await post(app, '/api/auth/resend-verification', {
      email: 'resend@example.com',
    })
    assert.equal(resent.status, 200)

    const stale = await post(app, '/api/auth/verify-email', {
      email: 'resend@example.com',
      code: first,
    })
    assert.equal(stale.status, 400, 'the superseded code must stop working')

    const fresh = await post(app, '/api/auth/verify-email', {
      email: 'resend@example.com',
      code: await verificationCode(app, 'resend@example.com'),
    })
    assert.equal(fresh.status, 200)
  })

  it('does not reveal whether an address is registered', async () => {
    const app = freshApp()
    const code = await registerUnverified(app, 'known@example.com')
    const wrong = wrongCode(code)

    const unknown = await post(app, '/api/auth/verify-email', {
      email: 'unknown@example.com',
      code: wrong,
    })
    const known = await post(app, '/api/auth/verify-email', {
      email: 'known@example.com',
      code: wrong,
    })

    assert.equal(unknown.status, known.status)
    assert.deepEqual(await unknown.json(), await known.json())
  })

  it('confirms the account from the emailed link', async () => {
    const app = freshApp()
    await registerUnverified(app, 'link@example.com')

    const confirmed = await post(app, '/api/auth/verify-email/link', {
      token: await verificationToken(app, 'link@example.com'),
    })
    assert.equal(confirmed.status, 200)

    const me = await app.request('/api/auth/me', {
      headers: { cookie: sessionCookie(confirmed) },
    })
    assert.equal(me.status, 200)
  })

  it('refuses a link token that was already spent', async () => {
    const app = freshApp()
    await registerUnverified(app, 'link-replay@example.com')
    const token = await verificationToken(app, 'link-replay@example.com')

    const first = await post(app, '/api/auth/verify-email/link', { token })
    assert.equal(first.status, 200)

    await query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [
      await userIdFor('link-replay@example.com'),
    ])

    const replay = await post(app, '/api/auth/verify-email/link', { token })
    assert.equal(replay.status, 400)
  })

  it('refuses an expired link', async () => {
    const app = freshApp()
    await registerUnverified(app, 'link-expired@example.com')
    const token = await verificationToken(app, 'link-expired@example.com')

    await query('UPDATE email_verifications SET expires_at = $1 WHERE user_id = $2', [
      new Date(Date.now() - 1000).toISOString(),
      await userIdFor('link-expired@example.com'),
    ])

    const response = await post(app, '/api/auth/verify-email/link', { token })
    assert.equal(response.status, 400)
    assert.match(((await response.json()) as { message: string }).message, /expired/)
  })

  it('refuses an unknown link token', async () => {
    const response = await post(freshApp(), '/api/auth/verify-email/link', {
      token: 'not-a-real-token',
    })
    assert.equal(response.status, 400)
  })

  it('retires the code once the link has been used', async () => {
    const app = freshApp()
    const code = await registerUnverified(app, 'link-then-code@example.com')

    const viaLink = await post(app, '/api/auth/verify-email/link', {
      token: await verificationToken(app, 'link-then-code@example.com'),
    })
    assert.equal(viaLink.status, 200)

    await query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [
      await userIdFor('link-then-code@example.com'),
    ])

    // Both credentials live on the same row, so spending one spends the other.
    const viaCode = await post(app, '/api/auth/verify-email', {
      email: 'link-then-code@example.com',
      code,
    })
    assert.equal(viaCode.status, 400)
  })
})

describe('passwordless login', () => {
  function startLogin(app: ReturnType<typeof freshApp>, email: string, remember = false) {
    return post(app, '/api/auth/login', { email, remember })
  }

  it('prompts for full name when email is unknown and provisions unverified account upon receiving name', async () => {
    const app = freshApp()
    const unknown = await startLogin(app, 'newuser@example.com')
    assert.equal(unknown.status, 200)
    const unknownBody = (await unknown.json()) as { needsName?: boolean }
    assert.equal(unknownBody.needsName, true)

    const withName = await post(app, '/api/auth/login', {
      email: 'newuser@example.com',
      name: 'New Person',
    })
    assert.equal(withName.status, 200)
    const withNameBody = (await withName.json()) as { ok?: boolean; needsName?: boolean }
    assert.equal(withNameBody.ok, true)
    assert.equal(withNameBody.needsName, undefined)

    const code = await verificationCode(app, 'newuser@example.com')
    const verifyRes = await post(app, '/api/auth/login/verify', {
      email: 'newuser@example.com',
      code,
    })
    assert.equal(verifyRes.status, 200)
    const verifyBody = (await verifyRes.json()) as { user: { name: string; email: string } }
    assert.equal(verifyBody.user.name, 'New Person')
    assert.equal(verifyBody.user.email, 'newuser@example.com')
  })

  it('sends a link and a code for a verified account', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'mail@example.com')

    await startLogin(app, 'mail@example.com')

    assert.match(await loginCode(app, 'mail@example.com'), /^\d{6}$/)
    assert.ok(await loginLinkToken(app, 'mail@example.com'))
  })

  it('resends the verification email for an unconfirmed account instead of a code', async () => {
    const app = freshApp()
    await post(app, '/api/auth/register', {
      name: 'Test User',
      email: 'unconfirmed@example.com',
    })

    await startLogin(app, 'unconfirmed@example.com')

    assert.match(
      await verificationCode(app, 'unconfirmed@example.com'),
      /^\d{6}$/,
      'the unconfirmed account must receive a confirmation code',
    )
  })

  it('completes the sign-in with the emailed code', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'code-ok@example.com')

    await startLogin(app, 'code-ok@example.com')

    const verified = await post(app, '/api/auth/login/verify', {
      email: 'code-ok@example.com',
      code: await loginCode(app, 'code-ok@example.com'),
    })
    assert.equal(verified.status, 200)

    const me = await app.request('/api/auth/me', {
      headers: { cookie: sessionCookie(verified) },
    })
    assert.equal(me.status, 200)
  })

  it('completes the sign-in from the emailed link', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'link-ok@example.com')

    await startLogin(app, 'link-ok@example.com')

    const verified = await post(app, '/api/auth/login/link', {
      token: await loginLinkToken(app, 'link-ok@example.com'),
    })
    assert.equal(verified.status, 200)

    const me = await app.request('/api/auth/me', {
      headers: { cookie: sessionCookie(verified) },
    })
    assert.equal(me.status, 200)
  })

  it('honours the remember flag from the challenge', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'remember@example.com')

    await startLogin(app, 'remember@example.com', true)

    const verified = await post(app, '/api/auth/login/verify', {
      email: 'remember@example.com',
      code: await loginCode(app, 'remember@example.com'),
    })
    assert.equal(verified.status, 200)

    const cookieHeader = verified.headers.get('set-cookie')
    assert.ok(cookieHeader)
    assert.match(cookieHeader, /expires=/i, 'a remembered session must carry an expiry')
  })

  it('rejects a wrong code without handing out a session', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'code-wrong@example.com')

    await startLogin(app, 'code-wrong@example.com')
    const real = await loginCode(app, 'code-wrong@example.com')

    const response = await post(app, '/api/auth/login/verify', {
      email: 'code-wrong@example.com',
      code: wrongCode(real),
    })
    assert.equal(response.status, 400)
    assert.equal(response.headers.get('set-cookie'), null)
  })

  it('rejects a malformed code before it reaches the account', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'code-malformed@example.com')

    const response = await post(app, '/api/auth/login/verify', {
      email: 'code-malformed@example.com',
      code: 'abc',
    })
    assert.equal(response.status, 422)
  })

  it('refuses a challenge that was already spent', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'code-replay@example.com')

    await startLogin(app, 'code-replay@example.com')
    const code = await loginCode(app, 'code-replay@example.com')

    const first = await post(app, '/api/auth/login/verify', {
      email: 'code-replay@example.com',
      code,
    })
    assert.equal(first.status, 200)

    const replay = await post(app, '/api/auth/login/verify', {
      email: 'code-replay@example.com',
      code,
    })
    assert.equal(replay.status, 400)
  })

  it('refuses an expired challenge', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'code-expired@example.com')

    await startLogin(app, 'code-expired@example.com')

    await query('UPDATE login_challenges SET expires_at = $1 WHERE user_id = $2', [
      new Date(Date.now() - 1000).toISOString(),
      await userIdFor('code-expired@example.com'),
    ])

    const response = await post(app, '/api/auth/login/verify', {
      email: 'code-expired@example.com',
      code: await loginCode(app, 'code-expired@example.com'),
    })
    assert.equal(response.status, 400)
    assert.match(((await response.json()) as { message: string }).message, /expired/)
  })

  it('burns the challenge after the attempt cap', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'code-attempts@example.com')

    await startLogin(app, 'code-attempts@example.com')
    const code = await loginCode(app, 'code-attempts@example.com')
    const wrong = wrongCode(code)

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await post(app, '/api/auth/login/verify', {
        email: 'code-attempts@example.com',
        code: wrong,
      })
      assert.equal(response.status, 400, `attempt ${attempt} should be a plain mismatch`)
    }

    const correct = await post(app, '/api/auth/login/verify', {
      email: 'code-attempts@example.com',
      code,
    })
    assert.equal(correct.status, 429, 'the cap must hold even once the right code arrives')
  })

  it('resend issues a working replacement code', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'resend-code@example.com')

    await startLogin(app, 'resend-code@example.com')
    const original = await loginCode(app, 'resend-code@example.com')

    const resent = await post(app, '/api/auth/login/resend', { email: 'resend-code@example.com' })
    assert.equal(resent.status, 200)

    const replacement = await loginCode(app, 'resend-code@example.com')
    if (replacement !== original) {
      const stale = await post(app, '/api/auth/login/verify', {
        email: 'resend-code@example.com',
        code: original,
      })
      assert.equal(stale.status, 400, 'the superseded code must stop working')
    }

    const fresh = await post(app, '/api/auth/login/verify', {
      email: 'resend-code@example.com',
      code: replacement,
    })
    assert.equal(fresh.status, 200)
  })

  it('refuses an unknown email on the code path without leaking', async () => {
    const app = freshApp()
    const response = await post(app, '/api/auth/login/verify', {
      email: 'ghost@example.com',
      code: '000000',
    })
    assert.equal(response.status, 400)
  })

  it('refuses an unknown link token', async () => {
    const response = await post(freshApp(), '/api/auth/login/link', {
      token: 'not-a-real-token',
    })
    assert.equal(response.status, 400)
  })

  it('rejects a request with no session', async () => {
    const response = await freshApp().request('/api/auth/me')
    assert.equal(response.status, 401)
  })

  it('destroys the session on logout', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'logout@example.com')

    const logout = await post(app, '/api/auth/logout', {}, { cookie })
    assert.equal(logout.status, 200)

    const me = await app.request('/api/auth/me', { headers: { cookie } })
    assert.equal(me.status, 401)
  })
})

describe('dev mailbox', () => {
  it('is not registered unless DEV_MAILBOX is set', async () => {
    delete process.env.DEV_MAILBOX

    try {
      const response = await freshApp().request('/api/dev/mailbox')
      assert.equal(response.status, 404)
    } finally {
      process.env.DEV_MAILBOX = '1'
    }
  })

  it('reports no messages when a real relay is configured', async () => {
    process.env.SMTP_URL = 'smtp://user:password@example.com:587'

    try {
      const response = await freshApp().request('/api/dev/mailbox')
      const body = (await response.json()) as {
        transport: string
        directory: string | null
        messages: unknown[]
      }

      assert.equal(body.transport, 'smtp')
      assert.equal(body.directory, null)
      assert.deepEqual(body.messages, [])
    } finally {
      delete process.env.SMTP_URL
    }
  })
})

describe('rate limiting', () => {
  it('blocks login after the configured number of attempts', async () => {
    const app = freshApp()

    for (let i = 1; i <= 8; i += 1) {
      const attempt = await post(app, '/api/auth/login', { email: 'ratelimit@example.com' })
      assert.equal(attempt.status, 200, `attempt ${i} should be accepted`)
    }

    const blocked = await post(app, '/api/auth/login', { email: 'ratelimit@example.com' })
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1)
  })

  it('ignores a forged x-forwarded-for so the limit cannot be escaped', async () => {
    const app = freshApp()

    for (let i = 1; i <= 8; i += 1) {
      await post(
        app,
        '/api/auth/login',
        { email: 'spoof@example.com' },
        { 'x-forwarded-for': `10.0.0.${i}` },
      )
    }

    const blocked = await post(
      app,
      '/api/auth/login',
      { email: 'spoof@example.com' },
      { 'x-forwarded-for': '10.0.0.99' },
    )
    assert.equal(blocked.status, 429, 'a fresh forged address must not grant a fresh bucket')
  })

  it('honours x-forwarded-for once TRUST_PROXY is set', async () => {
    const app = freshApp()
    process.env.TRUST_PROXY = '1'

    try {
      for (let i = 1; i <= 8; i += 1) {
        await post(
          app,
          '/api/auth/login',
          { email: 'proxy@example.com' },
          { 'x-forwarded-for': '10.0.0.1' },
        )
      }

      const sameClient = await post(
        app,
        '/api/auth/login',
        { email: 'proxy@example.com' },
        { 'x-forwarded-for': '10.0.0.1' },
      )
      assert.equal(sameClient.status, 429)

      const otherClient = await post(
        app,
        '/api/auth/login',
        { email: 'proxy@example.com' },
        { 'x-forwarded-for': '10.0.0.2' },
      )
      assert.equal(otherClient.status, 200, 'a different proxied client has its own budget')
    } finally {
      delete process.env.TRUST_PROXY
    }
  })

  it('updates display name and avatar, validates avatar format, and supports clearing avatar', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'avatar-test@example.com')

    const invalidRes = await app.request('/api/auth/account', {
      method: 'PATCH',
      headers: { ...JSON_HEADERS, cookie },
      body: JSON.stringify({ avatarUrl: 'invalid-scheme://foo' }),
    })
    assert.equal(invalidRes.status, 422)

    const validDataUrl =
      'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='
    const updateRes = await app.request('/api/auth/account', {
      method: 'PATCH',
      headers: { ...JSON_HEADERS, cookie },
      body: JSON.stringify({ name: 'Updated Name', avatarUrl: validDataUrl }),
    })
    assert.equal(updateRes.status, 200)
    const updateBody = (await updateRes.json()) as {
      user: { name: string; avatarUrl: string | null }
    }
    assert.equal(updateBody.user.name, 'Updated Name')
    assert.equal(updateBody.user.avatarUrl, validDataUrl)

    const meRes = await app.request('/api/auth/me', { headers: { cookie } })
    const meBody = (await meRes.json()) as { user: { name: string; avatarUrl: string | null } }
    assert.equal(meBody.user.avatarUrl, validDataUrl)

    const clearRes = await app.request('/api/auth/account', {
      method: 'PATCH',
      headers: { ...JSON_HEADERS, cookie },
      body: JSON.stringify({ avatarUrl: null }),
    })
    assert.equal(clearRes.status, 200)
    const clearBody = (await clearRes.json()) as { user: { avatarUrl: string | null } }
    assert.equal(clearBody.user.avatarUrl, null)
  })
})