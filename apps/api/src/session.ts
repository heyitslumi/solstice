import { createHash, randomBytes } from 'node:crypto'

import { query, queryOne, toIso } from './db.ts'

export const SESSION_COOKIE = 'solstice_session'
export const SESSION_TTL_SHORT_MS = 24 * 60 * 60 * 1000
export const SESSION_TTL_LONG_MS = 30 * 24 * 60 * 60 * 1000

interface SessionRow {
  token_hash: string
  user_id: string
  created_at: Date | string
  expires_at: Date | string
  user_agent: string | null
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string, ttlMs: number, userAgent?: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ttlMs)

  await query(
    'INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES ($1, $2, $3, $4)',
    [hashToken(token), userId, expiresAt.toISOString(), userAgent ?? null],
  )

  return { token, expiresAt: expiresAt.toISOString() }
}

export async function readSession(token: string | undefined) {
  if (!token) return null

  const row = await queryOne<SessionRow>('SELECT * FROM sessions WHERE token_hash = $1', [
    hashToken(token),
  ])
  if (!row) return null

  if (new Date(toIso(row.expires_at)).getTime() < Date.now()) {
    await query('DELETE FROM sessions WHERE token_hash = $1', [row.token_hash])
    return null
  }

  return row
}

export async function destroySession(token: string | undefined) {
  if (!token) return
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
}

export async function purgeExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at < now()')
}

export async function listSessions(userId: string) {
  return query<{ token_hash: string; user_agent: string | null; created_at: Date | string; expires_at: Date | string }>(
    'SELECT token_hash, user_agent, created_at, expires_at FROM sessions WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  )
}

export async function destroySessionById(tokenHash: string) {
  await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash])
}
