import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import { useTestDatabase } from './test-db.ts'

const root = mkdtempSync(join(tmpdir(), 'solstice-passkeys-'))
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
const { closePool, migrate, query, queryOne } = await import('./db.ts')
const { createMemoryStore } = await import('./rate-limit.ts')
const {
  consumeCeremony,
  insertPasskey,
  listPasskeys,
  storeCeremony,
  toWebAuthnCredential,
} = await import('./passkeys.ts')

await migrate()

after(async () => {
  await closePool()
  await testDb.drop()
  rmSync(root, { recursive: true, force: true })
})

const JSON_HEADERS = { 'content-type': 'application/json' }
const VERIFY_SUBJECT = 'Confirm your VPS Panel email'

type App = ReturnType<typeof createApp>

function freshApp() {
  return createApp({ rateLimitStore: createMemoryStore() })
}

function post(app: App, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function authed(cookie: string) {
  return { cookie }
}

function sessionCookie(response: Response) {
  const header = response.headers.get('set-cookie')
  assert.ok(header, 'expected a Set-Cookie header')
  const value = header.split(';')[0] ?? ''
  assert.match(value, /^solstice_session=/, 'expected the session cookie')
  return value
}

function ceremonyCookie(response: Response) {
  const header = response.headers.get('set-cookie')
  assert.ok(header, 'expected a Set-Cookie header')
  const value = header.split(';')[0] ?? ''
  assert.match(value, /^solstice_webauthn=/, 'expected the ceremony cookie')
  return value
}

function cookieJar(...values: string[]) {
  return { cookie: values.join('; ') }
}

function codeFrom(text: string) {
  const code = text.match(/^\s*(\d{6})\s*$/m)?.[1]
  assert.ok(code, 'expected a 6-digit code on its own line')
  return code
}

async function registerAndVerify(app: App, email: string) {
  const response = await post(app, '/api/auth/register', { name: 'Test User', email })
  assert.equal(response.status, 201)

  const mailbox = await app.request('/api/dev/mailbox?limit=200')
  const { messages } = (await mailbox.json()) as { messages: { to: string; subject: string; text: string }[] }
  const mail = messages.find((entry) => entry.to === email && entry.subject === VERIFY_SUBJECT)
  assert.ok(mail, `expected a verification email for ${email}`)

  const verified = await post(app, '/api/auth/verify-email', { email, code: codeFrom(mail.text) })
  assert.equal(verified.status, 200)
  return sessionCookie(verified)
}

async function userIdFor(email: string) {
  const row = await queryOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [email])
  assert.ok(row, `expected a user row for ${email}`)
  return row.id
}

describe('passkeys: ceremony storage', () => {
  it('spends a challenge as it reads it, so an assertion cannot be replayed', async () => {
    const ceremony = await storeCeremony('registration', null, 'challenge-value')

    const first = await consumeCeremony(ceremony.token, 'registration')
    assert.equal(first?.challenge, 'challenge-value')

    const second = await consumeCeremony(ceremony.token, 'registration')
    assert.equal(second, null, 'the same ceremony must not verify twice')
  })

  it('will not hand a registration ceremony to the authentication flow', async () => {
    const ceremony = await storeCeremony('registration', null, 'kind-bound')

    const wrongKind = await consumeCeremony(ceremony.token, 'authentication')
    assert.equal(wrongKind, null)

    const rightKind = await consumeCeremony(ceremony.token, 'registration')
    assert.equal(rightKind?.challenge, 'kind-bound', 'the failed read must not have spent it')
  })

  it('refuses an expired ceremony', async () => {
    const ceremony = await storeCeremony('registration', null, 'stale')

    await query("UPDATE webauthn_challenges SET expires_at = now() - interval '1 minute'")

    const consumed = await consumeCeremony(ceremony.token, 'registration')
    assert.equal(consumed, null)
  })

  it('keeps the ceremony bound to the account that started it', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'pk-bound@example.com')
    const owner = await userIdFor('pk-bound@example.com')
    const ceremony = await storeCeremony('registration', owner, 'bound')

    const consumed = await consumeCeremony(ceremony.token, 'registration')
    assert.equal(consumed?.user_id, owner)
  })

  it('round-trips a stored public key back to bytes', () => {
    const bytes = new Uint8Array([1, 2, 250, 255, 0, 128])
    const encoded = Buffer.from(bytes).toString('base64url')

    const credential = toWebAuthnCredential({
      id: 'cred-1',
      user_id: 'user-1',
      credential_id: 'cred-1',
      public_key: encoded,
      counter: '0',
      transports: 'internal,hybrid',
      name: 'Laptop',
      backed_up: true,
      created_at: new Date(),
      last_used_at: null,
    })

    assert.deepEqual(Array.from(credential.publicKey), Array.from(bytes))
    assert.deepEqual(credential.transports, ['internal', 'hybrid'])
    assert.equal(credential.counter, 0, 'a bigint column arrives as a string and must become a number')
  })
})

describe('passkeys: registration guards', () => {
  it('requires a session to list passkeys', async () => {
    const response = await freshApp().request('/api/auth/passkeys')
    assert.equal(response.status, 401)
  })

  it('requires a session to start registration', async () => {
    const response = await post(freshApp(), '/api/auth/passkeys/register/options')
    assert.equal(response.status, 401)
  })

  it('returns discoverable, user-verified options and binds them to this browser', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'pk-options@example.com')

    const response = await post(
      app,
      '/api/auth/passkeys/register/options',
      {},
      authed(cookie),
    )

    assert.equal(response.status, 200)
    const body = (await response.json()) as {
      options: { challenge: string; rp: { id: string }; authenticatorSelection: Record<string, string> }
    }

    assert.ok(body.options.challenge, 'expected a challenge')
    assert.equal(body.options.rp.id, 'localhost')
    assert.equal(body.options.authenticatorSelection.residentKey, 'required')
    assert.equal(body.options.authenticatorSelection.userVerification, 'required')

    ceremonyCookie(response)
  })

  it('refuses to finish registration without a ceremony cookie', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'pk-noceremony@example.com')

    const response = await post(
      app,
      '/api/auth/passkeys/register/verify',
      { response: { id: 'x' } },
      authed(cookie),
    )

    assert.equal(response.status, 400)
  })

  it('refuses a registration response that is not shaped like one', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'pk-badshape@example.com')

    const response = await post(app, '/api/auth/passkeys/register/verify', { response: {} }, authed(cookie))
    assert.equal(response.status, 422)
  })

  it('refuses a forged attestation and still spends the ceremony', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'pk-forged@example.com')

    const options = await post(
      app,
      '/api/auth/passkeys/register/options',
      {},
      authed(cookie),
    )
    const jar = ceremonyCookie(options)

    const forged = await post(
      app,
      '/api/auth/passkeys/register/verify',
      {
        response: {
          id: 'forged',
          rawId: 'forged',
          type: 'public-key',
          clientExtensionResults: {},
          response: {
            clientDataJSON: 'AAAA',
            attestationObject: 'AAAA',
          },
        },
      },
      cookieJar(cookie, jar),
    )

    assert.equal(forged.status, 400, 'a made-up attestation must not register')

    const rows = await listPasskeys(await userIdFor('pk-forged@example.com'))
    assert.equal(rows.length, 0)

    const replay = await post(
      app,
      '/api/auth/passkeys/register/verify',
      { response: { id: 'forged' } },
      cookieJar(cookie, jar),
    )
    assert.equal(replay.status, 400, 'the ceremony was spent by the failed attempt')
  })
})

describe('passkeys: sign-in', () => {
  it('hands out options without a session, with no credential list', async () => {
    const response = await post(freshApp(), '/api/auth/passkeys/login/options')

    assert.equal(response.status, 200)
    const body = (await response.json()) as {
      options: { challenge: string; allowCredentials?: unknown[]; userVerification: string }
    }

    assert.ok(body.options.challenge)
    assert.equal(body.options.allowCredentials, undefined, 'a discoverable flow asks the authenticator')
    assert.equal(body.options.userVerification, 'required')
    ceremonyCookie(response)
  })

  it('refuses a sign-in without a ceremony', async () => {
    const response = await post(freshApp(), '/api/auth/passkeys/login/verify', {
      response: { id: 'anything' },
    })

    assert.equal(response.status, 400)
  })

  it('refuses a credential this deployment has never seen', async () => {
    const app = freshApp()

    const options = await post(app, '/api/auth/passkeys/login/options')
    const jar = ceremonyCookie(options)

    const response = await post(
      app,
      '/api/auth/passkeys/login/verify',
      { response: { id: 'never-registered' } },
      authed(jar),
    )

    assert.equal(response.status, 400)
  })

  it('rejects a malformed sign-in response', async () => {
    const app = freshApp()

    const options = await post(app, '/api/auth/passkeys/login/options')
    const jar = ceremonyCookie(options)

    const response = await post(app, '/api/auth/passkeys/login/verify', { response: {} }, authed(jar))
    assert.equal(response.status, 422)
  })
})

describe('passkeys: removal', () => {
  it('lists a registered passkey without leaking its public key', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'pk-list@example.com')
    const userId = await userIdFor('pk-list@example.com')

    await insertPasskey({
      userId,
      credentialId: 'listed-credential',
      publicKey: 'AAAA',
      counter: 0,
      transports: 'internal',
      name: 'Laptop',
      backedUp: false,
    })

    const response = await app.request('/api/auth/passkeys', { headers: authed(cookie) })
    assert.equal(response.status, 200)

    const body = (await response.json()) as { passkeys: Record<string, unknown>[] }
    assert.equal(body.passkeys.length, 1)
    assert.equal(body.passkeys[0]?.name, 'Laptop')
    assert.equal(body.passkeys[0]?.publicKey, undefined, 'the public key stays server-side')
    assert.equal(body.passkeys[0]?.credentialId, undefined)
  })

  it('removes a passkey while signed in', async () => {
    const app = freshApp()
    const cookie = await registerAndVerify(app, 'pk-rm@example.com')
    const userId = await userIdFor('pk-rm@example.com')

    await insertPasskey({
      userId,
      credentialId: 'rm-ok-credential',
      publicKey: 'AAAA',
      counter: 0,
      transports: undefined,
      name: 'Key',
      backedUp: false,
    })

    const target = (await listPasskeys(userId))[0]?.id
    assert.ok(target)

    const response = await post(
      app,
      `/api/auth/passkeys/${target}/remove`,
      {},
      authed(cookie),
    )

    assert.equal(response.status, 200)
    assert.equal((await listPasskeys(userId)).length, 0)
  })

  it('will not remove a passkey belonging to another account', async () => {
    const app = freshApp()
    await registerAndVerify(app, 'pk-victim@example.com')
    const attackerCookie = await registerAndVerify(app, 'pk-attacker@example.com')

    const victimId = await userIdFor('pk-victim@example.com')
    await insertPasskey({
      userId: victimId,
      credentialId: 'victim-credential',
      publicKey: 'AAAA',
      counter: 0,
      transports: undefined,
      name: 'Victim key',
      backedUp: false,
    })

    const target = (await listPasskeys(victimId))[0]?.id
    assert.ok(target)

    const response = await post(
      app,
      `/api/auth/passkeys/${target}/remove`,
      {},
      authed(attackerCookie),
    )

    assert.equal(response.status, 404, 'the id belongs to someone else, so it does not exist here')
    assert.equal((await listPasskeys(victimId)).length, 1, 'the victim keeps their passkey')

    const attackerRows = await listPasskeys(await userIdFor('pk-attacker@example.com'))
    assert.equal(attackerRows.length, 0)
  })
})
