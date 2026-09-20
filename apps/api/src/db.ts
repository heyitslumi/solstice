import { Pool } from 'pg'

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://solstice:password@127.0.0.1:5433/solstice'

export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
})

pool.on('error', (err) => {
  console.error('[db] idle client pool error:', err.message)
})

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id                uuid PRIMARY KEY,
    email             text NOT NULL,
    name              text NOT NULL,
    password_hash     text,
    email_verified_at timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

  /* Databases created before verification shipped already have a users table, so
     CREATE TABLE IF NOT EXISTS is a no-op for them and the column needs adding. */
  ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
  ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

  /* Sign-in is passwordless now. The hash column stays for rows written by the
     old flow, but nothing reads or writes it; the authenticator and email-OTP
     factor columns are gone entirely. */
  ALTER TABLE users DROP COLUMN IF EXISTS email_otp_enabled_at;
  ALTER TABLE users DROP COLUMN IF EXISTS totp_secret;
  ALTER TABLE users DROP COLUMN IF EXISTS totp_enabled_at;
  ALTER TABLE users DROP COLUMN IF EXISTS totp_last_step;

  /* Two-factor is gone, so the tables that only it used can be dropped. IF EXISTS
     keeps this a no-op on databases that never had them. */
  DROP TABLE IF EXISTS recovery_codes;
  DROP TABLE IF EXISTS password_resets;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    user_agent text
  );
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

  /* One live code per account: user_id is the key, so issuing a new code
     replaces the old one instead of leaving several valid at once. */
  CREATE TABLE IF NOT EXISTS email_verifications (
    user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash  text NOT NULL,
    link_hash  text,
    attempts   integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz
  );

  /* Tables created before the emailed link existed lack the column. */
  ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS link_hash text;

  /* Nullable column, so accounts issued a code-only row do not collide. */
  CREATE UNIQUE INDEX IF NOT EXISTS email_verifications_link_idx
    ON email_verifications (link_hash);

  /* Two-phase on purpose: the account keeps working on the old address until the
     new one answers, so a typo cannot strand anyone. cancel_hash goes to the
     address being abandoned, the only inbox that can notice a takeover. */
  CREATE TABLE IF NOT EXISTS email_changes (
    user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    new_email   text NOT NULL,
    code_hash   text NOT NULL,
    cancel_hash text NOT NULL,
    attempts    integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
  );
  CREATE INDEX IF NOT EXISTS email_changes_cancel_idx ON email_changes (cancel_hash);

  /* Stored as base64url text because that is the form the WebAuthn API hands over
     and takes back, so there is no conversion layer to get wrong. counter is BIGINT
     because an authenticator reports it as an unsigned 32-bit value, which overflows
     a signed integer. */
  CREATE TABLE IF NOT EXISTS passkeys (
    id            uuid PRIMARY KEY,
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id text NOT NULL,
    public_key    text NOT NULL,
    counter       bigint NOT NULL DEFAULT 0,
    transports    text,
    name          text NOT NULL,
    backed_up     boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_used_at  timestamptz
  );
  CREATE UNIQUE INDEX IF NOT EXISTS passkeys_credential_idx ON passkeys (credential_id);
  CREATE INDEX IF NOT EXISTS passkeys_user_idx ON passkeys (user_id);

  /* One in-flight ceremony. The browser holds the token in a cookie, and the row is
     deleted as it is read so a challenge cannot be replayed even when verification
     then fails. user_id is null for a usernameless sign-in, where the credential
     itself is what names the account. */
  CREATE TABLE IF NOT EXISTS webauthn_challenges (
    token_hash text PRIMARY KEY,
    user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
    challenge  text NOT NULL,
    kind       text NOT NULL,
    expires_at timestamptz NOT NULL
  );
  CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_idx ON webauthn_challenges (expires_at);

  CREATE TABLE IF NOT EXISTS rate_limits (
    key      text PRIMARY KEY,
    count    integer NOT NULL,
    reset_at timestamptz NOT NULL
  );
  CREATE INDEX IF NOT EXISTS rate_limits_reset_idx ON rate_limits (reset_at);

  /* The pending sign-in step of a passwordless login. The token is what the link
     in the email carries; the code is what the owner reads out of their inbox.
     One live challenge per account: a fresh sign-in supersedes the previous one. */
  CREATE TABLE IF NOT EXISTS login_challenges (
    token_hash text PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  text,
    link_hash  text,
    attempts   integer NOT NULL DEFAULT 0,
    remember   boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz
  );
  CREATE INDEX IF NOT EXISTS login_challenges_user_idx ON login_challenges (user_id);
  CREATE INDEX IF NOT EXISTS login_challenges_expires_idx ON login_challenges (expires_at);

  /* Tables created before the emailed link existed lack the column. Nullable,
     so accounts issued a code-only row do not collide. */
  CREATE TABLE IF NOT EXISTS activity_logs (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action     text NOT NULL,
    details    text NOT NULL,
    ip_address text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS activity_logs_user_idx ON activity_logs (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS email_logs (
    id         uuid PRIMARY KEY,
    user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
    recipient  text NOT NULL,
    subject    text NOT NULL,
    body_text  text NOT NULL,
    status     text NOT NULL DEFAULT 'sent',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS email_logs_user_idx ON email_logs (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS email_logs_recipient_idx ON email_logs (recipient, created_at DESC);

  CREATE TABLE IF NOT EXISTS account_deletions (
    user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash  text NOT NULL,
    attempts   integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  );

  CREATE TABLE IF NOT EXISTS instances (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        text NOT NULL UNIQUE,
    type        text NOT NULL,
    os          text NOT NULL,
    image_alias text NOT NULL,
    cores       integer NOT NULL DEFAULT 1,
    memory_mb   integer NOT NULL DEFAULT 1024,
    disk_gb     integer NOT NULL DEFAULT 10,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS instances_user_idx ON instances (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS ssh_keys (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        text NOT NULL,
    public_key  text NOT NULL,
    fingerprint text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS ssh_keys_user_idx ON ssh_keys (user_id, created_at DESC);

  /* Platform administrators. Seeded from ADMIN_EMAILS on every boot so the
     first operator never has to touch SQL by hand. */
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

  /* Global panel configuration key-value storage */
  CREATE TABLE IF NOT EXISTS system_settings (
    key   text PRIMARY KEY,
    value text NOT NULL
  );
`

async function hasColumn(table: string, column: string) {
  const row = await queryOne<{ present: boolean }>(
    `SELECT true AS present FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  )
  return row !== null
}

export async function migrate() {
  // Read before the schema runs: afterwards the column always exists, so this
  // could no longer tell a fresh database apart from an upgraded one.
  const hadVerifiedColumn = await hasColumn('users', 'email_verified_at')

  await pool.query(SCHEMA)

  // Accounts that predate verification cannot be sent a code, so grandfather them
  // in rather than locking people out of accounts they already own.
  if (!hadVerifiedColumn) {
    await query('UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL')
  }

  /* Seed operators from ADMIN_EMAILS (comma-separated). Runs every boot so a
     newly added address takes effect on the next deploy without touching SQL. */
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  for (const email of adminEmails) {
    await query('UPDATE users SET is_admin = true WHERE lower(email) = $1', [email])
  }
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(sql, params)
  return result.rows as unknown as T[]
}

export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export function closePool() {
  return pool.end()
}

/** timestamptz arrives as a Date, but accept a string too. */
export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export interface UserRow {
  id: string
  email: string
  name: string
  password_hash: string | null
  avatar_url?: string | null
  email_verified_at: Date | string | null
  is_admin: boolean
  created_at: Date | string
}

export interface InstanceRow {
  id: string
  user_id: string
  name: string
  type: 'kvm' | 'lxc'
  os: string
  image_alias: string
  cores: number
  memory_mb: number
  disk_gb: number
  created_at: Date | string
}

export interface SshKeyRow {
  id: string
  user_id: string
  name: string
  public_key: string
  fingerprint: string
  created_at: Date | string
}
