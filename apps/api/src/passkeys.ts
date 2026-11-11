import { randomBytes, randomUUID } from 'node:crypto'

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'

import { query, queryOne, toIso } from './db.ts'
import { hashSecret } from './secret.ts'

export const CEREMONY_COOKIE = 'solstice_webauthn'
export const CEREMONY_TTL_MS = 5 * 60 * 1000

export type CeremonyKind = 'registration' | 'authentication'

export interface PasskeyRow {
  id: string
  user_id: string
  credential_id: string
  public_key: string
  counter: number | string
  transports: string | null
  name: string
  backed_up: boolean
  created_at: Date | string
  last_used_at: Date | string | null
}

export function relyingParty(config?: Record<string, string>) {
  if (config?.['webauthn_origin']) {
    const origin = config['webauthn_origin'].replace(/\/+$/, '')
    const rpID = config['webauthn_rp_id'] || new URL(origin).hostname
    const rpName = config['webauthn_rp_name'] || config['app_name'] || 'Solstice'
    return { origin, rpID, rpName }
  }
  const origin = (process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, '')
  return { origin, rpID: new URL(origin).hostname, rpName: 'Solstice' }
}

function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64url')
}

function fromBase64Url(value: string) {
  return new Uint8Array(Buffer.from(value, 'base64url'))
}

function transportsOf(row: PasskeyRow) {
  return row.transports ? row.transports.split(',') : undefined
}

export async function storeCeremony(kind: CeremonyKind, userId: string | null, challenge: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + CEREMONY_TTL_MS)

  await query('DELETE FROM webauthn_challenges WHERE expires_at < now()')
  await query(
    `INSERT INTO webauthn_challenges (token_hash, user_id, challenge, kind, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashSecret(token), userId, challenge, kind, expiresAt.toISOString()],
  )

  return { token, expiresAt: expiresAt.toISOString() }
}

/*
 * Deleted as it is read, so a challenge is spent even when the verification that
 * follows fails. That is what stops a captured assertion being replayed: the second
 * attempt finds no ceremony to match against.
 */
export async function consumeCeremony(token: string, kind: CeremonyKind) {
  const row = await queryOne<{ challenge: string; user_id: string | null }>(
    `DELETE FROM webauthn_challenges
      WHERE token_hash = $1 AND kind = $2 AND expires_at > now()
      RETURNING challenge, user_id`,
    [hashSecret(token), kind],
  )

  return row ?? null
}

export async function listPasskeys(userId: string) {
  return query<PasskeyRow>('SELECT * FROM passkeys WHERE user_id = $1 ORDER BY created_at DESC', [
    userId,
  ])
}

export function findPasskeyByCredentialId(credentialId: string) {
  return queryOne<PasskeyRow>('SELECT * FROM passkeys WHERE credential_id = $1', [credentialId])
}

export async function insertPasskey(input: {
  userId: string
  credentialId: string
  publicKey: string
  counter: number
  transports: string | undefined
  name: string
  backedUp: boolean
}) {
  const id = randomUUID()

  await query(
    `INSERT INTO passkeys
       (id, user_id, credential_id, public_key, counter, transports, name, backed_up)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      input.userId,
      input.credentialId,
      input.publicKey,
      input.counter,
      input.transports ?? null,
      input.name,
      input.backedUp,
    ],
  )

  return id
}

export async function deletePasskey(userId: string, id: string) {
  const row = await queryOne<{ id: string }>(
    'DELETE FROM passkeys WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId],
  )

  return row !== null
}

export async function recordPasskeyUse(id: string, counter: number, backedUp: boolean) {
  await query('UPDATE passkeys SET counter = $1, backed_up = $2, last_used_at = now() WHERE id = $3', [
    counter,
    backedUp,
    id,
  ])
}

export function toWebAuthnCredential(row: PasskeyRow): WebAuthnCredential {
  const transports = transportsOf(row)
  return {
    id: row.credential_id,
    publicKey: fromBase64Url(row.public_key),
    counter: Number(row.counter),
    ...(transports ? { transports } : {}),
  }
}

export function publicPasskey(row: PasskeyRow) {
  return {
    id: row.id,
    name: row.name,
    backedUp: row.backed_up,
    createdAt: toIso(row.created_at),
    lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null,
  }
}

export async function registrationOptions(
  user: { id: string; email: string; name: string },
  existing: PasskeyRow[],
  config?: Record<string, string>,
) {
  const { rpID, rpName } = relyingParty(config)
  const allowUsernameless =
    config?.['webauthn_allow_usernameless'] !== undefined
      ? config['webauthn_allow_usernameless'] === 'true'
      : true

  const timeout = (Number(config?.['webauthn_registration_timeout']) || 300) * 1000

  return generateRegistrationOptions({
    rpName,
    rpID,
    timeout,
    userName: user.email,
    userDisplayName: user.name,
    // The account id is already opaque and stable, which is exactly what a WebAuthn
    // user handle has to be, so it doubles as one and a discoverable credential can
    // be matched back to this account without a second identifier to keep in sync.
    userID: new Uint8Array(Buffer.from(user.id)),
    excludeCredentials: existing.map((row) => {
      const transports = transportsOf(row)
      return { id: row.credential_id, ...(transports ? { transports } : {}) }
    }),
    // Discoverable when usernameless is permitted
    authenticatorSelection: {
      residentKey: allowUsernameless ? 'required' : 'discouraged',
      userVerification: 'required',
    },
  })
}

export async function authenticationOptions(credentials?: PasskeyRow[], config?: Record<string, string>) {
  const { rpID } = relyingParty(config)
  const timeout = (Number(config?.['webauthn_authentication_timeout']) || 300) * 1000

  return generateAuthenticationOptions({
    rpID,
    timeout,
    ...(credentials
      ? {
          allowCredentials: credentials.map((row) => {
            const transports = transportsOf(row)
            return { id: row.credential_id, ...(transports ? { transports } : {}) }
          }),
        }
      : {}),
    userVerification: 'required',
  })
}

export async function verifyRegistration(input: {
  response: RegistrationResponseJSON
  challenge: string
  userId: string
  name: string
  config?: Record<string, string>
}) {
  const { origin, rpID } = relyingParty(input.config)

  const result = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  })

  if (!result.verified) return null

  const { credential, credentialBackedUp } = result.registrationInfo

  const id = await insertPasskey({
    userId: input.userId,
    credentialId: credential.id,
    publicKey: toBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports?.join(','),
    name: input.name,
    backedUp: credentialBackedUp,
  })

  return { id, credentialId: credential.id }
}

export async function verifyAuthentication(input: {
  response: AuthenticationResponseJSON
  challenge: string
  row: PasskeyRow
  config?: Record<string, string>
}) {
  const { origin, rpID } = relyingParty(input.config)

  const result = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: toWebAuthnCredential(input.row),
  })

  if (!result.verified) return null

  const { newCounter, credentialBackedUp } = result.authenticationInfo
  await recordPasskeyUse(input.row.id, newCounter, credentialBackedUp)

  return { userId: input.row.user_id }
}
