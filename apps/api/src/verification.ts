import { randomBytes } from 'node:crypto'

import { query, queryOne, toIso } from './db.ts'
import { generateNumericCode, hashSecret, matchesSecret } from './secret.ts'

export const CODE_LENGTH = 6
export const CODE_TTL_MS = 15 * 60 * 1000
export const MAX_CODE_ATTEMPTS = 5

export type VerificationOutcome = 'ok' | 'invalid' | 'expired' | 'too_many'

export type LinkOutcome =
  | { status: 'ok'; userId: string }
  | { status: 'invalid' }
  | { status: 'expired' }

const CODE_PATTERN = new RegExp(`^\\d{${CODE_LENGTH}}$`)

export function isCodeShape(code: string) {
  return CODE_PATTERN.test(code)
}

export async function createEmailVerification(userId: string) {
  const code = generateNumericCode(CODE_LENGTH)
  const linkToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)

  await query('DELETE FROM email_verifications WHERE user_id = $1', [userId])
  await query(
    `INSERT INTO email_verifications (user_id, code_hash, link_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, hashSecret(code), hashSecret(linkToken), expiresAt.toISOString()],
  )

  return { code, linkToken, expiresAt: expiresAt.toISOString() }
}

/*
 * The link carries this opaque token rather than the 6-digit code, so it can be
 * high-entropy and, unlike a code in a URL, cannot leak through browser history
 * or a Referer header.
 */
export async function consumeEmailVerificationLink(linkToken: string): Promise<LinkOutcome> {
  const row = await queryOne<{ user_id: string; expires_at: Date | string }>(
    'SELECT user_id, expires_at FROM email_verifications WHERE link_hash = $1 AND used_at IS NULL',
    [hashSecret(linkToken)],
  )

  if (!row) return { status: 'invalid' }
  if (new Date(toIso(row.expires_at)).getTime() < Date.now()) return { status: 'expired' }

  await query('UPDATE email_verifications SET used_at = now() WHERE user_id = $1', [row.user_id])
  return { status: 'ok', userId: row.user_id }
}

export async function consumeEmailVerification(
  userId: string,
  code: string,
): Promise<VerificationOutcome> {
  const row = await queryOne<{ code_hash: string; attempts: number; expires_at: Date | string }>(
    'SELECT code_hash, attempts, expires_at FROM email_verifications WHERE user_id = $1 AND used_at IS NULL',
    [userId],
  )

  // A used code has no row, which is what makes a second submission fail.
  if (!row) return 'invalid'

  // Checked ahead of the comparison so a spent code stays spent even if the
  // right digits arrive later.
  if (row.attempts >= MAX_CODE_ATTEMPTS) return 'too_many'
  if (new Date(toIso(row.expires_at)).getTime() < Date.now()) return 'expired'

  if (!matchesSecret(row.code_hash, code)) {
    await query('UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = $1', [
      userId,
    ])
    return 'invalid'
  }

  await query('UPDATE email_verifications SET used_at = now() WHERE user_id = $1', [userId])
  return 'ok'
}
