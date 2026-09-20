import { randomUUID } from 'node:crypto'

import { getConnInfo } from '@hono/node-server/conninfo'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'

import { query, queryOne, toIso, type UserRow } from './db.ts'
import {
  CHANGE_CODE_LENGTH,
  CHANGE_CODE_TTL_MS,
  cancelEmailChange,
  cancelEmailChangeByToken,
  claimEmailChange,
  consumeEmailChange,
  createEmailChange,
  isChangeCodeShape,
  loadEmailChange,
} from './email-change.ts'
import { listMailbox, mailboxDir, mailTransportName, sendMail } from './mail.ts'
import {
  CEREMONY_COOKIE,
  CEREMONY_TTL_MS,
  authenticationOptions,
  consumeCeremony,
  deletePasskey,
  findPasskeyByCredentialId,
  listPasskeys,
  publicPasskey,
  registrationOptions,
  storeCeremony,
  verifyAuthentication,
  verifyRegistration,
} from './passkeys.ts'
import { createMemoryStore, createSqlStore, type RateLimitStore } from './rate-limit.ts'
import { generateNumericCode, hashSecret, matchesSecret } from './secret.ts'
import {
  SESSION_COOKIE,
  SESSION_TTL_LONG_MS,
  SESSION_TTL_SHORT_MS,
  createSession,
  destroySession,
  destroySessionById,
  hashToken,
  listSessions,
  purgeExpiredSessions,
  readSession,
} from './session.ts'
import {
  CODE_LENGTH,
  CODE_TTL_MS,
  consumeEmailVerification,
  consumeEmailVerificationLink,
  createEmailVerification,
  isCodeShape,
} from './verification.ts'
import {
  LOGIN_CODE_TTL_MS,
  consumeLoginCode,
  consumeLoginLink,
  createLoginChallenge,
} from './two-factor.ts'

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function isProduction() {
  return process.env.NODE_ENV === 'production'
}

/*
 * The SQL store is the default because an in-process counter resets on every
 * restart and is not shared between processes, which is exactly when a limit
 * matters least and is needed most.
 */
function createRateLimitStore(): RateLimitStore {
  return process.env.RATE_LIMIT_STORE === 'memory' ? createMemoryStore() : createSqlStore()
}

function publicOrigin() {
  return (process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, '')
}

/*
 * Rate limits are per client, so the key has to actually identify a client.
 * `x-forwarded-for` is only trustworthy when a proxy we control overwrites it,
 * so it is ignored unless TRUST_PROXY is set — otherwise any caller can forge
 * the header and land in a fresh bucket on every request.
 */
export function clientKey(c: Context) {
  if (process.env.TRUST_PROXY) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded
  }

  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function publicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url ?? null,
    emailVerifiedAt: row.email_verified_at ? toIso(row.email_verified_at) : null,
    createdAt: toIso(row.created_at),
  }
}

export async function logActivity(userId: string, action: string, details: string, ip?: string) {
  try {
    await query(
      'INSERT INTO activity_logs (id, user_id, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), userId, action, details, ip ?? null],
    )
  } catch (err) {
    console.error('[activity-log] failed:', err)
  }
}

export async function logEmail(recipient: string, subject: string, bodyText: string, userId?: string) {
  try {
    await query(
      'INSERT INTO email_logs (id, user_id, recipient, subject, body_text, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [randomUUID(), userId ?? null, recipient, subject, bodyText, 'sent'],
    )
  } catch (err) {
    console.error('[email-log] failed:', err)
  }
}

function setSessionCookie(c: Context, token: string, expiresAt: string, remember: boolean) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProduction(),
    path: '/',
    // Without `expires` the browser drops the cookie when it closes, which is
    // what "don't keep me signed in" should mean.
    ...(remember ? { expires: new Date(expiresAt) } : {}),
  })
}

/*
 * The ceremony token rides in its own cookie rather than in the response body, so a
 * script on the page cannot read it back and the challenge stays bound to this
 * browser. It is short-lived because a ceremony is over in seconds.
 */
function setCeremonyCookie(c: Context, token: string) {
  setCookie(c, CEREMONY_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProduction(),
    path: '/',
    maxAge: Math.floor(CEREMONY_TTL_MS / 1000),
  })
}

function clearCeremonyCookie(c: Context) {
  deleteCookie(c, CEREMONY_COOKIE, { path: '/' })
}

async function readJson(c: Context) {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function str(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function findUserByEmail(email: string) {
  return queryOne<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [email])
}

const CODE_TTL_MINUTES = Math.round(CODE_TTL_MS / 60_000)

function verificationEmail(code: string, link: string) {
  return {
    subject: 'Confirm your Solstice email',
    text: [
      'Confirm this address to finish setting up your Solstice account.',
      '',
      'Open this link:',
      link,
      '',
      'Or enter this code on the confirmation page:',
      '',
      code,
      '',
      `The link and code expire in ${CODE_TTL_MINUTES} minutes. If you did not create an account, you can ignore this email.`,
    ].join('\n'),
    html: [
      '<p>Confirm this address to finish setting up your Solstice account.</p>',
      `<p><a href="${link}">Confirm my email</a></p>`,
      '<p>Or enter this code on the confirmation page:</p>',
      `<p style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:26px;letter-spacing:0.18em"><strong>${code}</strong></p>`,
      `<p>The link and code expire in ${CODE_TTL_MINUTES} minutes. If you did not create an account, you can ignore this email.</p>`,
    ].join('\n'),
  }
}

async function sendVerificationCode(user: UserRow) {
  const verification = await createEmailVerification(user.id)
  const link =
    `${publicOrigin()}/verify-email` +
    `?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(verification.linkToken)}`

  try {
    const mailMsg = {
      to: user.email,
      ...verificationEmail(verification.code, link),
    }
    const sent = await sendMail(mailMsg)
    await logEmail(user.email, mailMsg.subject, mailMsg.text, user.id)
    console.log(
      sent.filePath
        ? `[verify email] ${user.email} -> ${sent.filePath}`
        : `[verify email] emailed ${user.email}`,
    )
  } catch (error) {
    console.error('[verify email] could not send mail', error)
  }
}

async function confirmAccount(c: Context, userId: string, remember: boolean) {
  const confirmed = await queryOne<UserRow>(
    'UPDATE users SET email_verified_at = now() WHERE id = $1 RETURNING *',
    [userId],
  )
  if (!confirmed) return null

  const session = await createSession(
    userId,
    remember ? SESSION_TTL_LONG_MS : SESSION_TTL_SHORT_MS,
    c.req.header('user-agent'),
  )
  setSessionCookie(c, session.token, session.expiresAt, remember)
  await logActivity(userId, 'login', 'User verified email and signed in', clientKey(c))

  return publicUser(confirmed)
}

async function requireCurrentUser(c: Context) {
  const session = await readSession(getCookie(c, SESSION_COOKIE))
  if (!session) return null
  return queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
}

const LOGIN_CODE_TTL_MINUTES = Math.round(LOGIN_CODE_TTL_MS / 60_000)

function loginEmail(link: string, code: string) {
  return {
    subject: 'Sign in to Solstice',
    text: [
      'Sign in to your Solstice account:',
      '',
      link,
      '',
      'Or enter this code on the sign-in page:',
      '',
      code,
      '',
      `The link and code expire in ${LOGIN_CODE_TTL_MINUTES} minutes. If you were not signing in, you can ignore this email.`,
    ].join('\n'),
    html: [
      '<p>Sign in to your Solstice account:</p>',
      `<p><a href="${link}">Sign in</a></p>`,
      '<p>Or enter this code on the sign-in page:</p>',
      `<p style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:26px;letter-spacing:0.18em"><strong>${code}</strong></p>`,
      `<p>The link and code expire in ${LOGIN_CODE_TTL_MINUTES} minutes. If you were not signing in, you can ignore this email.</p>`,
    ].join('\n'),
  }
}

async function sendLoginEmail(user: UserRow, link: string, code: string) {
  const mailMsg = { to: user.email, ...loginEmail(link, code) }
  const sent = await sendMail(mailMsg)
  await logEmail(user.email, mailMsg.subject, mailMsg.text, user.id)
  console.log(
    sent.filePath
      ? `[login] ${user.email} -> ${sent.filePath}`
      : `[login] emailed ${user.email}`,
  )
}

const CHANGE_TTL_MINUTES = Math.round(CHANGE_CODE_TTL_MS / 60_000)

function emailChangeCodeEmail(code: string, newEmail: string) {
  return {
    subject: 'Confirm your new Solstice address',
    text: [
      `Enter this code to make ${newEmail} the sign-in address on your Solstice account:`,
      '',
      code,
      '',
      `It expires in ${CHANGE_TTL_MINUTES} minutes. Until it is entered, the account keeps signing in with its current address.`,
    ].join('\n'),
    html: [
      `<p>Enter this code to make <strong>${newEmail}</strong> the sign-in address on your Solstice account:</p>`,
      `<p style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:26px;letter-spacing:0.18em"><strong>${code}</strong></p>`,
      `<p>It expires in ${CHANGE_TTL_MINUTES} minutes. Until it is entered, the account keeps signing in with its current address.</p>`,
    ].join('\n'),
  }
}

function emailChangeNoticeEmail(oldEmail: string, newEmail: string, cancelLink: string) {
  return {
    subject: 'Your Solstice sign-in address is being changed',
    text: [
      `Someone asked to move the Solstice account for ${oldEmail} to ${newEmail}.`,
      '',
      'If this was you, nothing further is needed — the move finishes when the code sent to the new address is entered.',
      '',
      'If it was not you, stop it here:',
      cancelLink,
      '',
      'Then sign in again from a device you trust. Whoever asked for this was signed in as you.',
    ].join('\n'),
    html: [
      `<p>Someone asked to move the Solstice account for <strong>${oldEmail}</strong> to <strong>${newEmail}</strong>.</p>`,
      '<p>If this was you, nothing further is needed — the move finishes when the code sent to the new address is entered.</p>',
      `<p>If it was not you, <a href="${cancelLink}">stop the change</a>, then sign in again from a device you trust. Whoever asked for this was signed in as you.</p>`,
    ].join('\n'),
  }
}

function emailChangeDoneEmail(oldEmail: string, newEmail: string) {
  return {
    subject: 'Your Solstice sign-in address has changed',
    text: [
      `The sign-in address on your Solstice account is now ${newEmail}.`,
      '',
      `${oldEmail} no longer reaches this account.`,
      '',
      'If this was not you, sign in at the new address and move it back.',
    ].join('\n'),
    html: [
      `<p>The sign-in address on your Solstice account is now <strong>${newEmail}</strong>.</p>`,
      `<p>${oldEmail} no longer reaches this account.</p>`,
      '<p>If this was not you, sign in at the new address and move it back.</p>',
    ].join('\n'),
  }
}

function deletionEmail(code: string) {
  return {
    subject: 'Confirm deletion of your Solstice account',
    text: [
      'You requested to permanently delete your Solstice account.',
      '',
      'Enter this code to confirm deletion:',
      '',
      code,
      '',
      'This code expires in 15 minutes. Once confirmed, all your instances, SSH keys, sessions, and data will be destroyed immediately.',
      'If you did not make this request, you can ignore this email and your account remains safe.',
    ].join('\n'),
    html: [
      '<p>You requested to permanently delete your Solstice account.</p>',
      '<p>Enter this code to confirm deletion:</p>',
      `<p style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:26px;letter-spacing:0.18em"><strong>${code}</strong></p>`,
      '<p>This code expires in 15 minutes. Once confirmed, all your instances, SSH keys, sessions, and data will be destroyed immediately.</p>',
      '<p>If you did not make this request, you can ignore this email and your account remains safe.</p>',
    ].join('\n'),
  }
}

/* Sends a fresh sign-in challenge (link + code) for a verified account. The
   caller decides whether the account exists and whether the response leaks it. */
async function dispatchLoginChallenge(user: UserRow, remember: boolean) {
  const challenge = await createLoginChallenge(user.id, remember)
  const link =
    `${publicOrigin()}/login` +
    `?token=${encodeURIComponent(challenge.linkToken)}`

  try {
    await sendLoginEmail(user, link, challenge.code)
  } catch (error) {
    console.error('[login] could not send mail', error)
    return false
  }

  return true
}

export function createApp(options: { rateLimitStore?: RateLimitStore } = {}) {
  const app = new Hono()
  const store = options.rateLimitStore ?? createRateLimitStore()

  app.onError((err, c) => {
    console.error(`[api error] ${c.req.method} ${c.req.url}:`, err)
    return c.json({ message: 'Internal server error.' }, 500)
  })

  app.post('/api/auth/register', async (c) => {
    const limit = await store.hit(`register:${clientKey(c)}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const body = await readJson(c)
    const name = str(body.name).trim()
    const email = str(body.email).trim()

    const fieldErrors: Record<string, string> = {}
    if (!name) fieldErrors.name = 'Enter your name.'
    if (!email) fieldErrors.email = 'Enter your email address.'
    else if (!EMAIL_PATTERN.test(email))
      fieldErrors.email = 'That does not look like a valid email address.'

    if (Object.keys(fieldErrors).length > 0) {
      return c.json({ message: 'Check the highlighted fields.', fieldErrors }, 422)
    }

    const existing = await findUserByEmail(email)
    if (existing) {
      return c.json({ fieldErrors: { email: 'That email is already registered.' } }, 409)
    }

    const id = randomUUID()
    const created = await queryOne<UserRow>(
      `INSERT INTO users (id, email, name, email_verified_at)
       VALUES ($1, $2, $3, NULL) RETURNING *`,
      [id, email, name],
    )
    if (!created) return c.json({ message: 'Could not create the account.' }, 500)

    await sendVerificationCode(created)

    // Deliberately no session: the account stays inert until the emailed code
    // comes back, so registering with an address you do not own gets you nothing.
    return c.json({ email: created.email }, 201)
  })

  app.post('/api/auth/login', async (c) => {
    const limit = await store.hit(`login:${clientKey(c)}`, 8, 10 * 60 * 1000)
    if (!limit.allowed) {
      c.header('Retry-After', String(limit.retryAfterSeconds))
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const body = await readJson(c)
    const email = str(body.email).trim()

    if (!email || !EMAIL_PATTERN.test(email)) {
      return c.json({ fieldErrors: { email: 'Enter a valid email address.' } }, 422)
    }

    let user = await findUserByEmail(email)

    if (!user) {
      const name = str(body.name).trim()
      if (!name) {
        return c.json({ needsName: true, message: 'Please enter your full name to proceed.' }, 200)
      }

      const id = randomUUID()
      user = await queryOne<UserRow>(
        `INSERT INTO users (id, email, name, email_verified_at)
         VALUES ($1, $2, $3, NULL) RETURNING *`,
        [id, email, name],
      )
      if (!user) return c.json({ message: 'Could not create the account.' }, 500)
    }

    if (user.email_verified_at) {
      await dispatchLoginChallenge(user, body.remember === true)
    } else {
      // The account is unconfirmed (newly created or pending verification).
      // Send the email verification code/link to verify it's them.
      await sendVerificationCode(user)
    }

    return c.json({ ok: true })
  })

  app.post('/api/auth/logout', async (c) => {
    await destroySession(getCookie(c, SESSION_COOKIE))
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  app.post('/api/auth/login/verify', async (c) => {
    const limit = await store.hit(`login-verify:${clientKey(c)}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const body = await readJson(c)
    const email = str(body.email).trim()
    const code = str(body.code).trim()

    if (!email || !isCodeShape(code)) {
      return c.json({ message: `Enter the ${CODE_LENGTH}-digit code from your email.` }, 422)
    }

    const user = await findUserByEmail(email)
    if (!user) {
      return c.json({ message: 'That code is not correct.' }, 400)
    }

    let remember = body.remember === true

    if (user.email_verified_at) {
      const outcome = await consumeLoginCode(user.id, code)

      if (outcome.status === 'too_many') {
        return c.json({ message: 'Too many attempts. Request a new code.' }, 429)
      }
      if (outcome.status === 'expired') {
        return c.json({ message: 'That code has expired. Request a new one.' }, 400)
      }
      if (outcome.status !== 'ok') {
        return c.json({ message: 'That code is not correct.' }, 400)
      }
      remember = outcome.remember
    } else {
      const outcome = await consumeEmailVerification(user.id, code)

      if (outcome === 'too_many') {
        return c.json({ message: 'Too many attempts. Request a new code.' }, 429)
      }
      if (outcome === 'expired') {
        return c.json({ message: 'That code has expired. Request a new one.' }, 400)
      }
      if (outcome !== 'ok') {
        return c.json({ message: 'That code is not correct.' }, 400)
      }

      await query('UPDATE users SET email_verified_at = now() WHERE id = $1', [user.id])
    }

    const session = await createSession(
      user.id,
      remember ? SESSION_TTL_LONG_MS : SESSION_TTL_SHORT_MS,
      c.req.header('user-agent'),
    )
    setSessionCookie(c, session.token, session.expiresAt, remember)
    await logActivity(user.id, 'login', 'User signed in via email code', clientKey(c))

    const updated = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [user.id])
    return c.json({ user: publicUser(updated ?? user) })
  })

  app.post('/api/auth/login/link', async (c) => {
    const limit = await store.hit(`login-link:${clientKey(c)}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const body = await readJson(c)
    const token = str(body.token).trim()

    if (!token) {
      return c.json({ message: 'That sign-in link is incomplete.' }, 422)
    }

    const outcome = await consumeLoginLink(token)

    if (outcome.status === 'ok') {
      const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [outcome.userId])
      if (!user) return c.json({ message: 'Not signed in.' }, 401)

      const session = await createSession(
        user.id,
        outcome.remember ? SESSION_TTL_LONG_MS : SESSION_TTL_SHORT_MS,
        c.req.header('user-agent'),
      )
      setSessionCookie(c, session.token, session.expiresAt, outcome.remember)
      await logActivity(user.id, 'login', 'User signed in via magic link', clientKey(c))
      return c.json({ user: publicUser(user) })
    }

    const verifyOutcome = await consumeEmailVerificationLink(token)
    if (verifyOutcome.status === 'ok') {
      await query('UPDATE users SET email_verified_at = now() WHERE id = $1', [verifyOutcome.userId])
      const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [verifyOutcome.userId])
      if (!user) return c.json({ message: 'Not signed in.' }, 401)

      const session = await createSession(
        user.id,
        SESSION_TTL_SHORT_MS,
        c.req.header('user-agent'),
      )
      setSessionCookie(c, session.token, session.expiresAt, false)
      await logActivity(user.id, 'login', 'User verified email via link', clientKey(c))
      return c.json({ user: publicUser(user) })
    }

    if (outcome.status === 'expired' || verifyOutcome.status === 'expired') {
      return c.json({ message: 'That sign-in link has expired. Request a new one.' }, 400)
    }

    return c.json({ message: 'That sign-in link is invalid.' }, 400)
  })

  app.post('/api/auth/login/resend', async (c) => {
    const limit = await store.hit(`login-resend:${clientKey(c)}`, 3, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many requests. Try again shortly.' }, 429)
    }

    const body = await readJson(c)
    const email = str(body.email).trim()

    if (!email || !EMAIL_PATTERN.test(email)) {
      return c.json({ fieldErrors: { email: 'Enter a valid email address.' } }, 422)
    }

    // Anti-oracle: the response never says whether the address has an account.
    const user = await findUserByEmail(email)
    if (user && user.email_verified_at) {
      await dispatchLoginChallenge(user, body.remember === true)
    }

    return c.json({ ok: true })
  })

  app.get('/api/auth/me', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    return c.json({
      user: publicUser(user),
      session: { createdAt: toIso(session.created_at), expiresAt: toIso(session.expires_at) },
    })
  })

  app.post('/api/auth/verify-email', async (c) => {
    const limit = await store.hit(`verify:${clientKey(c)}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const body = await readJson(c)
    const email = str(body.email).trim()
    const code = str(body.code).trim()

    if (!email || !isCodeShape(code)) {
      return c.json({ message: `Enter the ${CODE_LENGTH}-digit code from your email.` }, 422)
    }

    const user = await findUserByEmail(email)

    if (!user) {
      return c.json({ message: 'That code is not correct.' }, 400)
    }

    if (user.email_verified_at) {
      return c.json({ message: 'That account is already confirmed. Sign in instead.' }, 400)
    }

    const outcome = await consumeEmailVerification(user.id, code)

    if (outcome === 'too_many') {
      return c.json({ message: 'Too many attempts. Request a new code.' }, 429)
    }
    if (outcome === 'expired') {
      return c.json({ message: 'That code has expired. Request a new one.' }, 400)
    }
    if (outcome !== 'ok') {
      return c.json({ message: 'That code is not correct.' }, 400)
    }

    const confirmed = await confirmAccount(c, user.id, body.remember === true)
    if (!confirmed) return c.json({ message: 'Could not confirm the account.' }, 500)

    return c.json({ user: confirmed })
  })

  app.post('/api/auth/verify-email/link', async (c) => {
    const limit = await store.hit(`verify-link:${clientKey(c)}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const body = await readJson(c)
    const token = str(body.token).trim()

    if (!token) {
      return c.json({ message: 'That confirmation link is incomplete.' }, 422)
    }

    const outcome = await consumeEmailVerificationLink(token)

    if (outcome.status === 'expired') {
      return c.json({ message: 'That link has expired. Request a new one.' }, 400)
    }
    if (outcome.status !== 'ok') {
      return c.json({ message: 'That confirmation link is invalid.' }, 400)
    }

    const confirmed = await confirmAccount(c, outcome.userId, body.remember === true)
    if (!confirmed) return c.json({ message: 'Could not confirm the account.' }, 500)

    return c.json({ user: confirmed })
  })

  app.post('/api/auth/resend-verification', async (c) => {
    const limit = await store.hit(`resend:${clientKey(c)}`, 3, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many requests. Try again shortly.' }, 429)
    }

    const body = await readJson(c)
    const email = str(body.email).trim()

    if (!email || !EMAIL_PATTERN.test(email)) {
      return c.json({ fieldErrors: { email: 'Enter a valid email address.' } }, 422)
    }

    const user = await findUserByEmail(email)
    if (user && !user.email_verified_at) {
      await sendVerificationCode(user)
    }

    return c.json({ ok: true })
  })

  app.get('/api/auth/passkeys', async (c) => {
    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const rows = await listPasskeys(user.id)
    return c.json({ passkeys: rows.map(publicPasskey) })
  })

  app.post('/api/auth/passkeys/register/options', async (c) => {
    const limit = await store.hit(`passkey-register:${clientKey(c)}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const existing = await listPasskeys(user.id)
    const options = await registrationOptions(user, existing)
    const ceremony = await storeCeremony('registration', user.id, options.challenge)
    setCeremonyCookie(c, ceremony.token)

    return c.json({ options })
  })

  app.post('/api/auth/passkeys/register/verify', async (c) => {
    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const body = await readJson(c)
    const response = body.response as RegistrationResponseJSON | undefined

    if (!response || typeof response.id !== 'string') {
      return c.json({ message: 'That registration response is incomplete.' }, 422)
    }

    const ceremony = await consumeCeremony(getCookie(c, CEREMONY_COOKIE) ?? '', 'registration')
    clearCeremonyCookie(c)

    if (!ceremony || ceremony.user_id !== user.id) {
      return c.json({ message: 'That registration has expired. Start again.' }, 400)
    }

    const name = str(body.name).trim().slice(0, 60) || 'Passkey'

    try {
      const created = await verifyRegistration({
        response,
        challenge: ceremony.challenge,
        userId: user.id,
        name,
      })

      if (!created) return c.json({ message: 'Could not verify that passkey.' }, 400)

      await logActivity(user.id, 'create_passkey', `Registered passkey "${name}"`, clientKey(c))

      const rows = await listPasskeys(user.id)
      const row = rows.find((entry) => entry.id === created.id)

      return c.json({ passkey: row ? publicPasskey(row) : null })
    } catch (error) {
      console.error('[passkey] registration failed', error)
      return c.json({ message: 'Could not verify that passkey.' }, 400)
    }
  })

  app.post('/api/auth/passkeys/login/options', async (c) => {
    const limit = await store.hit(`passkey-login:${clientKey(c)}`, 20, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    // No allowCredentials: the authenticator asks the user which passkey to use, so
    // the sign-in page never has to know an address before the credential does.
    const options = await authenticationOptions()
    const ceremony = await storeCeremony('authentication', null, options.challenge)
    setCeremonyCookie(c, ceremony.token)

    return c.json({ options })
  })

  app.post('/api/auth/passkeys/login/verify', async (c) => {
    const limit = await store.hit(`passkey-login-verify:${clientKey(c)}`, 20, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const body = await readJson(c)
    const response = body.response as AuthenticationResponseJSON | undefined

    if (!response || typeof response.id !== 'string') {
      return c.json({ message: 'That sign-in response is incomplete.' }, 422)
    }

    const ceremony = await consumeCeremony(getCookie(c, CEREMONY_COOKIE) ?? '', 'authentication')
    clearCeremonyCookie(c)

    if (!ceremony) {
      return c.json({ message: 'That sign-in has expired. Try again.' }, 400)
    }

    const row = await findPasskeyByCredentialId(response.id)
    if (!row) return c.json({ message: 'That passkey is not registered here.' }, 400)

    try {
      const verified = await verifyAuthentication({
        response,
        challenge: ceremony.challenge,
        row,
      })
      if (!verified) return c.json({ message: 'Could not verify that passkey.' }, 400)

      const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [verified.userId])
      if (!user) return c.json({ message: 'Could not verify that passkey.' }, 400)

      // A passkey can only be registered from a signed-in session, and signing in
      // needs a confirmed address, so this is belt-and-braces rather than a live path.
      if (!user.email_verified_at) {
        return c.json({ message: 'Confirm your email address first.', code: 'email_unverified' }, 403)
      }

      /*
       * No second-factor prompt follows. A passkey is already possession plus user
       * verification, which is what the code would have added, so asking for it again
       * would be theatre. GitHub and Google both document the same behaviour, and the
       * account page says so before a passkey is added.
       */
      const remember = body.remember === true
      const session = await createSession(
        user.id,
        remember ? SESSION_TTL_LONG_MS : SESSION_TTL_SHORT_MS,
        c.req.header('user-agent'),
      )
      setSessionCookie(c, session.token, session.expiresAt, remember)
      await logActivity(user.id, 'login', `User signed in with passkey "${row.name}"`, clientKey(c))

      return c.json({ user: publicUser(user) })
    } catch (error) {
      console.error('[passkey] authentication failed', error)
      return c.json({ message: 'Could not verify that passkey.' }, 400)
    }
  })

  app.post('/api/auth/passkeys/:id/remove', async (c) => {
    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const removed = await deletePasskey(user.id, c.req.param('id'))
    if (!removed) return c.json({ message: 'That passkey is not on this account.' }, 404)

    await logActivity(user.id, 'delete_passkey', `Removed passkey ${c.req.param('id')}`, clientKey(c))

    return c.json({ ok: true })
  })

  app.get('/api/auth/change-email', async (c) => {
    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    return c.json({ pending: await loadEmailChange(user.id) })
  })

  app.post('/api/auth/change-email', async (c) => {
    const limit = await store.hit(`change-email:${clientKey(c)}`, 5, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const body = await readJson(c)
    const newEmail = str(body.email).trim()

    const fieldErrors: Record<string, string> = {}
    if (!newEmail) fieldErrors.email = 'Enter the new email address.'
    else if (!EMAIL_PATTERN.test(newEmail)) fieldErrors.email = 'Enter a valid email address.'
    else if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      fieldErrors.email = 'That is already the address on this account.'
    }

    if (Object.keys(fieldErrors).length > 0) {
      return c.json({ message: 'Check the highlighted fields.', fieldErrors }, 422)
    }

    const taken = await findUserByEmail(newEmail)
    if (taken && taken.id !== user.id) {
      return c.json({ fieldErrors: { email: 'That address is already in use.' } }, 409)
    }

    const change = await createEmailChange(user.id, newEmail)
    const cancelLink = `${publicOrigin()}/cancel-email-change?token=${encodeURIComponent(change.cancelToken)}`

    // On the critical path, unlike the warning below: the caller is sitting at a
    // prompt waiting for this message, so it fails the request rather than logging.
    try {
      const codeMsg = { to: newEmail, ...emailChangeCodeEmail(change.code, newEmail) }
      const sent = await sendMail(codeMsg)
      await logEmail(newEmail, codeMsg.subject, codeMsg.text, user.id)
      console.log(
        sent.filePath
          ? `[change email] ${newEmail} -> ${sent.filePath}`
          : `[change email] emailed ${newEmail}`,
      )
    } catch (error) {
      console.error('[change email] could not send mail', error)
      return c.json({ message: 'Could not send the confirmation email. Try again shortly.' }, 503)
    }

    try {
      const warnMsg = {
        to: user.email,
        ...emailChangeNoticeEmail(user.email, newEmail, cancelLink),
      }
      await sendMail(warnMsg)
      await logEmail(user.email, warnMsg.subject, warnMsg.text, user.id)
    } catch (error) {
      console.error('[change email] could not warn the old address', error)
    }

    return c.json({ pending: { email: newEmail, expiresAt: change.expiresAt } })
  })

  app.post('/api/auth/change-email/verify', async (c) => {
    const limit = await store.hit(`change-email-verify:${clientKey(c)}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const body = await readJson(c)
    const code = str(body.code).trim()

    if (!isChangeCodeShape(code)) {
      return c.json({ message: `Enter the ${CHANGE_CODE_LENGTH}-digit code from your email.` }, 422)
    }

    const pending = await loadEmailChange(user.id)
    if (!pending) {
      return c.json({ message: 'No address change is waiting. Start again.' }, 400)
    }

    const outcome = await consumeEmailChange(user.id, code)

    if (outcome === 'too_many') {
      return c.json({ message: 'Too many attempts. Start the change again.' }, 429)
    }
    if (outcome === 'expired') {
      return c.json({ message: 'That code has expired. Start the change again.' }, 400)
    }
    if (outcome !== 'ok') {
      return c.json({ message: 'That code is not correct.' }, 400)
    }

    // Re-checked because the address could have been claimed by someone else
    // between the request and this moment.
    const taken = await findUserByEmail(pending.email)
    if (taken && taken.id !== user.id) {
      return c.json({ fieldErrors: { email: 'That address is already in use.' } }, 409)
    }

    const claimed = await claimEmailChange(user.id)
    if (!claimed) return c.json({ message: 'That request is no longer pending.' }, 409)

    const previousEmail = user.email
    const updated = await queryOne<UserRow>(
      'UPDATE users SET email = $1, email_verified_at = now() WHERE id = $2 RETURNING *',
      [claimed.newEmail, user.id],
    )
    if (!updated) return c.json({ message: 'Could not change the address.' }, 500)

    // Anyone signed in elsewhere was authenticated against the old address, so
    // they are dropped and only the browser that proved the new one stays in.
    await query('DELETE FROM sessions WHERE user_id = $1', [user.id])
    const session = await createSession(user.id, SESSION_TTL_SHORT_MS, c.req.header('user-agent'))
    setSessionCookie(c, session.token, session.expiresAt, false)

    try {
      const doneMsg = {
        to: previousEmail,
        ...emailChangeDoneEmail(previousEmail, claimed.newEmail),
      }
      await sendMail(doneMsg)
      await logEmail(previousEmail, doneMsg.subject, doneMsg.text, user.id)
    } catch (error) {
      console.error('[change email] could not confirm to the old address', error)
    }

    return c.json({ user: publicUser(updated) })
  })

  app.post('/api/auth/change-email/cancel', async (c) => {
    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    await cancelEmailChange(user.id)
    return c.json({ ok: true })
  })

  app.post('/api/auth/change-email/cancel-link', async (c) => {
    const limit = await store.hit(`change-cancel:${clientKey(c)}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const body = await readJson(c)
    const token = str(body.token).trim()

    if (!token) return c.json({ message: 'That link is incomplete.' }, 422)

    const cancelled = await cancelEmailChangeByToken(token)
    if (!cancelled) return c.json({ message: 'That link is no longer valid.' }, 400)

    return c.json({ ok: true })
  })

  app.patch('/api/auth/account', async (c) => {
    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const body = await readJson(c)
    const fieldErrors: Record<string, string> = {}

    let nextName = user.name
    if ('name' in body) {
      const name = str(body.name).trim()
      if (!name) {
        fieldErrors.name = 'Enter your name.'
      } else {
        nextName = name
      }
    }

    let nextAvatarUrl: string | null = user.avatar_url ?? null
    if ('avatarUrl' in body) {
      // ponytail: inlined data URL in postgres, ceiling 500KB. Upgrade to S3/CDN when multi-host media needed.
      if (body.avatarUrl === null || body.avatarUrl === '') {
        nextAvatarUrl = null
      } else if (typeof body.avatarUrl === 'string') {
        const val = body.avatarUrl.trim()
        if (!val.startsWith('data:image/') && !val.startsWith('https://')) {
          fieldErrors.avatarUrl = 'Avatar must be an image data URL or HTTPS link.'
        } else if (val.length > 500_000) {
          fieldErrors.avatarUrl = 'Image is too large (max 500 KB compressed).'
        } else {
          nextAvatarUrl = val
        }
      } else {
        fieldErrors.avatarUrl = 'Invalid avatar format.'
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return c.json({ message: 'Check the highlighted fields.', fieldErrors }, 422)
    }

    const updated = await queryOne<UserRow>(
      'UPDATE users SET name = $1, avatar_url = $2 WHERE id = $3 RETURNING *',
      [nextName, nextAvatarUrl, user.id],
    )
    if (!updated) return c.json({ message: 'Could not update the account.' }, 500)

    if (nextName !== user.name) {
      await logActivity(user.id, 'update_profile', `Updated name to "${nextName}"`, clientKey(c))
    }
    if (nextAvatarUrl !== user.avatar_url) {
      await logActivity(user.id, 'update_avatar', nextAvatarUrl ? 'Updated avatar photo' : 'Removed avatar photo', clientKey(c))
    }

    return c.json({ user: publicUser(updated) })
  })

  app.get('/api/auth/sessions', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const rows = await listSessions(user.id)
    const currentHash = hashToken(getCookie(c, SESSION_COOKIE) ?? '')

    return c.json({
      sessions: rows.map((row) => ({
        id: row.token_hash,
        isCurrent: row.token_hash === currentHash,
        userAgent: row.user_agent,
        createdAt: toIso(row.created_at),
        expiresAt: toIso(row.expires_at),
      })),
    })
  })

  app.delete('/api/auth/sessions/:id', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const tokenHash = c.req.param('id')
    if (tokenHash === session.token_hash) {
      return c.json({ message: 'Cannot revoke the current session here. Sign out instead.' }, 400)
    }

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    await destroySessionById(tokenHash)
    await logActivity(user.id, 'revoke_session', 'Revoked device session', clientKey(c))
    return c.json({ ok: true })
  })

  app.post('/api/auth/delete-account/request', async (c) => {
    const limit = await store.hit(`delete-req:${clientKey(c)}`, 5, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const code = generateNumericCode(CODE_LENGTH)
    const expiresAt = new Date(Date.now() + CODE_TTL_MS)

    await query(
      `INSERT INTO account_deletions (user_id, code_hash, attempts, created_at, expires_at)
       VALUES ($1, $2, 0, now(), $3)
       ON CONFLICT (user_id) DO UPDATE SET
         code_hash = EXCLUDED.code_hash,
         attempts = 0,
         created_at = now(),
         expires_at = EXCLUDED.expires_at`,
      [user.id, hashSecret(code), expiresAt.toISOString()],
    )

    const mailMsg = { to: user.email, ...deletionEmail(code) }
    try {
      const sent = await sendMail(mailMsg)
      await logEmail(user.email, mailMsg.subject, mailMsg.text, user.id)
      console.log(
        sent.filePath
          ? `[delete account] ${user.email} -> ${sent.filePath}`
          : `[delete account] emailed ${user.email}`,
      )
    } catch (err) {
      console.error('[delete account] failed to send mail', err)
      return c.json({ message: 'Could not send deletion confirmation code.' }, 500)
    }

    return c.json({ ok: true, email: user.email })
  })

  app.delete('/api/auth/account', async (c) => {
    const limit = await store.hit(`delete-account:${clientKey(c)}`, 10, 60 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const body = await readJson(c).catch(() => ({}))
    const code = str(body.code).trim()
    const confirmation = str(body.confirmation ?? body.confirmText).trim()

    if (confirmation !== 'DELETE') {
      return c.json({ message: 'You must type DELETE in all capitals to confirm.' }, 400)
    }

    if (!code) {
      return c.json({ message: 'Enter the verification code sent to your email.' }, 400)
    }

    const delRow = await queryOne<{
      code_hash: string
      attempts: number
      expires_at: Date
    }>('SELECT code_hash, attempts, expires_at FROM account_deletions WHERE user_id = $1', [user.id])

    if (!delRow) {
      return c.json({ message: 'No deletion request found. Please request a new code.' }, 400)
    }

    if (new Date(delRow.expires_at).getTime() < Date.now()) {
      await query('DELETE FROM account_deletions WHERE user_id = $1', [user.id])
      return c.json({ message: 'That code has expired. Please request a new code.' }, 400)
    }

    if (delRow.attempts >= 5) {
      await query('DELETE FROM account_deletions WHERE user_id = $1', [user.id])
      return c.json({ message: 'Too many incorrect attempts. Request a new code.' }, 400)
    }

    if (!matchesSecret(delRow.code_hash, code)) {
      await query('UPDATE account_deletions SET attempts = attempts + 1 WHERE user_id = $1', [user.id])
      return c.json({ message: 'That verification code is not correct.' }, 400)
    }

    await query('DELETE FROM email_logs WHERE user_id = $1 OR lower(recipient) = lower($2)', [user.id, user.email])
    await query('DELETE FROM activity_logs WHERE user_id = $1', [user.id])
    await query('DELETE FROM users WHERE id = $1', [user.id])
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  app.get('/api/auth/activity', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 20), 1), 100)
    const offset = Math.max(Number(c.req.query('offset') ?? 0), 0)

    const countRow = await queryOne<{ total: string }>(
      'SELECT count(*) AS total FROM activity_logs WHERE user_id = $1',
      [user.id],
    )
    const rows = await query<{
      id: string
      action: string
      details: string
      ip_address: string | null
      created_at: Date
    }>(
      'SELECT id, action, details, ip_address, created_at FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [user.id, limit, offset],
    )

    return c.json({
      total: Number(countRow?.total ?? 0),
      activities: rows.map((r) => ({
        id: r.id,
        action: r.action,
        details: r.details,
        ipAddress: r.ip_address,
        createdAt: toIso(r.created_at),
      })),
    })
  })

  app.get('/api/auth/emails', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 20), 1), 100)
    const offset = Math.max(Number(c.req.query('offset') ?? 0), 0)

    const countRow = await queryOne<{ total: string }>(
      'SELECT count(*) AS total FROM email_logs WHERE user_id = $1',
      [user.id],
    )
    const rows = await query<{
      id: string
      recipient: string
      subject: string
      body_text: string
      status: string
      created_at: Date
    }>(
      'SELECT id, recipient, subject, body_text, status, created_at FROM email_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [user.id, limit, offset],
    )

    return c.json({
      total: Number(countRow?.total ?? 0),
      emails: rows.map((r) => ({
        id: r.id,
        recipient: r.recipient,
        subject: r.subject,
        bodyText: r.body_text,
        status: r.status,
        createdAt: toIso(r.created_at),
      })),
    })
  })

  app.delete('/api/auth/emails', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    await query('DELETE FROM email_logs WHERE user_id = $1', [user.id])
    await logActivity(user.id, 'clear_emails', 'Cleared sent email history', clientKey(c))
    return c.json({ ok: true })
  })

  app.delete('/api/auth/emails/:id', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const emailId = c.req.param('id')
    await query('DELETE FROM email_logs WHERE id = $1 AND user_id = $2', [emailId, user.id])
    return c.json({ ok: true })
  })

  app.get('/api/auth/export-data', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const userPasskeys = await listPasskeys(user.id)
    const userSessions = await listSessions(user.id)
    const userActivities = await query(
      'SELECT id, action, details, ip_address, created_at FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC',
      [user.id],
    )
    const userEmails = await query(
      'SELECT id, recipient, subject, body_text, status, created_at FROM email_logs WHERE user_id = $1 ORDER BY created_at DESC',
      [user.id],
    )

    await logActivity(user.id, 'export_data', 'User requested full GDPR data export', clientKey(c))

    return c.json({
      exportedAt: new Date().toISOString(),
      account: publicUser(user),
      passkeys: userPasskeys.map(publicPasskey),
      sessions: userSessions.map((s) => ({
        userAgent: s.user_agent,
        createdAt: toIso(s.created_at),
        expiresAt: toIso(s.expires_at),
      })),
      activity: userActivities,
      emails: userEmails,
    })
  })

  app.get('/api/health', async (c) => {
    await purgeExpiredSessions()
    const version = await queryOne<{ server_version: string }>('SHOW server_version')
    return c.json({
      ok: true,
      service: 'solstice-api',
      database: `postgres ${version?.server_version}`,
      mail: mailTransportName(),
    })
  })

  /*
   * Development only, and explicitly opt-in. Reset links travel by mail and the
   * file transport has no inbox, so this exposes what was written. It stays off
   * unless DEV_MAILBOX=1, because gating it on NODE_ENV alone would hand out
   * live reset tokens to any deployment that forgot to set NODE_ENV=production.
   */
  if (process.env.DEV_MAILBOX === '1') {
    app.get('/api/dev/mailbox', async (c) => {
      const requested = Number(c.req.query('limit') ?? 20)
      const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 20
      const transport = mailTransportName()

      // Nothing is written to the mailbox when a real relay is configured, and
      // listing leftover files would present an expired reset link as current.
      return c.json({
        transport,
        directory: transport === 'file' ? mailboxDir() : null,
        messages: transport === 'file' ? await listMailbox(limit) : [],
      })
    })
  }

  app.notFound((c) => c.json({ message: 'Not found.' }, 404))

  app.onError((error, c) => {
    console.error('[api error]', error)
    return c.json({ message: 'Something went wrong.' }, 500)
  })

  return app
}
