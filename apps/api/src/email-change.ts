import { randomBytes } from 'node:crypto'

import { query, queryOne, toIso } from './db.ts'
import { generateNumericCode, hashSecret, matchesSecret } from './secret.ts'

export const CHANGE_CODE_LENGTH = 6
export const CHANGE_CODE_TTL_MS = 15 * 60 * 1000
export const MAX_CHANGE_ATTEMPTS = 5

export type ChangeOutcome = 'ok' | 'invalid' | 'expired' | 'too_many'

export interface PendingChange {
  email: string
  expiresAt: string
}

const CODE_PATTERN = new RegExp(`^\\d{${CHANGE_CODE_LENGTH}}$`)

export function isChangeCodeShape(code: string) {
  return CODE_PATTERN.test(code)
}

export async function createEmailChange(userId: string, newEmail: string) {
  const code = generateNumericCode(CHANGE_CODE_LENGTH)
  const cancelToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + CHANGE_CODE_TTL_MS)

  // One pending move per account: a new request supersedes the last one, which
  // also retires the cancel token the old address is still holding.
  await query('DELETE FROM email_changes WHERE user_id = $1', [userId])
  await query(
    `INSERT INTO email_changes (user_id, new_email, code_hash, cancel_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, newEmail, hashSecret(code), hashSecret(cancelToken), expiresAt.toISOString()],
  )

  return { code, cancelToken, expiresAt: expiresAt.toISOString() }
}

export async function loadEmailChange(userId: string): Promise<PendingChange | null> {
  const row = await queryOne<{ new_email: string; expires_at: Date | string }>(
    'SELECT new_email, expires_at FROM email_changes WHERE user_id = $1',
    [userId],
  )

  if (!row) return null
  if (new Date(toIso(row.expires_at)).getTime() < Date.now()) return null

  return { email: row.new_email, expiresAt: toIso(row.expires_at) }
}

export async function consumeEmailChange(userId: string, code: string): Promise<ChangeOutcome> {
  const row = await queryOne<{ code_hash: string; attempts: number; expires_at: Date | string }>(
    'SELECT code_hash, attempts, expires_at FROM email_changes WHERE user_id = $1',
    [userId],
  )

  if (!row) return 'invalid'
  if (row.attempts >= MAX_CHANGE_ATTEMPTS) return 'too_many'
  if (new Date(toIso(row.expires_at)).getTime() < Date.now()) return 'expired'

  if (!matchesSecret(row.code_hash, code)) {
    await query('UPDATE email_changes SET attempts = attempts + 1 WHERE user_id = $1', [userId])
    return 'invalid'
  }

  return 'ok'
}

/*
 * Deleting as it reads makes the claim atomic: two requests arriving with the
 * same code both pass the check above, but only one gets the row back.
 */
export async function claimEmailChange(userId: string) {
  const row = await queryOne<{ new_email: string }>(
    'DELETE FROM email_changes WHERE user_id = $1 RETURNING new_email',
    [userId],
  )

  return row ? { newEmail: row.new_email } : null
}

export async function cancelEmailChange(userId: string) {
  await query('DELETE FROM email_changes WHERE user_id = $1', [userId])
}

export async function cancelEmailChangeByToken(cancelToken: string) {
  const row = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM email_changes WHERE cancel_hash = $1',
    [hashSecret(cancelToken)],
  )

  if (!row) return null

  await query('DELETE FROM email_changes WHERE user_id = $1', [row.user_id])
  return { userId: row.user_id }
}
