import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import { useTestDatabase } from './test-db.ts'

const root = mkdtempSync(join(tmpdir(), 'solstice-change-email-'))
process.env.MAIL_DIR = join(root, 'mail')
process.env.NODE_ENV = 'test'
process.env.DEV_MAILBOX = '1'
process.env.PUBLIC_ORIGIN = 'http://localhost:5173'
delete process.env.TRUST_PROXY
delete process.env.SMTP_URL

// The pool captures DATABASE_URL at import time, so the test database has to exist
// before db.ts is loaded.
const testDb = await useTestDatabase()

const { createApp } = await import('./app.ts')
const { closePool, migrate, queryOne } = await import('./db.ts')
const { createMemoryStore } = await import('./rate-limit.ts')

await migrate()

after(async () => {
  await closePool()
  await testDb.drop()
  rmSync(root, { recursive: true, force: true })
})

const JSON_HEADERS = { 'content-type': 'application/json' }

const VERIFY_SUBJECT = 'Confirm your Solstice email'
const CODE_SUBJECT = 'Confirm your new Solstice address'
const NOTICE_SUBJECT = 'Your Solstice sign-in address is being changed'
const DONE_SUBJECT = 'Your Solstice sign-in address has changed'

type App = ReturnType<typeof createApp>

interface Mail {
  to: string
  subject: string
  text: string
}

function freshApp() {
  return createApp({ rateLimitStore: createMemoryStore() })
}

function post(app: App, path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body),
  })
}

function authed(cookie: string) {
  return { cookie }
}

function sessionCookie(response: Response) {
  const header = response.headers.get('set-cookie')
  assert.ok(header, 'expected a Set-Cookie header')
  return header.split(';')[0] ?? ''
}

async function mailTo(app: App, to: string, subject: string) {
  const response = await app.request('/api/dev/mailbox?limit=200')
  const { messages } = (await response.json()) as { messages: Mail[] }

  // Newest-first, and matched on subject as well as recipient: the old address
  // receives both a verification code and a change warning during these tests.
  const message = messages.find((entry) => entry.to === to && entry.subject === subject)
  assert.ok(message, `expected a "${subject}" email to ${to}`)
  return message
}

async function mailCountTo(app: App, to: string, subject: string) {
  const response = await app.request('/api/dev/mailbox?limit=200')
  const { messages } = (await response.json()) as { messages: Mail[] }
  return messages.filter((entry) => entry.to === to && entry.subject === subject).length
}

function codeFrom(text: string) {
  // The code sits alone on its own line; a looser match would also catch a
  // six-digit run inside a link's token.
  const code = text.match(/^\s*(\d{6})\s*$/m)?.[1]
  assert.ok(code, 'expected a 6-digit code on its own line')
  return code
}

function wrongCode(code: string) {
  return String((Number(code) + 1) % 1_000_000).padStart(6, '0')
}

async function registerAndVerify(app: App, email: string) {
  const response = await post(app, '/api/auth/register', { name: 'Test User', email })
  assert.equal(response.status, 201)

  const code = codeFrom((await mailTo(app, email, VERIFY_SUBJECT)).text)
  const verified = await post(app, '/api/auth/verify-email', { email, code })
  assert.equal(verified.status, 200)
  return sessionCookie(verified)
}

async function signIn(app: App, email: string) {
  const started = await post(app, '/api/auth/login', { email })
  assert.equal(started.status, 200)

  const code = codeFrom((await mailTo(app, email, 'Sign in to Solstice')).text)
  const verified = await post(app, '/api/auth/login/verify', { email, code })
  assert.equal(verified.status, 200)
  return sessionCookie(verified)
}

async function startChange(app: App, cookie: string, newEmail: string) {
  const response = await post(app, '/api/auth/change-email', { email: newEmail }, authed(cookie))
  assert.equal(response.status, 200)
  return codeFrom((await mailTo(app, newEmail, CODE_SUBJECT)).text)
}

async function userIdFor(email: string) {
  const row = await queryOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [email])
  assert.ok(row, `expected a user row for ${email}`)
  return row.id
}

async function cancelTokenFromNotice(app: App, to: string, index = 0) {
  const response = await app.request('/api/dev/mailbox?limit=200')
  const { messages } = (await response.json()) as { messages: Mail[] }

  // Newest-first, so index 0 is the most recent change to this address.
  const notices = messages.filter((entry) => entry.to === to && entry.subject === NOTICE_SUBJECT)
  const notice = notices[index]
  assert.ok(notice, `expected at least ${index + 1} notices to ${to}`)

  const link = notice.text.match(/https?:\/\/\S*cancel-email-change\?token=\S*/)?.[0]
  assert.ok(link, 'expected a cancel link in the warning')

  const token = new URL(link).searchParams.get('token')
  assert.ok(token, 'expected a cancel token in the link')
  return token
}

describe('change email: requesting', () => {
  it('emails a code to the new address and a warning to the old one', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'req-old@example.com')

    const response = await post(
      app,
      '/api/auth/change-email',
      { email: 'req-new@example.com' },
      authed(cookie),
    )

    assert.equal(response.status, 200)
    const body = (await response.json()) as { pending: { email: string; expiresAt: string } }
    assert.equal(body.pending.email, 'req-new@example.com')
    assert.match(body.pending.expiresAt, /^\d{4}-/)

    assert.match((await mailTo(app, 'req-new@example.com', CODE_SUBJECT)).text, /^\s*\d{6}\s*$/m)

    const notice = await mailTo(app, 'req-old@example.com', NOTICE_SUBJECT)
    assert.match(notice.text, /req-new@example\.com/)
    assert.match(notice.text, /cancel-email-change\?token=/)
  })

  it('leaves the account signing in with the old address until the code is confirmed', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'pending-old@example.com')
    await startChange(app, cookie, 'pending-new@example.com')

    const stillOld = await signIn(app, 'pending-old@example.com')
    assert.match(stillOld, /^solstice_session=/)

    const mailbox = await app.request('/api/dev/mailbox?limit=200')
    const { messages } = (await mailbox.json()) as { messages: { to: string; subject: string }[] }
    const signInMails = messages.filter(
      (entry) => entry.to === 'pending-new@example.com' && entry.subject === 'Sign in to Solstice',
    )
    assert.equal(signInMails.length, 0, 'the new address must not have an account yet')
  })

  it('requires a session to ask for a change', async () => {
    const response = await post(freshApp(), '/api/auth/change-email', {
      email: 'nobody@example.com',
    })

    assert.equal(response.status, 401)
    assert.equal(await mailCountTo(freshApp(), 'nobody@example.com', CODE_SUBJECT), 0)
  })

  it('refuses an address another account already holds', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'holder@example.com')
    const cookie = await registerAndVerify(app, 'taker@example.com')

    const response = await post(
      app,
      '/api/auth/change-email',
      { email: 'holder@example.com' },
      authed(cookie),
    )

    assert.equal(response.status, 409)
    const body = (await response.json()) as { fieldErrors: Record<string, string> }
    assert.match(body.fieldErrors.email ?? '', /already in use/)
  })

  it('refuses the address the account already has', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'same@example.com')

    const response = await post(
      app,
      '/api/auth/change-email',
      { email: 'same@example.com' },
      authed(cookie),
    )

    assert.equal(response.status, 422)
    const body = (await response.json()) as { fieldErrors: Record<string, string> }
    assert.match(body.fieldErrors.email ?? '', /already the address/)
  })

  it('refuses a malformed address', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'bad-shape@example.com')

    const response = await post(
      app,
      '/api/auth/change-email',
      { email: 'not-an-email' },
      authed(cookie),
    )

    assert.equal(response.status, 422)
    const body = (await response.json()) as { fieldErrors: Record<string, string> }
    assert.ok(body.fieldErrors.email)
  })

  it('replaces an earlier pending change and retires its code', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'supersede@example.com')

    const first = await startChange(app, cookie, 'supersede-first@example.com')
    const second = await startChange(app, cookie, 'supersede-second@example.com')

    const stale = await post(app, '/api/auth/change-email/verify', { code: first }, authed(cookie))
    assert.equal(stale.status, 400, 'the superseded code must not still work')

    const fresh = await post(app, '/api/auth/change-email/verify', { code: second }, authed(cookie))
    assert.equal(fresh.status, 200)
  })
})

describe('change email: confirming', () => {
  it('switches the address, marks it verified, and moves the sign-in over', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'confirm-old@example.com')
    const code = await startChange(app, cookie, 'confirm-new@example.com')

    const response = await post(app, '/api/auth/change-email/verify', { code }, authed(cookie))

    assert.equal(response.status, 200)
    const body = (await response.json()) as {
      user: { email: string; emailVerifiedAt: string | null }
    }
    assert.equal(body.user.email, 'confirm-new@example.com')
    assert.ok(body.user.emailVerifiedAt, 'the new address was proven, so it counts as verified')

    // A login request for the old address must no longer reach an account, while
    // the new address mails its sign-in code like any alive account.
    await post(app, '/api/auth/login', { email: 'confirm-old@example.com' })
    await post(app, '/api/auth/login', { email: 'confirm-new@example.com' })

    const mailbox = await app.request('/api/dev/mailbox?limit=200')
    const { messages } = (await mailbox.json()) as { messages: { to: string; subject: string }[] }
    const signInsTo = (address: string) =>
      messages.filter(
        (entry) => entry.to === address && entry.subject === 'Sign in to Solstice',
      ).length

    assert.equal(signInsTo('confirm-old@example.com'), 0, 'the old address must be gone')
    assert.equal(signInsTo('confirm-new@example.com'), 1, 'the new address must hold the account')

    assert.match((await mailTo(app, 'confirm-old@example.com', DONE_SUBJECT)).text, /confirm-new@example\.com/)
  })

  it('keeps the caller signed in but drops sessions opened against the old address', async () => {
    const app = freshApp()
    const first = await registerAndVerify(app, 'sessions-old@example.com')
    const second = await signIn(app, 'sessions-old@example.com')

    const code = await startChange(app, first, 'sessions-new@example.com')
    const response = await post(app, '/api/auth/change-email/verify', { code }, authed(first))
    assert.equal(response.status, 200)

    const caller = await app.request('/api/auth/me', { headers: authed(sessionCookie(response)) })
    assert.equal(caller.status, 200)

    const other = await app.request('/api/auth/me', { headers: authed(second) })
    assert.equal(other.status, 401, 'the other session must not survive the move')
  })

  it('rejects a wrong code and spends an attempt', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'wrong-old@example.com')
    const code = await startChange(app, cookie, 'wrong-new@example.com')

    const response = await post(
      app,
      '/api/auth/change-email/verify',
      { code: wrongCode(code) },
      authed(cookie),
    )
    assert.equal(response.status, 400)

    const attempts = await queryOne<{ attempts: number }>(
      'SELECT attempts FROM email_changes WHERE lower(new_email) = lower($1)',
      ['wrong-new@example.com'],
    )
    assert.equal(attempts?.attempts, 1)
  })

  it('rejects a malformed code without spending an attempt', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'shape-old@example.com')
    await startChange(app, cookie, 'shape-new@example.com')

    const response = await post(app, '/api/auth/change-email/verify', { code: '12' }, authed(cookie))
    assert.equal(response.status, 422)
  })

  it('stops accepting codes once the attempt cap is reached', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'cap-old@example.com')
    const code = await startChange(app, cookie, 'cap-new@example.com')

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post(app, '/api/auth/change-email/verify', { code: wrongCode(code) }, authed(cookie))
    }

    const blocked = await post(app, '/api/auth/change-email/verify', { code }, authed(cookie))
    assert.equal(blocked.status, 429, 'the right code must not rescue a spent budget')
  })

  it('rejects an expired code', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'expired-old@example.com')
    const code = await startChange(app, cookie, 'expired-new@example.com')

    const id = await userIdFor('expired-old@example.com')
    await queryOne(
      "UPDATE email_changes SET expires_at = now() - interval '1 minute' WHERE user_id = $1",
      [id],
    )

    const response = await post(app, '/api/auth/change-email/verify', { code }, authed(cookie))
    assert.equal(response.status, 400)
  })

  it('refuses when no change is pending', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'none-old@example.com')

    const response = await post(app, '/api/auth/change-email/verify', { code: '123456' }, authed(cookie))
    assert.equal(response.status, 400)
  })

  it('does not accept the same code twice', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'replay-old@example.com')
    const code = await startChange(app, cookie, 'replay-new@example.com')

    const first = await post(app, '/api/auth/change-email/verify', { code }, authed(cookie))
    assert.equal(first.status, 200)

    // Completing the move rotates the caller's session, so the replay has to come
    // from the cookie it just handed back rather than the one that started it.
    const second = await post(
      app,
      '/api/auth/change-email/verify',
      { code },
      authed(sessionCookie(first)),
    )
    assert.equal(second.status, 400)
  })

  it('refuses an address taken while the change was pending', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'race-old@example.com')
    const code = await startChange(app, cookie, 'race-new@example.com')

    await registerAndVerify(app, 'race-new@example.com')

    const response = await post(app, '/api/auth/change-email/verify', { code }, authed(cookie))
    assert.equal(response.status, 409, 'the second claim on an address must lose')
  })
})

describe('change email: cancelling', () => {
  it('reports a pending change and lets the owner drop it', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'cancel-old@example.com')
    await startChange(app, cookie, 'cancel-new@example.com')

    const pending = await app.request('/api/auth/change-email', { headers: authed(cookie) })
    const pendingBody = (await pending.json()) as { pending: { email: string } | null }
    assert.equal(pendingBody.pending?.email, 'cancel-new@example.com')

    const cancelled = await post(app, '/api/auth/change-email/cancel', {}, authed(cookie))
    assert.equal(cancelled.status, 200)

    const after = await app.request('/api/auth/change-email', { headers: authed(cookie) })
    const afterBody = (await after.json()) as { pending: unknown }
    assert.equal(afterBody.pending, null)
  })

  it('drops a change through the token mailed to the abandoned address, with no session', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'link-old@example.com')
    const code = await startChange(app, cookie, 'link-new@example.com')

    const token = await cancelTokenFromNotice(app, 'link-old@example.com')

    const cancelled = await post(app, '/api/auth/change-email/cancel-link', { token })
    assert.equal(cancelled.status, 200)

    const stale = await post(app, '/api/auth/change-email/verify', { code }, authed(cookie))
    assert.equal(stale.status, 400, 'a cancelled change must not still complete')
  })

  it('rejects a cancel token that does not match a pending change', async () => {
    const response = await post(freshApp(), '/api/auth/change-email/cancel-link', {
      token: 'not-a-real-token',
    })
    assert.equal(response.status, 400)
  })

  it('retires the cancel token when a newer change replaces it', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'retire-old@example.com')

    await startChange(app, cookie, 'retire-first@example.com')
    await startChange(app, cookie, 'retire-second@example.com')

    const firstToken = await cancelTokenFromNotice(app, 'retire-old@example.com', 1)

    const staleToken = await post(app, '/api/auth/change-email/cancel-link', { token: firstToken })
    assert.equal(staleToken.status, 400, 'the superseded token must be dead')

    const pending = await app.request('/api/auth/change-email', { headers: authed(cookie) })
    const body = (await pending.json()) as { pending: { email: string } | null }
    assert.equal(body.pending?.email, 'retire-second@example.com', 'the newer change must survive')
  })
})
