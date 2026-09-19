import { randomBytes } from 'node:crypto'

import { query, queryOne, toIso } from './db.ts'
import { generateNumericCode, hashSecret, matchesSecret } from './secret.ts'

export const LOGIN_CODE_LENGTH = 6
export const LOGIN_CODE_TTL_MS = 10 * 60 * 1000
export const MAX_LOGIN_CODE_ATTEMPTS = 5

export type LoginOutcome =
  | { status: 'ok'; userId: string; remember: boolean }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'too_many' }

export type LinkOutcome =
  | { status: 'ok'; userId: string; remember: boolean }
  | { status: 'invalid' }
  | { status: 'expired' }

interface ChallengeRow {
  user_id: string
  code_hash: string | null
  attempts: number
  remember: boolean
  expires_at: Date | string
}

/*
 * The link carries a high-entropy token rather than the 6-digit code, so it can
 * be a single click deep-linking to the app and cannot leak through a Referer
 * header the way a query-string code could.
 */
export async function createLoginChallenge(userId: string, remember: boolean) {
  const token = randomBytes(32).toString('base64url')
  const linkToken = randomBytes(32).toString('base64url')
  const code = generateNumericCode(LOGIN_CODE_LENGTH)
  const expiresAt = new Date(Date.now() + LOGIN_CODE_TTL_MS)

  // One live challenge per account: a fresh sign-in supersedes the previous one.
  await query('DELETE FROM login_challenges WHERE user_id = $1', [userId])
  await query(
    `INSERT INTO login_challenges (token_hash, user_id, code_hash, link_hash, remember, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      hashSecret(token),
      userId,
      hashSecret(code),
      hashSecret(linkToken),
      remember,
      expiresAt.toISOString(),
    ],
  )

  return { code, linkToken, expiresAt: expiresAt.toISOString() }
}

export async function loadLoginChallenge(userId: string): Promise<ChallengeState> {
  const row = await queryOne<ChallengeRow>(
    'SELECT user_id, code_hash, attempts, remember, expires_at FROM login_challenges WHERE user_id = $1 AND used_at IS NULL',
    [userId],
  )

  if (!row) return { status: 'invalid' }
  if (row.attempts >= MAX_LOGIN_CODE_ATTEMPTS) return { status: 'too_many' }
  if (new Date(toIso(row.expires_at)).getTime() < Date.now()) return { status: 'expired' }

  return {
    status: 'ok',
    userId: row.user_id,
    remember: row.remember,
    codeHash: row.code_hash,
  }
}

export type ChallengeState =
  | { status: 'ok'; userId: string; remember: boolean; codeHash: string | null }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'too_many' }

export async function consumeLoginCode(userId: string, code: string): Promise<LoginOutcome> {
  const challenge = await loadLoginChallenge(userId)
  if (challenge.status !== 'ok') return challenge

  if (!matchesSecret(challenge.codeHash ?? '', code)) {
    await recordChallengeFailure(userId)
    return { status: 'invalid' }
  }

  await consumeChallenge(userId)
  return { status: 'ok', userId: challenge.userId, remember: challenge.remember }
}

export async function consumeLoginLink(linkToken: string): Promise<LinkOutcome> {
  const row = await queryOne<{ user_id: string; remember: boolean; expires_at: Date | string }>(
    'SELECT user_id, remember, expires_at FROM login_challenges WHERE link_hash = $1 AND used_at IS NULL',
    [hashSecret(linkToken)],
  )

  if (!row) return { status: 'invalid' }
  if (new Date(toIso(row.expires_at)).getTime() < Date.now()) return { status: 'expired' }

  await consumeChallenge(row.user_id)
  return { status: 'ok', userId: row.user_id, remember: row.remember }
}

async function recordChallengeFailure(userId: string) {
  await query('UPDATE login_challenges SET attempts = attempts + 1 WHERE user_id = $1', [userId])
}

async function consumeChallenge(userId: string) {
  await query('UPDATE login_challenges SET used_at = now() WHERE user_id = $1', [userId])
}