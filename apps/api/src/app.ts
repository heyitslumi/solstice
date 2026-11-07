import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, statfsSync } from 'node:fs'
import os from 'node:os'

import { getConnInfo } from '@hono/node-server/conninfo'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'

import { query, queryOne, toIso, type InstanceRow, type OAuthProviderRow, type OsTemplateRow, type SshKeyRow, type UserRow } from './db.ts'
import { incus, incusRequest, type IncusInstance, type IncusInstanceState } from './incus/client.ts'
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
  type PasskeyRow,
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
import {
  createAssetDirectory,
  deleteAsset,
  listAssets,
  parseDataUrl,
  parseStorageConfig,
  readLocalAsset,
  uploadAsset,
} from './storage.ts'

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

async function getSystemSettings(): Promise<Record<string, string>> {
  try {
    const rows = await query<{ key: string; value: string }>('SELECT key, value FROM system_settings')
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  } catch {
    return {}
  }
}

function publicOrigin(config?: Record<string, string>) {
  if (config?.['app_url'] && config['app_url'].startsWith('http')) {
    return config['app_url'].replace(/\/+$/, '')
  }
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
    // Cloudflare's header wins (unspoofable); otherwise the first XFF entry.
    const cf = c.req.header('cf-connecting-ip')?.trim()
    if (cf) return normalizeIp(cf)
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return normalizeIp(forwarded)
  }

  try {
    return normalizeIp(getConnInfo(c).remote.address ?? 'unknown')
  } catch {
    return 'unknown'
  }
}

/* Display ::ffff:127.0.0.1 as 127.0.0.1. */
function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip
}

export async function verifyCaptcha(
  config: Record<string, string>,
  token: string | undefined,
  remoteIp: string,
): Promise<{ ok: boolean; message?: string }> {
  const provider = config['captcha_provider'] || 'none'
  if (provider === 'none') return { ok: true }

  if (!token || typeof token !== 'string' || !token.trim()) {
    return { ok: false, message: 'Captcha verification is required.' }
  }

  const secret = config['captcha_secret_key'] || ''
  if (!secret) {
    console.error(`[captcha] Secret key missing for provider: ${provider}`)
    // ponytail: fail closed if captcha provider enabled but secret key missing
    return { ok: false, message: 'Captcha configuration error on server.' }
  }

  try {
    if (provider === 'turnstile') {
      const form = new URLSearchParams()
      form.append('secret', secret)
      form.append('response', token.trim())
      if (remoteIp && remoteIp !== 'unknown') form.append('remoteip', remoteIp)

      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(6000),
      })
      const data = (await res.json()) as { success?: boolean }
      if (!data.success) return { ok: false, message: 'Captcha verification failed.' }
      return { ok: true }
    }

    if (provider === 'recaptcha' || provider === 'recaptcha_v2' || provider === 'recaptcha_v3') {
      const form = new URLSearchParams()
      form.append('secret', secret)
      form.append('response', token.trim())
      if (remoteIp && remoteIp !== 'unknown') form.append('remoteip', remoteIp)

      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(6000),
      })
      const data = (await res.json()) as { success?: boolean; score?: number }
      if (!data.success) return { ok: false, message: 'Captcha verification failed.' }
      if (provider === 'recaptcha_v3' && typeof data.score === 'number' && data.score < 0.5) {
        return { ok: false, message: 'Captcha verification failed suspicious activity check.' }
      }
      return { ok: true }
    }

    if (provider === 'hcaptcha') {
      const form = new URLSearchParams()
      form.append('secret', secret)
      form.append('response', token.trim())
      if (remoteIp && remoteIp !== 'unknown') form.append('remoteip', remoteIp)
      if (config['captcha_site_key']) form.append('sitekey', config['captcha_site_key'])

      const res = await fetch('https://api.hcaptcha.com/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(6000),
      })
      const data = (await res.json()) as { success?: boolean }
      if (!data.success) return { ok: false, message: 'Captcha verification failed.' }
      return { ok: true }
    }

    if (provider === 'trycap') {
      // Self-hosted Cap (trycap.dev): instance URL + site key address the
      // verify endpoint, secret goes in the JSON body (never the admin key).
      const apiUrl = (config['captcha_api_url'] || '').replace(/\/+$/, '')
      const sitekey = config['captcha_site_key'] || ''
      if (!apiUrl || !sitekey) {
        console.error('[captcha] Instance URL or site key missing for provider: trycap')
        return { ok: false, message: 'Captcha configuration error on server.' }
      }
      const res = await fetch(`${apiUrl}/${encodeURIComponent(sitekey)}/siteverify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret, response: token.trim() }),
        signal: AbortSignal.timeout(6000),
      })
      const data = (await res.json()) as { success?: boolean }
      if (!data.success) return { ok: false, message: 'Captcha verification failed.' }
      return { ok: true }
    }

    if (provider === 'friendly_captcha') {
      const sitekey = config['captcha_site_key'] || ''
      const res = await fetch('https://api.friendlycaptcha.com/api/v1/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          solution: token.trim(),
          secret,
          sitekey,
        }),
        signal: AbortSignal.timeout(6000),
      })
      const data = (await res.json()) as { success?: boolean }
      if (!data.success) return { ok: false, message: 'Captcha verification failed.' }
      return { ok: true }
    }

    return { ok: true }
  } catch (err) {
    console.error('[captcha] Verification network error:', err)
    return { ok: false, message: 'Captcha verification request failed.' }
  }
}

function publicOAuthProvider(row: OAuthProviderRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    clientId: row.client_id ?? '',
    clientSecret: row.client_secret ?? '',
    authUrl: row.auth_url ?? '',
    tokenUrl: row.token_url ?? '',
    infoUrl: row.info_url ?? '',
    basicAuth: !!row.basic_auth,
    scopes: row.scopes ?? '',
    identifierPath: row.identifier_path ?? '$.sub',
    emailPath: row.email_path ?? '$.email',
    usernamePath: row.username_path ?? '',
    firstNamePath: row.first_name_path ?? '',
    lastNamePath: row.last_name_path ?? '',
    avatarUrlTemplate: row.avatar_url_template ?? '',
    overwriteAvatars: !!row.overwrite_avatars,
    loginOnly: !!row.login_only,
    linkViewable: !!row.link_viewable,
    userManageable: !!row.user_manageable,
    enabled: !!row.enabled,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

/*
 * Minimal JSONPath reader for OAuth profile mapping. Supports `$`,
 * dot segments (`$.user.email`), bracket names (`$['user']['email']`)
 * and numeric indexes (`$.items[0].id`) — enough for provider payloads.
 */
function extractJsonPath(data: unknown, path: string): unknown {
  const trimmed = (path || '').trim()
  if (!trimmed || trimmed === '$') return data
  if (!trimmed.startsWith('$')) return undefined

  let rest = trimmed.slice(1)
  let current: unknown = data
  const segmentPattern = /^(?:\.([A-Za-z0-9_-]+)|\[['"]([^'"\]]+)['"]\]|\[(\d+)\])/

  while (rest.length > 0) {
    const match = segmentPattern.exec(rest)
    if (!match) return undefined
    const key = match[1] ?? match[2] ?? match[3]
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
    rest = rest.slice(match[0].length)
  }
  return current
}

function jsonPathString(data: unknown, path: string): string | null {
  const value = extractJsonPath(data, path)
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() ? value.trim() : null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

/*
 * Resolve an avatar URL template with `{...}` JSONPath placeholders.
 * A lone placeholder (`{$.picture}`) is used verbatim; embedded values are
 * percent-encoded so a provider cannot smuggle a different URL in.
 */
function resolveAvatarTemplate(template: string, info: unknown): string | null {
  const trimmed = (template || '').trim()
  if (!trimmed) return null

  const placeholders = [...trimmed.matchAll(/\{([^{}]+)\}/g)]
  if (placeholders.length === 0) return null

  if (placeholders.length === 1 && placeholders[0][0] === trimmed) {
    const value = jsonPathString(info, placeholders[0][1])
    return value && /^https?:\/\//i.test(value) ? value : null
  }

  let resolved = trimmed
  for (const [raw, path] of placeholders) {
    const value = jsonPathString(info, path)
    if (!value) return null
    resolved = resolved.replace(raw, encodeURIComponent(value))
  }
  return /^https?:\/\//i.test(resolved) ? resolved : null
}

/*
 * Parse an OAuth provider definition file: JSON, or the flat YAML subset
 * Calagopus exports use (top-level `key: scalar` pairs plus a `scopes:`
 * list). Anything nested or exotic is rejected rather than guessed at.
 */
function parseOAuthProviderFile(content: string): Record<string, unknown> {
  const trimmed = content.trim()
  if (!trimmed) throw new Error('File is empty.')

  if (trimmed.startsWith('{')) {
    const parsed: unknown = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON must be an object at the top level.')
    }
    return parsed as Record<string, unknown>
  }

  const result: Record<string, unknown> = {}
  let listKey: string | null = null

  function parseScalar(raw: string): unknown {
    const value = raw.trim()
    if (value === '' || value === 'null' || value === '~') return null
    if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true'
    const single = /^'(.*)'$/s.exec(value)
    if (single) return single[1].replace(/''/g, "'")
    const double = /^"(.*)"$/s.exec(value)
    if (double) return double[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    return value
  }

  const lines = trimmed.split(/\r?\n/)
  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue

    const indent = rawLine.length - rawLine.trimStart().length
    const line = rawLine.trim()

    if (line.startsWith('- ')) {
      if (indent === 0 || !listKey || !Array.isArray(result[listKey])) {
        throw new Error('Unsupported YAML structure in file.')
      }
      ;(result[listKey] as unknown[]).push(parseScalar(line.slice(2)))
      continue
    }

    const colon = line.indexOf(':')
    if (colon === -1) throw new Error('Unsupported YAML structure in file.')
    if (indent > 0) throw new Error('Unsupported nested YAML in file.')

    const key = line.slice(0, colon).trim()
    const rest = line.slice(colon + 1).trim()
    if (!key) throw new Error('Unsupported YAML structure in file.')

    if (rest === '' || rest === '|' || rest === '>') {
      // Start of a list (or block scalar, which we do not support).
      listKey = key
      result[key] = []
      continue
    }

    listKey = null
    result[key] = parseScalar(rest)
  }

  return result
}

/* Identity for user-scoped routes: session cookie or personal access token.
   Admin routes stay session-only — PATs never grant admin. */
async function authIdentity(
  c: Context,
): Promise<{ user_id: string; via: 'session' | 'pat'; keyId: string | null } | null> {
  const header = c.req.header('authorization') || ''
  const bearer = /^Bearer (.+)$/.exec(header.trim())
  if (bearer) {
    const tokenHash = createHash('sha256').update(bearer[1]).digest('hex')
    const row = await queryOne<{ id: string; user_id: string; expires_at: Date | string | null }>(
      'SELECT id, user_id, expires_at FROM api_keys WHERE token_hash = $1',
      [tokenHash],
    )
    if (!row) return null
    if (row.expires_at && new Date(toIso(row.expires_at)).getTime() < Date.now()) return null
    query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [row.id]).catch(() => {})
    return { user_id: row.user_id, via: 'pat', keyId: row.id }
  }
  const session = await readSession(getCookie(c, SESSION_COOKIE))
  if (!session) return null
  return { user_id: session.user_id, via: 'session', keyId: null }
}

function publicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    language: row.language ?? 'en',
    externalId: row.external_id ?? null,
    isFrozen: !!row.is_frozen,
    isSuspended: !!row.is_suspended,
    themeMode: row.theme_mode ?? 'system',
    themePreset: row.theme_preset ?? '',
    portForwardLimit: row.port_forward_limit ?? null,
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

function verificationEmail(code: string, link: string, appName = 'VPS Panel') {
  return {
    subject: `Confirm your ${appName} email`,
    text: [
      `Confirm this address to finish setting up your ${appName} account.`,
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
      `<p>Confirm this address to finish setting up your ${appName} account.</p>`,
      `<p><a href="${link}">Confirm my email</a></p>`,
      '<p>Or enter this code on the confirmation page:</p>',
      `<p style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:26px;letter-spacing:0.18em"><strong>${code}</strong></p>`,
      `<p>The link and code expire in ${CODE_TTL_MINUTES} minutes. If you did not create an account, you can ignore this email.</p>`,
    ].join('\n'),
  }
}

function accountCreatedEmail(name: string, origin: string, appName = 'VPS Panel') {
  return {
    subject: `Your ${appName} account is ready`,
    text: [
      `Hi ${name},`,
      '',
      `An administrator created a ${appName} account for you.`,
      '',
      'Sign in here:',
      `${origin}/login`,
      '',
      'If you did not expect this account, you can ignore this email.',
    ].join('\n'),
    html: [
      `<p>Hi ${name},</p>`,
      `<p>An administrator created a ${appName} account for you.</p>`,
      `<p><a href="${origin}/login">Sign in to ${appName}</a></p>`,
      '<p>If you did not expect this account, you can ignore this email.</p>',
    ].join('\n'),
  }
}

async function sendVerificationCode(user: UserRow, config?: Record<string, string>) {
  const cfg = config ?? (await getSystemSettings())
  const appName = cfg['app_name'] || 'VPS Panel'
  const origin = publicOrigin(cfg)
  const verification = await createEmailVerification(user.id)
  const link =
    `${origin}/verify-email` +
    `?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(verification.linkToken)}`

  try {
    const mailMsg = {
      to: user.email,
      ...verificationEmail(verification.code, link, appName),
    }
    const sent = await sendMail(mailMsg, config)
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
  const session = await authIdentity(c)
  if (!session) return null
  return queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
}

const LOGIN_CODE_TTL_MINUTES = Math.round(LOGIN_CODE_TTL_MS / 60_000)

function loginEmail(link: string, code: string, appName = 'VPS Panel') {
  return {
    subject: `Sign in to ${appName}`,
    text: [
      `Sign in to your ${appName} account:`,
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
      `<p>Sign in to your ${appName} account:</p>`,
      `<p><a href="${link}">Sign in</a></p>`,
      '<p>Or enter this code on the sign-in page:</p>',
      `<p style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:26px;letter-spacing:0.18em"><strong>${code}</strong></p>`,
      `<p>The link and code expire in ${LOGIN_CODE_TTL_MINUTES} minutes. If you were not signing in, you can ignore this email.</p>`,
    ].join('\n'),
  }
}

function sshAccessEmail(opts: {
  appName: string
  instanceName: string
  os: string
  sshCmd: string | null
  username: string
  password: string | null
  deployed: boolean
  keysInjected: boolean
}) {
  const lines: string[] = []
  if (opts.deployed) {
    lines.push(`Your server ${opts.instanceName} (${opts.os}) has been deployed.`, '')
  } else {
    lines.push(`SSH access for ${opts.instanceName} is ready.`, '')
  }
  if (opts.sshCmd) {
    lines.push('Connect with:', '', opts.sshCmd, '')
  }
  if (opts.password) {
    lines.push('Your one-time root password is:', '', opts.password, '')
    lines.push('Change it after signing in, and keep it somewhere safe — it will not be shown again.')
  } else if (opts.keysInjected) {
    lines.push('Your SSH key(s) were installed — sign in with your key, no password needed.')
  }

  const htmlParts: string[] = []
  if (opts.deployed) {
    htmlParts.push(`<p style="margin:0 0 12px">Your server <strong>${opts.instanceName}</strong> (${opts.os}) has been deployed.</p>`)
  } else {
    htmlParts.push(`<p style="margin:0 0 12px">SSH access for <strong>${opts.instanceName}</strong> is ready.</p>`)
  }
  if (opts.sshCmd) {
    htmlParts.push(
      '<p style="margin:0 0 6px">Connect with:</p>',
      `<p style="margin:0 0 14px;font-family:ui-monospace,SFMono-Regular,monospace;background:#18181b;color:#f4f4f5;padding:8px 12px;border-radius:6px;word-break:break-all">${opts.sshCmd}</p>`,
    )
  }
  if (opts.password) {
    htmlParts.push(
      '<p style="margin:0 0 6px">Your one-time root password is:</p>',
      `<p style="margin:0 0 14px;font-family:ui-monospace,SFMono-Regular,monospace;background:#18181b;color:#f4f4f5;padding:8px 12px;border-radius:6px;word-break:break-all"><strong>${opts.password}</strong></p>`,
      '<p style="margin:0;font-size:12px;color:#71717a">Change it after signing in, and keep it somewhere safe — it will not be shown again.</p>',
    )
  } else if (opts.keysInjected) {
    htmlParts.push('<p style="margin:0;color:#71717a">Your SSH key(s) were installed — sign in with your key, no password needed.</p>')
  }

  return {
    subject: opts.deployed
      ? `Your server ${opts.instanceName} has been deployed`
      : `SSH access for ${opts.instanceName}`,
    text: lines.join('\n'),
    html: htmlParts.join('\n'),
  }
}

async function sendSshAccessEmail(opts: {
  user: UserRow
  instanceName: string
  os: string
  sshCmd: string | null
  username: string
  password: string | null
  deployed: boolean
  keysInjected: boolean
}) {
  const config = await getSystemSettings()
  const appName = config['app_name'] || 'VPS Panel'
  const mailMsg = {
    to: opts.user.email,
    ...sshAccessEmail({ appName, ...opts }),
  }
  try {
    const sent = await sendMail(mailMsg, config)
    await logEmail(opts.user.email, mailMsg.subject, mailMsg.text, opts.user.id)
    console.log(
      sent.filePath
        ? `Mail stored for ${opts.user.email}: ${sent.filePath}`
        : `Mail sent to ${opts.user.email}`,
    )
    return true
  } catch (err) {
    console.warn('Failed to send SSH access email:', err)
    return false
  }
}

async function sendLoginEmail(user: UserRow, link: string, code: string, appName = 'VPS Panel', config?: Record<string, string>) {
  const mailMsg = { to: user.email, ...loginEmail(link, code, appName) }
  const sent = await sendMail(mailMsg, config)
  await logEmail(user.email, mailMsg.subject, mailMsg.text, user.id)
  console.log(
    sent.filePath
      ? `[login] ${user.email} -> ${sent.filePath}`
      : `[login] emailed ${user.email}`,
  )
}

const CHANGE_TTL_MINUTES = Math.round(CHANGE_CODE_TTL_MS / 60_000)

function emailChangeCodeEmail(code: string, newEmail: string, appName = 'VPS Panel') {
  return {
    subject: `Confirm your new ${appName} address`,
    text: [
      `Enter this code to make ${newEmail} the sign-in address on your ${appName} account:`,
      '',
      code,
      '',
      `It expires in ${CHANGE_TTL_MINUTES} minutes. Until it is entered, the account keeps signing in with its current address.`,
    ].join('\n'),
    html: [
      `<p>Enter this code to make <strong>${newEmail}</strong> the sign-in address on your ${appName} account:</p>`,
      `<p style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:26px;letter-spacing:0.18em"><strong>${code}</strong></p>`,
      `<p>It expires in ${CHANGE_TTL_MINUTES} minutes. Until it is entered, the account keeps signing in with its current address.</p>`,
    ].join('\n'),
  }
}

function emailChangeNoticeEmail(oldEmail: string, newEmail: string, cancelLink: string, appName = 'VPS Panel') {
  return {
    subject: `Your ${appName} sign-in address is being changed`,
    text: [
      `Someone asked to move the ${appName} account for ${oldEmail} to ${newEmail}.`,
      '',
      'If this was you, nothing further is needed — the move finishes when the code sent to the new address is entered.',
      '',
      'If it was not you, stop it here:',
      cancelLink,
      '',
      'Then sign in again from a device you trust. Whoever asked for this was signed in as you.',
    ].join('\n'),
    html: [
      `<p>Someone asked to move the ${appName} account for <strong>${oldEmail}</strong> to <strong>${newEmail}</strong>.</p>`,
      '<p>If this was you, nothing further is needed — the move finishes when the code sent to the new address is entered.</p>',
      `<p>If it was not you, <a href="${cancelLink}">stop the change</a>, then sign in again from a device you trust. Whoever asked for this was signed in as you.</p>`,
    ].join('\n'),
  }
}

function emailChangeDoneEmail(oldEmail: string, newEmail: string, appName = 'VPS Panel') {
  return {
    subject: `Your ${appName} sign-in address has changed`,
    text: [
      `The sign-in address on your ${appName} account is now ${newEmail}.`,
      '',
      `${oldEmail} no longer reaches this account.`,
      '',
      'If this was not you, sign in at the new address and move it back.',
    ].join('\n'),
    html: [
      `<p>The sign-in address on your ${appName} account is now <strong>${newEmail}</strong>.</p>`,
      `<p>${oldEmail} no longer reaches this account.</p>`,
      '<p>If this was not you, sign in at the new address and move it back.</p>',
    ].join('\n'),
  }
}

function deletionEmail(code: string, appName = 'VPS Panel') {
  return {
    subject: `Confirm deletion of your ${appName} account`,
    text: [
      'You requested to permanently delete your ${appName} account.',
      '',
      'Enter this code to confirm deletion:',
      '',
      code,
      '',
      'This code expires in 15 minutes. Once confirmed, all your instances, SSH keys, sessions, and data will be destroyed immediately.',
      'If you did not make this request, you can ignore this email and your account remains safe.',
    ].join('\n'),
    html: [
      '<p>You requested to permanently delete your ${appName} account.</p>',
      '<p>Enter this code to confirm deletion:</p>',
      `<p style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:26px;letter-spacing:0.18em"><strong>${code}</strong></p>`,
      '<p>This code expires in 15 minutes. Once confirmed, all your instances, SSH keys, sessions, and data will be destroyed immediately.</p>',
      '<p>If you did not make this request, you can ignore this email and your account remains safe.</p>',
    ].join('\n'),
  }
}

/* Sends a fresh sign-in challenge (link + code) for a verified account. The
   caller decides whether the account exists and whether the response leaks it. */
async function dispatchLoginChallenge(user: UserRow, remember: boolean, config?: Record<string, string>) {
  const cfg = config ?? (await getSystemSettings())
  const appName = cfg['app_name'] || 'VPS Panel'
  const origin = publicOrigin(cfg)
  const challenge = await createLoginChallenge(user.id, remember)
  const link =
    `${origin}/login` +
    `?token=${encodeURIComponent(challenge.linkToken)}`

  try {
    await sendLoginEmail(user, link, challenge.code, appName, cfg)
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

    const config = await getSystemSettings()
    if (config['app_enable_registration'] === 'false') {
      return c.json({ message: 'Registration is currently disabled.' }, 403)
    }

    const body = await readJson(c)

    const captchaCheck = await verifyCaptcha(config, str(body.captchaToken || body.captcha_token), clientKey(c))
    if (!captchaCheck.ok) {
      return c.json({ message: captchaCheck.message || 'Captcha verification failed.' }, 400)
    }

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

    const isAdminEmail = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.toLowerCase())
    const requireVerification = config['app_require_email_verification'] !== 'false'
    const id = randomUUID()
    const created = await queryOne<UserRow>(
      `INSERT INTO users (id, email, name, is_admin, email_verified_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, email, name, isAdminEmail, requireVerification ? null : new Date().toISOString()],
    )
    if (!created) return c.json({ message: 'Could not create the account.' }, 500)

    if (requireVerification) {
      await sendVerificationCode(created, config)
      return c.json({ email: created.email }, 201)
    }

    const session = await createSession(
      created.id,
      SESSION_TTL_SHORT_MS,
      c.req.header('user-agent'),
    )
    setCookie(c, SESSION_COOKIE, session.token, {
      path: '/',
      httpOnly: true,
      secure: isProduction(),
      sameSite: 'Lax',
      maxAge: Math.round(SESSION_TTL_SHORT_MS / 1000),
    })

    return c.json({ email: created.email, autoVerified: true }, 201)
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

    const config = await getSystemSettings()

    const captchaCheck = await verifyCaptcha(config, str(body.captchaToken || body.captcha_token), clientKey(c))
    if (!captchaCheck.ok) {
      return c.json({ message: captchaCheck.message || 'Captcha verification failed.' }, 400)
    }

    let user = await findUserByEmail(email)

    if (!user) {
      if (config['app_enable_registration'] === 'false') {
        return c.json({ message: 'Account not found. Registration is disabled.' }, 403)
      }

      const name = str(body.name).trim()
      if (!name) {
        return c.json({ needsName: true, message: 'Please enter your full name to proceed.' }, 200)
      }

      const isAdminEmail = (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
        .includes(email.toLowerCase())
      const requireVerification = config['app_require_email_verification'] !== 'false'
      const id = randomUUID()
      user = await queryOne<UserRow>(
        `INSERT INTO users (id, email, name, is_admin, email_verified_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, email, name, isAdminEmail, requireVerification ? null : new Date().toISOString()],
      )
      if (!user) return c.json({ message: 'Could not create the account.' }, 500)
    }

    const requireVerification = config['app_require_email_verification'] !== 'false'
    if (!requireVerification && !user.email_verified_at) {
      await query('UPDATE users SET email_verified_at = now() WHERE id = $1', [user.id])
      user.email_verified_at = new Date()
    }

    if (!requireVerification) {
      const remember = body.remember === true
      const session = await createSession(
        user.id,
        remember ? SESSION_TTL_LONG_MS : SESSION_TTL_SHORT_MS,
        c.req.header('user-agent'),
      )
      setSessionCookie(c, session.token, session.expiresAt, remember)
      await logActivity(user.id, 'login', 'User signed in directly (email verification disabled)', clientKey(c))
      return c.json({ ok: true, directLogin: true, user: publicUser(user) })
    }

    if (user.email_verified_at) {
      await dispatchLoginChallenge(user, body.remember === true, config)
    } else {
      await sendVerificationCode(user, config)
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

    // Live operator promotion so a fresh install's first user is admin
    // immediately (no restart needed); boot seed remains the backstop.
    const operatorEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    if (operatorEmails.includes(user.email.toLowerCase())) {
      await query('UPDATE users SET is_admin = true WHERE id = $1', [user.id])
    }

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

    const config = await getSystemSettings()
    if (config['webauthn_enable_security_keys'] === 'false') {
      return c.json({ message: 'Security keys are disabled by administrator.' }, 403)
    }

    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const existing = await listPasskeys(user.id)
    const options = await registrationOptions(user, existing, config)
    const ceremony = await storeCeremony('registration', user.id, options.challenge)
    setCeremonyCookie(c, ceremony.token)

    return c.json({ options })
  })

  app.post('/api/auth/passkeys/register/verify', async (c) => {
    const config = await getSystemSettings()
    if (config['webauthn_enable_security_keys'] === 'false') {
      return c.json({ message: 'Security keys are disabled by administrator.' }, 403)
    }

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
        config,
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

    const config = await getSystemSettings()
    if (config['webauthn_enable_security_keys'] === 'false') {
      return c.json({ message: 'Security keys are disabled by administrator.' }, 403)
    }

    let email = ''
    try {
      const body = await readJson(c)
      if (typeof body?.email === 'string') {
        email = body.email.trim().toLowerCase()
      }
    } catch {
      // Body may be empty or not JSON
    }

    if (config['webauthn_allow_usernameless'] === 'false' && !email) {
      return c.json({ message: 'Usernameless login is disabled. Please provide your email address.' }, 400)
    }

    let credentials: PasskeyRow[] | undefined
    let targetUserId: string | null = null
    if (email) {
      const user = await queryOne<UserRow>('SELECT id FROM users WHERE lower(email) = lower($1)', [email])
      if (user) {
        credentials = await listPasskeys(user.id)
        targetUserId = user.id
      } else {
        credentials = []
      }
    }

    const options = await authenticationOptions(credentials, config)
    const ceremony = await storeCeremony('authentication', targetUserId, options.challenge)
    setCeremonyCookie(c, ceremony.token)

    return c.json({ options })
  })

  app.post('/api/auth/passkeys/login/verify', async (c) => {
    const limit = await store.hit(`passkey-login-verify:${clientKey(c)}`, 20, 15 * 60 * 1000)
    if (!limit.allowed) {
      return c.json({ message: 'Too many attempts. Try again shortly.' }, 429)
    }

    const config = await getSystemSettings()
    if (config['webauthn_enable_security_keys'] === 'false') {
      return c.json({ message: 'Security keys are disabled by administrator.' }, 403)
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

    if (ceremony.user_id && ceremony.user_id !== row.user_id) {
      return c.json({ message: 'That passkey does not belong to this account.' }, 400)
    }

    try {
      const verified = await verifyAuthentication({
        response,
        challenge: ceremony.challenge,
        row,
        config,
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

  /* ── OAuth providers (login + account linking) ───────────────────────── */

  app.get('/api/auth/oauth/providers', async (c) => {
    const rows = await query<OAuthProviderRow>(
      `SELECT * FROM oauth_providers WHERE enabled = true ORDER BY name ASC`,
    )
    return c.json(
      rows.map((p) => ({ id: p.id, name: p.name, description: p.description ?? '' })),
    )
  })

  app.get('/api/admin/oauth/providers', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rows = await query<OAuthProviderRow & { link_count: number }>(
      `SELECT p.*,
              (SELECT COUNT(*)::int FROM oauth_links l WHERE l.provider_id = p.id) AS link_count
         FROM oauth_providers p
        ORDER BY p.name ASC`,
    )
    return c.json(
      rows.map((p) => ({ ...publicOAuthProvider(p), linkCount: p.link_count })),
    )
  })

  app.post('/api/admin/oauth/providers', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<any>().catch(() => null)
    if (!body || !str(body.name).trim()) {
      return c.json({ message: 'Provider name is required.' }, 400)
    }
    for (const field of ['authUrl', 'tokenUrl', 'infoUrl', 'clientId', 'clientSecret'] as const) {
      if (!str(body[field]).trim()) {
        return c.json({ message: `${field} is required.` }, 400)
      }
    }

    const row = await queryOne<OAuthProviderRow>(
      `INSERT INTO oauth_providers
         (name, description, client_id, client_secret, auth_url, token_url, info_url,
          basic_auth, scopes, identifier_path, email_path, username_path,
          first_name_path, last_name_path, avatar_url_template, overwrite_avatars,
          login_only, link_viewable, user_manageable, enabled)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [
        str(body.name).trim(),
        str(body.description).trim(),
        str(body.clientId).trim(),
        str(body.clientSecret).trim(),
        str(body.authUrl).trim(),
        str(body.tokenUrl).trim(),
        str(body.infoUrl).trim(),
        body.basicAuth === true,
        str(body.scopes).trim(),
        str(body.identifierPath).trim() || '$.sub',
        str(body.emailPath).trim() || '$.email',
        str(body.usernamePath).trim(),
        str(body.firstNamePath).trim(),
        str(body.lastNamePath).trim(),
        str(body.avatarUrlTemplate).trim(),
        body.overwriteAvatars === true,
        body.loginOnly === true,
        body.linkViewable !== false,
        body.userManageable !== false,
        body.enabled !== false,
      ],
    )

    await logActivity(
      admin.user.id,
      'create_oauth_provider',
      `Created OAuth provider "${body.name}"`,
      clientKey(c),
    )

    return c.json({ ...publicOAuthProvider(row!), linkCount: 0 }, 201)
  })

  app.patch('/api/admin/oauth/providers/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const body = await c.req.json<any>().catch(() => null)
    if (!body) return c.json({ message: 'Invalid payload.' }, 400)

    const existing = await queryOne<OAuthProviderRow>(
      'SELECT * FROM oauth_providers WHERE id = $1',
      [id],
    )
    if (!existing) return c.json({ message: 'Provider not found.' }, 404)

    const set: Record<string, unknown> = {}
    if (body.name !== undefined) set['name'] = str(body.name).trim()
    if (body.description !== undefined) set['description'] = str(body.description).trim()
    if (body.clientId !== undefined) set['client_id'] = str(body.clientId).trim()
    // Empty secret keeps the stored value so the form never leaks or wipes it.
    if (body.clientSecret !== undefined && str(body.clientSecret).trim()) {
      set['client_secret'] = str(body.clientSecret).trim()
    }
    if (body.authUrl !== undefined) set['auth_url'] = str(body.authUrl).trim()
    if (body.tokenUrl !== undefined) set['token_url'] = str(body.tokenUrl).trim()
    if (body.infoUrl !== undefined) set['info_url'] = str(body.infoUrl).trim()
    if (body.basicAuth !== undefined) set['basic_auth'] = body.basicAuth === true
    if (body.scopes !== undefined) set['scopes'] = str(body.scopes).trim()
    if (body.identifierPath !== undefined) {
      set['identifier_path'] = str(body.identifierPath).trim() || '$.sub'
    }
    if (body.emailPath !== undefined) set['email_path'] = str(body.emailPath).trim()
    if (body.usernamePath !== undefined) set['username_path'] = str(body.usernamePath).trim()
    if (body.firstNamePath !== undefined) set['first_name_path'] = str(body.firstNamePath).trim()
    if (body.lastNamePath !== undefined) set['last_name_path'] = str(body.lastNamePath).trim()
    if (body.avatarUrlTemplate !== undefined) {
      set['avatar_url_template'] = str(body.avatarUrlTemplate).trim()
    }
    if (body.overwriteAvatars !== undefined) set['overwrite_avatars'] = body.overwriteAvatars === true
    if (body.loginOnly !== undefined) set['login_only'] = body.loginOnly === true
    if (body.linkViewable !== undefined) set['link_viewable'] = body.linkViewable !== false
    if (body.userManageable !== undefined) set['user_manageable'] = body.userManageable !== false
    if (body.enabled !== undefined) set['enabled'] = body.enabled !== false

    const keys = Object.keys(set)
    if (keys.length === 0) return c.json(publicOAuthProvider(existing))

    const values = keys.map((k) => set[k])
    values.push(id)
    const updated = await queryOne<OAuthProviderRow>(
      `UPDATE oauth_providers SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now()
        WHERE id = $${keys.length + 1} RETURNING *`,
      values,
    )

    await logActivity(
      admin.user.id,
      'update_oauth_provider',
      `Updated OAuth provider "${updated!.name}"`,
      clientKey(c),
    )

    return c.json(publicOAuthProvider(updated!))
  })

  app.delete('/api/admin/oauth/providers/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const existing = await queryOne<{ name: string }>(
      'SELECT name FROM oauth_providers WHERE id = $1',
      [id],
    )
    if (!existing) return c.json({ message: 'Provider not found.' }, 404)

    // Links cascade via FK.
    await query('DELETE FROM oauth_providers WHERE id = $1', [id])

    await logActivity(
      admin.user.id,
      'delete_oauth_provider',
      `Deleted OAuth provider "${existing.name}"`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  /*
   * Import a provider definition (.json/.yml/.yaml) in the Calagopus export
   * shape. Credentials are never part of an export, so the provider is
   * created with empty placeholders — the admin sets the real Client ID and
   * Secret on the edit page afterwards.
   */
  app.post('/api/admin/oauth/providers/import', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<any>().catch(() => null)
    const content = typeof body?.content === 'string' ? body.content : ''
    if (!content.trim()) {
      return c.json({ message: 'No file content provided.' }, 400)
    }
    if (content.length > 64 * 1024) {
      return c.json({ message: 'File is too large (max 64 KB).' }, 400)
    }

    let def: Record<string, unknown>
    try {
      def = parseOAuthProviderFile(content)
    } catch (err) {
      return c.json({ message: (err as Error)?.message || 'Could not parse file.' }, 400)
    }

    const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
    const asBool = (value: unknown, fallback: boolean) =>
      typeof value === 'boolean' ? value : fallback
    const scopes = Array.isArray(def['scopes'])
      ? def['scopes'].filter((s): s is string => typeof s === 'string').join(' ')
      : asString(def['scopes'])

    const name = asString(def['name'])
    const authUrl = asString(def['auth_url'])
    const tokenUrl = asString(def['token_url'])
    const infoUrl = asString(def['info_url'])
    if (!name) return c.json({ message: 'Import is missing the provider name.' }, 400)
    for (const [label, value] of [['Auth URL', authUrl], ['Token URL', tokenUrl], ['Info URL', infoUrl]] as const) {
      if (!value) return c.json({ message: `Import is missing the ${label}.` }, 400)
    }

    const row = await queryOne<OAuthProviderRow>(
      `INSERT INTO oauth_providers
         (name, description, client_id, client_secret, auth_url, token_url, info_url,
          basic_auth, scopes, identifier_path, email_path, username_path,
          first_name_path, last_name_path, avatar_url_template, overwrite_avatars,
          login_only, link_viewable, user_manageable, enabled)
       VALUES
         ($1, $2, '', '', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        name,
        asString(def['description']),
        authUrl,
        tokenUrl,
        infoUrl,
        asBool(def['basic_auth'], false),
        scopes,
        asString(def['identifier_path']) || '$.sub',
        asString(def['email_path']) || '$.email',
        asString(def['username_path']),
        asString(def['name_first_path']),
        asString(def['name_last_path']),
        asString(def['avatar_url_template']),
        asBool(def['avatar_overwrite'], false),
        asBool(def['login_only'], false),
        asBool(def['link_viewable'], true),
        asBool(def['user_manageable'], true),
        asBool(def['enabled'], true),
      ],
    )

    await logActivity(
      admin.user.id,
      'import_oauth_provider',
      `Imported OAuth provider "${name}"`,
      clientKey(c),
    )

    return c.json({ ...publicOAuthProvider(row!), linkCount: 0 }, 201)
  })

  /* Static oauth routes are registered before `/:id` so Hono never treats
     `providers` or `links` as a provider id. */

  app.get('/api/auth/oauth/links', async (c) => {
    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const rows = await query<{
      id: string
      identifier: string
      created_at: Date | string
      last_used_at: Date | string | null
      provider_id: string
      provider_name: string
      link_viewable: boolean
      user_manageable: boolean
    }>(
      `SELECT l.id, l.identifier, l.created_at, l.last_used_at,
              p.id AS provider_id, p.name AS provider_name,
              p.link_viewable, p.user_manageable
         FROM oauth_links l
         JOIN oauth_providers p ON p.id = l.provider_id
        WHERE l.user_id = $1
        ORDER BY l.created_at DESC`,
      [user.id],
    )

    return c.json({
      links: rows.map((r) => ({
        id: r.id,
        providerId: r.provider_id,
        providerName: r.provider_name,
        identifier: r.link_viewable ? r.identifier : null,
        userManageable: !!r.user_manageable,
        createdAt: toIso(r.created_at),
        lastUsedAt: r.last_used_at ? toIso(r.last_used_at) : null,
      })),
    })
  })

  app.delete('/api/auth/oauth/links/:id', async (c) => {
    const user = await requireCurrentUser(c)
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const link = await queryOne<{ user_id: string; user_manageable: boolean }>(
      `SELECT l.user_id, p.user_manageable
         FROM oauth_links l
         JOIN oauth_providers p ON p.id = l.provider_id
        WHERE l.id = $1`,
      [c.req.param('id')],
    )
    if (!link || link.user_id !== user.id) {
      return c.json({ message: 'Link not found.' }, 404)
    }
    // Admins can always detach; otherwise the provider must allow user management.
    const isAdmin = (await queryOne<{ is_admin: boolean }>(
      'SELECT is_admin FROM users WHERE id = $1',
      [user.id],
    ))?.is_admin
    if (!link.user_manageable && !isAdmin) {
      return c.json({ message: 'This provider does not allow removing the link.' }, 403)
    }

    await query('DELETE FROM oauth_links WHERE id = $1', [c.req.param('id')])
    await logActivity(user.id, 'unlink_oauth', 'Removed an OAuth link', clientKey(c))
    return c.json({ ok: true })
  })

  app.get('/api/auth/oauth/:id/start', async (c) => {
    const provider = await queryOne<OAuthProviderRow>(
      'SELECT * FROM oauth_providers WHERE id = $1',
      [c.req.param('id')],
    )
    if (!provider || !provider.enabled) {
      return c.json({ message: 'Unknown OAuth provider.' }, 404)
    }

    const mode = c.req.query('mode') === 'link' ? 'link' : 'login'
    let userId: string | null = null
    if (mode === 'link') {
      const session = await readSession(getCookie(c, SESSION_COOKIE))
      if (!session) return c.json({ message: 'Not signed in.' }, 401)
      userId = session.user_id
    }

    const state = randomBytes(24).toString('base64url')
    const verifier = randomBytes(48).toString('base64url')
    await query('DELETE FROM oauth_states WHERE expires_at < now()')
    await query(
      `INSERT INTO oauth_states (token_hash, provider_id, user_id, mode, code_verifier, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '10 minutes')`,
      [hashSecret(state), provider.id, userId, mode, verifier],
    )

    // The callback must be reachable by the user's browser, so it uses the
    // configured panel URL (DB `app_url`) rather than this process's local
    // origin, which is wrong behind a tunnel or reverse proxy.
    const config = await getSystemSettings()
    const redirectUri = `${publicOrigin(config)}/api/auth/oauth/${provider.id}`
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: provider.client_id,
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })
    if (provider.scopes.trim()) params.set('scope', provider.scopes.trim())

    return c.json({ url: `${provider.auth_url}?${params.toString()}` })
  })

  app.get('/api/auth/oauth/:id', async (c) => {
    const providerId = c.req.param('id')
    const config = await getSystemSettings()
    const origin = publicOrigin(config)
    const fail = (message: string) =>
      c.redirect(`${origin}/login?oauth_error=${encodeURIComponent(message)}`, 302)

    const provider = await queryOne<OAuthProviderRow>(
      'SELECT * FROM oauth_providers WHERE id = $1',
      [providerId],
    )
    if (!provider || !provider.enabled) return fail('Unknown OAuth provider.')
    const prov = provider
    if (c.req.query('error')) return fail('Authorization was denied at the provider.')

    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code || !state) return fail('Invalid OAuth response.')

    // Single-use: consume the state row so a callback URL cannot be replayed.
    const stateRow = await queryOne<{
      provider_id: string
      user_id: string | null
      mode: string
      code_verifier: string
    }>(
      `DELETE FROM oauth_states WHERE token_hash = $1 AND expires_at > now()
       RETURNING provider_id, user_id, mode, code_verifier`,
      [hashSecret(state)],
    )
    if (!stateRow || stateRow.provider_id !== provider.id) {
      return fail('Expired OAuth session. Please try again.')
    }

    // Must match the redirect_uri sent at `start` (configured panel URL).
    const redirectUri = `${publicOrigin(config)}/api/auth/oauth/${provider.id}`

    // Exchange the code for tokens. The verifier pairs with the
    // code_challenge sent at `start`; without it providers reject
    // the exchange with invalid_grant.
    let accessToken: string | null = null
    try {
      const form = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: provider.client_id,
        code_verifier: stateRow.code_verifier,
      })
      if (!provider.basic_auth) form.set('client_secret', provider.client_secret)
      const headers: Record<string, string> = {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      }
      if (provider.basic_auth) {
        headers['authorization'] =
          'Basic ' + Buffer.from(`${provider.client_id}:${provider.client_secret}`).toString('base64')
      }
      const tokenRes = await fetch(provider.token_url, { method: 'POST', headers, body: form })
      const tokenText = await tokenRes.text()
      if (!tokenRes.ok) throw new Error(`Token endpoint responded ${tokenRes.status}`)
      try {
        accessToken = (JSON.parse(tokenText) as any).access_token ?? null
      } catch {
        accessToken = new URLSearchParams(tokenText).get('access_token')
      }
    } catch (err) {
      console.error('[oauth] token exchange failed:', (err as Error)?.message)
      return fail('Could not complete sign-in with the provider.')
    }
    if (!accessToken) return fail('Could not complete sign-in with the provider.')

    // Fetch the user profile.
    let info: unknown = null
    try {
      const infoRes = await fetch(provider.info_url, {
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      })
      if (!infoRes.ok) throw new Error(`Info endpoint responded ${infoRes.status}`)
      info = await infoRes.json()
    } catch (err) {
      console.error('[oauth] info fetch failed:', (err as Error)?.message)
      return fail('Could not read your provider profile.')
    }

    const identifier = jsonPathString(info, provider.identifier_path || '$.sub')
    if (!identifier) return fail('Provider profile has no usable identifier.')
    const email = jsonPathString(info, provider.email_path || '$.email')

    async function maybeImportAvatar(user: UserRow) {
      if (!prov.avatar_url_template.trim() || user.is_frozen) return
      if (user.avatar_url && !prov.overwrite_avatars) return
      const avatarUrl = resolveAvatarTemplate(prov.avatar_url_template, info)
      if (!avatarUrl) return
      await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, user.id])
    }

    async function signIn(user: UserRow) {
      if (user.is_suspended) return fail('This account has been suspended.')
      const session = await createSession(
        user.id,
        SESSION_TTL_LONG_MS,
        c.req.header('user-agent'),
      )
      setSessionCookie(c, session.token, session.expiresAt, true)
      await query('UPDATE oauth_links SET last_used_at = now() WHERE provider_id = $1 AND user_id = $2', [
        prov.id,
        user.id,
      ])
      await logActivity(user.id, 'login', `Signed in with ${prov.name}`, clientKey(c))
      return c.redirect(`${origin}/dashboard`, 302)
    }

    // Link mode: attach the provider identity to the signed-in account.
    if (stateRow.mode === 'link') {
      if (!stateRow.user_id) return fail('Sign in before linking an account.')
      const me = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [stateRow.user_id])
      if (!me) return fail('Account no longer exists.')

      const taken = await queryOne<{ user_id: string }>(
        'SELECT user_id FROM oauth_links WHERE provider_id = $1 AND identifier = $2',
        [provider.id, identifier],
      )
      if (taken && taken.user_id !== me.id) {
        return fail('That provider account is already linked to someone else.')
      }
      if (!taken) {
        await query('INSERT INTO oauth_links (provider_id, user_id, identifier) VALUES ($1, $2, $3)', [
          provider.id,
          me.id,
          identifier,
        ])
        await logActivity(me.id, 'link_oauth', `Linked ${provider.name} account`, clientKey(c))
      }
      await maybeImportAvatar(me)
      return c.redirect(`${origin}/account?oauth=linked`, 302)
    }

    // Login mode: existing link wins.
    const link = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM oauth_links WHERE provider_id = $1 AND identifier = $2',
      [provider.id, identifier],
    )
    if (link) {
      const owner = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [link.user_id])
      if (!owner) return fail('Linked account no longer exists.')
      await maybeImportAvatar(owner)
      return signIn(owner)
    }

    if (provider.login_only) {
      return fail('No panel account is linked to that provider identity.')
    }

    // Match by verified provider email before registering.
    if (email) {
      const byEmail = await findUserByEmail(email)
      if (byEmail) {
        await query('INSERT INTO oauth_links (provider_id, user_id, identifier) VALUES ($1, $2, $3)', [
          provider.id,
          byEmail.id,
          identifier,
        ])
        await logActivity(byEmail.id, 'link_oauth', `Linked ${provider.name} account on login`, clientKey(c))
        await maybeImportAvatar(byEmail)
        return signIn(byEmail)
      }
    }

    if (config['app_enable_registration'] === 'false') {
      return fail('No account found and registration is disabled.')
    }
    if (!email || !EMAIL_PATTERN.test(email)) {
      return fail('The provider did not supply a usable email address.')
    }

    const firstName = jsonPathString(info, provider.first_name_path || '')
    const lastName = jsonPathString(info, provider.last_name_path || '')
    const username = jsonPathString(info, provider.username_path || '')
    const displayName = `${firstName ?? ''} ${lastName ?? ''}`.trim() || username || email.split('@')[0]

    const created = await queryOne<UserRow>(
      `INSERT INTO users (id, email, name, first_name, last_name, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING *`,
      [randomUUID(), email, displayName, firstName, lastName],
    )
    if (!created) return fail('Could not create your panel account.')
    await query('INSERT INTO oauth_links (provider_id, user_id, identifier) VALUES ($1, $2, $3)', [
      provider.id,
      created.id,
      identifier,
    ])
    await logActivity(created.id, 'register', `Registered via ${provider.name}`, clientKey(c))
    await maybeImportAvatar(created)
    return signIn(created)
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
    const mailConfig = await getSystemSettings()

    // On the critical path, unlike the warning below: the caller is sitting at a
    // prompt waiting for this message, so it fails the request rather than logging.
    try {
      const codeMsg = { to: newEmail, ...emailChangeCodeEmail(change.code, newEmail, mailConfig['app_name'] || 'VPS Panel') }
      const sent = await sendMail(codeMsg, mailConfig)
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
        ...emailChangeNoticeEmail(user.email, newEmail, cancelLink, mailConfig['app_name'] || 'VPS Panel'),
      }
      await sendMail(warnMsg, mailConfig)
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
      const mailConfig = await getSystemSettings()
      const doneMsg = {
        to: previousEmail,
        ...emailChangeDoneEmail(previousEmail, claimed.newEmail, mailConfig['app_name'] || 'VPS Panel'),
      }
      await sendMail(doneMsg, mailConfig)
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
      if (body.avatarUrl === null || body.avatarUrl === '') {
        nextAvatarUrl = null
      } else if (typeof body.avatarUrl === 'string') {
        const val = body.avatarUrl.trim()
        if (!val.startsWith('data:image/') && !val.startsWith('https://') && !val.startsWith('http://') && !val.startsWith('/')) {
          fieldErrors.avatarUrl = 'Avatar must be an image data URL or valid link.'
        } else if (val.startsWith('data:image/')) {
          if (val.length > 5_000_000) {
            fieldErrors.avatarUrl = 'Image is too large (max 5 MB).'
          } else {
            const config = await getSystemSettings()
            const storageConfig = parseStorageConfig(config)
            if (storageConfig.driver === 's3') {
              const parsed = parseDataUrl(val)
              if (!parsed) {
                fieldErrors.avatarUrl = 'Invalid avatar image data.'
              } else {
                try {
                  const uploaded = await uploadAsset({
                    folder: 'avatars',
                    filename: `${user.id}.${parsed.extension}`,
                    buffer: parsed.buffer,
                    contentType: parsed.contentType,
                    config: storageConfig,
                    publicOrigin: publicOrigin(config),
                  })
                  nextAvatarUrl = uploaded.url
                } catch (err: any) {
                  return c.json({ message: `S3 avatar upload failed: ${err?.message || 'Storage error'}` }, 500)
                }
              }
            } else {
              nextAvatarUrl = val
            }
          }
        } else {
          nextAvatarUrl = val
        }
      } else {
        fieldErrors.avatarUrl = 'Invalid avatar format.'
      }
    }

    let nextThemeMode = user.theme_mode ?? 'system'
    if ('themeMode' in body) {
      const mode = str(body.themeMode).trim().toLowerCase()
      if (mode !== 'system' && mode !== 'light' && mode !== 'dark') {
        fieldErrors.themeMode = 'Theme mode must be system, light, or dark.'
      } else {
        nextThemeMode = mode
      }
    }

    let nextThemePreset = user.theme_preset ?? ''
    if ('themePreset' in body) {
      const preset = str(body.themePreset).trim().toLowerCase()
      if (preset !== '' && !/^[a-z0-9-]{1,32}$/.test(preset)) {
        fieldErrors.themePreset = 'Unknown theme preset.'
      } else {
        nextThemePreset = preset
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return c.json({ message: 'Check the highlighted fields.', fieldErrors }, 422)
    }

    const updated = await queryOne<UserRow>(
      'UPDATE users SET name = $1, avatar_url = $2, theme_mode = $3, theme_preset = $4 WHERE id = $5 RETURNING *',
      [nextName, nextAvatarUrl, nextThemeMode, nextThemePreset, user.id],
    )
    if (!updated) return c.json({ message: 'Could not update the account.' }, 500)

    if (nextName !== user.name) {
      await logActivity(user.id, 'update_profile', `Updated name to "${nextName}"`, clientKey(c))
    }
    if (nextAvatarUrl !== user.avatar_url) {
      await logActivity(user.id, 'update_avatar', nextAvatarUrl ? 'Updated avatar photo' : 'Removed avatar photo', clientKey(c))
    }
    if (nextThemeMode !== (user.theme_mode ?? 'system') || nextThemePreset !== (user.theme_preset ?? '')) {
      await logActivity(user.id, 'update_theme', `Updated appearance settings`, clientKey(c))
    }

    return c.json({ user: publicUser(updated) })
  })

  app.get('/api/auth/sessions', async (c) => {
    const session = await authIdentity(c)
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

    const session = await authIdentity(c)
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

    const mailConfig = await getSystemSettings()
    const mailMsg = { to: user.email, ...deletionEmail(code, mailConfig['app_name'] || 'VPS Panel') }
    try {
      const sent = await sendMail(mailMsg, mailConfig)
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

    const session = await authIdentity(c)
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
    const session = await authIdentity(c)
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
    const session = await authIdentity(c)
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
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    await query('DELETE FROM email_logs WHERE user_id = $1', [user.id])
    await logActivity(user.id, 'clear_emails', 'Cleared sent email history', clientKey(c))
    return c.json({ ok: true })
  })

  app.delete('/api/auth/emails/:id', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const emailId = c.req.param('id')
    await query('DELETE FROM email_logs WHERE id = $1 AND user_id = $2', [emailId, user.id])
    return c.json({ ok: true })
  })

  app.get('/api/auth/export-data', async (c) => {
    const session = await authIdentity(c)
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

  /*
   * Incus reports cumulative CPU nanoseconds, so an instantaneous percentage
   * needs two samples. Kept in memory keyed by instance name; the first
   * sample for a name yields null (shown as "—") instead of a fake number.
   */
  const cpuSamples = new Map<string, { usage: number; at: number }>()

  function cpuPercent(name: string, usageNanos: number, cores: number): number | null {
    const now = Date.now()
    const prev = cpuSamples.get(name)
    cpuSamples.set(name, { usage: usageNanos, at: now })
    if (!prev || now <= prev.at || usageNanos < prev.usage) return null
    const elapsedNs = (now - prev.at) * 1e6
    if (elapsedNs <= 0) return null
    return Math.min(100, Math.round((usageNanos - prev.usage) / (elapsedNs * cores) * 100))
  }

  app.get('/api/instances', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    /* Admins may pass ?scope=all to see every user's servers. */
    let ownerClause = 'WHERE i.user_id = $1'
    let ownerParams: string[] = [session.user_id]
    if (c.req.query('scope') === 'all') {
      const caller = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
      if (!caller?.is_admin) return c.json({ message: 'Only administrators can list all servers.' }, 403)
      ownerClause = ''
      ownerParams = []
    }

    const dbRows = await query<
      InstanceRow & { location_name: string | null; location_code: string | null; location_city: string | null; node_name: string | null; owner_id: string; owner_email: string; owner_name: string }
    >(
      `SELECT i.*,
              l.name AS location_name,
              l.short_code AS location_code,
              l.city AS location_city,
              COALESCE(NULLIF(n.display_name, ''), n.name) AS node_name,
              u.id AS owner_id,
              u.email AS owner_email,
              u.name AS owner_name
         FROM instances i
         LEFT JOIN nodes n ON n.id = i.node_id
         LEFT JOIN locations l ON l.id = n.location_id
         JOIN users u ON u.id = i.user_id
        ${ownerClause}
        ORDER BY i.created_at DESC`,
      ownerParams,
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
      const liveStatus = live?.status?.toLowerCase() || ''
      const isRunning = liveStatus === 'running'
      const liveFrozen = liveStatus === 'frozen' || liveStatus === 'freezing'
      const displayStatus = isRunning ? 'running' : liveFrozen ? 'frozen' : 'stopped'

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

      const cpuNanos = live?.state?.cpu?.usage ?? 0
      const cores = row.cores || 1
      const cpuUsage = isRunning ? cpuPercent(row.name, cpuNanos, cores) : null

      const diskTotalBytes = (row.disk_gb || 10) * 1024 * 1024 * 1024
      const diskUsedBytes = live?.state?.disk?.root?.usage ?? -1
      const diskUsage =
        isRunning && diskUsedBytes >= 0 && diskTotalBytes > 0
          ? Math.min(100, Math.round((diskUsedBytes / diskTotalBytes) * 100))
          : null

      const region = row.location_code
        ? `${row.location_city || row.location_name || row.location_code} (${row.location_code})`
        : ''

      return {
        id: row.id,
        name: row.name,
        type: row.type as 'kvm' | 'lxc',
        os: row.os,
        status: displayStatus as 'running' | 'stopped' | 'frozen',
        ip4,
        ip6,
        cores: row.cores,
        memory: formatMemory(row.memory_mb),
        disk: `${row.disk_gb} GB NVMe`,
        diskGb: row.disk_gb,
        diskUsage,
        nodeName: row.node_name,
        uptime: isRunning
          ? `Since ${new Date(toIso(live?.last_used_at ?? row.created_at)).toLocaleDateString()}`
          : 'Stopped',
        region,
        cpuUsage,
        ramUsage,
        bandwidth: formatBytes(totalBytes),
        createdAt: toIso(row.created_at),
        suspended: !!row.suspend_reason,
        owner: { id: row.owner_id, email: row.owner_email, name: row.owner_name },
      }
    })

    return c.json({ instances })
  })

  /* Resolve an OS image from an enabled template, a raw alias, or the legacy map. */
  async function resolveOsSource(body: {
    templateId?: string
    imageAlias?: string
    os?: string
  }): Promise<{ name: string; alias: string; uefi?: boolean }> {
    if (body.templateId) {
      const tpl = await queryOne<{ name: string; image_alias: string; uefi: boolean }>(
        'SELECT name, image_alias, uefi FROM os_templates WHERE id = $1 AND enabled = true',
        [body.templateId],
      )
      if (!tpl) throw new Error('Selected OS template is not available.')
      return { name: tpl.name, alias: tpl.image_alias, uefi: !!tpl.uefi }
    }
    if (body.imageAlias && body.imageAlias.trim()) {
      return { name: body.imageAlias.trim(), alias: body.imageAlias.trim() }
    }
    const osKey = body.os || 'debian-12'
    return OS_MAP[osKey] || { name: 'Debian 12 Bookworm', alias: 'debian/12' }
  }

  /* Default node for provisioning: prefer the local socket node, else first node. */
  async function defaultNodeId(): Promise<string | null> {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM nodes ORDER BY (name = 'local-incus') DESC, name ASC LIMIT 1`,
    )
    return row?.id ?? null
  }

  app.post('/api/instances', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const body = await c.req
      .json<{
        name?: string
        type?: 'kvm' | 'lxc'
        os?: string
        templateId?: string
        imageAlias?: string
        cores?: number
        memoryMb?: number
        diskGb?: number
        hostname?: string
        timezone?: string
        swapMb?: number
        dnsServers?: string[]
        sshKeyIds?: string[]
        directSsh?: boolean
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
    let osConfig: { name: string; alias: string; uefi?: boolean } = OS_MAP[osKey] || { name: 'Debian 12 Bookworm', alias: 'debian/12' }
    try {
      osConfig = await resolveOsSource(body)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Invalid OS selection.' }, 400)
    }
    const cores = Math.max(1, Math.min(8, Number(body.cores) || 1))
    const memoryMb = Math.max(512, Math.min(16384, Number(body.memoryMb) || 1024))
    const diskGb = Math.max(5, Math.min(200, Number(body.diskGb) || 10))
    const hostname = String(body.hostname || '').trim().toLowerCase()
    if (hostname && !/^[a-z0-9][a-z0-9.-]{0,62}[a-z0-9]$/.test(hostname)) {
      return c.json({ message: 'Hostname must be a valid DNS hostname (letters, digits, hyphens, dots).' }, 400)
    }
    const timezone = String(body.timezone || '').trim()
    if (timezone) {
      let validTz = false
      try {
        validTz = (Intl.supportedValuesOf('timeZone') as string[]).includes(timezone)
      } catch {
        validTz = true
      }
      if (!validTz) return c.json({ message: 'Invalid timezone.' }, 400)
    }
    const swapMb = Math.max(0, Math.min(16384, Number(body.swapMb) || 0))
    const dnsServers = Array.isArray(body.dnsServers)
      ? body.dnsServers.map((d) => String(d).trim()).filter((d) => /^\d{1,3}(\.\d{1,3}){3}$/.test(d)).slice(0, 3)
      : []
    const directSsh = body.directSsh === true

    const existing = await queryOne('SELECT id FROM instances WHERE name = $1', [cleanName])
    if (existing) {
      return c.json({ message: 'An instance with this name already exists.' }, 409)
    }

    const instanceId = randomUUID()

    let userSshKeys: SshKeyRow[]
    if (Array.isArray(body.sshKeyIds)) {
      const ids = body.sshKeyIds.filter((id) => typeof id === 'string')
      userSshKeys =
        ids.length > 0
          ? await query<SshKeyRow>('SELECT public_key FROM ssh_keys WHERE user_id = $1 AND id = ANY($2::uuid[])', [user.id, ids])
          : []
    } else {
      userSshKeys = await query<SshKeyRow>('SELECT public_key FROM ssh_keys WHERE user_id = $1', [user.id])
    }
    const sshPublicKeys = userSshKeys.map((k) => k.public_key)

    const nodeId = await defaultNodeId()
    const targetNode = nodeId
      ? await queryOne<{ cpu_model: string; server_limit: number }>('SELECT cpu_model, server_limit FROM nodes WHERE id = $1', [nodeId])
      : null

    if (targetNode && targetNode.server_limit > 0) {
      const countRow = await queryOne<{ count: string }>(
        'SELECT COUNT(*) AS count FROM instances WHERE node_id = $1',
        [nodeId],
      )
      const currentCount = Number(countRow?.count || 0)
      if (currentCount >= targetNode.server_limit) {
        return c.json({ message: `Node capacity reached: maximum server limit of ${targetNode.server_limit} exceeded.` }, 400)
      }
    }

    const rawQemu =
      type === 'kvm' && targetNode?.cpu_model && targetNode.cpu_model !== 'host'
        ? `-cpu ${targetNode.cpu_model}`
        : undefined

    try {
      await incus.createInstance({
        name: cleanName,
        type: type === 'kvm' ? 'virtual-machine' : 'container',
        imageAlias: osConfig.alias,
        cpu: cores,
        memory: `${memoryMb}MiB`,
        disk: `${diskGb}GiB`,
        sshKeys: sshPublicKeys,
        uefi: osConfig.uefi,
        hostname: hostname || undefined,
        timezone: timezone || undefined,
        swapMb,
        dnsServers,
        rawQemu,
      })

      // Start the newly provisioned instance
      await incus.setInstanceState(cleanName, 'start').catch((e) => {
        console.warn('Failed to start newly created instance:', e)
      })

      await query(
        `INSERT INTO instances (id, user_id, name, type, os, image_alias, cores, memory_mb, disk_gb, node_id, hostname, timezone, swap_mb, dns_servers)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
        [instanceId, user.id, cleanName, type, osConfig.name, osConfig.alias, cores, memoryMb, diskGb, nodeId, hostname, timezone, swapMb, JSON.stringify(dnsServers)],
      )

      // Password fallback: no SSH keys selected -> generate a root password
      // (returned once, never stored) and enable direct SSH.
      let rootPassword: string | null = null
      let sshHostPort: number | null = null
      if (sshPublicKeys.length === 0 || directSsh) {
        try {
          let containerIp: string | null = null
          for (let attempt = 0; attempt < 15 && !containerIp; attempt++) {
            const state = await incus.getInstanceState(cleanName).catch(() => null)
            containerIp = containerGlobalIpv4(state)
            if (!containerIp) await new Promise((r) => setTimeout(r, 3000))
          }
          if (containerIp) {
            const config = await getSystemSettings()
            const { start, end } = portForwardRange(config)
            const taken = new Set(
              (await query<{ host_port: number }>(
                'SELECT host_port FROM port_forwards WHERE host_port BETWEEN $1 AND $2',
                [start, end],
              )).map((r) => r.host_port),
            )
            const free: number[] = []
            for (let port = start; port <= end; port++) if (!taken.has(port)) free.push(port)
            if (free.length > 0) {
              sshHostPort = free[Math.floor(Math.random() * free.length)]
              await attachForward(
                cleanName,
                { kind: 'ssh', host_port: sshHostPort, container_port: 22, protocol: 'tcp' },
                containerIp,
              )
              await query(
                `INSERT INTO port_forwards (id, instance_id, kind, host_port, container_port, protocol)
                 VALUES ($1, $2, 'ssh', $3, 22, 'tcp')`,
                [randomUUID(), instanceId, sshHostPort],
              ).catch(() => {})
            }
          }
        } catch (err: any) {
          console.warn('Direct SSH setup warning:', err?.message)
          sshHostPort = null
        }
      }
      if (sshPublicKeys.length === 0) {
        try {
          rootPassword = await issueRootPassword(cleanName)
        } catch (err: any) {
          console.warn('Root password setup warning:', err?.message)
        }
      }

      await logActivity(
        user.id,
        'create_instance',
        `Created ${type.toUpperCase()} instance "${cleanName}" (${osConfig.name})`,
        clientKey(c),
      )

      let passwordEmailed = false
      try {
        const host = await sshHostFor({ name: cleanName } as InstanceRow)
        passwordEmailed = await sendSshAccessEmail({
          user,
          instanceName: cleanName,
          os: osConfig.name,
          sshCmd: sshHostPort ? `ssh -p ${sshHostPort} root@${host}` : null,
          username: 'root',
          password: rootPassword,
          deployed: true,
          keysInjected: sshPublicKeys.length > 0,
        })
      } catch (err: any) {
        console.warn('Access email warning:', err?.message)
      }

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
          hostname: hostname || cleanName,
          timezone: timezone || null,
          swapMb,
          dnsServers,
          sshHostPort,
          passwordEmailed,
        },
        201,
      )
    } catch (err: any) {
      console.error('Incus instance creation failed:', err)
      return c.json({ message: err?.message || 'Failed to provision instance.' }, 500)
    }
  })

  // Install an OS on a bare server (created by an admin without a template).
  // The owner picks the OS from the setup page on first access.
  app.post('/api/instances/:id/install-os', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)
    if (instance.os) {
      return c.json({ message: 'This server already has an OS installed.' }, 409)
    }

    const body = await c.req
      .json<{
        templateId?: string
        hostname?: string
        timezone?: string
        swapMb?: number
        dnsServers?: string[]
        sshKeyIds?: string[]
        directSsh?: boolean
      }>()
      .catch(() => null)
    if (!body?.templateId) return c.json({ message: 'An OS template is required.' }, 400)

    let osConfig
    try {
      osConfig = await resolveOsSource({ templateId: body.templateId })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Invalid OS selection.' }, 400)
    }

    const hostname = String(body.hostname || instance.hostname || '').trim().toLowerCase()
    if (hostname && !/^[a-z0-9][a-z0-9.-]{0,62}[a-z0-9]$/.test(hostname)) {
      return c.json({ message: 'Hostname must be a valid DNS hostname.' }, 400)
    }
    const timezone = String(body.timezone || '').trim()
    if (timezone) {
      let validTz = false
      try {
        validTz = (Intl.supportedValuesOf('timeZone') as string[]).includes(timezone)
      } catch {
        validTz = true
      }
      if (!validTz) return c.json({ message: 'Invalid timezone.' }, 400)
    }
    const swapMb = Math.max(0, Math.min(16384, Number(body.swapMb) || 0))
    const dnsServers = Array.isArray(body.dnsServers)
      ? body.dnsServers.map((d) => String(d).trim()).filter((d) => /^\d{1,3}(\.\d{1,3}){3}$/.test(d)).slice(0, 3)
      : []
    const directSsh = body.directSsh === true

    let userSshKeys: SshKeyRow[]
    if (Array.isArray(body.sshKeyIds)) {
      const ids = body.sshKeyIds.filter((id) => typeof id === 'string')
      userSshKeys =
        ids.length > 0
          ? await query<SshKeyRow>('SELECT public_key FROM ssh_keys WHERE user_id = $1 AND id = ANY($2::uuid[])', [session.user_id, ids])
          : []
    } else {
      userSshKeys = await query<SshKeyRow>('SELECT public_key FROM ssh_keys WHERE user_id = $1', [session.user_id])
    }
    const sshPublicKeys = userSshKeys.map((k) => k.public_key)

    try {
      await incus.createInstance({
        name: instance.name,
        type: instance.type === 'kvm' ? 'virtual-machine' : 'container',
        imageAlias: osConfig.alias,
        cpu: instance.cores,
        memory: `${instance.memory_mb}MiB`,
        disk: `${instance.disk_gb}GiB`,
        sshKeys: sshPublicKeys,
        uefi: osConfig.uefi,
        hostname: hostname || undefined,
        timezone: timezone || undefined,
        swapMb,
        dnsServers,
      })
      await incus.setInstanceState(instance.name, 'start').catch((e) => {
        console.warn('Failed to start newly installed instance:', e)
      })

      let rootPassword: string | null = null
      let sshHostPort: number | null = null
      if (sshPublicKeys.length === 0 || directSsh) {
        try {
          let containerIp: string | null = null
          for (let attempt = 0; attempt < 15 && !containerIp; attempt++) {
            const state = await incus.getInstanceState(instance.name).catch(() => null)
            containerIp = containerGlobalIpv4(state)
            if (!containerIp) await new Promise((r) => setTimeout(r, 3000))
          }
          if (containerIp) {
            const config = await getSystemSettings()
            const { start, end } = portForwardRange(config)
            const taken = new Set(
              (await query<{ host_port: number }>(
                'SELECT host_port FROM port_forwards WHERE host_port BETWEEN $1 AND $2',
                [start, end],
              )).map((r) => r.host_port),
            )
            const free: number[] = []
            for (let port = start; port <= end; port++) if (!taken.has(port)) free.push(port)
            if (free.length > 0) {
              sshHostPort = free[Math.floor(Math.random() * free.length)]
              await attachForward(
                instance.name,
                { kind: 'ssh', host_port: sshHostPort, container_port: 22, protocol: 'tcp' },
                containerIp,
              )
              await query(
                `INSERT INTO port_forwards (id, instance_id, kind, host_port, container_port, protocol)
                 VALUES ($1, $2, 'ssh', $3, 22, 'tcp')`,
                [randomUUID(), instance.id, sshHostPort],
              ).catch(() => {})
            }
          }
        } catch (err: any) {
          console.warn('Direct SSH setup warning:', err?.message)
          sshHostPort = null
        }
      }
      if (sshPublicKeys.length === 0) {
        try {
          rootPassword = await issueRootPassword(instance.name)
        } catch (err: any) {
          console.warn('Root password setup warning:', err?.message)
        }
      }

      await query(
        `UPDATE instances SET os = $1, image_alias = $2, hostname = $3, timezone = $4, swap_mb = $5, dns_servers = $6::jsonb
         WHERE id = $7`,
        [osConfig.name, osConfig.alias, hostname, timezone, swapMb, JSON.stringify(dnsServers), instance.id],
      )

      await logActivity(
        session.user_id,
        'install_os',
        `Installed ${osConfig.name} on "${instance.name}"`,
        clientKey(c),
      )

      let passwordEmailed = false
      try {
        const owner2 = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
        const host = await sshHostFor(instance)
        if (owner2) {
          passwordEmailed = await sendSshAccessEmail({
            user: owner2,
            instanceName: instance.name,
            os: osConfig.name,
            sshCmd: sshHostPort ? `ssh -p ${sshHostPort} root@${host}` : null,
            username: 'root',
            password: rootPassword,
            deployed: true,
            keysInjected: sshPublicKeys.length > 0,
          })
        }
      } catch (err: any) {
        console.warn('Access email warning:', err?.message)
      }

      return c.json({
        id: instance.id,
        name: instance.name,
        os: osConfig.name,
        sshHostPort,
        passwordEmailed,
      })
    } catch (err: any) {
      console.error('OS install failed:', err)
      return c.json({ message: err?.message || 'Failed to install OS.' }, 500)
    }
  })

  app.post('/api/instances/:id/rebuild', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)
    if (!instance.os) {
      return c.json({ message: 'This server has no OS to rebuild — use the setup page.' }, 409)
    }
    // Rebuild wipes the existing system: stop + delete the Incus instance
    // and drop its port forwards before provisioning the fresh OS.
    try {
      await incus.setInstanceState(instance.name, 'stop', true).catch(() => {})
      await incus.deleteInstance(instance.name)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to delete the existing instance.' }, 500)
    }
    await query('DELETE FROM port_forwards WHERE instance_id = $1', [instance.id])

    const body = await c.req
      .json<{
        templateId?: string
        hostname?: string
        timezone?: string
        swapMb?: number
        dnsServers?: string[]
        sshKeyIds?: string[]
        directSsh?: boolean
      }>()
      .catch(() => null)
    if (!body?.templateId) return c.json({ message: 'An OS template is required.' }, 400)

    let osConfig
    try {
      osConfig = await resolveOsSource({ templateId: body.templateId })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Invalid OS selection.' }, 400)
    }

    const hostname = String(body.hostname || instance.hostname || '').trim().toLowerCase()
    if (hostname && !/^[a-z0-9][a-z0-9.-]{0,62}[a-z0-9]$/.test(hostname)) {
      return c.json({ message: 'Hostname must be a valid DNS hostname.' }, 400)
    }
    const timezone = String(body.timezone || '').trim()
    if (timezone) {
      let validTz = false
      try {
        validTz = (Intl.supportedValuesOf('timeZone') as string[]).includes(timezone)
      } catch {
        validTz = true
      }
      if (!validTz) return c.json({ message: 'Invalid timezone.' }, 400)
    }
    const swapMb = Math.max(0, Math.min(16384, Number(body.swapMb) || 0))
    const dnsServers = Array.isArray(body.dnsServers)
      ? body.dnsServers.map((d) => String(d).trim()).filter((d) => /^\d{1,3}(\.\d{1,3}){3}$/.test(d)).slice(0, 3)
      : []
    const directSsh = body.directSsh === true

    let userSshKeys: SshKeyRow[]
    if (Array.isArray(body.sshKeyIds)) {
      const ids = body.sshKeyIds.filter((id) => typeof id === 'string')
      userSshKeys =
        ids.length > 0
          ? await query<SshKeyRow>('SELECT public_key FROM ssh_keys WHERE user_id = $1 AND id = ANY($2::uuid[])', [session.user_id, ids])
          : []
    } else {
      userSshKeys = await query<SshKeyRow>('SELECT public_key FROM ssh_keys WHERE user_id = $1', [session.user_id])
    }
    const sshPublicKeys = userSshKeys.map((k) => k.public_key)

    try {
      await incus.createInstance({
        name: instance.name,
        type: instance.type === 'kvm' ? 'virtual-machine' : 'container',
        imageAlias: osConfig.alias,
        cpu: instance.cores,
        memory: `${instance.memory_mb}MiB`,
        disk: `${instance.disk_gb}GiB`,
        sshKeys: sshPublicKeys,
        uefi: osConfig.uefi,
        hostname: hostname || undefined,
        timezone: timezone || undefined,
        swapMb,
        dnsServers,
      })
      await incus.setInstanceState(instance.name, 'start').catch((e) => {
        console.warn('Failed to start newly installed instance:', e)
      })

      let rootPassword: string | null = null
      let sshHostPort: number | null = null
      if (sshPublicKeys.length === 0 || directSsh) {
        try {
          let containerIp: string | null = null
          for (let attempt = 0; attempt < 15 && !containerIp; attempt++) {
            const state = await incus.getInstanceState(instance.name).catch(() => null)
            containerIp = containerGlobalIpv4(state)
            if (!containerIp) await new Promise((r) => setTimeout(r, 3000))
          }
          if (containerIp) {
            const config = await getSystemSettings()
            const { start, end } = portForwardRange(config)
            const taken = new Set(
              (await query<{ host_port: number }>(
                'SELECT host_port FROM port_forwards WHERE host_port BETWEEN $1 AND $2',
                [start, end],
              )).map((r) => r.host_port),
            )
            const free: number[] = []
            for (let port = start; port <= end; port++) if (!taken.has(port)) free.push(port)
            if (free.length > 0) {
              sshHostPort = free[Math.floor(Math.random() * free.length)]
              await attachForward(
                instance.name,
                { kind: 'ssh', host_port: sshHostPort, container_port: 22, protocol: 'tcp' },
                containerIp,
              )
              await query(
                `INSERT INTO port_forwards (id, instance_id, kind, host_port, container_port, protocol)
                 VALUES ($1, $2, 'ssh', $3, 22, 'tcp')`,
                [randomUUID(), instance.id, sshHostPort],
              ).catch(() => {})
            }
          }
        } catch (err: any) {
          console.warn('Direct SSH setup warning:', err?.message)
          sshHostPort = null
        }
      }
      if (sshPublicKeys.length === 0) {
        try {
          rootPassword = await issueRootPassword(instance.name)
        } catch (err: any) {
          console.warn('Root password setup warning:', err?.message)
        }
      }

      await query(
        `UPDATE instances SET os = $1, image_alias = $2, hostname = $3, timezone = $4, swap_mb = $5, dns_servers = $6::jsonb
         WHERE id = $7`,
        [osConfig.name, osConfig.alias, hostname, timezone, swapMb, JSON.stringify(dnsServers), instance.id],
      )

      await logActivity(
        session.user_id,
        'rebuild_instance',
        `Rebuilt "${instance.name}" with ${osConfig.name}`,
        clientKey(c),
      )

      let passwordEmailed = false
      try {
        const owner2 = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
        const host = await sshHostFor(instance)
        if (owner2) {
          passwordEmailed = await sendSshAccessEmail({
            user: owner2,
            instanceName: instance.name,
            os: osConfig.name,
            sshCmd: sshHostPort ? `ssh -p ${sshHostPort} root@${host}` : null,
            username: 'root',
            password: rootPassword,
            deployed: true,
            keysInjected: sshPublicKeys.length > 0,
          })
        }
      } catch (err: any) {
        console.warn('Access email warning:', err?.message)
      }

      return c.json({
        id: instance.id,
        name: instance.name,
        os: osConfig.name,
        sshHostPort,
        passwordEmailed,
      })
    } catch (err: any) {
      console.error('Rebuild failed:', err)
      return c.json({ message: err?.message || 'Failed to rebuild. The previous system may be gone.' }, 500)
    }
  })

  app.post('/api/instances/:id/action', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    const body = await c.req.json<{ action?: string; force?: boolean }>().catch(() => null)
    const action = body?.action
    if (action !== 'start' && action !== 'stop' && action !== 'restart' && action !== 'freeze' && action !== 'unfreeze') {
      return c.json({ message: 'Action must be start, stop, restart, freeze, or unfreeze.' }, 400)
    }
    // Freezing is an owner-level pause (keeps RAM, stops CPU). Administrative
    // suspensions carry a reason and override it: owners cannot act until
    // an admin clears it.
    if ((action === 'freeze' || action === 'unfreeze') && instance.suspend_reason) {
      return c.json(
        { message: 'This server was suspended by an administrator. Contact support.' },
        403,
      )
    }

    try {
      await incus.setInstanceState(
        instance.name,
        action,
        body?.force === true && (action === 'stop' || action === 'restart'),
      )
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

  /* Rename an owned instance (Incus requires it stopped). */
  app.patch('/api/instances/:id', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    const body = await c.req.json<{ name?: string }>().catch(() => null)
    const cleanName = (body?.name || '').trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(cleanName)) {
      return c.json(
        { message: 'Name must be 3-32 characters, lowercase alphanumeric and hyphens only.' },
        400,
      )
    }
    if (cleanName === instance.name) return c.json({ ok: true, name: cleanName })
    const taken = await queryOne('SELECT id FROM instances WHERE name = $1', [cleanName])
    if (taken) return c.json({ message: 'An instance with this name already exists.' }, 409)

    try {
      const live = await incus.getInstance(instance.name).catch(() => null)
      const liveStatus = (live?.status || '').toLowerCase()
      if (liveStatus === 'running' || liveStatus === 'frozen' || liveStatus === 'freezing') {
        return c.json({ message: 'Stop the server before renaming it.' }, 400)
      }
      await incus.renameInstance(instance.name, cleanName)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to rename in Incus.' }, 500)
    }

    await query('UPDATE instances SET name = $1 WHERE id = $2', [cleanName, instance.id])
    await logActivity(
      session.user_id,
      'rename_instance',
      `Renamed "${instance.name}" to "${cleanName}"`,
      clientKey(c),
    )
    return c.json({ ok: true, name: cleanName })
  })

  /* Reinstall: destroy and recreate with the same (or a new) image. Data is lost. */
  app.post('/api/instances/:id/reinstall', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    const body = await c.req.json<{ templateId?: string }>().catch(() => null)
    let osName = instance.os
    let osAlias = instance.image_alias
    if (body?.templateId) {
      try {
        const resolved = await resolveOsSource({ templateId: body.templateId })
        osName = resolved.name
        osAlias = resolved.alias
      } catch (err: any) {
        return c.json({ message: err?.message || 'Invalid OS template.' }, 400)
      }
    }

    const ownerKeys = await query<SshKeyRow>('SELECT public_key FROM ssh_keys WHERE user_id = $1', [
      session.user_id,
    ])

    try {
      await incus.setInstanceState(instance.name, 'stop', true).catch(() => {})
      await incus.deleteInstance(instance.name)
      await incus.createInstance({
        name: instance.name,
        type: instance.type === 'kvm' ? 'virtual-machine' : 'container',
        imageAlias: osAlias,
        cpu: instance.cores,
        memory: `${instance.memory_mb}MiB`,
        disk: `${instance.disk_gb}GiB`,
        sshKeys: ownerKeys.map((k) => k.public_key),
      })
      await incus.setInstanceState(instance.name, 'start').catch(() => {})
      // Proxy devices died with the old instance; re-attach every forward.
      const freshState = await incus.getInstanceState(instance.name).catch(() => null)
      const freshIp = containerGlobalIpv4(freshState)
      if (freshIp) {
        const forwards = await query<{ id: string; kind: string; host_port: number; container_port: number; protocol: string }>(
          'SELECT id, kind, host_port, container_port, protocol FROM port_forwards WHERE instance_id = $1',
          [instance.id],
        )
        for (const fwd of forwards) {
          try {
            await attachForward(instance.name, fwd, freshIp)
            await query('UPDATE port_forwards SET container_ip = $1 WHERE id = $2', [freshIp, fwd.id])
          } catch (e: any) {
            console.warn('Reinstall forward restore warning:', e?.message)
          }
        }
      }
    } catch (err: any) {
      console.error('Reinstall failed:', err)
      return c.json(
        { message: err?.message || 'Reinstall failed. The previous system may be gone.' },
        500,
      )
    }

    await query('UPDATE instances SET os = $1, image_alias = $2 WHERE id = $3', [
      osName,
      osAlias,
      instance.id,
    ])
    await logActivity(
      session.user_id,
      'reinstall_instance',
      `Reinstalled "${instance.name}" with ${osName}`,
      clientKey(c),
    )
    return c.json({ ok: true, os: osName })
  })

  /* One-time root password via Incus exec. Returned once, never stored. */
  async function issueRootPassword(instanceName: string): Promise<string> {
    const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!#$%&*-+=?'
    const bytes = randomBytes(20)
    let password = ''
    for (const b of bytes) password += alphabet[b % alphabet.length]

    // Cloud images ship without sshd and with password/root login disabled.
    // Bring the daemon up in a usable state, then set the password.
    const setupScript = [
      `export DEBIAN_FRONTEND=noninteractive`,
      `command -v sshd >/dev/null || (apt-get update -qq && apt-get install -y -qq openssh-server)`,
      `mkdir -p /etc/ssh/sshd_config.d`,
      `rm -f /etc/ssh/sshd_config.d/99-solstice.conf`,
      `printf 'PasswordAuthentication yes\nPermitRootLogin yes\n' > /etc/ssh/sshd_config.d/00-solstice.conf`,
      `grep -q '^Include /etc/ssh/sshd_config.d/\*.conf' /etc/ssh/sshd_config 2>/dev/null || printf 'Include /etc/ssh/sshd_config.d/*.conf\n' | cat - /etc/ssh/sshd_config > /tmp/sshd_config && mv /tmp/sshd_config /etc/ssh/sshd_config`,
      `(systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || service ssh restart 2>/dev/null || true)`,
      `echo 'root:${password}' | chpasswd`,
    ].join(' && ')
    const ok = await incus.execInstance(instanceName, ['bash', '-c', setupScript], 180)
    if (!ok) throw new Error('Exec did not complete.')
    return password
  }

  app.post('/api/instances/:id/ssh-password', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    let live: IncusInstance | null = null
    try {
      live = await incus.getInstance(instance.name)
    } catch {
      return c.json({ message: 'Instance is not reachable.' }, 400)
    }
    if ((live.status || '').toLowerCase() !== 'running') {
      return c.json({ message: 'Start the server first.' }, 400)
    }

    let password: string
    try {
      password = await issueRootPassword(instance.name)
    } catch (err: any) {
      return c.json(
        { message: err?.message || 'Could not set a password (is the instance reachable?).' },
        500,
      )
    }

    await logActivity(
      session.user_id,
      'ssh_password',
      `Generated an SSH password for "${instance.name}"`,
      clientKey(c),
    )
    const pwUser = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    const forward = await queryOne<{ host_port: number }>(
      'SELECT host_port FROM port_forwards WHERE instance_id = $1',
      [instance.id],
    )
    const host = await sshHostFor(instance)
    const sshCmd = forward ? `ssh -p ${forward.host_port} root@${host}` : null
    let emailed = false
    if (pwUser) {
      emailed = await sendSshAccessEmail({
        user: pwUser,
        instanceName: instance.name,
        os: instance.os,
        sshCmd,
        username: 'root',
        password,
        deployed: false,
        keysInjected: false,
      })
    }
    return c.json({ ok: true, username: 'root', emailed })
  })

  /* NAT port forward for direct SSH: random host port from the admin range
     proxied to the container's sshd. Password issued alongside, shown once. */
  function portForwardRange(config: Record<string, string>): { start: number; end: number } {
    const start = Math.floor(Number(config['port_forward_start'])) || 22000
    const end = Math.floor(Number(config['port_forward_end'])) || 22999
    return { start: Math.max(1024, start), end: Math.min(65535, end) }
  }

  /* Max forwards per user. NULL personal value falls back to the default. */
  function portForwardDefaultLimit(config: Record<string, string>): number {
    const raw = Number(config['port_forward_default_limit'])
    if (Number.isFinite(raw) && raw >= 0) return Math.min(1000, Math.floor(raw))
    return 5
  }

  function effectiveForwardLimit(user: UserRow, config: Record<string, string>): number {
    const personal = user.port_forward_limit
    if (personal !== null && personal !== undefined) {
      const n = Number(personal)
      if (Number.isFinite(n) && n >= 0) return Math.min(1000, Math.floor(n))
    }
    return portForwardDefaultLimit(config)
  }

  async function countUserForwards(userId: string): Promise<number> {
    const row = await queryOne<{ count: string }>(
      `SELECT count(*) FROM port_forwards pf
        JOIN instances i ON i.id = pf.instance_id
       WHERE i.user_id = $1`,
      [userId],
    )
    return Number(row?.count ?? 0)
  }

  /* Reachable address for direct SSH: the node's own FQDN/IP. Never the
     panel origin — SSH cannot traverse the HTTP tunnel. Admins should keep
     node records pointed at reachable addresses. */
  async function sshHostFor(instance: InstanceRow): Promise<string> {
    const node = instance.node_id
      ? await queryOne<{ fqdn: string; ip_address: string; public_ip: string }>(
          'SELECT fqdn, ip_address, public_ip FROM nodes WHERE id = $1',
          [instance.node_id],
        )
      : null
    if (node?.public_ip?.trim()) return node.public_ip.trim()
    const isLoopback = (v: string | undefined) =>
      !v || v === 'localhost' || v === '127.0.0.1' || v === '::1'
    if (!isLoopback(node?.fqdn?.trim())) return node!.fqdn.trim()
    if (!isLoopback(node?.ip_address?.trim())) return node!.ip_address.trim()
    return 'localhost'
  }

  /* First global IPv4 across non-loopback interfaces, or null. */
  function containerGlobalIpv4(state: IncusInstanceState | null): string | null {
    if (!state?.network) return null
    for (const [ifaceName, iface] of Object.entries(state.network)) {
      if (ifaceName === 'lo') continue
      const hit = iface.addresses?.find((a) => a.family === 'inet' && a.scope === 'global')
      if (hit) return hit.address
    }
    return null
  }

  /* Device names for a forward row. The SSH forward keeps its legacy name. */
  function forwardDeviceNames(kind: string, hostPort: number, protocol: string): Array<{ name: string; proto: 'tcp' | 'udp' }> {
    if (kind === 'ssh') return [{ name: 'solstice-ssh', proto: 'tcp' }]
    if (protocol === 'both') {
      return [
        { name: `solstice-pf-${hostPort}-tcp`, proto: 'tcp' },
        { name: `solstice-pf-${hostPort}-udp`, proto: 'udp' },
      ]
    }
    if (protocol === 'udp') return [{ name: `solstice-pf-${hostPort}-udp`, proto: 'udp' }]
    return [{ name: `solstice-pf-${hostPort}`, proto: 'tcp' }]
  }

  /* (Re)attach proxy device(s) for a forward row. Plain (non-NAT) proxy:
     the host routes the bridge directly. */
  async function attachForward(
    instanceName: string,
    row: { kind: string; host_port: number; container_port: number; protocol: string },
    containerIp: string,
  ) {
    // NAT-mode proxies require the connect IP to be a *static* instance
    // address. Pin the DHCP lease as a static IP on the default NIC first.
    await incus
      .addInstanceDevice(instanceName, 'eth0', { type: 'nic', 'ipv4.address': containerIp })
      .catch(() => {})
    for (const dev of forwardDeviceNames(row.kind, row.host_port, row.protocol)) {
      await incus.addInstanceDevice(instanceName, dev.name, {
        type: 'proxy',
        // VMs only support NAT-mode proxies.
        nat: 'true',
        'listen': `${dev.proto}:0.0.0.0:${row.host_port}`,
        'connect': `${dev.proto}:${containerIp}:${row.container_port}`,
      })
    }
    return containerIp
  }

  async function detachForward(
    instanceName: string,
    row: { kind: string; host_port: number; protocol: string },
  ) {
    for (const dev of forwardDeviceNames(row.kind, row.host_port, row.protocol)) {
      await incus.deleteInstanceDevice(instanceName, dev.name).catch(() => {})
    }
  }

  /* If the container's DHCP lease changed, repoint every proxy and update rows. */
  async function healInstanceForwards(instanceId: string, instanceName: string) {
    const state = await incus.getInstanceState(instanceName).catch(() => null)
    const liveIp = containerGlobalIpv4(state)
    if (!liveIp) return
    const rows = await query<{ id: string; kind: string; host_port: number; container_port: number; protocol: string; container_ip: string }>(
      'SELECT id, kind, host_port, container_port, protocol, container_ip FROM port_forwards WHERE instance_id = $1',
      [instanceId],
    )
    for (const row of rows) {
      if (row.container_ip === liveIp) continue
      try {
        await detachForward(instanceName, row)
        await attachForward(instanceName, row, liveIp)
        await query('UPDATE port_forwards SET container_ip = $1 WHERE id = $2', [liveIp, row.id])
      } catch (e: any) {
        console.warn('Forward heal warning:', e?.message)
      }
    }
  }

  app.get('/api/instances/:id/ssh-forward', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    const forward = await queryOne<{ host_port: number; container_port: number }>(
      `SELECT host_port, container_port FROM port_forwards
        WHERE instance_id = $1 AND kind = 'ssh'`,
      [instance.id],
    )
    if (!forward) return c.json({ forward: null })
    await healInstanceForwards(instance.id, instance.name).catch((e: any) =>
      console.warn('Forward heal warning:', e?.message),
    )
    return c.json({
      forward: {
        host: await sshHostFor(instance),
        hostPort: forward.host_port,
        containerPort: forward.container_port,
        username: 'root',
      },
    })
  })

  app.post('/api/instances/:id/ssh-forward', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    let live: IncusInstance | null = null
    try {
      live = await incus.getInstance(instance.name)
    } catch {
      return c.json({ message: 'Instance is not reachable.' }, 400)
    }
    if ((live.status || '').toLowerCase() !== 'running') {
      return c.json({ message: 'Start the server first.' }, 400)
    }

    const existing = await queryOne<{ host_port: number }>(
      'SELECT host_port FROM port_forwards WHERE instance_id = $1',
      [instance.id],
    )
    if (existing) {
      return c.json({ message: 'Direct SSH is already enabled for this server.' }, 409)
    }

    const config = await getSystemSettings()
    const owner = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (owner && !owner.is_admin) {
      const limit = effectiveForwardLimit(owner, config)
      const usedCount = await countUserForwards(session.user_id)
      if (usedCount >= limit) {
        return c.json(
          { message: `Port forward limit reached (${usedCount}/${limit}). Ask an admin to raise it.` },
          403,
        )
      }
    }
    const { start, end } = portForwardRange(config)
    const taken = new Set(
      (
        await query<{ host_port: number }>(
          'SELECT host_port FROM port_forwards WHERE host_port BETWEEN $1 AND $2',
          [start, end],
        )
      ).map((r) => r.host_port),
    )
    const free: number[] = []
    for (let port = start; port <= end; port++) {
      if (!taken.has(port)) free.push(port)
    }
    if (free.length === 0) {
      return c.json({ message: 'No free ports left in the forwarding range.' }, 409)
    }
    const hostPort = free[Math.floor(Math.random() * free.length)]

    const liveState = await incus.getInstanceState(instance.name).catch(() => null)
    const containerIp = containerGlobalIpv4(liveState)
    if (!containerIp) {
      return c.json({ message: 'No address on the container yet, try again shortly.' }, 400)
    }

    try {
      await attachForward(
        instance.name,
        { kind: 'ssh', host_port: hostPort, container_port: 22, protocol: 'tcp' },
        containerIp,
      )
    } catch (err: any) {
      return c.json({ message: err?.message || 'Could not create the port forward.' }, 500)
    }

    let password: string
    try {
      password = await issueRootPassword(instance.name)
    } catch (err: any) {
      await incus.deleteInstanceDevice(instance.name, 'solstice-ssh').catch(() => {})
      return c.json({ message: err?.message || 'Could not prepare SSH access.' }, 500)
    }

    // Seed the owner's saved keys so key auth works alongside the password.
    try {
      const ownerKeys = await query<SshKeyRow>('SELECT public_key FROM ssh_keys WHERE user_id = $1', [
        session.user_id,
      ])
      const clean = ownerKeys
        .map((k) => k.public_key.trim().split(/\s+/).slice(0, 2).join(' '))
        .filter((k) => /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-[a-z0-9-]+|sk-ssh-ed25519|sk-ecdsa-sha2-[a-z0-9-]+) [A-Za-z0-9+/=]+$/.test(k))
      if (clean.length > 0) {
        const quoted = clean.map((k) => `'${k}'`).join(' ')
        await incus.execInstance(
          instance.name,
          [
            'bash',
            '-c',
            `mkdir -p /root/.ssh && chmod 700 /root/.ssh && touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys && for k in ${quoted}; do grep -qxF "$k" /root/.ssh/authorized_keys || echo "$k" >> /root/.ssh/authorized_keys; done`,
          ],
          60,
        )
      }
    } catch (err: any) {
      console.warn('SSH key seeding warning:', err?.message)
    }

    try {
      await query(
        `INSERT INTO port_forwards (instance_id, host_port, container_port, container_ip, protocol, description, kind)
         VALUES ($1, $2, 22, $3, 'tcp', '', 'ssh')`,
        [instance.id, hostPort, containerIp],
      )
    } catch (err: any) {
      await incus.deleteInstanceDevice(instance.name, 'solstice-ssh').catch(() => {})
      if (err?.code === '23505') {
        return c.json({ message: 'Port was just taken, try again.' }, 409)
      }
      return c.json({ message: err?.message || 'Database error.' }, 500)
    }

    await logActivity(
      session.user_id,
      'ssh_forward_enable',
      `Enabled direct SSH on port ${hostPort} for "${instance.name}"`,
      clientKey(c),
    )
    const host = await sshHostFor(instance)
    let emailed = false
    if (owner) {
      emailed = await sendSshAccessEmail({
        user: owner,
        instanceName: instance.name,
        os: instance.os,
        sshCmd: `ssh -p ${hostPort} root@${host}`,
        username: 'root',
        password,
        deployed: false,
        keysInjected: false,
      })
    }
    return c.json(
      {
        ok: true,
        host,
        hostPort,
        username: 'root',
        emailed,
      },
      201,
    )
  })

  app.delete('/api/instances/:id/ssh-forward', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    const row = await queryOne<{ kind: string; host_port: number; protocol: string }>(
      `SELECT kind, host_port, protocol FROM port_forwards
        WHERE instance_id = $1 AND kind = 'ssh'`,
      [instance.id],
    )
    if (row) await detachForward(instance.name, row).catch(() => {})
    await query(`DELETE FROM port_forwards WHERE instance_id = $1 AND kind = 'ssh'`, [instance.id])
    await logActivity(
      session.user_id,
      'ssh_forward_disable',
      `Disabled direct SSH for "${instance.name}"`,
      clientKey(c),
    )
    return c.json({ ok: true })
  })


  /* Browser terminal session via sshx (https://sshx.io). Installs the static
     binary if missing, launches it detached, and polls its log for the share
     link. The link grants root shell access — returned once, never logged. */
  app.post('/api/instances/:id/ssh-session', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    let live: IncusInstance | null = null
    try {
      live = await incus.getInstance(instance.name)
    } catch {
      return c.json({ message: 'Instance is not reachable.' }, 400)
    }
    if ((live.status || '').toLowerCase() !== 'running') {
      return c.json({ message: 'Start the server first.' }, 400)
    }

    // Install first as its own step (the pipe installer is flaky inside long
    // chained commands), then launch detached.
    try {
      const installed = await incus.execInstance(
        instance.name,
        ['bash', '-c', `command -v sshx >/dev/null || curl -sSf https://sshx.io/get | sh`],
        180,
      )
      if (!installed) throw new Error('Could not install the terminal.')
      const launched = await incus.execInstance(
        instance.name,
        [
          'bash',
          '-c',
          `pkill -x sshx 2>/dev/null; rm -f /tmp/.solstice-sshx.log; setsid nohup sshx > /tmp/.solstice-sshx.log 2>&1 < /dev/null & sleep 2; echo launched`,
        ],
        60,
      )
      if (!launched) throw new Error('Could not launch the session.')
    } catch (err: any) {
      return c.json(
        { message: err?.message || 'Could not start a terminal session.' },
        500,
      )
    }

    const linkPattern = /https:\/\/sshx\.io\/s\/[A-Za-z0-9_#=-]+/
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((r) => setTimeout(r, 2000))
      const log = await incus.readInstanceFile(instance.name, '/tmp/.solstice-sshx.log')
      const match = log?.match(linkPattern)
      if (match) {
        await logActivity(
          session.user_id,
          'ssh_session',
          `Opened a browser terminal session on "${instance.name}"`,
          clientKey(c),
        )
        return c.json({ ok: true, url: match[0] })
      }
    }
    return c.json(
      { message: 'Session started but no share link appeared. Check outbound network access.' },
      500,
    )
  })

  app.delete('/api/instances/:id/ssh-session', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    await incus
      .execInstance(instance.name, ['bash', '-c', `pkill -x sshx; rm -f /tmp/.solstice-sshx.log`], 30)
      .catch(() => {})
    await logActivity(
      session.user_id,
      'ssh_session_end',
      `Closed the browser terminal session on "${instance.name}"`,
      clientKey(c),
    )
    return c.json({ ok: true })
  })

  /* Personal access tokens: long-lived Bearer credentials for scripts.
     Management is session-only; tokens never grant admin. */
  app.get('/api/api-keys', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const rows = await query<{
      id: string
      name: string
      prefix: string
      last_used_at: Date | string | null
      expires_at: Date | string | null
      created_at: Date | string
    }>(
      `SELECT id, name, prefix, last_used_at, expires_at, created_at
         FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [session.user_id],
    )
    return c.json({
      keys: rows.map((r) => ({
        id: r.id,
        name: r.name,
        prefix: r.prefix,
        lastUsedAt: r.last_used_at ? toIso(r.last_used_at) : null,
        expiresAt: r.expires_at ? toIso(r.expires_at) : null,
        createdAt: toIso(r.created_at),
      })),
    })
  })

  app.post('/api/api-keys', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const body = await c.req.json<{ name?: string; expiresInDays?: number }>().catch(() => null)
    const name = (body?.name || '').trim().slice(0, 60) || 'Untitled key'
    let expiresAt: string | null = null
    if (body?.expiresInDays !== undefined) {
      const days = Math.floor(Number(body.expiresInDays))
      if (!Number.isFinite(days) || days < 1 || days > 3650) {
        return c.json({ message: 'Expiry must be 1-3650 days.' }, 400)
      }
      expiresAt = new Date(Date.now() + days * 86400000).toISOString()
    }

    const token = `solstice_${randomBytes(24).toString('base64url')}`
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const created = await queryOne<{ id: string; created_at: Date | string }>(
      `INSERT INTO api_keys (user_id, name, prefix, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [session.user_id, name, token.slice(0, 16), tokenHash, expiresAt],
    )
    await logActivity(session.user_id, 'api_key_create', `Created API key "${name}"`, clientKey(c))
    return c.json(
      {
        id: created!.id,
        name,
        prefix: token.slice(0, 16),
        token,
        expiresAt,
        createdAt: toIso(created!.created_at),
      },
      201,
    )
  })

  app.delete('/api/api-keys/:id', async (c) => {
    const session = await readSession(getCookie(c, SESSION_COOKIE))
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const row = await queryOne<{ id: string }>(
      'SELECT id FROM api_keys WHERE id = $1 AND user_id = $2',
      [c.req.param('id'), session.user_id],
    )
    if (!row) return c.json({ message: 'API key not found.' }, 404)
    await query('DELETE FROM api_keys WHERE id = $1', [row.id])
    await logActivity(session.user_id, 'api_key_revoke', 'Revoked an API key', clientKey(c))
    return c.json({ ok: true })
  })

  /* All of a user's forwards with pool stats (drives the Network page). */
  app.get('/api/port-forwards', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const config = await getSystemSettings()
    const { start, end } = portForwardRange(config)
    const allocated = Math.max(0, end - start + 1)
    const caller = await queryOne<UserRow>('SELECT is_admin FROM users WHERE id = $1', [session.user_id])

    const rows = await query<{
      id: string
      kind: string
      host_port: number
      container_port: number
      protocol: string
      description: string
      container_ip: string
      created_at: Date | string
      instance_id: string
      instance_name: string
    }>(
      `SELECT pf.id, pf.kind, pf.host_port, pf.container_port, pf.protocol,
              pf.description, pf.container_ip, pf.created_at,
              i.id AS instance_id, i.name AS instance_name
         FROM port_forwards pf
         JOIN instances i ON i.id = pf.instance_id
        WHERE ($1 = TRUE OR i.user_id = $2)
        ORDER BY pf.created_at DESC`,
      [!!caller?.is_admin, session.user_id],
    )

    const used = await queryOne<{ count: string }>(
      'SELECT count(*) FROM port_forwards WHERE host_port BETWEEN $1 AND $2',
      [start, end],
    )

    const host = await (async () => {
      const first = rows[0]
      if (!first) return 'localhost'
      const inst = await queryOne<InstanceRow>('SELECT * FROM instances WHERE id = $1', [
        first.instance_id,
      ])
      return inst ? sshHostFor(inst) : 'localhost'
    })()

    const owner = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    const quotaLimit = owner ? effectiveForwardLimit(owner, config) : portForwardDefaultLimit(config)
    // Admins see every forward; their personal quota counts only their own.
    let quotaUsed = rows.length
    if (caller?.is_admin) {
      const own = await queryOne<{ count: string }>(
        `SELECT count(*) FROM port_forwards pf
          JOIN instances i ON i.id = pf.instance_id
         WHERE i.user_id = $1`,
        [session.user_id],
      )
      quotaUsed = Number(own?.count ?? 0)
    }

    return c.json({
      host,
      range: { start, end, allocated },
      used: Number(used?.count ?? 0),
      quota: { used: quotaUsed, limit: quotaLimit },
      forwards: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        instanceId: r.instance_id,
        instanceName: r.instance_name,
        hostPort: r.host_port,
        containerPort: r.container_port,
        protocol: r.protocol,
        description: r.description ?? '',
        createdAt: toIso(r.created_at),
      })),
    })
  })

  /* Custom forward: user picks the container port, host port is allocated. */
  app.post('/api/instances/:id/port-forwards', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    const body = await c.req
      .json<{ containerPort?: number; protocol?: string; description?: string }>()
      .catch(() => null)
    const containerPort = Math.floor(Number(body?.containerPort))
    if (!Number.isFinite(containerPort) || containerPort < 1 || containerPort > 65535) {
      return c.json({ message: 'Container port must be 1-65535.' }, 400)
    }
    if (containerPort === 22) {
      return c.json({ message: 'Port 22 is reserved for Direct SSH.' }, 400)
    }
    const protocol = (body?.protocol || 'tcp').toLowerCase()
    if (protocol !== 'tcp' && protocol !== 'udp' && protocol !== 'both') {
      return c.json({ message: 'Protocol must be tcp, udp, or both.' }, 400)
    }
    const description = String(body?.description || '').trim().slice(0, 80)

    let live: IncusInstance | null = null
    try {
      live = await incus.getInstance(instance.name)
    } catch {
      return c.json({ message: 'Instance is not reachable.' }, 400)
    }
    if ((live.status || '').toLowerCase() !== 'running') {
      return c.json({ message: 'Start the server first.' }, 400)
    }
    const liveState = await incus.getInstanceState(instance.name).catch(() => null)
    const containerIp = containerGlobalIpv4(liveState)
    if (!containerIp) {
      return c.json({ message: 'No address on the container yet, try again shortly.' }, 400)
    }

    const dupe = await queryOne(
      `SELECT id FROM port_forwards
        WHERE instance_id = $1 AND container_port = $2 AND protocol = $3`,
      [instance.id, containerPort, protocol],
    )
    if (dupe) return c.json({ message: 'This port is already forwarded.' }, 409)

    const config = await getSystemSettings()
    const owner = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (owner && !owner.is_admin) {
      const limit = effectiveForwardLimit(owner, config)
      const usedCount = await countUserForwards(session.user_id)
      if (usedCount >= limit) {
        return c.json(
          { message: `Port forward limit reached (${usedCount}/${limit}). Ask an admin to raise it.` },
          403,
        )
      }
    }
    const { start, end } = portForwardRange(config)
    const taken = new Set(
      (
        await query<{ host_port: number }>(
          'SELECT host_port FROM port_forwards WHERE host_port BETWEEN $1 AND $2',
          [start, end],
        )
      ).map((r) => r.host_port),
    )
    const free: number[] = []
    for (let port = start; port <= end; port++) {
      if (!taken.has(port)) free.push(port)
    }
    if (free.length === 0) {
      return c.json({ message: 'No free ports left in the forwarding range.' }, 409)
    }
    const hostPort = free[Math.floor(Math.random() * free.length)]
    const row = { kind: 'custom', host_port: hostPort, container_port: containerPort, protocol }

    try {
      await attachForward(instance.name, row, containerIp)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Could not create the port forward.' }, 500)
    }

    try {
      await query(
        `INSERT INTO port_forwards (instance_id, host_port, container_port, container_ip, protocol, description, kind)
         VALUES ($1, $2, $3, $4, $5, $6, 'custom')`,
        [instance.id, hostPort, containerPort, containerIp, protocol, description],
      )
    } catch (err: any) {
      await detachForward(instance.name, row).catch(() => {})
      if (err?.code === '23505') {
        return c.json({ message: 'Port was just taken, try again.' }, 409)
      }
      return c.json({ message: err?.message || 'Database error.' }, 500)
    }

    await logActivity(
      session.user_id,
      'port_forward_create',
      `Forwarded ${hostPort} to ${containerPort}/${protocol} on "${instance.name}"`,
      clientKey(c),
    )
    return c.json(
      {
        ok: true,
        host: await sshHostFor(instance),
        hostPort,
        containerPort,
        protocol,
        description,
      },
      201,
    )
  })

  app.delete('/api/instances/:id/port-forwards/:forwardId', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    const row = await queryOne<{ kind: string; host_port: number; protocol: string }>(
      `SELECT kind, host_port, protocol FROM port_forwards
        WHERE id = $1 AND instance_id = $2`,
      [c.req.param('forwardId'), instance.id],
    )
    if (!row) return c.json({ message: 'Forward not found.' }, 404)

    await detachForward(instance.name, row).catch(() => {})
    await query('DELETE FROM port_forwards WHERE id = $1', [c.req.param('forwardId')])
    await logActivity(
      session.user_id,
      'port_forward_delete',
      `Removed forward on port ${row.host_port} from "${instance.name}"`,
      clientKey(c),
    )
    return c.json({ ok: true })
  })

  /* Clone a server: snapshot the disk, copy it to a new instance, start it.
     Port forwards are never copied — host ports are globally unique. */
  app.post('/api/instances/:id/clone', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    /* Cloning provisions a new VPS, which only admins can do. */
    const caller = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!caller?.is_admin) {
      return c.json({ message: 'Only administrators can clone servers.' }, 403)
    }
    const instance = await queryOne<InstanceRow>(
      'SELECT * FROM instances WHERE id = $1',
      [c.req.param('id')],
    )
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    const body = await c.req.json<{ name?: string }>().catch(() => null)
    if (!body || typeof body.name !== 'string') {
      return c.json({ message: 'Clone name is required.' }, 400)
    }
    const cleanName = body.name.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(cleanName)) {
      return c.json(
        { message: 'Name must be 3-32 characters, lowercase alphanumeric and hyphens only.' },
        400,
      )
    }
    const existing = await queryOne('SELECT id FROM instances WHERE name = $1', [cleanName])
    if (existing) {
      return c.json({ message: 'An instance with this name already exists.' }, 409)
    }

    const tmpSnap = `clone-${Date.now().toString(36)}`
    try {
      await incus.createSnapshot(instance.name, tmpSnap)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Could not snapshot the source server.' }, 500)
    }

    try {
      await incus.copyInstance(`${instance.name}/${tmpSnap}`, cleanName)
    } catch (err: any) {
      await incus.deleteSnapshot(instance.name, tmpSnap).catch(() => {})
      return c.json({ message: err?.message || 'Clone failed.' }, 500)
    }
    await incus.deleteSnapshot(instance.name, tmpSnap).catch((e: any) => {
      console.warn('Clone cleanup warning:', e?.message)
    })

    await incus.setInstanceState(cleanName, 'start').catch((e: any) => {
      console.warn('Failed to start clone:', e?.message)
    })

    const cloneId = randomUUID()
    await query(
      `INSERT INTO instances (id, user_id, name, type, os, image_alias, cores, memory_mb, disk_gb, node_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        cloneId,
        instance.user_id,
        cleanName,
        instance.type,
        instance.os,
        instance.image_alias,
        instance.cores,
        instance.memory_mb,
        instance.disk_gb,
        instance.node_id,
      ],
    )
    await logActivity(
      session.user_id,
      'clone_instance',
      `Cloned "${instance.name}" to "${cleanName}"`,
      clientKey(c),
    )
    return c.json({ ok: true, id: cloneId, name: cleanName }, 201)
  })

  /* Firewall: one Incus network ACL per server, attached to eth0. */
  function firewallAclName(instance: InstanceRow): string {
    return `solstice-fw-${instance.id.slice(0, 8)}`
  }

  /* Incus speaks icmp4/icmp6; the UI presents both as icmp. */
  function firewallRuleToUi(
    direction: 'ingress' | 'egress',
    index: number,
    r: Record<string, string>,
  ) {
    const proto = r.protocol || ''
    return {
      direction,
      index,
      action: r.action || 'allow',
      protocol: proto === 'icmp4' || proto === 'icmp6' ? 'icmp' : proto,
      ports: r.destination_port || '',
      remote: direction === 'ingress' ? r.source || '' : r.destination || '',
      state: r.state || 'enabled',
    }
  }

  async function readFirewallState(instance: InstanceRow) {
    const aclName = firewallAclName(instance)
    const live = await incus.getInstance(instance.name)
    const localEth0 = (live.devices || {})['eth0'] as Record<string, string> | undefined
    const enabled = !!localEth0 && localEth0['security.acls'] === aclName
    const acl = await incus.getNetworkAcl(aclName).catch(() => null)
    const rules = [
      ...(acl?.ingress || []).map((r, i) => firewallRuleToUi('ingress', i, r)),
      ...(acl?.egress || []).map((r, i) => firewallRuleToUi('egress', i, r)),
    ]
    return { enabled, aclName, rules }
  }

  async function setFirewallAttach(instanceName: string, aclName: string, attach: boolean) {
    // Attach/detach needs the expanded NIC, so read it fresh first.
    const live = await incus.getInstance(instanceName)
    const expanded = ((live as any).expanded_devices || {})['eth0'] as Record<string, string> | undefined
    const local = (live.devices || {})['eth0'] as Record<string, string> | undefined
    await incus.mergeInstanceDevices(instanceName, (devices) => {
      if (attach) {
        const base: Record<string, string> = { ...(expanded || local || { type: 'nic', network: 'incusbr0' }) }
        delete base.hwaddr
        delete base.host_name
        devices['eth0'] = { ...base, name: 'eth0', 'security.acls': aclName }
      } else {
        const cur = devices['eth0'] as Record<string, string> | undefined
        if (!cur || cur['security.acls'] !== aclName) return
        const { ['security.acls']: _drop, name: _n, ...rest } = cur
        void _drop
        void _n
        const meaningful = Object.keys(rest).filter((k) => k !== 'type' && k !== 'network')
        if (meaningful.length === 0) {
          delete devices['eth0']
        } else {
          delete devices['eth0']['security.acls']
        }
      }
    })
  }

  function seedFirewallRules(): {
    egress: Array<Record<string, string>>
    ingress: Array<Record<string, string>>
  } {
    return {
      egress: [{ action: 'allow', state: 'enabled' }],
      ingress: [
        { action: 'allow', protocol: 'icmp4', state: 'enabled' },
        { action: 'allow', protocol: 'icmp6', state: 'enabled' },
        { action: 'allow', protocol: 'tcp', destination_port: '22', state: 'enabled' },
      ],
    }
  }

  app.get('/api/instances/:id/firewall', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const { instance, error, status } = await snapshotOwnerCheck(c, false)
    if (!instance) return c.json({ message: error }, status || 404)
    try {
      const state = await readFirewallState(instance)
      return c.json({ enabled: state.enabled, rules: state.rules })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to read firewall.' }, 500)
    }
  })

  app.post('/api/instances/:id/firewall/toggle', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const { instance, error, status } = await snapshotOwnerCheck(c, false)
    if (!instance) return c.json({ message: error }, status || 404)

    const body = await c.req.json<{ enabled?: boolean }>().catch(() => null)
    const enabled = body?.enabled === true
    const aclName = firewallAclName(instance)
    try {
      if (enabled) {
        const existing = await incus.getNetworkAcl(aclName).catch(() => null)
        if (!existing) await incus.createNetworkAcl(aclName, seedFirewallRules())
        await setFirewallAttach(instance.name, aclName, true)
      } else {
        await setFirewallAttach(instance.name, aclName, false)
      }
      await logActivity(
        session.user_id,
        'firewall_toggle',
        `${enabled ? 'Enabled' : 'Disabled'} firewall on "${instance.name}"`,
        clientKey(c),
      )
      const state = await readFirewallState(instance)
      return c.json({ enabled: state.enabled, rules: state.rules })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to update firewall.' }, 500)
    }
  })

  app.post('/api/instances/:id/firewall/rules', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const { instance, error, status } = await snapshotOwnerCheck(c, false)
    if (!instance) return c.json({ message: error }, status || 404)

    const body = await c.req
      .json<{ direction?: string; action?: string; protocol?: string; ports?: string; remote?: string }>()
      .catch(() => null)
    const direction = body?.direction === 'egress' ? 'egress' : body?.direction === 'ingress' ? 'ingress' : null
    const action = body?.action === 'drop' ? 'drop' : body?.action === 'allow' ? 'allow' : null
    const protocol = (body?.protocol || '').toLowerCase()
    const ports = (body?.ports || '').trim().replace(/\s+/g, '')
    const remote = (body?.remote || '').trim()
    if (!direction) return c.json({ message: 'Direction must be ingress or egress.' }, 400)
    if (!action) return c.json({ message: 'Action must be allow or drop.' }, 400)
    if (protocol && !['tcp', 'udp', 'icmp'].includes(protocol)) {
      return c.json({ message: 'Protocol must be tcp, udp, icmp, or empty.' }, 400)
    }
    if (ports && !/^[0-9,\-]+$/.test(ports)) {
      return c.json({ message: 'Ports must be numbers, commas, or ranges (e.g. 80,443 or 8000-8100).' }, 400)
    }
    if (remote && !/^[0-9a-fA-F:.\/]+$/.test(remote)) {
      return c.json({ message: 'Remote must be an IP or CIDR.' }, 400)
    }

    const aclName = firewallAclName(instance)
    try {
      let acl = await incus.getNetworkAcl(aclName).catch(() => null)
      if (!acl) {
        await incus.createNetworkAcl(aclName, seedFirewallRules())
        acl = await incus.getNetworkAcl(aclName).catch(() => null)
      }
      if (!acl) return c.json({ message: 'Firewall ACL was not created.' }, 500)
      const base: Record<string, string> = { action, state: 'enabled' }
      if (protocol && protocol !== 'icmp') base.protocol = protocol
      if (ports) base.destination_port = ports
      if (remote) base[direction === 'ingress' ? 'source' : 'destination'] = remote
      // One UI rule, one or two Incus rules (icmp covers v4 + v6).
      const toAdd: Array<Record<string, string>> =
        protocol === 'icmp'
          ? [
              { ...base, protocol: 'icmp4' },
              { ...base, protocol: 'icmp6' },
            ]
          : [base]
      const next = { egress: [...(acl.egress || [])], ingress: [...(acl.ingress || [])] }
      next[direction].push(...toAdd)
      await incus.updateNetworkAcl(aclName, next)
      // Adding the first rule arms the firewall.
      await setFirewallAttach(instance.name, aclName, true)
      await logActivity(
        session.user_id,
        'firewall_rule_add',
        `Added firewall rule (${direction} ${action}${protocol ? ` ${protocol}` : ''}${ports ? ` :${ports}` : ''}) on "${instance.name}"`,
        clientKey(c),
      )
      const state = await readFirewallState(instance)
      return c.json({ enabled: state.enabled, rules: state.rules }, 201)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to add firewall rule.' }, 500)
    }
  })

  app.delete('/api/instances/:id/firewall/rules', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const { instance, error, status } = await snapshotOwnerCheck(c, false)
    if (!instance) return c.json({ message: error }, status || 404)

    const body = await c.req.json<{ direction?: string; index?: number }>().catch(() => null)
    const direction = body?.direction === 'egress' ? 'egress' : body?.direction === 'ingress' ? 'ingress' : null
    const index = Math.floor(Number(body?.index))
    if (!direction || !Number.isFinite(index) || index < 0) {
      return c.json({ message: 'Direction and rule index are required.' }, 400)
    }

    const aclName = firewallAclName(instance)
    try {
      const acl = await incus.getNetworkAcl(aclName).catch(() => null)
      if (!acl || index >= (acl[direction] || []).length) {
        return c.json({ message: 'Rule not found.' }, 404)
      }
      const next = { egress: [...(acl.egress || [])], ingress: [...(acl.ingress || [])] }
      next[direction].splice(index, 1)
      await incus.updateNetworkAcl(aclName, next)
      await logActivity(
        session.user_id,
        'firewall_rule_delete',
        `Removed a ${direction} firewall rule from "${instance.name}"`,
        clientKey(c),
      )
      const state = await readFirewallState(instance)
      return c.json({ enabled: state.enabled, rules: state.rules })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to remove firewall rule.' }, 500)
    }
  })

  app.delete('/api/instances/:id', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const instance = await resolveInstance(c, session.user_id)
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
    const session = await authIdentity(c)
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

  /* Enabled OS templates visible to users (for reinstall choices).
     Registered before `/:id` so "os-templates" is not treated as an id. */
  app.get('/api/instances/os-templates', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const rows = await query<{ id: string; name: string; image_alias: string; arch: string }>(
      `SELECT id, name, image_alias, arch FROM os_templates
        WHERE enabled = true ORDER BY name ASC`,
    )
    return c.json({
      templates: rows.map((r) => ({
        id: r.id,
        name: r.name,
        imageAlias: r.image_alias,
        arch: r.arch,
      })),
    })
  })

  /* Recent completed tasks for a server (from the activity log). */
  app.get('/api/instances/:id/activity', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const instance = await resolveInstance(c, session.user_id)
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)
    const rows = await query<{
      id: string
      action: string
      details: string
      ip_address: string | null
      created_at: string
    }>(
      `SELECT id, action, details, ip_address, created_at
         FROM activity_logs
        WHERE user_id = $1 AND details LIKE $2
        ORDER BY created_at DESC
        LIMIT 50`,
      [session.user_id, `%"${instance.name}"%`],
    )
    return c.json({ tasks: rows })
  })

  app.get('/api/instances/:id', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const instanceId = c.req.param('id')
    const me = await queryOne<UserRow>('SELECT is_admin FROM users WHERE id = $1', [session.user_id])
    const row = await queryOne<
      InstanceRow & { node_name: string | null; location_name: string | null; location_code: string | null; location_city: string | null; owner_id: string; owner_email: string; owner_name: string }
    >(
      `SELECT i.*,
              COALESCE(NULLIF(n.display_name, ''), n.name) AS node_name,
              l.name AS location_name,
              l.short_code AS location_code,
              l.city AS location_city,
              u.id AS owner_id,
              u.email AS owner_email,
              u.name AS owner_name
         FROM instances i
         LEFT JOIN nodes n ON n.id = i.node_id
         LEFT JOIN locations l ON l.id = n.location_id
         JOIN users u ON u.id = i.user_id
        WHERE i.id = $1${me?.is_admin ? '' : ' AND i.user_id = $2'}`,
      me?.is_admin ? [instanceId] : [instanceId, session.user_id],
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

    const liveStatusRaw = ((state?.status || live?.status) || '').toLowerCase()
    const isRunning = liveStatusRaw === 'running'
    const liveStatusOut = isRunning ? 'running' : liveStatusRaw === 'frozen' || liveStatusRaw === 'freezing' ? 'frozen' : 'stopped'

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
        status: liveStatusOut as 'running' | 'stopped' | 'frozen',
        ip4,
        ip6,
        cores: row.cores,
        memory: formatMemory(row.memory_mb),
        memoryMb: row.memory_mb,
        disk: `${row.disk_gb} GB NVMe`,
        diskGb: row.disk_gb,
        uptime: isRunning ? 'Active' : 'Stopped',
        region: row.location_code
          ? `${row.location_city || row.location_name || row.location_code} (${row.location_code})`
          : '',
        nodeName: row.node_name,
        suspendReason: row.suspend_reason ?? null,
        owner: { id: row.owner_id, email: row.owner_email, name: row.owner_name },
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
    const session = await authIdentity(c)
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
    const session = await authIdentity(c)
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
    const session = await authIdentity(c)
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
    const config = await getSystemSettings()
    return c.json({
      ok: true,
      service: 'solstice-api',
      database: `postgres ${version?.server_version}`,
      mail: mailTransportName(config),
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

  /* Every port forward on the panel, with owner + server (admin overview). */
  app.get('/api/admin/port-forwards', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rows = await query<{
      id: string
      kind: string
      host_port: number
      container_port: number
      protocol: string
      description: string
      created_at: Date | string
      instance_id: string
      instance_name: string
      instance_type: string
      owner_id: string
      owner_email: string
      owner_name: string
    }>(
      `SELECT pf.id, pf.kind, pf.host_port, pf.container_port, pf.protocol,
              pf.description, pf.created_at,
              i.id AS instance_id, i.name AS instance_name, i.type AS instance_type,
              u.id AS owner_id, u.email AS owner_email, u.name AS owner_name
         FROM port_forwards pf
         JOIN instances i ON i.id = pf.instance_id
         JOIN users u ON u.id = i.user_id
        ORDER BY pf.created_at DESC`,
    )

    const forwards: Array<Record<string, unknown>> = []
    for (const r of rows) {
      const inst = await queryOne<InstanceRow>('SELECT * FROM instances WHERE id = $1', [
        r.instance_id,
      ])
      forwards.push({
        id: r.id,
        kind: r.kind,
        host: inst ? await sshHostFor(inst) : 'localhost',
        hostPort: r.host_port,
        containerPort: r.container_port,
        protocol: r.protocol,
        description: r.description ?? '',
        createdAt: toIso(r.created_at),
        instance: { id: r.instance_id, name: r.instance_name, type: r.instance_type },
        owner: { id: r.owner_id, email: r.owner_email, name: r.owner_name },
      })
    }

    return c.json({ forwards })
  })

  /* Remove any forward (abuse/misuse cleanup). Detaches the Incus device too. */
  app.delete('/api/admin/port-forwards/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const row = await queryOne<{
      kind: string
      host_port: number
      protocol: string
      instance_id: string
      instance_name: string
    }>(
      `SELECT pf.kind, pf.host_port, pf.protocol, i.id AS instance_id, i.name AS instance_name
         FROM port_forwards pf
         JOIN instances i ON i.id = pf.instance_id
        WHERE pf.id = $1`,
      [c.req.param('id')],
    )
    if (!row) return c.json({ message: 'Forward not found.' }, 404)

    await detachForward(row.instance_name, row).catch(() => {})
    await query('DELETE FROM port_forwards WHERE id = $1', [c.req.param('id')])
    await logActivity(
      admin.user.id,
      'admin_port_forward_delete',
      `Removed forward on port ${row.host_port} from "${row.instance_name}"`,
      clientKey(c),
    )
    return c.json({ ok: true })
  })

  app.get('/api/admin/users', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rows = await query<
      UserRow & { instance_count: number; ssh_key_count: number; passkey_count: number }
    >(
      `SELECT u.*,
              (SELECT COUNT(*)::int FROM instances i WHERE i.user_id = u.id) AS instance_count,
              (SELECT COUNT(*)::int FROM ssh_keys k WHERE k.user_id = u.id) AS ssh_key_count,
              (SELECT COUNT(*)::int FROM passkeys p WHERE p.user_id = u.id) AS passkey_count
         FROM users u
        ORDER BY u.created_at ASC`,
    )

    return c.json(
      rows.map((u) => ({
        ...publicUser(u),
        instanceCount: u.instance_count,
        sshKeyCount: u.ssh_key_count,
        passkeyCount: u.passkey_count,
      })),
    )
  })

  app.post('/api/admin/users', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await readJson(c)
    const email = str(body.email).trim()
    const name = str(body.name || body.displayName).trim()
    const externalId = str(body.externalId).trim()
    const isAdmin = body.isAdmin === true
    const isFrozen = body.isFrozen === true
    const isSuspended = body.isSuspended === true
    const emailVerified = body.emailVerified !== false

    if (!email || !EMAIL_PATTERN.test(email)) {
      return c.json({ message: 'Enter a valid email address.' }, 400)
    }
    if (!name) {
      return c.json({ message: 'Enter a display name.' }, 400)
    }

    const taken = await findUserByEmail(email)
    if (taken) {
      return c.json({ message: 'That email is already registered.' }, 409)
    }

    const [derivedFirst, ...derivedRest] = name.split(/\s+/)
    const id = randomUUID()
    try {
      const created = await queryOne<UserRow>(
        `INSERT INTO users (id, email, name, first_name, last_name, external_id, is_admin, is_frozen, is_suspended, email_verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          id,
          email,
          name,
          derivedFirst || null,
          derivedRest.join(' ') || null,
          externalId || null,
          isAdmin,
          isFrozen,
          isSuspended,
          emailVerified ? new Date().toISOString() : null,
        ],
      )
      if (!created) return c.json({ message: 'Could not create the account.' }, 500)

      await logActivity(
        admin.user.id,
        'create_user',
        `Created user ${created.email}`,
        clientKey(c),
      )

      const config = await getSystemSettings()
      try {
        if (emailVerified) {
          const appName = config['app_name'] || 'VPS Panel'
          const origin = publicOrigin(config)
          const mailMsg = {
            to: created.email,
            ...accountCreatedEmail(created.name, origin, appName),
          }
          const sent = await sendMail(mailMsg, config)
          await logEmail(created.email, mailMsg.subject, mailMsg.text, created.id)
          console.log(
            sent.filePath
              ? `[admin create] ${created.email} -> ${sent.filePath}`
              : `[admin create] emailed ${created.email}`,
          )
        } else {
          await sendVerificationCode(created, config)
        }
      } catch (error) {
        console.error('[admin create] could not send mail', error)
      }

      return c.json({ ...publicUser(created), instanceCount: 0, sshKeyCount: 0, passkeyCount: 0 }, 201)
    } catch (err: any) {
      if (err?.code === '23505') {
        return c.json({ message: 'That email is already registered.' }, 409)
      }
      return c.json({ message: err?.message || 'Database error' }, 500)
    }
  })

  app.get('/api/admin/users/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const targetId = c.req.param('id')
    const row = await queryOne<UserRow & { instance_count: number; ssh_key_count: number; passkey_count: number; forward_count: number }>(
      `SELECT u.*,
              (SELECT COUNT(*)::int FROM instances i WHERE i.user_id = u.id) AS instance_count,
              (SELECT COUNT(*)::int FROM ssh_keys k WHERE k.user_id = u.id) AS ssh_key_count,
              (SELECT COUNT(*)::int FROM passkeys p WHERE p.user_id = u.id) AS passkey_count,
              (SELECT COUNT(*)::int FROM port_forwards pf JOIN instances i ON i.id = pf.instance_id WHERE i.user_id = u.id) AS forward_count
         FROM users u
        WHERE u.id = $1`,
      [targetId],
    )
    if (!row) return c.json({ message: 'User not found.' }, 404)

    return c.json({
      ...publicUser(row),
      instanceCount: row.instance_count,
      sshKeyCount: row.ssh_key_count,
      passkeyCount: row.passkey_count,
      forwardCount: row.forward_count,
    })
  })

  app.get('/api/admin/users/:id/activity', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const targetId = c.req.param('id')
    const target = await queryOne<UserRow>('SELECT id FROM users WHERE id = $1', [targetId])
    if (!target) return c.json({ message: 'User not found.' }, 404)

    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50), 1), 100)
    const offset = Math.max(Number(c.req.query('offset') ?? 0), 0)

    const countRow = await queryOne<{ total: string }>(
      'SELECT count(*) AS total FROM activity_logs WHERE user_id = $1',
      [targetId],
    )
    const rows = await query<{
      id: string
      action: string
      details: string
      ip_address: string | null
      created_at: Date
    }>(
      'SELECT id, action, details, ip_address, created_at FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [targetId, limit, offset],
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

  /* Panel-wide activity log: every user's actions, searchable and filterable. */
  app.get('/api/admin/activity', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 25), 1), 100)
    const offset = Math.max(Number(c.req.query('offset') ?? 0), 0)
    const search = (c.req.query('q') ?? '').trim()
    const userId = (c.req.query('userId') ?? '').trim()

    const conditions: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (userId) {
      conditions.push(`a.user_id = $${idx++}`)
      values.push(userId)
    }
    if (search) {
      conditions.push(
        `(u.email ILIKE $${idx} OR u.name ILIKE $${idx} OR a.action ILIKE $${idx} OR a.details ILIKE $${idx} OR a.ip_address ILIKE $${idx})`,
      )
      values.push(`%${search}%`)
      idx++
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRow = await queryOne<{ total: string }>(
      `SELECT count(*) AS total FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ${where}`,
      values,
    )
    const rows = await query<{
      id: string
      action: string
      details: string
      ip_address: string | null
      created_at: Date | string
      user_id: string
      user_name: string | null
      user_email: string | null
      user_avatar: string | null
    }>(
      `SELECT a.id, a.action, a.details, a.ip_address, a.created_at, a.user_id,
              u.name AS user_name, u.email AS user_email, u.avatar_url AS user_avatar
         FROM activity_logs a
         LEFT JOIN users u ON u.id = a.user_id
        ${where}
        ORDER BY a.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset],
    )

    return c.json({
      total: Number(countRow?.total ?? 0),
      activities: rows.map((r) => ({
        id: r.id,
        action: r.action,
        details: r.details,
        ipAddress: r.ip_address,
        createdAt: toIso(r.created_at),
        user: r.user_id
          ? {
              id: r.user_id,
              name: r.user_name ?? 'Deleted user',
              email: r.user_email ?? '',
              avatarUrl: r.user_avatar ?? null,
            }
          : null,
      })),
    })
  })

  app.post('/api/admin/users/:id/disable-2fa', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const targetId = c.req.param('id')
    const target = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [targetId])
    if (!target) return c.json({ message: 'User not found.' }, 404)

    const deleted = await query<{ id: string }>('DELETE FROM passkeys WHERE user_id = $1 RETURNING id', [targetId])

    await logActivity(
      admin.user.id,
      'disable_user_2fa',
      `Disabled two-factor for ${target.email} (${deleted.length} passkey(s) removed)`,
      clientKey(c),
    )

    return c.json({ ok: true, removed: deleted.length })
  })

  app.get('/api/admin/users/:id/oauth-links', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const targetId = c.req.param('id')
    const target = await queryOne<UserRow>('SELECT id FROM users WHERE id = $1', [targetId])
    if (!target) return c.json({ message: 'User not found.' }, 404)

    const rows = await query<{
      id: string
      identifier: string
      created_at: Date | string
      last_used_at: Date | string | null
      provider_id: string
      provider_name: string
    }>(
      `SELECT l.id, l.identifier, l.created_at, l.last_used_at,
              p.id AS provider_id, p.name AS provider_name
         FROM oauth_links l
         JOIN oauth_providers p ON p.id = l.provider_id
        WHERE l.user_id = $1
        ORDER BY l.created_at DESC`,
      [targetId],
    )

    return c.json({
      links: rows.map((r) => ({
        id: r.id,
        providerId: r.provider_id,
        providerName: r.provider_name,
        identifier: r.identifier,
        createdAt: toIso(r.created_at),
        lastUsedAt: r.last_used_at ? toIso(r.last_used_at) : null,
      })),
    })
  })

  app.post('/api/admin/users/:id/oauth-links', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const targetId = c.req.param('id')
    const target = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [targetId])
    if (!target) return c.json({ message: 'User not found.' }, 404)

    const body = await c.req.json<any>().catch(() => null)
    const providerId = str(body?.providerId).trim()
    const identifier = str(body?.identifier).trim()
    if (!providerId || !identifier) {
      return c.json({ message: 'Provider and identifier are required.' }, 400)
    }

    const provider = await queryOne<OAuthProviderRow>(
      'SELECT * FROM oauth_providers WHERE id = $1',
      [providerId],
    )
    if (!provider) return c.json({ message: 'Provider not found.' }, 404)

    const taken = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM oauth_links WHERE provider_id = $1 AND identifier = $2',
      [providerId, identifier],
    )
    if (taken) {
      return c.json({ message: 'That provider account is already linked to a user.' }, 409)
    }

    await query('INSERT INTO oauth_links (provider_id, user_id, identifier) VALUES ($1, $2, $3)', [
      providerId,
      targetId,
      identifier,
    ])
    await logActivity(
      admin.user.id,
      'link_oauth',
      `Linked ${provider.name} account (${identifier}) to ${target.email}`,
      clientKey(c),
    )

    return c.json({ ok: true }, 201)
  })

  app.delete('/api/admin/users/:id/oauth-links/:linkId', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const targetId = c.req.param('id')
    const link = await queryOne<{ id: string }>(
      'SELECT id FROM oauth_links WHERE id = $1 AND user_id = $2',
      [c.req.param('linkId'), targetId],
    )
    if (!link) return c.json({ message: 'Link not found.' }, 404)

    await query('DELETE FROM oauth_links WHERE id = $1', [c.req.param('linkId')])
    await logActivity(
      admin.user.id,
      'unlink_oauth',
      `Removed an OAuth link from user ${targetId}`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.patch('/api/admin/users/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const targetId = c.req.param('id')
    const body = await c.req.json<{
      isAdmin?: boolean
      username?: string | null
      name?: string
      firstName?: string | null
      lastName?: string | null
      language?: string
      externalId?: string | null
      isFrozen?: boolean
      isSuspended?: boolean
      emailVerified?: boolean
      portForwardLimit?: number | null
    }>().catch(() => null)
    if (!body) return c.json({ message: 'Invalid body.' }, 400)

    // Never let an operator strip their own rights and lock everyone out.
    if (targetId === admin.user.id && body.isAdmin === false) {
      return c.json({ message: 'You cannot revoke your own admin access.' }, 400)
    }

    const fields: string[] = []
    const values: any[] = []
    let idx = 1

    if (body.isAdmin !== undefined) {
      fields.push(`is_admin = $${idx++}`)
      values.push(Boolean(body.isAdmin))
    }
    if (body.username !== undefined) {
      fields.push(`username = $${idx++}`)
      values.push(body.username ? String(body.username).trim() : null)
    }
    if (body.name !== undefined) {
      fields.push(`name = $${idx++}`)
      values.push(String(body.name).trim())
    }
    if (body.firstName !== undefined) {
      fields.push(`first_name = $${idx++}`)
      values.push(body.firstName ? String(body.firstName).trim() : null)
    }
    if (body.lastName !== undefined) {
      fields.push(`last_name = $${idx++}`)
      values.push(body.lastName ? String(body.lastName).trim() : null)
    }
    if (body.language !== undefined) {
      fields.push(`language = $${idx++}`)
      values.push(String(body.language).trim())
    }
    if (body.externalId !== undefined) {
      fields.push(`external_id = $${idx++}`)
      values.push(body.externalId ? String(body.externalId).trim() : null)
    }
    if (body.isFrozen !== undefined) {
      fields.push(`is_frozen = $${idx++}`)
      values.push(Boolean(body.isFrozen))
    }
    if (body.isSuspended !== undefined) {
      fields.push(`is_suspended = $${idx++}`)
      values.push(Boolean(body.isSuspended))
    }
    if (body.portForwardLimit !== undefined) {
      if (body.portForwardLimit === null) {
        fields.push(`port_forward_limit = $${idx++}`)
        values.push(null)
      } else {
        const n = Math.floor(Number(body.portForwardLimit))
        if (!Number.isFinite(n) || n < 0 || n > 1000) {
          return c.json({ message: 'Port forward limit must be 0-1000 or null.' }, 400)
        }
        fields.push(`port_forward_limit = $${idx++}`)
        values.push(n)
      }
    }
    if (body.emailVerified !== undefined) {
      if (body.emailVerified) {
        fields.push(`email_verified_at = COALESCE(email_verified_at, now())`)
      } else {
        fields.push(`email_verified_at = NULL`)
      }
    }

    if (fields.length === 0) {
      return c.json({ message: 'No fields provided.' }, 400)
    }

    values.push(targetId)
    const updated = await queryOne<UserRow>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    )
    if (!updated) return c.json({ message: 'User not found.' }, 404)

    await logActivity(
      admin.user.id,
      'update_user',
      `Updated user ${updated.email}`,
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

  /* Announcements API */
  app.get('/api/announcements', async (c) => {
    const rows = await query<{
      id: string
      type: string
      title: string
      content: string
      dismissible: boolean
      enabled: boolean
      enabled_start: Date | null
      enabled_end: Date | null
      dismissible_end: Date | null
      created_at: Date
    }>(
      `SELECT * FROM announcements
        WHERE enabled = true
          AND (enabled_start IS NULL OR enabled_start <= now())
          AND (enabled_end IS NULL OR enabled_end > now())
        ORDER BY created_at DESC`,
    )
    return c.json({
      announcements: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        content: r.content,
        dismissible: r.dismissible,
        enabled: r.enabled,
        enabledStart: r.enabled_start ? toIso(r.enabled_start) : null,
        enabledEnd: r.enabled_end ? toIso(r.enabled_end) : null,
        dismissibleEnd: r.dismissible_end ? toIso(r.dismissible_end) : null,
        createdAt: toIso(r.created_at),
      })),
    })
  })

  app.get('/api/admin/announcements', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rows = await query<{
      id: string
      type: string
      title: string
      content: string
      enabled: boolean
      dismissible: boolean
      enabled_start: Date | null
      enabled_end: Date | null
      dismissible_end: Date | null
      created_at: Date
      updated_at: Date
    }>('SELECT * FROM announcements ORDER BY created_at DESC')

    return c.json({
      announcements: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        content: r.content,
        enabled: r.enabled,
        dismissible: r.dismissible,
        enabledStart: r.enabled_start ? toIso(r.enabled_start) : null,
        enabledEnd: r.enabled_end ? toIso(r.enabled_end) : null,
        dismissibleEnd: r.dismissible_end ? toIso(r.dismissible_end) : null,
        createdAt: toIso(r.created_at),
        updatedAt: toIso(r.updated_at),
      })),
    })
  })

  app.get('/api/admin/announcements/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const row = await queryOne<{
      id: string
      type: string
      title: string
      content: string
      enabled: boolean
      dismissible: boolean
      enabled_start: Date | null
      enabled_end: Date | null
      dismissible_end: Date | null
      created_at: Date
      updated_at: Date
    }>('SELECT * FROM announcements WHERE id = $1', [c.req.param('id')])

    if (!row) return c.json({ message: 'Announcement not found.' }, 404)

    return c.json({
      announcement: {
        id: row.id,
        type: row.type,
        title: row.title,
        content: row.content,
        enabled: row.enabled,
        dismissible: row.dismissible,
        enabledStart: row.enabled_start ? toIso(row.enabled_start) : null,
        enabledEnd: row.enabled_end ? toIso(row.enabled_end) : null,
        dismissibleEnd: row.dismissible_end ? toIso(row.dismissible_end) : null,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      },
    })
  })

  app.post('/api/admin/announcements', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<any>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid payload.' }, 400)
    }

    const title = str(body.title).trim()
    const content = str(body.content).trim()
    const type = str(body.type).trim() || 'info'
    const enabled = body.enabled !== false
    const dismissible = Boolean(body.dismissible)
    const enabledStart = body.enabledStart ? new Date(body.enabledStart).toISOString() : null
    const enabledEnd = body.enabledEnd ? new Date(body.enabledEnd).toISOString() : null
    const dismissibleEnd = body.dismissibleEnd ? new Date(body.dismissibleEnd).toISOString() : null

    if (!title) return c.json({ message: 'Title is required.' }, 400)
    if (!content) return c.json({ message: 'Content is required.' }, 400)

    const id = randomUUID()
    const created = await queryOne<{
      id: string
      type: string
      title: string
      content: string
      enabled: boolean
      dismissible: boolean
      enabled_start: Date | null
      enabled_end: Date | null
      dismissible_end: Date | null
      created_at: Date
      updated_at: Date
    }>(
      `INSERT INTO announcements (id, type, title, content, enabled, dismissible, enabled_start, enabled_end, dismissible_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, type, title, content, enabled, dismissible, enabledStart, enabledEnd, dismissibleEnd],
    )

    await logActivity(
      admin.user.id,
      'create_announcement',
      `Created announcement "${title}"`,
      clientKey(c),
    )

    return c.json(
      {
        announcement: {
          id: created!.id,
          type: created!.type,
          title: created!.title,
          content: created!.content,
          enabled: created!.enabled,
          dismissible: created!.dismissible,
          enabledStart: created!.enabled_start ? toIso(created!.enabled_start) : null,
          enabledEnd: created!.enabled_end ? toIso(created!.enabled_end) : null,
          dismissibleEnd: created!.dismissible_end ? toIso(created!.dismissible_end) : null,
          createdAt: toIso(created!.created_at),
          updatedAt: toIso(created!.updated_at),
        },
      },
      201,
    )
  })

  app.patch('/api/admin/announcements/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const body = await c.req.json<any>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid payload.' }, 400)
    }

    const existing = await queryOne('SELECT * FROM announcements WHERE id = $1', [id])
    if (!existing) return c.json({ message: 'Announcement not found.' }, 404)

    const updates: string[] = []
    const values: any[] = []
    let idx = 1

    if ('title' in body) {
      const title = str(body.title).trim()
      if (!title) return c.json({ message: 'Title cannot be empty.' }, 400)
      updates.push(`title = $${idx++}`)
      values.push(title)
    }

    if ('content' in body) {
      const content = str(body.content).trim()
      if (!content) return c.json({ message: 'Content cannot be empty.' }, 400)
      updates.push(`content = $${idx++}`)
      values.push(content)
    }

    if ('type' in body) {
      updates.push(`type = $${idx++}`)
      values.push(str(body.type).trim() || 'info')
    }

    if ('enabled' in body) {
      updates.push(`enabled = $${idx++}`)
      values.push(Boolean(body.enabled))
    }

    if ('dismissible' in body) {
      updates.push(`dismissible = $${idx++}`)
      values.push(Boolean(body.dismissible))
    }

    if ('enabledStart' in body) {
      updates.push(`enabled_start = $${idx++}`)
      values.push(body.enabledStart ? new Date(body.enabledStart).toISOString() : null)
    }

    if ('enabledEnd' in body) {
      updates.push(`enabled_end = $${idx++}`)
      values.push(body.enabledEnd ? new Date(body.enabledEnd).toISOString() : null)
    }

    if ('dismissibleEnd' in body) {
      updates.push(`dismissible_end = $${idx++}`)
      values.push(body.dismissibleEnd ? new Date(body.dismissibleEnd).toISOString() : null)
    }

    if (updates.length === 0) {
      return c.json({ message: 'No updates provided.' }, 400)
    }

    updates.push(`updated_at = now()`)
    values.push(id)

    const updated = await queryOne<{
      id: string
      type: string
      title: string
      content: string
      enabled: boolean
      dismissible: boolean
      enabled_start: Date | null
      enabled_end: Date | null
      dismissible_end: Date | null
      created_at: Date
      updated_at: Date
    }>(
      `UPDATE announcements SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    )

    await logActivity(
      admin.user.id,
      'update_announcement',
      `Updated announcement "${updated!.title}"`,
      clientKey(c),
    )

    return c.json({
      announcement: {
        id: updated!.id,
        type: updated!.type,
        title: updated!.title,
        content: updated!.content,
        enabled: updated!.enabled,
        dismissible: updated!.dismissible,
        enabledStart: updated!.enabled_start ? toIso(updated!.enabled_start) : null,
        enabledEnd: updated!.enabled_end ? toIso(updated!.enabled_end) : null,
        dismissibleEnd: updated!.dismissible_end ? toIso(updated!.dismissible_end) : null,
        createdAt: toIso(updated!.created_at),
        updatedAt: toIso(updated!.updated_at),
      },
    })
  })

  app.delete('/api/admin/announcements/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const existing = await queryOne<{ title: string }>('SELECT title FROM announcements WHERE id = $1', [id])
    if (!existing) return c.json({ message: 'Announcement not found.' }, 404)

    await query('DELETE FROM announcements WHERE id = $1', [id])

    await logActivity(
      admin.user.id,
      'delete_announcement',
      `Deleted announcement "${existing.title}"`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  /* Assets API */
  app.get('/api/admin/assets', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rawPath = c.req.query('path') || 'assets'
    const config = await getSystemSettings()
    const storageConfig = parseStorageConfig(config)

    try {
      const result = await listAssets({
        prefix: rawPath,
        config: storageConfig,
        publicOrigin: publicOrigin(config),
      })
      return c.json({
        items: result.items,
        currentPath: result.currentPath,
        driver: storageConfig.driver,
      })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to list assets.' }, 500)
    }
  })

  app.post('/api/admin/assets/directory', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<any>().catch(() => null)
    if (!body || typeof body !== 'object' || !body.name) {
      return c.json({ message: 'Directory name is required.' }, 400)
    }

    const parentPath = typeof body.path === 'string' ? body.path : 'assets'
    const config = await getSystemSettings()
    const storageConfig = parseStorageConfig(config)

    try {
      const result = await createAssetDirectory({
        path: parentPath,
        name: body.name,
        config: storageConfig,
      })

      await logActivity(
        admin.user.id,
        'create_asset_directory',
        `Created directory "${result.path}"`,
        clientKey(c),
      )

      return c.json(result, 201)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to create directory.' }, 400)
    }
  })

  app.post('/api/admin/assets/upload', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const contentType = c.req.header('content-type') || ''
    const config = await getSystemSettings()
    const storageConfig = parseStorageConfig(config)
    const origin = publicOrigin(config)

    const uploadedFiles: Array<{ name: string; url: string; key: string }> = []

    try {
      if (contentType.includes('multipart/form-data')) {
        const body = await c.req.parseBody({ all: true })
        const targetPath = (typeof body['path'] === 'string' ? body['path'] : 'assets').replace(/^\/+/, '')
        const rawFiles = body['files'] || body['file']
        const fileList = Array.isArray(rawFiles) ? rawFiles : [rawFiles]

        for (const file of fileList) {
          if (file instanceof File) {
            const buffer = Buffer.from(await file.arrayBuffer())
            const mime = file.type || 'application/octet-stream'
            const res = await uploadAsset({
              folder: targetPath,
              filename: file.name,
              buffer,
              contentType: mime,
              config: storageConfig,
              publicOrigin: origin,
            })
            uploadedFiles.push({ name: file.name, url: res.url, key: res.key })
          }
        }
      } else {
        const body = await c.req.json<any>().catch(() => null)
        if (!body || !body.dataUrl) {
          return c.json({ message: 'No file provided.' }, 400)
        }
        const targetPath = (typeof body.path === 'string' ? body.path : 'assets').replace(/^\/+/, '')
        const parsed = parseDataUrl(body.dataUrl)
        if (!parsed) return c.json({ message: 'Invalid data URL.' }, 422)

        const res = await uploadAsset({
          folder: targetPath,
          filename: body.filename,
          buffer: parsed.buffer,
          contentType: parsed.contentType,
          config: storageConfig,
          publicOrigin: origin,
        })
        uploadedFiles.push({ name: body.filename || res.key, url: res.url, key: res.key })
      }

      if (uploadedFiles.length === 0) {
        return c.json({ message: 'No files were uploaded.' }, 400)
      }

      await logActivity(
        admin.user.id,
        'upload_asset',
        `Uploaded ${uploadedFiles.length} file(s) to assets`,
        clientKey(c),
      )

      return c.json({ ok: true, files: uploadedFiles }, 201)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to upload file(s).' }, 500)
    }
  })

  app.delete('/api/admin/assets', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<any>().catch(() => null)
    const pathsToDelete: string[] = []

    if (body) {
      if (Array.isArray(body.paths)) {
        pathsToDelete.push(...body.paths.filter((p: any) => typeof p === 'string'))
      } else if (typeof body.path === 'string') {
        pathsToDelete.push(body.path)
      }
    }

    if (pathsToDelete.length === 0) {
      const qPath = c.req.query('path')
      if (qPath) pathsToDelete.push(qPath)
    }

    if (pathsToDelete.length === 0) {
      return c.json({ message: 'Path to delete is required.' }, 400)
    }

    const config = await getSystemSettings()
    const storageConfig = parseStorageConfig(config)

    for (const p of pathsToDelete) {
      try {
        await deleteAsset({ path: p, config: storageConfig })
      } catch (err: any) {
        return c.json({ message: err?.message || `Failed to delete ${p}.` }, 400)
      }
    }

    await logActivity(
      admin.user.id,
      'delete_asset',
      `Deleted ${pathsToDelete.length} asset(s)`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  /* Infrastructure: Locations */
  app.get('/api/admin/locations', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const locations = await query<any>(
      `SELECT l.id,
              l.short_code AS "shortCode",
              l.name,
              l.description,
              l.country_code AS "countryCode",
              l.city,
              l.created_at AS "createdAt",
              l.updated_at AS "updatedAt",
              COALESCE(count(n.id), 0)::int AS "nodeCount",
              COALESCE(json_agg(json_build_object(
                'id', n.id,
                'name', n.name,
                'fqdn', n.fqdn,
                'ipAddress', n.ip_address,
                'maintenance', n.maintenance,
                'cpuCores', n.cpu_cores,
                'memoryMb', n.memory_limit_mb,
                'diskGb', n.disk_limit_gb
              )) FILTER (WHERE n.id IS NOT NULL), '[]'::json) AS nodes
         FROM locations l
         LEFT JOIN nodes n ON n.location_id = l.id
        GROUP BY l.id
        ORDER BY l.created_at ASC`,
    )

    const unassignedNodes = await query<any>(
      `SELECT id, name, fqdn, ip_address AS "ipAddress", maintenance, cpu_cores AS "cpuCores", memory_limit_mb AS "memoryMb", disk_limit_gb AS "diskGb"
         FROM nodes
        WHERE location_id IS NULL
        ORDER BY name ASC`,
    )

    return c.json({ locations, unassignedNodes })
  })

  app.post('/api/admin/locations', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<any>().catch(() => null)
    if (!body || !body.shortCode || !body.name) {
      return c.json({ message: 'Short code and name are required.' }, 400)
    }

    const shortCode = String(body.shortCode).trim().toLowerCase()
    const name = String(body.name).trim()
    const description = String(body.description || '').trim()
    const countryCode = String(body.countryCode || 'US').trim().toUpperCase()
    const city = String(body.city || '').trim()

    try {
      const row = await queryOne<{ id: string }>(
        `INSERT INTO locations (short_code, name, description, country_code, city)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [shortCode, name, description, countryCode, city],
      )

      if (!row) return c.json({ message: 'Failed to create location.' }, 500)

      if (Array.isArray(body.nodeIds) && body.nodeIds.length > 0) {
        await query(
          `UPDATE nodes SET location_id = $1, updated_at = now() WHERE id = ANY($2)`,
          [row.id, body.nodeIds],
        )
      }

      await logActivity(
        admin.user.id,
        'create_location',
        `Created location "${shortCode}" (${name})`,
        clientKey(c),
      )

      return c.json({ ok: true, id: row.id }, 201)
    } catch (err: any) {
      if (err?.code === '23505') {
        return c.json({ message: 'A location with this short code already exists.' }, 409)
      }
      return c.json({ message: err?.message || 'Database error' }, 500)
    }
  })

  app.patch('/api/admin/locations/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const body = await c.req.json<any>().catch(() => null)
    if (!body) return c.json({ message: 'Invalid payload.' }, 400)

    const existing = await queryOne<{ id: string; name: string }>('SELECT id, name FROM locations WHERE id = $1', [id])
    if (!existing) return c.json({ message: 'Location not found.' }, 404)

    const fields: string[] = []
    const values: any[] = []
    let idx = 1

    if (body.shortCode !== undefined) {
      fields.push(`short_code = $${idx++}`)
      values.push(String(body.shortCode).trim().toLowerCase())
    }
    if (body.name !== undefined) {
      fields.push(`name = $${idx++}`)
      values.push(String(body.name).trim())
    }
    if (body.description !== undefined) {
      fields.push(`description = $${idx++}`)
      values.push(String(body.description).trim())
    }
    if (body.countryCode !== undefined) {
      fields.push(`country_code = $${idx++}`)
      values.push(String(body.countryCode).trim().toUpperCase())
    }
    if (body.city !== undefined) {
      fields.push(`city = $${idx++}`)
      values.push(String(body.city).trim())
    }

    if (fields.length > 0) {
      fields.push(`updated_at = now()`)
      values.push(id)
      await query(`UPDATE locations SET ${fields.join(', ')} WHERE id = $${idx}`, values)
    }

    if (Array.isArray(body.nodeIds)) {
      await query(
        `UPDATE nodes SET location_id = NULL, updated_at = now() WHERE location_id = $1 AND NOT (id = ANY($2))`,
        [id, body.nodeIds],
      )
      if (body.nodeIds.length > 0) {
        await query(
          `UPDATE nodes SET location_id = $1, updated_at = now() WHERE id = ANY($2)`,
          [id, body.nodeIds],
        )
      }
    }

    await logActivity(
      admin.user.id,
      'update_location',
      `Updated location "${existing.name}"`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.delete('/api/admin/locations/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const existing = await queryOne<{ name: string }>('SELECT name FROM locations WHERE id = $1', [id])
    if (!existing) return c.json({ message: 'Location not found.' }, 404)

    await query('DELETE FROM locations WHERE id = $1', [id])

    await logActivity(
      admin.user.id,
      'delete_location',
      `Deleted location "${existing.name}"`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  /* Infrastructure: Nodes */
  app.get('/api/admin/nodes', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const nodes = await query<any>(
      `SELECT n.id,
              n.name,
              n.display_name AS "displayName",
              n.cpu_model AS "cpuModel",
              n.fqdn,
              n.ip_address AS "ipAddress",
              n.public_ip AS "publicIp",
              n.port,
              n.location_id AS "locationId",
              n.is_public AS "isPublic",
              n.maintenance,
              n.memory_limit_mb AS "memoryLimitMb",
              n.disk_limit_gb AS "diskLimitGb",
              n.server_limit AS "serverLimit",
              n.storage_enabled AS "storageEnabled",
              n.cpu_cores AS "cpuCores",
              n.created_at AS "createdAt",
              l.short_code AS "locationShortCode",
              l.name AS "locationName",
              l.country_code AS "locationCountryCode",
              l.city AS "locationCity"
         FROM nodes n
         LEFT JOIN locations l ON l.id = n.location_id
        ORDER BY n.name ASC`,
    )

    let systemDefaults = {
      cpuCores: os.cpus().length || 4,
      memoryLimitMb: Math.round(os.totalmem() / (1024 * 1024)) || 4096,
      diskLimitGb: 100,
    }
    try {
      const stats = statfsSync('/')
      systemDefaults.diskLimitGb = Math.round((stats.blocks * stats.bsize) / (1024 * 1024 * 1024)) || 100
    } catch {
      // fallback
    }

    return c.json({ nodes, systemDefaults })
  })

  app.post('/api/admin/nodes', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<any>().catch(() => null)
    if (!body || !body.name || !body.fqdn) {
      return c.json({ message: 'Node name and FQDN are required.' }, 400)
    }

    try {
      const row = await queryOne<{ id: string }>(
        `INSERT INTO nodes (name, display_name, cpu_model, fqdn, ip_address, public_ip, port, location_id, is_public, maintenance, memory_limit_mb, disk_limit_gb, cpu_cores, server_limit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          String(body.name).trim(),
          String(body.displayName || '').trim(),
          String(body.cpuModel || '').trim(),
          String(body.fqdn).trim(),
          String(body.ipAddress || body.fqdn).trim(),
          String(body.publicIp || '').trim(),
          Number(body.port) || 8443,
          body.locationId || null,
          body.isPublic !== false,
          body.maintenance === true,
          Number(body.memoryLimitMb) || 16384,
          Number(body.diskLimitGb) || 250,
          Number(body.cpuCores) || 8,
          Number(body.serverLimit) || 0,
        ],
      )

      await logActivity(
        admin.user.id,
        'create_node',
        `Created node "${body.name}"`,
        clientKey(c),
      )

      return c.json({ ok: true, id: row?.id }, 201)
    } catch (err: any) {
      if (err?.code === '23505') {
        return c.json({ message: 'A node with this name already exists.' }, 409)
      }
      return c.json({ message: err?.message || 'Database error' }, 500)
    }
  })

  app.patch('/api/admin/nodes/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const body = await c.req.json<any>().catch(() => null)
    if (!body) return c.json({ message: 'Invalid payload.' }, 400)

    const existing = await queryOne<{ name: string; fqdn: string }>('SELECT name, fqdn FROM nodes WHERE id = $1', [id])
    if (!existing) return c.json({ message: 'Node not found.' }, 404)

    const isDefaultLocal = existing.name === 'local-incus' || existing.fqdn === 'localhost'

    const fields: string[] = []
    const values: any[] = []
    let idx = 1

    if (body.name !== undefined) {
      fields.push(`name = $${idx++}`)
      values.push(String(body.name).trim())
    }
    if (body.displayName !== undefined) {
      fields.push(`display_name = $${idx++}`)
      values.push(String(body.displayName).trim())
    }
    if (body.cpuModel !== undefined) {
      fields.push(`cpu_model = $${idx++}`)
      values.push(String(body.cpuModel).trim())
    }
    if (body.fqdn !== undefined && !isDefaultLocal) {
      fields.push(`fqdn = $${idx++}`)
      values.push(String(body.fqdn).trim())
    }
    if (body.ipAddress !== undefined && !isDefaultLocal) {
      fields.push(`ip_address = $${idx++}`)
      values.push(String(body.ipAddress).trim())
    }
    if (body.port !== undefined && !isDefaultLocal) {
      fields.push(`port = $${idx++}`)
      values.push(Number(body.port) || 8443)
    }
    if (body.publicIp !== undefined) {
      fields.push(`public_ip = $${idx++}`)
      values.push(String(body.publicIp).trim())
    }
    if (body.locationId !== undefined) {
      fields.push(`location_id = $${idx++}`)
      values.push(body.locationId || null)
    }
    if (body.isPublic !== undefined) {
      fields.push(`is_public = $${idx++}`)
      values.push(Boolean(body.isPublic))
    }
    if (body.maintenance !== undefined) {
      fields.push(`maintenance = $${idx++}`)
      values.push(Boolean(body.maintenance))
    }
    if (body.memoryLimitMb !== undefined) {
      fields.push(`memory_limit_mb = $${idx++}`)
      values.push(Number(body.memoryLimitMb) || 16384)
    }
    if (body.diskLimitGb !== undefined) {
      fields.push(`disk_limit_gb = $${idx++}`)
      values.push(Number(body.diskLimitGb) || 250)
    }
    if (body.serverLimit !== undefined) {
      fields.push(`server_limit = $${idx++}`)
      values.push(Number(body.serverLimit) || 0)
    }
    if (body.storageEnabled !== undefined) {
      fields.push(`storage_enabled = $${idx++}`)
      values.push(Boolean(body.storageEnabled))
    }
    if (body.cpuCores !== undefined) {
      fields.push(`cpu_cores = $${idx++}`)
      values.push(Number(body.cpuCores) || 8)
    }
    if (body.primaryNetwork !== undefined) {
      fields.push(`primary_network = $${idx++}`)
      values.push(String(body.primaryNetwork).trim() || 'incusbr0')
    }

    if (fields.length > 0) {
      fields.push(`updated_at = now()`)
      values.push(id)
      await query(`UPDATE nodes SET ${fields.join(', ')} WHERE id = $${idx}`, values)
    }

    await logActivity(
      admin.user.id,
      'update_node',
      `Updated node "${existing.name}"`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.get('/api/admin/nodes/:id/network', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const node = await queryOne<{ id: string; name: string; fqdn: string; ip_address: string; public_ip: string; primary_network: string }>(
      'SELECT id, name, fqdn, ip_address, public_ip, primary_network FROM nodes WHERE id = $1',
      [id],
    )
    if (!node) return c.json({ message: 'Node not found.' }, 404)

    let networks: any[] = []
    try {
      const res = await incusRequest<any[]>('GET', '/1.0/networks?recursion=1')
      const raw = res?.metadata ?? res
      if (Array.isArray(raw)) {
        networks = raw.filter((n) => n.managed || ['bridge', 'physical'].includes(n.type))
      }
    } catch (err) {
      console.warn('Failed to query Incus networks for node:', err)
    }

    const config = await getSystemSettings()

    // Node overview statistics
    const statsRow = await queryOne<{
      total_instances: string
      active_instances: string
      suspended_instances: string
    }>(
      `SELECT
         COUNT(*)::text AS total_instances,
         COUNT(*) FILTER (WHERE status = 'running' OR status = 'active')::text AS active_instances,
         COUNT(*) FILTER (WHERE status = 'stopped' OR status = 'suspended')::text AS suspended_instances
       FROM instances
       WHERE node_id = $1`,
      [id],
    )

    const pfRow = await queryOne<{
      used_ports: string
    }>(
      `SELECT COUNT(*)::text AS used_ports
       FROM port_forwards pf
       JOIN instances i ON i.id = pf.instance_id
       WHERE i.node_id = $1`,
      [id],
    )

    const portRangeStart = Number(config['port_forward_start']) || 22000
    const portRangeEnd = Number(config['port_forward_end']) || 22999
    const totalPorts = Math.max(0, portRangeEnd - portRangeStart + 1)
    const usedPorts = Number(pfRow?.used_ports || 0)
    const availablePorts = Math.max(0, totalPorts - usedPorts)

    return c.json({
      node: {
        id: node.id,
        name: node.name,
        fqdn: node.fqdn,
        ipAddress: node.ip_address,
        publicIp: node.public_ip,
        primaryNetwork: node.primary_network || 'incusbr0',
      },
      stats: {
        servers: {
          total: Number(statsRow?.total_instances || 0),
          active: Number(statsRow?.active_instances || 0),
          suspended: Number(statsRow?.suspended_instances || 0),
          awaitingSetup: 0,
        },
        ports: {
          total: totalPorts,
          available: availablePorts,
          inUse: usedPorts,
          reserved: 0,
        },
      },
      portForwardRange: {
        start: portRangeStart,
        end: portRangeEnd,
      },
      networks,
    })
  })

  /* Create new Incus network bridge on the node */
  app.post('/api/admin/nodes/:id/networks', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const node = await queryOne<{ name: string }>('SELECT name FROM nodes WHERE id = $1', [id])
    if (!node) return c.json({ message: 'Node not found.' }, 404)

    const body = await c.req.json<any>().catch(() => null)
    const name = String(body?.name ?? '').trim().toLowerCase()
    if (!name || !/^[a-z0-9_-]{2,32}$/.test(name)) {
      return c.json({ message: 'Network name must be 2-32 lowercase alphanumeric characters.' }, 400)
    }

    const mtu = Math.floor(Number(body?.mtu)) || 1372
    const nat = body?.nat !== false
    const ipv4 = String(body?.ipv4 ?? '').trim() || 'auto'
    const ipv6 = String(body?.ipv6 ?? '').trim() || 'auto'

    const config: Record<string, string> = {
      'bridge.mtu': String(mtu),
      'ipv4.address': ipv4,
      'ipv4.nat': nat ? 'true' : 'false',
      'ipv6.address': ipv6,
      'ipv6.nat': nat ? 'true' : 'false',
    }

    try {
      await incusRequest<any>('POST', '/1.0/networks', {
        name,
        type: 'bridge',
        config,
      })
      await logActivity(
        admin.user.id,
        'create_network',
        `Created network bridge "${name}" on node "${node.name}"`,
        clientKey(c),
      )
      return c.json({ ok: true, name })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to create network.' }, 500)
    }
  })

  /* Update Incus network bridge config (e.g. MTU or NAT) */
  app.patch('/api/admin/nodes/:id/networks/:netName', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const netName = c.req.param('netName')
    const node = await queryOne<{ name: string }>('SELECT name FROM nodes WHERE id = $1', [id])
    if (!node) return c.json({ message: 'Node not found.' }, 404)

    const body = await c.req.json<any>().catch(() => null)
    if (!body) return c.json({ message: 'Invalid payload.' }, 400)

    try {
      const cur = await incusRequest<any>('GET', `/1.0/networks/${encodeURIComponent(netName)}`)
      const currentConfig = (cur?.metadata ?? cur)?.config || {}

      const newConfig: Record<string, string> = { ...currentConfig }
      if (body.mtu !== undefined) {
        newConfig['bridge.mtu'] = String(Math.floor(Number(body.mtu)) || 1372)
      }
      if (body.nat !== undefined) {
        newConfig['ipv4.nat'] = body.nat ? 'true' : 'false'
        newConfig['ipv6.nat'] = body.nat ? 'true' : 'false'
      }
      if (body.ipv4 !== undefined) {
        newConfig['ipv4.address'] = String(body.ipv4).trim() || 'auto'
      }

      await incusRequest<any>('PATCH', `/1.0/networks/${encodeURIComponent(netName)}`, {
        config: newConfig,
      })
      await logActivity(
        admin.user.id,
        'update_network',
        `Updated network bridge "${netName}" on node "${node.name}"`,
        clientKey(c),
      )
      return c.json({ ok: true })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to update network.' }, 500)
    }
  })

  /* Delete Incus network bridge */
  app.delete('/api/admin/nodes/:id/networks/:netName', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const netName = c.req.param('netName')
    const node = await queryOne<{ name: string; primary_network: string }>(
      'SELECT name, primary_network FROM nodes WHERE id = $1',
      [id],
    )
    if (!node) return c.json({ message: 'Node not found.' }, 404)

    if (node.primary_network === netName) {
      return c.json({ message: 'Cannot delete primary network bridge. Change primary network first.' }, 400)
    }

    try {
      await incusRequest<any>('DELETE', `/1.0/networks/${encodeURIComponent(netName)}`)
      await logActivity(
        admin.user.id,
        'delete_network',
        `Deleted network bridge "${netName}" from node "${node.name}"`,
        clientKey(c),
      )
      return c.json({ ok: true })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to delete network.' }, 500)
    }
  })

  /* Fetch storage pools on node */
  app.get('/api/admin/nodes/:id/storage', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const node = await queryOne<{ id: string; disk_limit_gb: number; storage_enabled: boolean }>(
      'SELECT id, disk_limit_gb, storage_enabled FROM nodes WHERE id = $1',
      [id],
    )
    if (!node) return c.json({ message: 'Node not found.' }, 404)

    let pools: any[] = []
    try {
      const res = await incusRequest<any[]>('GET', '/1.0/storage-pools?recursion=1')
      const raw = res?.metadata ?? res
      if (Array.isArray(raw)) {
        pools = raw
      }
    } catch (err) {
      console.warn('Failed to query Incus storage pools:', err)
    }

    return c.json({
      storageEnabled: node.storage_enabled,
      diskLimitGb: node.disk_limit_gb,
      pools,
    })
  })

  /* Update node storage configuration */
  app.patch('/api/admin/nodes/:id/storage', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const body = await c.req.json<any>().catch(() => null)
    if (!body) return c.json({ message: 'Invalid payload.' }, 400)

    const updates: string[] = []
    const values: any[] = []
    let idx = 1

    if (body.diskLimitGb !== undefined) {
      updates.push(`disk_limit_gb = $${idx++}`)
      values.push(Math.max(0, Number(body.diskLimitGb) || 0))
    }
    if (body.storageEnabled !== undefined) {
      updates.push(`storage_enabled = $${idx++}`)
      values.push(Boolean(body.storageEnabled))
    }

    if (updates.length > 0) {
      updates.push('updated_at = now()')
      values.push(id)
      await query(`UPDATE nodes SET ${updates.join(', ')} WHERE id = $${idx}`, values)
    }

    return c.json({ ok: true })
  })

  /* OS templates for VPS provisioning (images.linuxcontainers.org aliases) */

  function publicOsTemplate(row: OsTemplateRow) {
    return {
      id: row.id,
      groupId: row.group_id ?? null,
      groupName: row.group_name ?? null,
      groupLogo: row.group_logo ?? null,
      name: row.name,
      version: row.version ?? '1.00',
      os: row.os ?? '',
      release: row.release ?? '',
      arch: row.arch ?? 'amd64',
      variant: row.variant ?? 'cloud',
      imageAlias: row.image_alias,
      cloudInit: row.cloud_init !== false,
      uefi: !!row.uefi,
      enabled: !!row.enabled,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    }
  }

  // Cached linuxcontainers.com simplestreams index (1h TTL).
  let osCatalogCache: { at: number; entries: unknown } | null = null

  async function fetchOsCatalog() {
    if (osCatalogCache && Date.now() - osCatalogCache.at < 60 * 60 * 1000) {
      return osCatalogCache.entries as Array<{
        os: string
        release: string
        arch: string
        variant: string
        alias: string
      }>
    }
    const res = await fetch('https://images.linuxcontainers.org/streams/v1/images.json')
    if (!res.ok) throw new Error(`Image index responded ${res.status}`)
    const data = (await res.json()) as {
      products: Record<
        string,
        { os?: string; release?: string; arch?: string; variant?: string; aliases?: string }
      >
    }
    const seen = new Set<string>()
    const entries: Array<{ os: string; release: string; arch: string; variant: string; alias: string }> = []
    for (const product of Object.values(data.products || {})) {
      const alias = (product.aliases || '').split(',')[0]?.trim()
      if (!alias) continue
      const key = `${alias}|${product.arch}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({
        os: product.os || 'Unknown',
        release: product.release || '',
        arch: product.arch || 'amd64',
        variant: product.variant || 'default',
        alias,
      })
    }
    entries.sort((a, b) => a.os.localeCompare(b.os) || a.release.localeCompare(b.release))
    osCatalogCache = { at: Date.now(), entries }
    return entries
  }

  app.get('/api/admin/os-catalog', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    try {
      const entries = await fetchOsCatalog()
      const arch = (c.req.query('arch') || '').trim()
      const q = (c.req.query('q') || '').trim().toLowerCase()
      return c.json(
        entries.filter(
          (e) =>
            (!arch || e.arch === arch) &&
            (!q ||
              e.os.toLowerCase().includes(q) ||
              e.release.toLowerCase().includes(q) ||
              e.alias.toLowerCase().includes(q)),
        ),
      )
    } catch (err) {
      console.error('[os-catalog] fetch failed:', (err as Error)?.message)
      return c.json({ message: 'Could not reach images.linuxcontainers.org.' }, 502)
    }
  })

  /* --- OS Template Groups --- */

  app.get('/api/admin/os-groups', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rows = await query<any>(`
      SELECT g.*, 
             COALESCE(json_agg(t.*) FILTER (WHERE t.id IS NOT NULL), '[]') AS templates
        FROM os_groups g
        LEFT JOIN os_templates t ON t.group_id = g.id
       GROUP BY g.id
       ORDER BY g.name ASC
    `)

    return c.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        logo: r.logo,
        enabled: r.enabled,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        templates: (r.templates || []).map((t: any) => ({
          id: t.id,
          groupId: t.group_id,
          name: t.name,
          version: t.version,
          os: t.os,
          release: t.release,
          arch: t.arch,
          variant: t.variant,
          imageAlias: t.image_alias,
          enabled: t.enabled,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        })),
      })),
    )
  })

  app.post('/api/admin/os-groups', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<any>().catch(() => null)
    if (!body || !str(body.name).trim()) {
      return c.json({ message: 'Group name is required.' }, 400)
    }

    const row = await queryOne<any>(
      `INSERT INTO os_groups (name, description, logo, enabled)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        str(body.name).trim(),
        str(body.description || '').trim(),
        str(body.logo || 'linux').trim(),
        body.enabled !== false,
      ],
    )

    await logActivity(
      admin.user.id,
      'create_os_group',
      `Created OS template group "${row.name}"`,
      clientKey(c),
    )

    return c.json(
      {
        id: row.id,
        name: row.name,
        description: row.description,
        logo: row.logo,
        enabled: row.enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      201,
    )
  })

  app.patch('/api/admin/os-groups/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const body = await c.req.json<any>().catch(() => null)
    if (!body) return c.json({ message: 'Invalid payload.' }, 400)

    const fields: string[] = []
    const values: any[] = []
    let idx = 1

    if (body.name !== undefined) {
      fields.push(`name = $${idx++}`)
      values.push(str(body.name).trim())
    }
    if (body.description !== undefined) {
      fields.push(`description = $${idx++}`)
      values.push(str(body.description).trim())
    }
    if (body.logo !== undefined) {
      fields.push(`logo = $${idx++}`)
      values.push(str(body.logo).trim())
    }
    if (body.enabled !== undefined) {
      fields.push(`enabled = $${idx++}`)
      values.push(body.enabled !== false)
    }

    if (fields.length === 0) return c.json({ message: 'No fields provided.' }, 400)

    values.push(id)
    const updated = await queryOne<any>(
      `UPDATE os_groups SET ${fields.join(', ')}, updated_at = now()
        WHERE id = $${idx} RETURNING *`,
      values,
    )

    if (!updated) return c.json({ message: 'Group not found.' }, 404)

    return c.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      logo: updated.logo,
      enabled: updated.enabled,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    })
  })

  app.delete('/api/admin/os-groups/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const deleted = await queryOne<any>('DELETE FROM os_groups WHERE id = $1 RETURNING name', [id])
    if (!deleted) return c.json({ message: 'Group not found.' }, 404)

    await logActivity(
      admin.user.id,
      'delete_os_group',
      `Deleted OS template group "${deleted.name}"`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.get('/api/admin/os-templates', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rows = await query<OsTemplateRow>(`
      SELECT t.*, g.name AS group_name, g.logo AS group_logo
        FROM os_templates t
        LEFT JOIN os_groups g ON g.id = t.group_id
       ORDER BY t.name ASC
    `)
    return c.json(rows.map(publicOsTemplate))
  })

  app.post('/api/admin/os-templates', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<any>().catch(() => null)
    if (!body || !str(body.name).trim() || !str(body.imageAlias).trim()) {
      return c.json({ message: 'Template name and image alias are required.' }, 400)
    }

    try {
      const row = await queryOne<OsTemplateRow>(
        `INSERT INTO os_templates (name, group_id, version, os, release, arch, variant, image_alias, cloud_init, uefi, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          str(body.name).trim(),
          body.groupId || null,
          str(body.version).trim() || '1.00',
          str(body.os).trim(),
          str(body.release).trim(),
          str(body.arch).trim() || 'amd64',
          str(body.variant).trim(),
          str(body.imageAlias).trim(),
          body.cloudInit !== false,
          body.uefi === true,
          body.enabled !== false,
        ],
      )

      await logActivity(
        admin.user.id,
        'create_os_template',
        `Added OS template "${body.name}" (${body.imageAlias})`,
        clientKey(c),
      )

      const full = await queryOne<OsTemplateRow>(`
        SELECT t.*, g.name AS group_name, g.logo AS group_logo
          FROM os_templates t
          LEFT JOIN os_groups g ON g.id = t.group_id
         WHERE t.id = $1
      `, [row!.id])

      return c.json(publicOsTemplate(full || row!), 201)
    } catch (err: any) {
      if (err?.code === '23505') {
        return c.json({ message: 'A template with this image alias already exists.' }, 409)
      }
      return c.json({ message: err?.message || 'Database error' }, 500)
    }
  })

  app.patch('/api/admin/os-templates/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const body = await c.req.json<any>().catch(() => null)
    if (!body) return c.json({ message: 'Invalid payload.' }, 400)

    const fields: string[] = []
    const values: any[] = []
    let idx = 1
    if (body.name !== undefined) {
      fields.push(`name = $${idx++}`)
      values.push(str(body.name).trim())
    }
    if (body.groupId !== undefined) {
      fields.push(`group_id = $${idx++}`)
      values.push(body.groupId || null)
    }
    if (body.version !== undefined) {
      fields.push(`version = $${idx++}`)
      values.push(str(body.version).trim() || '1.00')
    }
    if (body.os !== undefined) {
      fields.push(`os = $${idx++}`)
      values.push(str(body.os).trim())
    }
    if (body.release !== undefined) {
      fields.push(`release = $${idx++}`)
      values.push(str(body.release).trim())
    }
    if (body.arch !== undefined) {
      fields.push(`arch = $${idx++}`)
      values.push(str(body.arch).trim() || 'amd64')
    }
    if (body.variant !== undefined) {
      fields.push(`variant = $${idx++}`)
      values.push(str(body.variant).trim())
    }
    if (body.imageAlias !== undefined) {
      fields.push(`image_alias = $${idx++}`)
      values.push(str(body.imageAlias).trim())
    }
    if (body.cloudInit !== undefined) {
      fields.push(`cloud_init = $${idx++}`)
      values.push(body.cloudInit !== false)
    }
    if (body.uefi !== undefined) {
      fields.push(`uefi = $${idx++}`)
      values.push(body.uefi === true)
    }
    if (body.enabled !== undefined) {
      fields.push(`enabled = $${idx++}`)
      values.push(body.enabled !== false)
    }
    if (fields.length === 0) return c.json({ message: 'No fields provided.' }, 400)

    values.push(id)
    try {
      const updated = await queryOne<OsTemplateRow>(
        `UPDATE os_templates SET ${fields.join(', ')}, updated_at = now()
          WHERE id = $${idx} RETURNING *`,
        values,
      )
      if (!updated) return c.json({ message: 'Template not found.' }, 404)

      await logActivity(
        admin.user.id,
        'update_os_template',
        `Updated OS template "${updated.name}"`,
        clientKey(c),
      )

      const full = await queryOne<OsTemplateRow>(`
        SELECT t.*, g.name AS group_name, g.logo AS group_logo
          FROM os_templates t
          LEFT JOIN os_groups g ON g.id = t.group_id
         WHERE t.id = $1
      `, [updated.id])

      return c.json(publicOsTemplate(full || updated))
    } catch (err: any) {
      if (err?.code === '23505') {
        return c.json({ message: 'A template with this image alias already exists.' }, 409)
      }
      return c.json({ message: err?.message || 'Database error' }, 500)
    }
  })

  app.delete('/api/admin/os-templates/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const existing = await queryOne<{ name: string }>(
      'SELECT name FROM os_templates WHERE id = $1',
      [id],
    )
    if (!existing) return c.json({ message: 'Template not found.' }, 404)

    await query('DELETE FROM os_templates WHERE id = $1', [id])

    await logActivity(
      admin.user.id,
      'delete_os_template',
      `Deleted OS template "${existing.name}"`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.delete('/api/admin/nodes/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const id = c.req.param('id')
    const existing = await queryOne<{ name: string }>('SELECT name FROM nodes WHERE id = $1', [id])
    if (!existing) return c.json({ message: 'Node not found.' }, 404)

    await query('DELETE FROM nodes WHERE id = $1', [id])

    await logActivity(
      admin.user.id,
      'delete_node',
      `Deleted node "${existing.name}"`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.get('/api/admin/instances', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rows = await query<
      InstanceRow & { owner_email: string; owner_name: string; node_name: string | null }
    >(
      `SELECT i.*, u.email AS owner_email, u.name AS owner_name, COALESCE(NULLIF(n.display_name, ''), n.name) AS node_name
         FROM instances i
         JOIN users u ON u.id = i.user_id
         LEFT JOIN nodes n ON n.id = i.node_id
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
      const cpuUsage = isRunning ? cpuPercent(row.name, cpuCount, cores) : null

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
        nodeName: row.node_name,
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
        templateId?: string
        imageAlias?: string
        nodeId?: string
        cores?: number
        memoryMb?: number
        diskGb?: number
      }>()
      .catch(() => null)

    if (!body?.userId || typeof body.userId !== 'string') {
      return c.json({ message: 'Target user is required.' }, 400)
    }
    const owner = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [body.userId])
    if (!owner) return c.json({ message: 'Target user not found.' }, 404)

    const cleanName = String(body.name || '').trim().toLowerCase()
    const type = body.type === 'kvm' ? 'kvm' : 'lxc'
    const osKey = body.os || 'debian-12'
    let osConfig: { name: string; alias: string; uefi?: boolean } = OS_MAP[osKey] || { name: 'Debian 12 Bookworm', alias: 'debian/12' }
    try {
      osConfig = await resolveOsSource(body)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Invalid OS selection.' }, 400)
    }
    const cores = Math.max(1, Math.min(8, Number(body.cores) || 1))
    const memoryMb = Math.max(512, Math.min(16384, Number(body.memoryMb) || 1024))
    const diskGb = Math.max(5, Math.min(200, Number(body.diskGb) || 10))
    const type2 = body.type === 'kvm' ? 'kvm' : 'lxc'

    // Bare server: no OS/template chosen yet. Create the record only —
    // the owner installs an OS from the setup page on first access.
    if (!body.templateId && !body.imageAlias && !body.os) {
      let bareName = cleanName
      if (!bareName) {
        bareName = 'srv-' + randomBytes(3).toString('hex')
      } else if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(bareName)) {
        return c.json({ message: 'Name must be 3-32 characters, lowercase alphanumeric and hyphens only.' }, 400)
      }
      const clash = await queryOne('SELECT id FROM instances WHERE name = $1', [bareName])
      if (clash) return c.json({ message: 'An instance with this name already exists.' }, 409)
      let bareNodeId: string | null = null
      if (body.nodeId) {
        const node = await queryOne<{ id: string }>('SELECT id FROM nodes WHERE id = $1', [body.nodeId])
        if (!node) return c.json({ message: 'Target node not found.' }, 404)
        bareNodeId = node.id
      } else {
        bareNodeId = await defaultNodeId()
      }
      const bareId = randomUUID()
      await query(
        `INSERT INTO instances (id, user_id, name, type, os, image_alias, cores, memory_mb, disk_gb, node_id)
         VALUES ($1, $2, $3, $4, '', '', $5, $6, $7, $8)`,
        [bareId, owner.id, bareName, type2, cores, memoryMb, diskGb, bareNodeId],
      )
      await logActivity(admin.user.id, 'admin_create_instance', `Created bare server "${bareName}" for ${owner.email} (no OS installed yet)`, clientKey(c))
      return c.json(
        { id: bareId, name: bareName, type: type2, os: '', status: 'awaiting_os', cores, memoryMb, diskGb, ownerId: owner.id },
        201,
      )
    }

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

    let nodeId: string | null = null
    if (body.nodeId) {
      const node = await queryOne<{ id: string }>('SELECT id FROM nodes WHERE id = $1', [body.nodeId])
      if (!node) return c.json({ message: 'Target node not found.' }, 404)
      nodeId = node.id
    } else {
      nodeId = await defaultNodeId()
    }

    const targetNode = nodeId
      ? await queryOne<{ cpu_model: string; server_limit: number }>('SELECT cpu_model, server_limit FROM nodes WHERE id = $1', [nodeId])
      : null

    if (targetNode && targetNode.server_limit > 0) {
      const countRow = await queryOne<{ count: string }>(
        'SELECT COUNT(*) AS count FROM instances WHERE node_id = $1',
        [nodeId],
      )
      const currentCount = Number(countRow?.count || 0)
      if (currentCount >= targetNode.server_limit) {
        return c.json({ message: `Node capacity reached: maximum server limit of ${targetNode.server_limit} exceeded.` }, 400)
      }
    }
    const rawQemu =
      type === 'kvm' && targetNode?.cpu_model && targetNode.cpu_model !== 'host'
        ? `-cpu ${targetNode.cpu_model}`
        : undefined

    try {
      await incus.createInstance({
        name: cleanName,
        type: type === 'kvm' ? 'virtual-machine' : 'container',
        imageAlias: osConfig.alias,
        cpu: cores,
        memory: `${memoryMb}MiB`,
        disk: `${diskGb}GiB`,
        sshKeys: sshPublicKeys,
        uefi: osConfig.uefi,
        rawQemu,
      })

      await incus.setInstanceState(cleanName, 'start').catch((e) => {
        console.warn('[admin] Failed to start newly created instance:', e)
      })

      await query(
        `INSERT INTO instances (id, user_id, name, type, os, image_alias, cores, memory_mb, disk_gb, node_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [instanceId, owner.id, cleanName, type, osConfig.name, osConfig.alias, cores, memoryMb, diskGb, nodeId],
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

    const body = await c.req.json<{ action?: string; reason?: string }>().catch(() => null)
    const action = body?.action
    if (action !== 'start' && action !== 'stop' && action !== 'restart' && action !== 'freeze' && action !== 'unfreeze') {
      return c.json({ message: 'Action must be start, stop, restart, freeze, or unfreeze.' }, 400)
    }

    // Administrative suspension carries a reason shown to the owner.
    let suspendReason: string | null = null
    if (action === 'freeze') {
      suspendReason = (body?.reason || '').trim().slice(0, 200) || 'Admin action'
    }

    try {
      await incus.setInstanceState(instance.name, action)
      await query('UPDATE instances SET suspend_reason = $1 WHERE id = $2', [
        action === 'freeze' ? suspendReason : action === 'unfreeze' ? null : instance.suspend_reason ?? null,
        instance.id,
      ])
      await logActivity(
        admin.user.id,
        `admin_${action}_instance`,
        `${action.toUpperCase()} on instance "${instance.name}"${action === 'freeze' ? ` (${suspendReason})` : ''}`,
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

  /* Admin instance detail: row + owner + node + live state + snapshots. */
  app.get('/api/admin/instances/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const row = await queryOne<
      InstanceRow & {
        owner_email: string
        owner_name: string
        node_name: string | null
        node_fqdn: string | null
        location_code: string | null
      }
    >(
      `SELECT i.*,
              u.email AS owner_email,
              u.name AS owner_name,
              COALESCE(NULLIF(n.display_name, ''), n.name) AS node_name,
              n.fqdn AS node_fqdn,
              l.short_code AS location_code
         FROM instances i
         JOIN users u ON u.id = i.user_id
         LEFT JOIN nodes n ON n.id = i.node_id
         LEFT JOIN locations l ON l.id = n.location_id
        WHERE i.id = $1`,
      [c.req.param('id')],
    )
    if (!row) return c.json({ message: 'Instance not found.' }, 404)

    let live: IncusInstance | null = null
    let state: IncusInstanceState | null = null
    try {
      live = await incus.getInstance(row.name)
      state = await incus.getInstanceState(row.name).catch(() => null)
    } catch (err) {
      console.warn('[admin] Could not fetch Incus instance details:', err)
    }

    const liveStatusRaw = ((state?.status || live?.status) || '').toLowerCase()
    const isRunning = liveStatusRaw === 'running'
    const liveStatusOut = isRunning ? 'running' : liveStatusRaw === 'frozen' || liveStatusRaw === 'freezing' ? 'frozen' : 'stopped'

    let ip4 = '—'
    let ip6 = '—'
    const networkInterfaces: Array<{
      interface: string
      hwaddr: string
      state: string
      ip4: string
      ip6: string
    }> = []
    if (state?.network) {
      for (const [name, iface] of Object.entries(state.network)) {
        if (name === 'lo') continue
        const v4 =
          iface.addresses?.find((a) => a.family === 'inet' && a.scope === 'global')?.address || '—'
        const v6 =
          iface.addresses?.find((a) => a.family === 'inet6' && a.scope === 'global')?.address || '—'
        if (ip4 === '—' && v4 !== '—') ip4 = v4
        if (ip6 === '—' && v6 !== '—') ip6 = v6
        networkInterfaces.push({
          interface: name,
          hwaddr: iface.hwaddr,
          state: iface.state,
          ip4: v4,
          ip6: v6,
        })
      }
    }

    // Live usage, same math as the user-facing endpoints (null = unknown).
    let totalBytes = 0
    if (state?.network) {
      for (const [ifaceName, iface] of Object.entries(state.network)) {
        if (ifaceName === 'lo') continue
        totalBytes += (iface.counters?.bytes_received || 0) + (iface.counters?.bytes_sent || 0)
      }
    }
    const memBytes = state?.memory?.usage || 0
    const totalMemBytes = (row.memory_mb || 1024) * 1024 * 1024
    const ramUsage =
      isRunning && totalMemBytes > 0
        ? Math.min(100, Math.round((memBytes / totalMemBytes) * 100))
        : null
    const cpuNanos = state?.cpu?.usage ?? 0
    const cpuUsage = isRunning ? cpuPercent(row.name, cpuNanos, row.cores || 1) : null
    const diskTotalBytes = (row.disk_gb || 10) * 1024 * 1024 * 1024
    const diskUsedBytes = state?.disk?.root?.usage ?? -1
    const diskUsage =
      isRunning && diskUsedBytes >= 0 && diskTotalBytes > 0
        ? Math.min(100, Math.round((diskUsedBytes / diskTotalBytes) * 100))
        : null
    const uptime =
      isRunning && live
        ? `Since ${new Date(toIso(live.last_used_at ?? row.created_at)).toLocaleDateString()}`
        : 'Stopped'

    let snapshots: Array<{ name: string; createdAt: string; stateful: boolean }> = []
    try {
      snapshots = (await incus.listSnapshots(row.name)).map((s) => ({
        name: s.name,
        createdAt: s.created_at,
        stateful: !!s.stateful,
      }))
    } catch (err) {
      console.warn('[admin] Could not list snapshots:', err)
    }

    const forwardRows = await query<{
      host_port: number
      container_port: number
      protocol: string
      description: string
      kind: string
    }>(
      `SELECT host_port, container_port, protocol, description, kind
         FROM port_forwards WHERE instance_id = $1 ORDER BY host_port ASC`,
      [row.id],
    ).catch(() => [])

    return c.json({
      instance: {
        id: row.id,
        name: row.name,
        type: row.type,
        os: row.os,
        imageAlias: row.image_alias,
        status: liveStatusOut as 'running' | 'stopped' | 'frozen',
        ip4,
        ip6,
        cores: row.cores,
        memoryMb: row.memory_mb,
        diskGb: row.disk_gb,
        networkMode: 'NAT (bridged)',
        cpuUsage,
        ramUsage,
        diskUsage,
        uptime,
        bandwidth: formatBytes(totalBytes),
        portForwards: forwardRows.map((f) => ({
          hostPort: f.host_port,
          containerPort: f.container_port,
          protocol: f.protocol,
          description: f.description ?? '',
          kind: f.kind,
        })),
        owner: { id: row.user_id, email: row.owner_email, name: row.owner_name },
        node: row.node_name
          ? { id: row.node_id, name: row.node_name, fqdn: row.node_fqdn }
          : null,
        locationShortCode: row.location_code,
        suspendReason: row.suspend_reason ?? null,
        networkInterfaces,
        snapshots,
        createdAt: toIso(row.created_at),
      },
    })
  })

  /* Admin resource limits: live-patch Incus config and persist to DB. */
  app.patch('/api/admin/instances/:id', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const instance = await queryOne<InstanceRow>('SELECT * FROM instances WHERE id = $1', [
      c.req.param('id'),
    ])
    if (!instance) return c.json({ message: 'Instance not found.' }, 404)

    const body = await c.req
      .json<{ cores?: number; memoryMb?: number }>()
      .catch(() => null)
    if (!body) return c.json({ message: 'Invalid payload.' }, 400)

    const fields: string[] = []
    const values: any[] = []
    const liveConfig: Record<string, string> = {}
    let idx = 1

    if (body.cores !== undefined) {
      const cores = Math.max(1, Math.min(64, Math.floor(Number(body.cores) || 0)))
      if (!cores) return c.json({ message: 'Cores must be between 1 and 64.' }, 400)
      fields.push(`cores = $${idx++}`)
      values.push(cores)
      liveConfig['limits.cpu'] = String(cores)
    }
    if (body.memoryMb !== undefined) {
      const memoryMb = Math.max(256, Math.min(131072, Math.floor(Number(body.memoryMb) || 0)))
      if (!memoryMb) return c.json({ message: 'Memory must be between 256 MB and 128 GB.' }, 400)
      fields.push(`memory_mb = $${idx++}`)
      values.push(memoryMb)
      liveConfig['limits.memory'] = `${memoryMb}MiB`
    }
    if (fields.length === 0) return c.json({ message: 'No fields provided.' }, 400)

    try {
      await incus.updateInstanceConfig(instance.name, liveConfig)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Incus rejected the new limits.' }, 500)
    }

    values.push(instance.id)
    await query(`UPDATE instances SET ${fields.join(', ')} WHERE id = $${idx}`, values)
    await logActivity(
      admin.user.id,
      'admin_update_instance',
      `Updated limits on instance "${instance.name}" (${fields.join(', ')})`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  /* Snapshots: owner-scoped user routes + admin routes. */
  /* Owner-scoped instance lookup with automatic admin bypass (powers
     "View in Client Area": admins transparently resolve any server). */
  async function resolveInstance(c: any, userId: string): Promise<InstanceRow | null> {
    const me = await queryOne<UserRow>('SELECT is_admin FROM users WHERE id = $1', [userId])
    if (me?.is_admin) {
      return queryOne<InstanceRow>('SELECT * FROM instances WHERE id = $1', [c.req.param('id')])
    }
    return queryOne<InstanceRow>(
      'SELECT * FROM instances WHERE id = $1 AND user_id = $2',
      [c.req.param('id'), userId],
    )
  }

  async function snapshotOwnerCheck(
    c: any,
    adminBypass: boolean,
  ): Promise<{ instance: InstanceRow | null; error: string | null; status?: 401 | 404 }> {
    if (adminBypass) {
      const instance = await queryOne<InstanceRow>('SELECT * FROM instances WHERE id = $1', [
        c.req.param('id'),
      ])
      return { instance, error: instance ? null : 'Instance not found.' }
    }
    const session = await authIdentity(c)
    if (!session) return { instance: null, error: 'Not signed in.', status: 401 }
    const instance = await resolveInstance(c, session.user_id)
    return { instance, error: instance ? null : 'Instance not found.', status: 404 }
  }

  /* Usage history for the caller's servers (drives the Usage page). */
  app.get('/api/usage', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const hoursRaw = Math.floor(Number(c.req.query('hours')))
    const hours = Number.isFinite(hoursRaw) ? Math.min(168, Math.max(1, hoursRaw)) : 24

    const servers = await query<{ id: string; name: string }>(
      'SELECT id, name FROM instances WHERE user_id = $1 ORDER BY name ASC',
      [session.user_id],
    )

    const out: Array<{
      id: string
      name: string
      points: Array<{
        t: string
        cpu: number | null
        ram: number
        disk: number | null
        rx: number
        tx: number
      }>
    }> = []
    for (const srv of servers) {
      const rows = await query<{
        ts: Date | string
        cpu_pct: number
        ram_pct: number
        disk_pct: number
        net_rx_bytes: string | number
        net_tx_bytes: string | number
      }>(
        `SELECT ts, cpu_pct, ram_pct, disk_pct, net_rx_bytes, net_tx_bytes
           FROM instance_metrics
          WHERE instance_id = $1 AND ts > now() - ($2 || ' hours')::interval
          ORDER BY ts ASC`,
        [srv.id, String(hours)],
      )
      // Bucket-average down to at most 360 points.
      const avgOrNull = (vals: Array<number | null>): number | null => {
        const known = vals.filter((v): v is number => v !== null && Number.isFinite(v))
        if (known.length === 0) return null
        return known.reduce((a, v) => a + v, 0) / known.length
      }
      const maxPoints = 360
      const size = Math.max(1, Math.ceil(rows.length / maxPoints))
      const points: Array<{
        t: string
        cpu: number | null
        ram: number
        disk: number | null
        rx: number
        tx: number
      }> = []
      for (let i = 0; i < rows.length; i += size) {
        const bucket = rows.slice(i, i + size)
        const n = bucket.length
        points.push({
          t: toIso(bucket[n - 1].ts),
          cpu: avgOrNull(bucket.map((r) => (r.cpu_pct === null ? null : Number(r.cpu_pct)))),
          ram: bucket.reduce((a, r) => a + Number(r.ram_pct), 0) / n,
          disk: avgOrNull(bucket.map((r) => (r.disk_pct === null ? null : Number(r.disk_pct)))),
          rx: bucket.reduce((a, r) => a + Number(r.net_rx_bytes), 0) / n,
          tx: bucket.reduce((a, r) => a + Number(r.net_tx_bytes), 0) / n,
        })
      }
      out.push({ id: srv.id, name: srv.name, points })
    }

    return c.json({ hours, servers: out })
  })

  /* Every snapshot across all of the caller's servers (drives the Snapshots page). */
  app.get('/api/snapshots', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const instances = await query<{ id: string; name: string }>(
      'SELECT id, name FROM instances WHERE user_id = $1 ORDER BY name ASC',
      [session.user_id],
    )

    const snapshots: Array<{
      instanceId: string
      instanceName: string
      name: string
      createdAt: string
      stateful: boolean
    }> = []
    const unreachable: string[] = []

    await Promise.all(
      instances.map(async (inst) => {
        try {
          const snaps = await incus.listSnapshots(inst.name)
          for (const s of snaps) {
            snapshots.push({
              instanceId: inst.id,
              instanceName: inst.name,
              name: s.name,
              createdAt: s.created_at,
              stateful: !!s.stateful,
            })
          }
        } catch {
          unreachable.push(inst.name)
        }
      }),
    )
    snapshots.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

    return c.json({ snapshots, unreachable })
  })

  app.get('/api/instances/:id/snapshots', async (c) => {
    const { instance, error, status } = await snapshotOwnerCheck(c, false)
    if (!instance) return c.json({ message: error }, status || 404)
    try {
      const snaps = await incus.listSnapshots(instance.name)
      return c.json({
        snapshots: snaps.map((s) => ({
          name: s.name,
          createdAt: s.created_at,
          stateful: !!s.stateful,
        })),
      })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to list snapshots.' }, 500)
    }
  })

  function snapshotScheduleOf(instance: IncusInstance): { enabled: boolean; schedule: string; expiryDays: number } {
    const cfg = instance.config || {}
    const schedule = (cfg['snapshots.schedule'] || '').trim()
    const expiryRaw = (cfg['snapshots.expiry'] || '').trim()
    const expiryDays = /^\d+[dD]$/.test(expiryRaw) ? Math.max(1, parseInt(expiryRaw, 10)) : 7
    return { enabled: schedule.length > 0, schedule, expiryDays }
  }

  app.get('/api/instances/:id/snapshot-schedule', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const { instance, error, status } = await snapshotOwnerCheck(c, false)
    if (!instance) return c.json({ message: error }, status || 404)
    try {
      const live = await incus.getInstance(instance.name)
      return c.json(snapshotScheduleOf(live))
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to read snapshot schedule.' }, 500)
    }
  })

  app.put('/api/instances/:id/snapshot-schedule', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const { instance, error, status } = await snapshotOwnerCheck(c, false)
    if (!instance) return c.json({ message: error }, status || 404)

    const body = await c.req.json<{ schedule?: string; expiryDays?: number }>().catch(() => null)
    const schedule = (body?.schedule || '').trim()
    if (schedule) {
      const cronLike = /^(\S+\s+){4}\S+$/.test(schedule)
      const atLike = /^@(hourly|daily|midnight|weekly|monthly|annually|yearly)$/.test(schedule)
      if ((!cronLike && !atLike) || schedule.length > 64) {
        return c.json({ message: 'Schedule must be cron (e.g. 0 3 * * *) or @daily.' }, 400)
      }
    }
    const expiryDays = Math.floor(Number(body?.expiryDays))
    if (schedule && (!Number.isFinite(expiryDays) || expiryDays < 1 || expiryDays > 365)) {
      return c.json({ message: 'Retention must be 1-365 days.' }, 400)
    }

    try {
      await incus.updateInstanceConfig(instance.name, {
        'snapshots.schedule': schedule,
        'snapshots.expiry': schedule ? `${expiryDays}d` : '',
        'snapshots.pattern': schedule ? 'auto-{{ creation_date|date:\'2006-01-02_15-04\' }}' : '',
      })
      await logActivity(
        session.user_id,
        'snapshot_schedule',
        schedule
          ? `Set snapshot schedule "${schedule}" (keep ${expiryDays}d) on "${instance.name}"`
          : `Disabled scheduled snapshots on "${instance.name}"`,
        clientKey(c),
      )
      const live = await incus.getInstance(instance.name)
      return c.json(snapshotScheduleOf(live))
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to save snapshot schedule.' }, 500)
    }
  })

  app.post('/api/instances/:id/snapshots', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const { instance, error, status } = await snapshotOwnerCheck(c, false)
    if (!instance) return c.json({ message: error }, status || 404)

    const body = await c.req.json<{ name?: string }>().catch(() => null)
    const snapName = (body?.name || '').trim()
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}[a-zA-Z0-9]$/.test(snapName)) {
      return c.json({ message: 'Snapshot name must be 2-64 chars: letters, numbers, _ . -' }, 400)
    }

    try {
      await incus.createSnapshot(instance.name, snapName)
      await logActivity(
        session.user_id,
        'create_snapshot',
        `Snapshot "${snapName}" on instance "${instance.name}"`,
        clientKey(c),
      )
      return c.json({ ok: true, name: snapName }, 201)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to create snapshot.' }, 500)
    }
  })

  app.post('/api/instances/:id/snapshots/:snap/restore', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const { instance, error, status } = await snapshotOwnerCheck(c, false)
    if (!instance) return c.json({ message: error }, status || 404)

    try {
      await incus.restoreSnapshot(instance.name, c.req.param('snap'))
      await logActivity(
        session.user_id,
        'restore_snapshot',
        `Restored snapshot "${c.req.param('snap')}" on "${instance.name}"`,
        clientKey(c),
      )
      return c.json({ ok: true })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to restore snapshot.' }, 500)
    }
  })

  app.delete('/api/instances/:id/snapshots/:snap', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)
    const { instance, error, status } = await snapshotOwnerCheck(c, false)
    if (!instance) return c.json({ message: error }, status || 404)

    try {
      await incus.deleteSnapshot(instance.name, c.req.param('snap'))
      await logActivity(
        session.user_id,
        'delete_snapshot',
        `Deleted snapshot "${c.req.param('snap')}" on "${instance.name}"`,
        clientKey(c),
      )
      return c.json({ ok: true })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to delete snapshot.' }, 500)
    }
  })

  app.get('/api/admin/instances/:id/snapshots', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)
    const { instance, error } = await snapshotOwnerCheck(c, true)
    if (!instance) return c.json({ message: error }, 404)
    try {
      const snaps = await incus.listSnapshots(instance.name)
      return c.json({
        snapshots: snaps.map((s) => ({
          name: s.name,
          createdAt: s.created_at,
          stateful: !!s.stateful,
        })),
      })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to list snapshots.' }, 500)
    }
  })

  app.post('/api/admin/instances/:id/snapshots', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)
    const { instance, error } = await snapshotOwnerCheck(c, true)
    if (!instance) return c.json({ message: error }, 404)

    const body = await c.req.json<{ name?: string }>().catch(() => null)
    const snapName = (body?.name || '').trim()
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}[a-zA-Z0-9]$/.test(snapName)) {
      return c.json({ message: 'Snapshot name must be 2-64 chars: letters, numbers, _ . -' }, 400)
    }

    try {
      await incus.createSnapshot(instance.name, snapName)
      await logActivity(
        admin.user.id,
        'admin_create_snapshot',
        `Snapshot "${snapName}" on instance "${instance.name}"`,
        clientKey(c),
      )
      return c.json({ ok: true, name: snapName }, 201)
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to create snapshot.' }, 500)
    }
  })

  app.post('/api/admin/instances/:id/snapshots/:snap/restore', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)
    const { instance, error } = await snapshotOwnerCheck(c, true)
    if (!instance) return c.json({ message: error }, 404)

    try {
      await incus.restoreSnapshot(instance.name, c.req.param('snap'))
      await logActivity(
        admin.user.id,
        'admin_restore_snapshot',
        `Restored snapshot "${c.req.param('snap')}" on "${instance.name}"`,
        clientKey(c),
      )
      return c.json({ ok: true })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to restore snapshot.' }, 500)
    }
  })

  app.delete('/api/admin/instances/:id/snapshots/:snap', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)
    const { instance, error } = await snapshotOwnerCheck(c, true)
    if (!instance) return c.json({ message: error }, 404)

    try {
      await incus.deleteSnapshot(instance.name, c.req.param('snap'))
      await logActivity(
        admin.user.id,
        'admin_delete_snapshot',
        `Deleted snapshot "${c.req.param('snap')}" on "${instance.name}"`,
        clientKey(c),
      )
      return c.json({ ok: true })
    } catch (err: any) {
      return c.json({ message: err?.message || 'Failed to delete snapshot.' }, 500)
    }
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
    const cpuModel = cpus[0]?.model?.trim() || 'Unknown CPU'

    let hostOs = `${os.type()} ${os.release()}`
    try {
      const osRelease = readFileSync('/etc/os-release', 'utf8')
      const pretty = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1]
      if (pretty) hostOs = pretty
    } catch {
      // keep os.type() fallback
    }

    let dbTarget = 'local'
    try {
      const dbUrl = new URL(process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/solstice')
      const dbName = dbUrl.pathname.replace(/^\/+/, '') || 'postgres'
      dbTarget = `${dbUrl.hostname}:${dbUrl.port || '5432'} (${dbName})`
    } catch {
      // keep fallback
    }

    const config = await getSystemSettings()
    const mailTransport = mailTransportName(config)
    const smtpHost = config['mail_smtp_host']
      ? `${config['mail_smtp_host']}:${config['mail_smtp_port'] || 587}`
      : (() => {
          try {
            if (!process.env.SMTP_URL) return ''
            const u = new URL(process.env.SMTP_URL)
            return `${u.hostname}:${u.port || '587'}`
          } catch {
            return ''
          }
        })()
    const mailTarget =
      mailTransport === 'smtp'
        ? smtpHost || 'SMTP relay'
        : mailTransport === 'sendmail'
          ? config['mail_sendmail_path'] || '/usr/sbin/sendmail'
          : mailboxDir()

    const nodeCountRow = await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM nodes')

    return c.json({
      totals: {
        users: totals?.users ?? 0,
        admins: totals?.admins ?? 0,
        instances: totals?.instances ?? 0,
        cores: totals?.cores ?? 0,
        memory: formatMemory(totals?.memory_mb ?? 0),
        diskGb: totals?.disk_gb ?? 0,
        nodes: nodeCountRow?.count ?? 1,
      },
      node: {
        daemon: incusInfo?.server || 'incus',
        version: incusInfo?.environment?.server_version || 'unknown',
        os: hostOs,
        kernel: os.release(),
        driver: incusInfo?.environment?.driver || 'lxc | qemu',
        socketPath: process.env.INCUS_SOCKET_PATH || '/var/lib/incus/unix.socket',
        incusOnline: Boolean(incusInfo),
        cpuModel,
        hostMemory: {
          usedMb: memUsedMb,
          totalMb: memTotalMb,
          percent: memPercent,
        },
        databaseVersion: `PostgreSQL ${dbVersionRow?.server_version ?? 'unknown'}`,
        databaseTarget: dbTarget,
        mailTransport,
        mailTarget,
        status: incusInfo ? 'online' : 'degraded',
        uptimeSeconds: Math.floor(os.uptime()),
        loadAvg: os.loadavg() as [number, number, number],
      },
    })
  })

  app.get('/api/config', async (c) => {
    const config = await getSystemSettings()
    return c.json({
      name: config['app_name'] || 'VPS Panel',
      tagline: config['app_tagline'] || 'VPS Hosting',
      language: config['app_language'] || 'en',
      icon: config['app_icon'] || '/brand/mark.svg',
      banner: config['app_banner'] || '',
      url: config['app_url'] || publicOrigin(config),
      enableRegistration: config['app_enable_registration'] !== 'false',
      requireEmailVerification: config['app_require_email_verification'] !== 'false',
      enableSecurityKeys: config['webauthn_enable_security_keys'] !== 'false',
      allowUsernamelessLogin: config['webauthn_allow_usernameless'] === 'true',
      metaDescription: config['meta_description'] || '',
      metaPreviewImage: config['meta_preview_image'] || '',
      metaTwitterCard: config['meta_twitter_card'] || 'summary_large_image',
      metaThemeColor: config['meta_theme_color'] || '#6c5ce7',
      metaAllowIndexing: config['meta_allow_indexing'] !== 'false',
      captchaProvider: config['captcha_provider'] || 'none',
      captchaSiteKey: config['captcha_site_key'] || '',
      captchaApiUrl: config['captcha_api_url'] || '',
      themePreset: config['theme_preset'] || 'solstice',
      themeAccentColor: config['theme_accent_color'] || '#fd9d1e',
      themeSurfaceStyle: config['theme_surface_style'] || 'midnight',
      themeRadius: config['theme_radius'] || 'default',
      themeFont: config['theme_font'] || 'geist',
      themeCustomCss: config['theme_custom_css'] || '',
      themeDefaultMode: config['theme_default_mode'] || 'dark',
      legalTermsUrl: config['legal_terms_url'] || '',
      legalPrivacyUrl: config['legal_privacy_url'] || '',
      legalAupUrl: config['legal_aup_url'] || '',
    })
  })

  app.get('/api/admin/settings', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const rows = await query<{ key: string; value: string }>('SELECT key, value FROM system_settings')
    const config = Object.fromEntries(rows.map((r) => [r.key, r.value]))

    return c.json({
      application: {
        name: config['app_name'] || 'VPS Panel',
        tagline: config['app_tagline'] || 'VPS Hosting',
        language: config['app_language'] || 'en',
        icon: config['app_icon'] || '/brand/mark.svg',
        banner: config['app_banner'] || '',
        url: config['app_url'] || publicOrigin(config),
        requireEmailVerification: config['app_require_email_verification'] !== 'false',
        enableRegistration: config['app_enable_registration'] !== 'false',
        environment: process.env.NODE_ENV || 'development',
        trustProxy: Boolean(process.env.TRUST_PROXY),
        adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean),
      },
      metadata: {
        description: config['meta_description'] || '',
        previewImage: config['meta_preview_image'] || '',
        twitterCard: config['meta_twitter_card'] || 'summary_large_image',
        themeColor: config['meta_theme_color'] || '#6c5ce7',
        allowIndexing: config['meta_allow_indexing'] !== 'false',
      },
      mail: {
        provider: config['mail_provider'] || (config['mail_smtp_host'] ? 'smtp' : (process.env.SMTP_URL ? 'smtp' : 'filesystem')),
        mailFrom: config['mail_from'] || process.env.MAIL_FROM || 'no-reply@localhost',
        mailFromName: config['mail_from_name'] || 'VPS Panel',
        smtpHost: config['mail_smtp_host'] || '',
        smtpPort: Number(config['mail_smtp_port']) || 587,
        smtpUser: config['mail_smtp_user'] || '',
        smtpPass: config['mail_smtp_pass'] || '',
        tlsMode: config['mail_tls_mode'] || 'STARTTLS',
        skipCertValidation: config['mail_skip_cert_validation'] === 'true',
        heloDomain: config['mail_helo_domain'] || '',
        sendmailPath: config['mail_sendmail_path'] || '/usr/sbin/sendmail',
      },
      storage: {
        driver: config['storage_driver'] || 'local',
        s3AccessKey: config['storage_s3_access_key'] || '',
        s3SecretKey: config['storage_s3_secret_key'] || '',
        s3Bucket: config['storage_s3_bucket'] || '',
        s3Region: config['storage_s3_region'] || 'auto',
        s3Endpoint: config['storage_s3_endpoint'] || '',
        s3PublicUrl: config['storage_s3_public_url'] || '',
        s3ForcePathStyle: config['storage_s3_force_path_style'] === 'true',
      },
      webauthn: {
        enableSecurityKeys: config['webauthn_enable_security_keys'] !== 'false',
        allowUsernamelessLogin: config['webauthn_allow_usernameless'] === 'true',
        rpName: config['webauthn_rp_name'] || config['app_name'] || 'VPS Panel',
        rpId: config['webauthn_rp_id'] || new URL(publicOrigin(config)).hostname,
        origin: config['webauthn_origin'] || publicOrigin(config),
        authenticationTimeout: Number(config['webauthn_authentication_timeout']) || 300,
        registrationTimeout: Number(config['webauthn_registration_timeout']) || 300,
      },
      captcha: {
        provider: config['captcha_provider'] || 'none',
        siteKey: config['captcha_site_key'] || '',
        secretKey: config['captcha_secret_key'] || '',
        apiUrl: config['captcha_api_url'] || '',
      },
      legal: {
        termsUrl: config['legal_terms_url'] || '',
        privacyUrl: config['legal_privacy_url'] || '',
        aupUrl: config['legal_aup_url'] || '',
      },
      ratelimits: {
        store: process.env.RATE_LIMIT_STORE || 'memory',
        windowMs: Number(config['ratelimit_window_ms']) || 60000,
        maxRequestsPerMin: Number(config['ratelimit_max_requests']) || 60,
      },
      network: {
        portRangeStart: Number(config['port_forward_start']) || 22000,
        portRangeEnd: Number(config['port_forward_end']) || 22999,
        defaultForwardLimit: portForwardDefaultLimit(config),
      },
      theme: {
        preset: config['theme_preset'] || 'solstice',
        accentColor: config['theme_accent_color'] || '#fd9d1e',
        surfaceStyle: config['theme_surface_style'] || 'midnight',
        radius: config['theme_radius'] || 'default',
        font: config['theme_font'] || 'geist',
        customCss: config['theme_custom_css'] || '',
        defaultMode: config['theme_default_mode'] || 'dark',
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
      tagline: 'app_tagline',
      language: 'app_language',
      icon: 'app_icon',
      banner: 'app_banner',
      url: 'app_url',
      requireEmailVerification: 'app_require_email_verification',
      enableRegistration: 'app_enable_registration',
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

  app.patch('/api/admin/settings/storage', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<Record<string, any>>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid settings body.' }, 400)
    }

    const mapping: Record<string, string> = {
      driver: 'storage_driver',
      s3AccessKey: 'storage_s3_access_key',
      s3SecretKey: 'storage_s3_secret_key',
      s3Bucket: 'storage_s3_bucket',
      s3Region: 'storage_s3_region',
      s3Endpoint: 'storage_s3_endpoint',
      s3PublicUrl: 'storage_s3_public_url',
      s3ForcePathStyle: 'storage_s3_force_path_style',
    }

    for (const [key, dbKey] of Object.entries(mapping)) {
      if (key in body) {
        let val = body[key]
        if (typeof val === 'boolean') val = String(val)
        else val = String(val ?? '').trim()
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
      'Updated storage settings',
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.get('/api/uploads/*', async (c) => {
    const rawPath = c.req.path.replace(/^\/api\/uploads\/?/, '')
    const config = await getSystemSettings()
    const storageConfig = parseStorageConfig(config)
    const asset = await readLocalAsset(storageConfig.localDir, decodeURIComponent(rawPath))
    if (!asset) return c.notFound()

    return new Response(new Uint8Array(asset.buffer), {
      status: 200,
      headers: {
        'Content-Type': asset.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  })

  app.post('/api/upload', async (c) => {
    const session = await authIdentity(c)
    if (!session) return c.json({ message: 'Not signed in.' }, 401)

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [session.user_id])
    if (!user) return c.json({ message: 'Not signed in.' }, 401)

    const contentType = c.req.header('content-type') || ''
    let buffer: Buffer | null = null
    let mimeType = 'application/octet-stream'
    let filename: string | undefined
    let folder: 'avatars' | 'assets' | 'publicdata' = 'avatars'

    if (contentType.includes('multipart/form-data')) {
      const body = await c.req.parseBody()
      const file = body['file']
      if (file instanceof File) {
        buffer = Buffer.from(await file.arrayBuffer())
        mimeType = file.type || 'application/octet-stream'
        filename = file.name
      }
      if (typeof body['folder'] === 'string') {
        const f = body['folder'] as any
        if (f === 'avatars' || f === 'assets' || f === 'publicdata') folder = f
      }
    } else {
      const body = await readJson(c)
      if (typeof body.dataUrl === 'string') {
        const parsed = parseDataUrl(body.dataUrl)
        if (!parsed) return c.json({ message: 'Invalid data URL.' }, 422)
        buffer = parsed.buffer
        mimeType = parsed.contentType
        filename = typeof body.filename === 'string' ? body.filename : undefined
      }
      if (typeof body.folder === 'string') {
        const f = body.folder as any
        if (f === 'avatars' || f === 'assets' || f === 'publicdata') folder = f
      }
    }

    if (!buffer) {
      return c.json({ message: 'No file or image data provided.' }, 422)
    }

    if (folder === 'assets' && !user.is_admin) {
      return c.json({ message: 'Only administrators can upload to assets.' }, 403)
    }

    const config = await getSystemSettings()
    const storageConfig = parseStorageConfig(config)

    try {
      const uploaded = await uploadAsset({
        folder,
        filename,
        buffer,
        contentType: mimeType,
        config: storageConfig,
        publicOrigin: publicOrigin(config),
      })
      return c.json({ ok: true, url: uploaded.url, key: uploaded.key })
    } catch (err: any) {
      return c.json({ message: `Upload failed: ${err?.message || 'Storage error'}` }, 500)
    }
  })

  app.patch('/api/admin/settings/mail', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<Record<string, any>>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid settings body.' }, 400)
    }

    const mapping: Record<string, string> = {
      provider: 'mail_provider',
      mailFrom: 'mail_from',
      mailFromName: 'mail_from_name',
      smtpHost: 'mail_smtp_host',
      smtpPort: 'mail_smtp_port',
      smtpUser: 'mail_smtp_user',
      smtpPass: 'mail_smtp_pass',
      tlsMode: 'mail_tls_mode',
      skipCertValidation: 'mail_skip_cert_validation',
      heloDomain: 'mail_helo_domain',
      sendmailPath: 'mail_sendmail_path',
    }

    for (const [key, dbKey] of Object.entries(mapping)) {
      if (key in body) {
        let val = body[key]
        if (typeof val === 'boolean') val = String(val)
        else val = String(val ?? '').trim()
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
      'Updated mail settings',
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.post('/api/admin/mail/test', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await readJson(c)
    const to = str(body.to).trim() || admin.user.email
    if (!to || !EMAIL_PATTERN.test(to)) {
      return c.json({ message: 'Enter a valid recipient email address.' }, 422)
    }

    const config = await getSystemSettings()
    try {
      await sendMail(
        {
          to,
          subject: `[${config['app_name'] || 'VPS Panel'}] Test Email Delivery`,
          text: `This is a test email sent from your ${config['app_name'] || 'VPS Panel'} admin panel.\nTimestamp: ${new Date().toISOString()}\nProvider: ${config['mail_provider'] || 'smtp'}`,
          html: `<div style="font-family: sans-serif; padding: 20px;"><h2>${config['app_name'] || 'VPS Panel'} Email Test</h2><p>This is a test email sent from your ${config['app_name'] || 'VPS Panel'} administrative panel.</p><p><strong>Timestamp:</strong> ${new Date().toISOString()}</p><p><strong>Configured Provider:</strong> <code>${config['mail_provider'] || 'smtp'}</code></p></div>`,
        },
        config,
      )
      return c.json({ ok: true, message: `Test email sent to ${to}` })
    } catch (err: any) {
      console.error('[mail test error]', err)
      return c.json({ message: `Failed to send test email: ${err?.message || 'SMTP error'}` }, 500)
    }
  })

  app.patch('/api/admin/settings/webauthn', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<Record<string, any>>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid settings body.' }, 400)
    }

    const mapping: Record<string, string> = {
      enableSecurityKeys: 'webauthn_enable_security_keys',
      allowUsernamelessLogin: 'webauthn_allow_usernameless',
      rpName: 'webauthn_rp_name',
      rpId: 'webauthn_rp_id',
      origin: 'webauthn_origin',
      authenticationTimeout: 'webauthn_authentication_timeout',
      registrationTimeout: 'webauthn_registration_timeout',
    }

    for (const [key, dbKey] of Object.entries(mapping)) {
      if (key in body) {
        let val = body[key]
        if (typeof val === 'boolean') val = String(val)
        else val = String(val ?? '').trim()
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
      'Updated webauthn settings',
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.patch('/api/admin/settings/metadata', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<Record<string, any>>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid settings body.' }, 400)
    }

    const mapping: Record<string, string> = {
      description: 'meta_description',
      previewImage: 'meta_preview_image',
      twitterCard: 'meta_twitter_card',
      themeColor: 'meta_theme_color',
      allowIndexing: 'meta_allow_indexing',
    }

    for (const [key, dbKey] of Object.entries(mapping)) {
      if (key in body) {
        let val = body[key]
        if (typeof val === 'boolean') val = String(val)
        else val = String(val ?? '').trim()
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
      'Updated metadata settings',
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.patch('/api/admin/settings/ratelimits', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<Record<string, any>>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid settings body.' }, 400)
    }

    const mapping: Record<string, string> = {
      windowMs: 'ratelimit_window_ms',
      maxRequestsPerMin: 'ratelimit_max_requests',
    }

    for (const [key, dbKey] of Object.entries(mapping)) {
      if (key in body) {
        const val = String(body[key] ?? '').trim()
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
      'Updated ratelimit settings',
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.patch('/api/admin/settings/network', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<Record<string, any>>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid settings body.' }, 400)
    }

    const start = Math.floor(Number(body.portRangeStart))
    const end = Math.floor(Number(body.portRangeEnd))
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return c.json({ message: 'Port range bounds must be numbers.' }, 400)
    }
    if (start < 1024 || end > 65535 || start >= end) {
      return c.json({ message: 'Range must be within 1024-65535 with start < end.' }, 400)
    }
    if (end - start > 5000) {
      return c.json({ message: 'Range may span at most 5000 ports.' }, 400)
    }

    let defaultLimit: number | null = null
    if (body.defaultForwardLimit !== undefined) {
      defaultLimit = Math.floor(Number(body.defaultForwardLimit))
      if (!Number.isFinite(defaultLimit) || defaultLimit < 0 || defaultLimit > 1000) {
        return c.json({ message: 'Default forward limit must be 0-1000.' }, 400)
      }
    }

    for (const [key, dbKey] of Object.entries({
      portRangeStart: 'port_forward_start',
      portRangeEnd: 'port_forward_end',
    })) {
      const val = String((body as Record<string, any>)[key] ?? '').trim()
      await query(
        `INSERT INTO system_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [dbKey, val],
      )
    }
    if (defaultLimit !== null) {
      await query(
        `INSERT INTO system_settings (key, value) VALUES ('port_forward_default_limit', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [String(defaultLimit)],
      )
    }

    await logActivity(
      admin.user.id,
      'admin_update_settings',
      defaultLimit !== null
        ? `Updated port forwarding range to ${start}-${end} (default limit ${defaultLimit})`
        : `Updated port forwarding range to ${start}-${end}`,
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.patch('/api/admin/settings/captcha', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<Record<string, any>>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid settings body.' }, 400)
    }

    const mapping: Record<string, string> = {
      provider: 'captcha_provider',
      siteKey: 'captcha_site_key',
      secretKey: 'captcha_secret_key',
      apiUrl: 'captcha_api_url',
    }

    for (const [key, dbKey] of Object.entries(mapping)) {
      if (key in body) {
        const val = String(body[key] ?? '').trim()
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
      'Updated captcha settings',
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.patch('/api/admin/settings/legal', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<Record<string, any>>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid settings body.' }, 400)
    }

    // Empty string clears back to the built-in page.
    const mapping: Record<string, string> = {
      termsUrl: 'legal_terms_url',
      privacyUrl: 'legal_privacy_url',
      aupUrl: 'legal_aup_url',
    }

    for (const [key, dbKey] of Object.entries(mapping)) {
      if (key in body) {
        const val = String(body[key] ?? '').trim()
        if (val && !/^https?:\/\//.test(val)) {
          return c.json({ message: 'Legal URLs must start with http:// or https://.' }, 400)
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
      'Updated legal document URLs',
      clientKey(c),
    )

    return c.json({ ok: true })
  })

  app.patch('/api/admin/settings/theme', async (c) => {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ message: 'Forbidden.' }, 403)

    const body = await c.req.json<Record<string, any>>().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ message: 'Invalid settings body.' }, 400)
    }

    const mapping: Record<string, string> = {
      preset: 'theme_preset',
      accentColor: 'theme_accent_color',
      surfaceStyle: 'theme_surface_style',
      radius: 'theme_radius',
      font: 'theme_font',
      customCss: 'theme_custom_css',
      defaultMode: 'theme_default_mode',
    }

    for (const [key, dbKey] of Object.entries(mapping)) {
      if (key in body) {
        const val = body[key] == null ? '' : String(body[key])
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
      'Updated theme settings',
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
