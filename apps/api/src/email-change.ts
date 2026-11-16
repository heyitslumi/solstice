import { randomBytes } from 'node:crypto'

import { query, queryOne, toIso } from './db.ts'
import { generateNumericCode, hashSecret, matchesSecret } from './secret.ts'

export const CHANGE_CODE_LENGTH = 6
export const CHANGE_CODE_TTL_MS = 15 * 60 * 1000
export const MAX_CHANGE_ATTEMPTS = 5

export type ChangeOutcome = 'ok' | 'invalid' | 'expired' | 'too_many'
export type ChangeStage = 'awaiting_current' | 'awaiting_new'

export interface PendingChange {
  email: string
  stage: ChangeStage
  expiresAt: string
}

const CODE_PATTERN = new RegExp(`^\\d{${CHANGE_CODE_LENGTH}}$`)

export function isChangeCodeShape(code: string) {
  return CODE_PATTERN.test(code)
}

export async function createEmailChange(userId: string, newEmail: string) {
  const currentCode = generateNumericCode(CHANGE_CODE_LENGTH)
  const cancelToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + CHANGE_CODE_TTL_MS)

  await query('DELETE FROM email_changes WHERE user_id = $1', [userId])
  await query(
    `INSERT INTO email_changes (user_id, new_email, current_code_hash, cancel_hash, stage, expires_at)
     VALUES ($1, $2, $3, $4, 'awaiting_current', $5)`,
    [userId, newEmail, hashSecret(currentCode), hashSecret(cancelToken), expiresAt.toISOString()],
  )

  return { currentCode, cancelToken, expiresAt: expiresAt.toISOString() }
}

export async function loadEmailChange(userId: string): Promise<PendingChange | null> {
  const row = await queryOne<{ new_email: string; stage: ChangeStage; expires_at: Date | string }>(
    'SELECT new_email, stage, expires_at FROM email_changes WHERE user_id = $1',
    [userId],
  )

  if (!row) return null
  if (new Date(toIso(row.expires_at)).getTime() < Date.now()) return null

  return {
    email: row.new_email,
    stage: row.stage || 'awaiting_current',
    expiresAt: toIso(row.expires_at),
  }
}

export async function authorizeEmailChange(
  userId: string,
  code: string,
): Promise<{ outcome: ChangeOutcome; newCode?: string }> {
  const row = await queryOne<{
    current_code_hash: string | null
    stage: string
    attempts: number
    expires_at: Date | string
  }>('SELECT current_code_hash, stage, attempts, expires_at FROM email_changes WHERE user_id = $1', [
    userId,
  ])

  if (!row) return { outcome: 'invalid' }
  if (new Date(toIso(row.expires_at)).getTime() < Date.now()) return { outcome: 'expired' }
  if (row.attempts >= MAX_CHANGE_ATTEMPTS) return { outcome: 'too_many' }
  if (row.stage !== 'awaiting_current') return { outcome: 'invalid' }

  if (!matchesSecret(row.current_code_hash || '', code)) {
    await query('UPDATE email_changes SET attempts = attempts + 1 WHERE user_id = $1', [userId])
    return { outcome: 'invalid' }
  }

  const newCode = generateNumericCode(CHANGE_CODE_LENGTH)
  await query(
    `UPDATE email_changes
     SET new_code_hash = $1, stage = 'awaiting_new', attempts = 0
     WHERE user_id = $2`,
    [hashSecret(newCode), userId],
  )

  return { outcome: 'ok', newCode }
}

export async function consumeEmailChange(userId: string, code: string): Promise<ChangeOutcome> {
  const row = await queryOne<{
    new_code_hash: string | null
    code_hash: string | null
    stage: string
    attempts: number
    expires_at: Date | string
  }>('SELECT new_code_hash, code_hash, stage, attempts, expires_at FROM email_changes WHERE user_id = $1', [
    userId,
  ])

  if (!row) return 'invalid'
  if (new Date(toIso(row.expires_at)).getTime() < Date.now()) return 'expired'
  if (row.attempts >= MAX_CHANGE_ATTEMPTS) return 'too_many'
  if (row.stage !== 'awaiting_new') return 'invalid'

  const targetHash = row.new_code_hash || row.code_hash || ''
  if (!matchesSecret(targetHash, code)) {
    await query('UPDATE email_changes SET attempts = attempts + 1 WHERE user_id = $1', [userId])
    return 'invalid'
  }

  return 'ok'
}

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
