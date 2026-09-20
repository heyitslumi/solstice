import { createHash, randomUUID } from 'node:crypto'
import os from 'node:os'

import { getConnInfo } from '@hono/node-server/conninfo'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'

import { query, queryOne, toIso, type InstanceRow, type SshKeyRow, type UserRow } from './db.ts'
import { incus, type IncusInstance } from './incus/client.ts'
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
    isAdmin: !!row.is_admin,
    createdAt: toIso(row.created_at),
  }
}

/** Resolve the signed-in user and reject unless they are a platform admin. */
async function requireAdmin(c: Context) {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null

  const session = await readSession(token)
  if (!session) return null

  const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
  if (!user || !user.is_admin) return null

  return { session, user }
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

    const body = (await readJson(c).catch(() => ({}))) as Record<string, unknown>
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

  const OS_MAP: Record<string, { name: string; alias: string }> = {
    'debian-12': { name: 'Debian 12 Bookworm', alias: 'debian/12' },
    'ubuntu-24': { name: 'Ubuntu 24.04 LTS', alias: 'ubuntu/24.04' },
    'alpine-edge': { name: 'Alpine Linux Edge', alias: 'alpine/edge' },
  }

  function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }

  function formatMemory(memoryMb: number): string {
    if (memoryMb >= 1024) {
      const gb = memoryMb / 1024
      return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
    }
    return `${memoryMb} MB`
  }

  app.get('/api/instances', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const dbRows = await query<InstanceRow>(
      'SELECT * FROM instances WHERE user_id = $1 ORDER BY created_at DESC',
      [session.user_id],
    )

    let incusMap = new Map<string, IncusInstance>()
    try {
      const incusList = await incus.listInstances()
      incusMap = new Map(incusList.map((i) => [i.name, i]))
    } catch (err) {
      console.error('Failed to list Incus instances:', err)
    }

    const instances = dbRows.map((row) => {
      const live = incusMap.get(row.name)
      const isRunning = live?.status?.toLowerCase() === 'running'

      let ip4 = '—'
      let ip6 = '—'
      let totalBytes = 0

      if (live?.state?.network) {
        for (const [ifaceName, iface] of Object.entries(live.state.network)) {
          if (ifaceName === 'lo') continue
          totalBytes += (iface.counters?.bytes_received || 0) + (iface.counters?.bytes_sent || 0)
          for (const addr of iface.addresses || []) {
            if (addr.family === 'inet' && addr.scope === 'global' && ip4 === '—') {
              ip4 = addr.address
            } else if (addr.family === 'inet6' && addr.scope === 'global' && ip6 === '—') {
              ip6 = addr.address
            }
          }
        }
      }

      const memBytes = live?.state?.memory?.usage || 0
      const totalMemBytes = (row.memory_mb || 1024) * 1024 * 1024
      const ramUsage =
        isRunning && totalMemBytes > 0
          ? Math.min(100, Math.round((memBytes / totalMemBytes) * 100))
          : 0

      return {
        id: row.id,
        name: row.name,
        type: row.type as 'kvm' | 'lxc',
        os: row.os,
        status: (isRunning ? 'running' : 'stopped') as 'running' | 'stopped',
        ip4,
        ip6,
        cores: row.cores,
        memory: formatMemory(row.memory_mb),
        disk: `${row.disk_gb} GB NVMe`,
        uptime: isRunning ? 'Active' : 'Stopped',
        region: 'Frankfurt (fra-01)',
        cpuUsage: isRunning ? 5 : 0,
        ramUsage,
        bandwidth: formatBytes(totalBytes),
        createdAt: toIso(row.created_at),
      }
    })

    return c.json({ instances })
  })

  app.post('/api/instances', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const body = await c.req
      .json<{
        name?: string
        type?: 'kvm' | 'lxc'
        os?: string
        cores?: number
        memoryMb?: number
        diskGb?: number
      }>()
      .catch(() => null)

    if (!body || typeof body.name !== 'string') {
      return c.json({ message: 'Instance name is required.' }, 400)
    }

    const cleanName = body.name.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(cleanName)) {
      return c.json(
        { message: 'Name must be 3-32 characters, lowercase alphanumeric and hyphens only.' },
        400,
      )
    }

    const type = body.type === 'kvm' ? 'kvm' : 'lxc'
    const osKey = body.os || 'debian-12'
    const osConfig = OS_MAP[osKey] || { name: 'Debian 12 Bookworm', alias: 'debian/12' }
    const cores = Math.max(1, Math.min(8, Number(body.cores) || 1))
    const memoryMb = Math.max(512, Math.min(16384, Number(body.memoryMb) || 1024))
    const diskGb = Math.max(5, Math.min(200, Number(body.diskGb) || 10))

    const existing = await queryOne('SELECT id FROM instances WHERE name = $1', [cleanName])
    if (existing) {
      return c.json({ message: 'An instance with this name already exists.' }, 409)
    }

    const instanceId = randomUUID()

    const userSshKeys = await query<SshKeyRow>('SELECT public_key FROM ssh_keys WHERE user_id = $1', [user.id])
    const sshPublicKeys = userSshKeys.map((k) => k.public_key)

    try {
      await incus.createInstance({
        name: cleanName,
        type: type === 'kvm' ? 'virtual-machine' : 'container',
        imageAlias: osConfig.alias,
        cpu: cores,
        memory: `${memoryMb}MiB`,
        disk: `${diskGb}GiB`,
        sshKeys: sshPublicKeys,
      })

      // Start the newly provisioned instance
      await incus.setInstanceState(cleanName, 'start').catch((e) => {
        console.warn('Failed to start newly created instance:', e)
      })

      await query(
        `INSERT INTO instances (id, user_id, name, type, os, image_alias, cores, memory_mb, disk_gb)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [instanceId, user.id, cleanName, type, osConfig.name, osConfig.alias, cores, memoryMb, diskGb],
      )

      await logActivity(
        user.id,
        'create_instance',
        `Created ${type.toUpperCase()} instance "${cleanName}" (${osConfig.name})`,
        clientKey(c),
      )

      return c.json(
        {
          id: instanceId,
          name: cleanName,
          type,
          os: osConfig.name,
          status: 'running',
          cores,
          memoryMb,
          diskGb,
        },
        201,
      )
    } catch (err: any) {
      console.error('Incus instance creation failed:', err)
      return c.json({ message: err?.message || 'Failed to provision instance.' }, 500)
    }
  })

  app.post('/api/instances/:id/action', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const instanceId = c.req.param('id')
    const instance = await queryOne<InstanceRow>(
      'SELECT * FROM instances WHERE id = $1 AND user_id = $2',
      [instanceId, session.user_id],
    )
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    const body = await c.req.json<{ action?: string }>().catch(() => null)
    const action = body?.action
    if (action !== 'start' && action !== 'stop' && action !== 'restart') {
      return c.json({ message: 'Action must be start, stop, or restart.' }, 400)
    }

    try {
      await incus.setInstanceState(instance.name, action)
      await logActivity(
        session.user_id,
        `${action}_instance`,
        `${action.toUpperCase()} action on instance "${instance.name}"`,
        clientKey(c),
      )
      return c.json({ ok: true, action })
    } catch (err: any) {
      console.error(`Failed to ${action} instance:`, err)
      return c.json({ message: err?.message || `Failed to ${action} instance.` }, 500)
    }
  })

  app.delete('/api/instances/:id', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const instanceId = c.req.param('id')
    const instance = await queryOne<InstanceRow>(
      'SELECT * FROM instances WHERE id = $1 AND user_id = $2',
      [instanceId, session.user_id],
    )
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    try {
      await incus.setInstanceState(instance.name, 'stop', true).catch(() => {})
      await incus.deleteInstance(instance.name)
    } catch (err: any) {
      console.warn('Incus deletion warning:', err?.message)
    }

    await query('DELETE FROM instances WHERE id = $1', [instance.id])
    await logActivity(
      session.user_id,
      'delete_instance',
      `Deleted instance "${instance.name}"`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.get('/api/instances/stats', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const userInstances = await query<InstanceRow>(
      'SELECT cores, memory_mb, disk_gb FROM instances WHERE user_id = $1',
      [session.user_id],
    )

    let incusInfo: any = null
    try {
      incusInfo = await incus.getSystemInfo()
    } catch (e) {
      console.error('Failed to get Incus system info:', e)
    }

    const totalCores = userInstances.reduce((acc, i) => acc + i.cores, 0)
    const totalMemoryMb = userInstances.reduce((acc, i) => acc + i.memory_mb, 0)
    const totalDiskGb = userInstances.reduce((acc, i) => acc + i.disk_gb, 0)

    return c.json({
      resources: {
        totalInstances: userInstances.length,
        totalCores,
        totalMemory: formatMemory(totalMemoryMb),
        totalDiskGb,
      },
      node: {
        daemon: incusInfo?.server || 'incus',
        version: incusInfo?.environment?.server_version || '7.4',
        os: `${incusInfo?.environment?.os_name || 'Debian'} ${incusInfo?.environment?.os_version || '13'}`,
        kernel: incusInfo?.environment?.kernel_version || 'Linux',
        driver: incusInfo?.environment?.driver || 'lxc | qemu',
        status: 'online',
      },
    })
  })

  app.get('/api/instances/:id', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const instanceId = c.req.param('id')
    const row = await queryOne<InstanceRow>(
      'SELECT * FROM instances WHERE id = $1 AND user_id = $2',
      [instanceId, session.user_id],
    )
    if (!row) return c.json({ message: 'Instance not found.' }, 404)

    let live: IncusInstance | null = null
    let state: any = null
    try {
      live = await incus.getInstance(row.name)
      state = await incus.getInstanceState(row.name).catch(() => null)
    } catch (err) {
      console.warn('Could not fetch Incus instance details:', err)
    }

    const isRunning = (state?.status || live?.status)?.toLowerCase() === 'running'

    let ip4 = '—'
    let ip6 = '—'
    let totalBytes = 0
    const networkInterfaces: any[] = []

    if (state?.network) {
      for (const [name, iface] of Object.entries<any>(state.network)) {
        if (name === 'lo') continue
        const rx = iface.counters?.bytes_received || 0
        const tx = iface.counters?.bytes_sent || 0
        totalBytes += rx + tx

        const ifaceIpv4 =
          iface.addresses?.find((a: any) => a.family === 'inet' && a.scope === 'global')?.address ||
          '—'
        const ifaceIpv6 =
          iface.addresses?.find((a: any) => a.family === 'inet6' && a.scope === 'global')?.address ||
          '—'

        if (ip4 === '—' && ifaceIpv4 !== '—') ip4 = ifaceIpv4
        if (ip6 === '—' && ifaceIpv6 !== '—') ip6 = ifaceIpv6

        networkInterfaces.push({
          interface: name,
          hwaddr: iface.hwaddr,
          state: iface.state,
          ip4: ifaceIpv4,
          ip6: ifaceIpv6,
          rxFormatted: formatBytes(rx),
          txFormatted: formatBytes(tx),
        })
      }
    }

    const memBytes = state?.memory?.usage || 0
    const totalMemBytes = (row.memory_mb || 1024) * 1024 * 1024
    const ramUsage =
      isRunning && totalMemBytes > 0
        ? Math.min(100, Math.round((memBytes / totalMemBytes) * 100))
        : 0

    return c.json({
      instance: {
        id: row.id,
        name: row.name,
        type: row.type,
        os: row.os,
        imageAlias: row.image_alias,
        status: isRunning ? 'running' : 'stopped',
        ip4,
        ip6,
        cores: row.cores,
        memory: formatMemory(row.memory_mb),
        memoryMb: row.memory_mb,
        disk: `${row.disk_gb} GB NVMe`,
        diskGb: row.disk_gb,
        uptime: isRunning ? 'Active' : 'Stopped',
        region: 'Frankfurt (fra-01)',
        cpuUsage: isRunning ? 5 : 0,
        ramUsage,
        bandwidth: formatBytes(totalBytes),
        networkInterfaces,
        createdAt: toIso(row.created_at),
      },
    })
  })

  function sshFingerprint(publicKey: string): string {
    const parts = publicKey.trim().split(/\s+/)
    if (parts.length >= 2) {
      try {
        const keyBuffer = Buffer.from(parts[1], 'base64')
        const hash = createHash('sha256').update(keyBuffer).digest('base64')
        return `SHA256:${hash.replace(/=+$/, '')}`
      } catch {
        // fallback
      }
    }
    return 'SHA256:invalid'
  }

  app.get('/api/auth/ssh-keys', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const keys = await query<SshKeyRow>(
      'SELECT id, name, public_key, fingerprint, created_at FROM ssh_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [session.user_id],
    )
    return c.json({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        publicKey: k.public_key,
        fingerprint: k.fingerprint,
        createdAt: toIso(k.created_at),
      })),
    })
  })

  app.post('/api/auth/ssh-keys', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const body = await c.req.json<{ name?: string; publicKey?: string }>().catch(() => null)
    const name = body?.name?.trim()
    const publicKey = body?.publicKey?.trim()

    if (!name || name.length > 50) {
      return c.json({ message: 'A descriptive key name (up to 50 chars) is required.' }, 400)
    }

    if (
      !publicKey ||
      !/^(ssh-rsa|ssh-ed25519|ecdsa-sha2-[a-z0-9-]+)\s+[A-Za-z0-9+/=]+/.test(publicKey)
    ) {
      return c.json(
        { message: 'Invalid public SSH key format (expected ssh-ed25519, ssh-rsa, or ecdsa).' },
        400,
      )
    }

    const fingerprint = sshFingerprint(publicKey)
    const keyId = randomUUID()

    await query(
      'INSERT INTO ssh_keys (id, user_id, name, public_key, fingerprint) VALUES ($1, $2, $3, $4, $5)',
      [keyId, session.user_id, name, publicKey, fingerprint],
    )

    await logActivity(
      session.user_id,
      'add_ssh_key',
      `Added public SSH key "${name}" (${fingerprint})`,
      clientKey(c),
    )

    return c.json(
      {
        id: keyId,
        name,
        publicKey,
        fingerprint,
        createdAt: new Date().toISOString(),
      },
      201,
    )
  })

  app.delete('/api/auth/ssh-keys/:id', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const keyId = c.req.param('id')
    const key = await queryOne<SshKeyRow>(
      'SELECT * FROM ssh_keys WHERE id = $1 AND user_id = $2',
      [keyId, session.user_id],
    )
    if (!key) return c.json({ message: 'SSH key not found.' }, 404)

    await query('DELETE FROM ssh_keys WHERE id = $1', [key.id])
    await logActivity(
      session.user_id,
      'delete_ssh_key',
      `Deleted public SSH key "${key.name}"`,
      clientKey(c),
    )

    return c.json({ ok: true })
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

  /* ── Admin panel ─────────────────────────────────────────────────────── */

  app.get('/api/admin/users', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rows = await query<
      UserRow & { instance_count: number; ssh_key_count: number }
    >(
      `SELECT u.*,
              (SELECT COUNT(*)::int FROM instances i WHERE i.user_id = u.id) AS instance_count,
              (SELECT COUNT(*)::int FROM ssh_keys k WHERE k.user_id = u.id) AS ssh_key_count
         FROM users u
        ORDER BY u.created_at ASC`,
    )

    return c.json(
      rows.map((u) => ({
        ...publicUser(u),
        instanceCount: u.instance_count,
        sshKeyCount: u.ssh_key_count,
      })),
    )
  })

  app.patch('/api/admin/users/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const targetId = c.req.param('id')
    const body = await c.req.json<{ isAdmin?: boolean }>().catch(() => null)
    if (body == null || typeof body.isAdmin !== 'boolean') {
      return c.json({ message: 'isAdmin must be a boolean.' }, 400)
    }

    // Never let an operator strip their own rights and lock everyone out.
    if (targetId === admin.user.id && !body.isAdmin) {
      return c.json({ message: 'You cannot revoke your own admin access.' }, 400)
    }

    const updated = await queryOne<UserRow>(
      'UPDATE users SET is_admin = $1 WHERE id = $2 RETURNING *',
      [body.isAdmin, targetId],
    )
    if (!updated) return c.json({ message: 'User not found.' }, 404)

    await logActivity(
      admin.user.id,
      'update_user_role',
      `${body.isAdmin ? 'Granted' : 'Revoked'} admin access for ${updated.email}`,
      clientKey(c),
    )

    return c.json(publicUser(updated))
  })

  app.delete('/api/admin/users/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const targetId = c.req.param('id')
    if (targetId === admin.user.id) {
      return c.json({ message: 'You cannot delete your own account here.' }, 400)
    }

    const target = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [targetId])
    if (!target) return c.json({ message: 'User not found.' }, 404)

    // Cascade away their instances in Incus first; the DB rows follow via FK cascade.
    const ownedInstances = await query<InstanceRow>(
      'SELECT name FROM instances WHERE user_id = $1',
      [targetId],
    )
    for (const inst of ownedInstances) {
      try {
        await incus.setInstanceState(inst.name, 'stop', true).catch(() => {})
        await incus.deleteInstance(inst.name)
      } catch (err: any) {
        console.warn(`[admin] Incus cleanup warning for "${inst.name}":`, err?.message)
      }
    }

    await query('DELETE FROM users WHERE id = $1', [targetId])

    await logActivity(
      admin.user.id,
      'delete_user',
      `Deleted user ${target.email} and ${ownedInstances.length} instance(s)`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.get('/api/admin/instances', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rows = await query<InstanceRow & { owner_email: string; owner_name: string }>(
      `SELECT i.*, u.email AS owner_email, u.name AS owner_name
         FROM instances i
         JOIN users u ON u.id = i.user_id
        ORDER BY i.created_at DESC`,
    )

    let incusMap = new Map<string, IncusInstance>()
    try {
      const incusList = await incus.listInstances()
      incusMap = new Map(incusList.map((i) => [i.name, i]))
    } catch (err) {
      console.error('[admin] Failed to list Incus instances:', err)
    }

    const instances = rows.map((row) => {
      const live = incusMap.get(row.name)
      const isRunning = live?.status?.toLowerCase() === 'running'

      let ip4 = '—'
      let totalBytes = 0
      if (live?.state?.network) {
        for (const [ifaceName, iface] of Object.entries(live.state.network)) {
          if (ifaceName === 'lo') continue
          totalBytes += (iface.counters?.bytes_received || 0) + (iface.counters?.bytes_sent || 0)
          for (const addr of iface.addresses || []) {
            if (addr.family === 'inet' && addr.scope === 'global' && ip4 === '—') {
              ip4 = addr.address
            }
          }
        }
      }

      const memBytes = live?.state?.memory?.usage || 0
      const totalMemBytes = (row.memory_mb || 1024) * 1024 * 1024
      const ramUsage =
        isRunning && totalMemBytes > 0
          ? Math.min(100, Math.round((memBytes / totalMemBytes) * 100))
          : 0

      const cpuCount = live?.state?.cpu?.usage ?? 0
      const cores = row.cores || 1
      const cpuUsage = isRunning ? Math.min(100, Math.round((cpuCount / (cores * 1e9)) * 100)) : 0

      return {
        id: row.id,
        name: row.name,
        type: row.type as 'kvm' | 'lxc',
        os: row.os,
        status: isRunning ? ('running' as const) : ('stopped' as const),
        ip4,
        cores: row.cores,
        memory: formatMemory(row.memory_mb),
        disk: `${row.disk_gb} GB`,
        cpuUsage,
        ramUsage,
        bandwidth: formatBytes(totalBytes),
        ownerId: row.user_id,
        ownerEmail: row.owner_email,
        ownerName: row.owner_name,
        createdAt: toIso(row.created_at),
      }
    })

    return c.json(instances)
  })

  app.post('/api/admin/instances', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req
      .json<{
        userId?: string
        name?: string
        type?: 'kvm' | 'lxc'
        os?: string
        cores?: number
        memoryMb?: number
        diskGb?: number
      }>()
      .catch(() => null)

    if (!body?.userId || typeof body.userId !== 'string') {
      return c.json({ message: 'Target user is required.' }, 400)
    }
    if (!body.name || typeof body.name !== 'string') {
      return c.json({ message: 'Instance name is required.' }, 400)
    }

    const owner = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [body.userId])
    if (!owner) return c.json({ message: 'Target user not found.' }, 404)

    const cleanName = body.name.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(cleanName)) {
      return c.json(
        { message: 'Name must be 3-32 characters, lowercase alphanumeric and hyphens only.' },
        400,
      )
    }

    const type = body.type === 'kvm' ? 'kvm' : 'lxc'
    const osKey = body.os || 'debian-12'
    const osConfig = OS_MAP[osKey] || { name: 'Debian 12 Bookworm', alias: 'debian/12' }
    const cores = Math.max(1, Math.min(8, Number(body.cores) || 1))
    const memoryMb = Math.max(512, Math.min(16384, Number(body.memoryMb) || 1024))
    const diskGb = Math.max(5, Math.min(200, Number(body.diskGb) || 10))

    const existing = await queryOne('SELECT id FROM instances WHERE name = $1', [cleanName])
    if (existing) {
      return c.json({ message: 'An instance with this name already exists.' }, 409)
    }

    const instanceId = randomUUID()

    const ownerSshKeys = await query<SshKeyRow>(
      'SELECT public_key FROM ssh_keys WHERE user_id = $1',
      [owner.id],
    )
    const sshPublicKeys = ownerSshKeys.map((k) => k.public_key)

    try {
      await incus.createInstance({
        name: cleanName,
        type: type === 'kvm' ? 'virtual-machine' : 'container',
        imageAlias: osConfig.alias,
        cpu: cores,
        memory: `${memoryMb}MiB`,
        disk: `${diskGb}GiB`,
        sshKeys: sshPublicKeys,
      })

      await incus.setInstanceState(cleanName, 'start').catch((e) => {
        console.warn('[admin] Failed to start newly created instance:', e)
      })

      await query(
        `INSERT INTO instances (id, user_id, name, type, os, image_alias, cores, memory_mb, disk_gb)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [instanceId, owner.id, cleanName, type, osConfig.name, osConfig.alias, cores, memoryMb, diskGb],
      )

      await logActivity(
        admin.user.id,
        'admin_create_instance',
        `Provisioned ${type.toUpperCase()} instance "${cleanName}" for ${owner.email}`,
        clientKey(c),
      )

      return c.json(
        {
          id: instanceId,
          name: cleanName,
          type,
          os: osConfig.name,
          status: 'running',
          cores,
          memoryMb,
          diskGb,
          ownerId: owner.id,
        },
        201,
      )
    } catch (err: any) {
      console.error('[admin] Incus instance creation failed:', err)
      return c.json({ message: err?.message || 'Failed to provision instance.' }, 500)
    }
  })

  app.post('/api/admin/instances/:id/action', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const instance = await queryOne<InstanceRow>('SELECT * FROM instances WHERE id = $1', [
      c.req.param('id'),
    ])
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    const body = await c.req.json<{ action?: string }>().catch(() => null)
    const action = body?.action
    if (action !== 'start' && action !== 'stop' && action !== 'restart') {
      return c.json({ message: 'Action must be start, stop, or restart.' }, 400)
    }

    try {
      await incus.setInstanceState(instance.name, action)
      await logActivity(
        admin.user.id,
        `admin_${action}_instance`,
        `${action.toUpperCase()} on instance "${instance.name}"`,
        clientKey(c),
      )
      return c.json({ ok: true, action })
    } catch (err: any) {
      console.error(`[admin] Failed to ${action} instance:`, err)
      return c.json({ message: err?.message || `Failed to ${action} instance.` }, 500)
    }
  })

  app.delete('/api/admin/instances/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const instance = await queryOne<InstanceRow>('SELECT * FROM instances WHERE id = $1', [
      c.req.param('id'),
    ])
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    try {
      await incus.setInstanceState(instance.name, 'stop', true).catch(() => {})
      await incus.deleteInstance(instance.name)
    } catch (err: any) {
      console.warn('[admin] Incus deletion warning:', err?.message)
    }

    await query('DELETE FROM instances WHERE id = $1', [instance.id])
    await logActivity(
      admin.user.id,
      'admin_delete_instance',
      `Deleted instance "${instance.name}"`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.get('/api/admin/stats', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const totals = await queryOne<{
      users: number
      admins: number
      instances: number
      running: number
      cores: number
      memory_mb: number
      disk_gb: number
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM users)                                    AS users,
         (SELECT COUNT(*)::int FROM users WHERE is_admin)                     AS admins,
         (SELECT COUNT(*)::int FROM instances)                                AS instances,
         (SELECT COUNT(*)::int FROM instances)                                AS running,
         COALESCE(SUM(cores), 0)::int                                         AS cores,
         COALESCE(SUM(memory_mb), 0)::int                                     AS memory_mb,
         COALESCE(SUM(disk_gb), 0)::int                                       AS disk_gb
       FROM instances`,
    )

    let incusInfo: any = null
    try {
      incusInfo = await incus.getSystemInfo()
    } catch (e) {
      console.error('[admin] Failed to get Incus system info:', e)
    }

    const dbVersionRow = await queryOne<{ server_version: string }>('SHOW server_version')
    const memTotalMb = Math.round(os.totalmem() / (1024 * 1024))
    const memFreeMb = Math.round(os.freemem() / (1024 * 1024))
    const memUsedMb = Math.max(0, memTotalMb - memFreeMb)
    const memPercent = memTotalMb > 0 ? Math.round((memUsedMb / memTotalMb) * 100) : 0
    const cpus = os.cpus()
    const cpuModel = cpus[0]?.model?.trim() || 'AMD EPYC Processor'

    return c.json({
      totals: {
        users: totals?.users ?? 0,
        admins: totals?.admins ?? 0,
        instances: totals?.instances ?? 0,
        cores: totals?.cores ?? 0,
        memory: formatMemory(totals?.memory_mb ?? 0),
        diskGb: totals?.disk_gb ?? 0,
      },
      node: {
        daemon: incusInfo?.server || 'incus',
        version: incusInfo?.environment?.server_version || '7.4',
        os: 'Debian GNU/Linux 13 (trixie)',
        kernel: os.release(),
        driver: incusInfo?.environment?.driver || 'lxc | qemu',
        cpuModel,
        hostMemory: {
          usedMb: memUsedMb,
          totalMb: memTotalMb,
          percent: memPercent,
        },
        databaseVersion: `PostgreSQL ${dbVersionRow?.server_version ?? '17.11'}`,
        status: 'online',
        uptimeSeconds: Math.floor(os.uptime()),
        loadAvg: os.loadavg() as [number, number, number],
      },
    })
  })

  app.get('/api/admin/settings', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rows = await query<{ key: string; value: string }>('SELECT key, value FROM system_settings')
    const config = Object.fromEntries(rows.map((r) => [r.key, r.value]))

    return c.json({
      application: {
        name: config['app_name'] || 'Solstice',
        language: config['app_language'] || 'en',
        icon: config['app_icon'] || '/brand/solstice-mark.png',
        banner: config['app_banner'] || '',
        url: config['app_url'] || publicOrigin(),
        requireEmailVerification: config['app_require_email_verification'] !== 'false',
        enableRegistration: config['app_enable_registration'] !== 'false',
        enableTelemetry: config['app_enable_telemetry'] !== 'false',
        environment: process.env.NODE_ENV || 'development',
        trustProxy: Boolean(process.env.TRUST_PROXY),
        adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean),
      },
      mail: {
        transport: mailTransportName(),
        mailFrom: process.env.MAIL_FROM || 'Solstice Host <no-reply@lumis.tf>',
        smtpHost: 'smtp.fastmail.com',
        smtpPort: 587,
        requireTls: Boolean(process.env.SMTP_REQUIRE_TLS),
      },
      storage: {
        incusSocket: '/var/lib/incus/unix.socket',
        storagePool: 'default',
        mailDir: process.env.MAIL_DIR || './data/mail',
      },
      webauthn: {
        rpName: config['app_name'] || 'Solstice',
        rpId: new URL(publicOrigin()).hostname,
        origin: publicOrigin(),
      },
      ratelimits: {
        store: process.env.RATE_LIMIT_STORE || 'memory',
        windowMs: 60000,
        maxRequestsPerMin: 60,
      },
    })
  })

  app.patch('/api/admin/settings/application', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<Record<string, any>>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid settings body.' }, 400)
    }

    const mapping: Record<string, string> = {
      name: 'app_name',
      language: 'app_language',
      icon: 'app_icon',
      banner: 'app_banner',
      url: 'app_url',
      requireEmailVerification: 'app_require_email_verification',
      enableRegistration: 'app_enable_registration',
      enableTelemetry: 'app_enable_telemetry',
    }

    for (const [key, dbKey] of Object.entries(mapping)) {
      if (key in body) {
        let val = body[key]
        if (typeof val === 'boolean') {
          val = String(val)
        } else if (val === null || val === undefined) {
          val = ''
        } else {
          val = String(val).trim()
        }

        await query(
          `INSERT INTO system_settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [dbKey, val],
        )
      }
    }

    await logActivity(
      admin.user.id,
      'admin_update_settings',
      'Updated panel application settings',
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.notFound((c) => c.json({ message: 'Not found.' }, 404))

  app.onError((error, c) => {
    console.error('[api error]', error)
    return c.json({ message: 'Something went wrong.' }, 500)
  })

  return app
}
