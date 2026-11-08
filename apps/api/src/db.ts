import { statfsSync } from 'node:fs'
import os from 'node:os'
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
  ALTER TABLE instances ADD COLUMN IF NOT EXISTS hostname text NOT NULL DEFAULT '';
  ALTER TABLE instances ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT '';
  ALTER TABLE instances ADD COLUMN IF NOT EXISTS swap_mb integer NOT NULL DEFAULT 0;
  ALTER TABLE instances ADD COLUMN IF NOT EXISTS dns_servers jsonb NOT NULL DEFAULT '[]'::jsonb;

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
  ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id text;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_mode text NOT NULL DEFAULT 'system';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preset text NOT NULL DEFAULT '';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS port_forward_limit integer;
  CREATE TABLE IF NOT EXISTS api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT '',
    prefix text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    last_used_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id);
  CREATE TABLE IF NOT EXISTS instance_metrics (
    instance_id uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    ts timestamptz NOT NULL DEFAULT now(),
    cpu_pct real NOT NULL DEFAULT 0,
    ram_pct real NOT NULL DEFAULT 0,
    disk_pct real NOT NULL DEFAULT 0,
    net_rx_bytes bigint NOT NULL DEFAULT 0,
    net_tx_bytes bigint NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS instance_metrics_lookup_idx ON instance_metrics (instance_id, ts DESC);
  ALTER TABLE instance_metrics ALTER COLUMN cpu_pct DROP NOT NULL;
  ALTER TABLE instance_metrics ALTER COLUMN disk_pct DROP NOT NULL;

  CREATE TABLE IF NOT EXISTS node_metrics (
    node_id uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    ts timestamptz NOT NULL DEFAULT now(),
    cpu_pct real NOT NULL DEFAULT 0,
    ram_pct real NOT NULL DEFAULT 0,
    load_1 real NOT NULL DEFAULT 0,
    load_5 real NOT NULL DEFAULT 0,
    load_15 real NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS node_metrics_lookup_idx ON node_metrics (node_id, ts DESC);

  /* Global panel configuration key-value storage */
  CREATE TABLE IF NOT EXISTS system_settings (
    key   text PRIMARY KEY,
    value text NOT NULL
  );

  /* System Announcements */
  CREATE TABLE IF NOT EXISTS announcements (
    id             uuid PRIMARY KEY,
    type           text NOT NULL DEFAULT 'info',
    title          text NOT NULL,
    content        text NOT NULL,
    enabled        boolean NOT NULL DEFAULT true,
    dismissible    boolean NOT NULL DEFAULT false,
    enabled_start  timestamptz,
    enabled_end    timestamptz,
    dismissible_end timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS announcements_enabled_idx ON announcements (enabled, created_at DESC);

  /* NAT port forwards (host port -> container port), freed on instance delete. */
  CREATE TABLE IF NOT EXISTS port_forwards (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id    uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    host_port      integer NOT NULL UNIQUE,
    container_port integer NOT NULL DEFAULT 22,
    container_ip   text NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS port_forwards_instance_idx ON port_forwards (instance_id);
  ALTER TABLE port_forwards ADD COLUMN IF NOT EXISTS container_ip text NOT NULL DEFAULT '';
  ALTER TABLE port_forwards ADD COLUMN IF NOT EXISTS protocol text NOT NULL DEFAULT 'tcp';
  ALTER TABLE port_forwards ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
  ALTER TABLE port_forwards ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'custom';
  /* Port 22 is reserved for the SSH flow, so any such row is an SSH forward. */
  UPDATE port_forwards SET kind = 'ssh' WHERE kind = 'custom' AND container_port = 22;

  /* OAuth providers (generic OAuth2 / OIDC) for login and account linking */
  CREATE TABLE IF NOT EXISTS oauth_providers (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 text NOT NULL,
    description          text NOT NULL DEFAULT '',
    client_id            text NOT NULL DEFAULT '',
    client_secret        text NOT NULL DEFAULT '',
    auth_url             text NOT NULL DEFAULT '',
    token_url            text NOT NULL DEFAULT '',
    info_url             text NOT NULL DEFAULT '',
    basic_auth           boolean NOT NULL DEFAULT false,
    scopes               text NOT NULL DEFAULT '',
    identifier_path      text NOT NULL DEFAULT '$.sub',
    email_path           text NOT NULL DEFAULT '$.email',
    username_path        text NOT NULL DEFAULT '',
    first_name_path      text NOT NULL DEFAULT '',
    last_name_path       text NOT NULL DEFAULT '',
    avatar_url_template  text NOT NULL DEFAULT '',
    overwrite_avatars    boolean NOT NULL DEFAULT false,
    login_only           boolean NOT NULL DEFAULT false,
    link_viewable        boolean NOT NULL DEFAULT true,
    user_manageable      boolean NOT NULL DEFAULT true,
    enabled              boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS oauth_links (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES oauth_providers(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    identifier  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
  );
  CREATE UNIQUE INDEX IF NOT EXISTS oauth_links_provider_identifier_idx ON oauth_links (provider_id, identifier);
  CREATE INDEX IF NOT EXISTS oauth_links_user_idx ON oauth_links (user_id);

  /* Short-lived OAuth authorization states (CSRF + PKCE verifier store) */
  CREATE TABLE IF NOT EXISTS oauth_states (
    token_hash    text PRIMARY KEY,
    provider_id   uuid NOT NULL REFERENCES oauth_providers(id) ON DELETE CASCADE,
    user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
    mode          text NOT NULL DEFAULT 'login',
    code_verifier text NOT NULL,
    expires_at    timestamptz NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
  );

  /* OS template groups for distribution categorization */
  CREATE TABLE IF NOT EXISTS os_groups (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    description text NOT NULL DEFAULT '',
    logo        text NOT NULL DEFAULT 'linux',
    enabled     boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
  );

  /* OS templates for VPS provisioning (aliases on images.linuxcontainers.org) */
  CREATE TABLE IF NOT EXISTS os_templates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    uuid REFERENCES os_groups(id) ON DELETE SET NULL,
    name        text NOT NULL,
    version     text NOT NULL DEFAULT '1.00',
    os          text NOT NULL DEFAULT '',
    release     text NOT NULL DEFAULT '',
    arch        text NOT NULL DEFAULT 'amd64',
    variant     text NOT NULL DEFAULT 'cloud',
    image_alias text NOT NULL,
    enabled     boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE os_templates ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES os_groups(id) ON DELETE SET NULL;
  ALTER TABLE os_templates ADD COLUMN IF NOT EXISTS version text NOT NULL DEFAULT '1.00';
  ALTER TABLE os_templates ADD COLUMN IF NOT EXISTS cloud_init boolean NOT NULL DEFAULT true;
  ALTER TABLE os_templates ADD COLUMN IF NOT EXISTS uefi boolean NOT NULL DEFAULT false;
  ALTER TABLE os_templates ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
  ALTER TABLE os_templates ADD COLUMN IF NOT EXISTS eol_date date;
  ALTER TABLE os_templates ADD COLUMN IF NOT EXISTS eol_action text NOT NULL DEFAULT 'none';
  ALTER TABLE os_templates ADD COLUMN IF NOT EXISTS eol_action_days integer NOT NULL DEFAULT 60;
  ALTER TABLE os_templates ADD COLUMN IF NOT EXISTS eol_warning text NOT NULL DEFAULT 'none';
  ALTER TABLE os_templates ADD COLUMN IF NOT EXISTS eol_warning_days integer NOT NULL DEFAULT 90;
  CREATE UNIQUE INDEX IF NOT EXISTS os_templates_alias_idx ON os_templates (image_alias, arch);

  /* Infrastructure Locations */
  CREATE TABLE IF NOT EXISTS locations (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    short_code   text NOT NULL UNIQUE,
    name         text NOT NULL,
    description  text NOT NULL DEFAULT '',
    country_code text NOT NULL DEFAULT 'US',
    city         text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
  );

  /* Infrastructure Nodes */
  CREATE TABLE IF NOT EXISTS nodes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL UNIQUE,
    fqdn            text NOT NULL,
    ip_address      text NOT NULL,
    port            integer NOT NULL DEFAULT 8443,
    location_id     uuid REFERENCES locations(id) ON DELETE SET NULL,
    is_public       boolean NOT NULL DEFAULT true,
    maintenance     boolean NOT NULL DEFAULT false,
    memory_limit_mb integer NOT NULL DEFAULT 16384,
    disk_limit_gb   integer NOT NULL DEFAULT 250,
    cpu_cores       integer NOT NULL DEFAULT 8,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS nodes_location_idx ON nodes (location_id);
  /* Public address users connect to (SSH forwards); panel metadata, not daemon config. */
  ALTER TABLE nodes ADD COLUMN IF NOT EXISTS public_ip text NOT NULL DEFAULT '';
  ALTER TABLE nodes ADD COLUMN IF NOT EXISTS primary_network text NOT NULL DEFAULT 'incusbr0';
  ALTER TABLE nodes ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
  ALTER TABLE nodes ADD COLUMN IF NOT EXISTS cpu_model text NOT NULL DEFAULT '';
  ALTER TABLE nodes ADD COLUMN IF NOT EXISTS cpu_display text NOT NULL DEFAULT '';
  ALTER TABLE nodes ADD COLUMN IF NOT EXISTS server_limit integer NOT NULL DEFAULT 0;
  ALTER TABLE nodes ADD COLUMN IF NOT EXISTS storage_enabled boolean NOT NULL DEFAULT true;
  /* Task audit fields on activity_logs */
  ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS node_id uuid REFERENCES nodes(id) ON DELETE SET NULL;
  ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS instance_id uuid REFERENCES instances(id) ON DELETE SET NULL;
  ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
  ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS duration_ms integer;
  ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS progress integer DEFAULT 100;
  ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS status text DEFAULT 'success';
  CREATE INDEX IF NOT EXISTS activity_logs_node_idx ON activity_logs (node_id, created_at DESC);
  /* Instances live on a node; older rows predate the column and stay unassigned. */
  ALTER TABLE instances ADD COLUMN IF NOT EXISTS node_id uuid REFERENCES nodes(id) ON DELETE SET NULL;
  /* Admin suspension carries a reason shown to the owner; NULL means not suspended. */
  ALTER TABLE instances ADD COLUMN IF NOT EXISTS suspend_reason text;
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

  // Seed default OS templates if none exist
  const tplCount = await queryOne<{ count: string }>('SELECT count(*) FROM os_templates')
  if (tplCount && Number(tplCount.count) === 0) {
    await query(
      `INSERT INTO os_templates (name, version, os, release, arch, variant, image_alias)
       VALUES
         ('Ubuntu Server', '24.04 LTS (Noble Numbat)', 'Ubuntu', 'noble', 'amd64', 'Minimal', 'ubuntu/noble/cloud'),
         ('Ubuntu Server', '22.04 LTS (Jammy Jellyfish)', 'Ubuntu', 'jammy', 'amd64', 'Minimal', 'ubuntu/jammy/cloud'),
         ('Debian', '13 (Trixie)', 'Debian', 'trixie', 'amd64', 'Minimal', 'debian/trixie/cloud'),
         ('AlmaLinux', '9', 'Almalinux', '9', 'amd64', '', 'almalinux/9/cloud')`,
    )
  }


  // Seed default local incus socket node if none exist using actual host hardware
  const nodeCount = await queryOne<{ count: string }>('SELECT count(*) FROM nodes')
  if (nodeCount && Number(nodeCount.count) === 0) {
    const cores = os.cpus().length || 4
    const memoryMb = Math.round(os.totalmem() / (1024 * 1024)) || 4096
    let diskGb = 100
    try {
      const stats = statfsSync('/')
      diskGb = Math.round((stats.blocks * stats.bsize) / (1024 * 1024 * 1024)) || 100
    } catch {
      // fallback
    }

    await query(
      `INSERT INTO nodes (name, fqdn, ip_address, port, location_id, is_public, maintenance, memory_limit_mb, disk_limit_gb, cpu_cores)
       VALUES ('local-incus', 'localhost', '127.0.0.1', 8443, NULL, true, false, $1, $2, $3)`,
      [memoryMb, diskGb, cores],
    )
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
  username?: string | null
  first_name?: string | null
  last_name?: string | null
  language?: string | null
  external_id?: string | null
  is_frozen?: boolean
  is_suspended?: boolean
  theme_mode?: string | null
  theme_preset?: string | null
  password_hash: string | null
  avatar_url?: string | null
  email_verified_at: Date | string | null
  is_admin: boolean
  port_forward_limit?: number | null
  created_at: Date | string
}

export interface OAuthProviderRow {
  id: string
  name: string
  description: string
  client_id: string
  client_secret: string
  auth_url: string
  token_url: string
  info_url: string
  basic_auth: boolean
  scopes: string
  identifier_path: string
  email_path: string
  username_path: string
  first_name_path: string
  last_name_path: string
  avatar_url_template: string
  overwrite_avatars: boolean
  login_only: boolean
  link_viewable: boolean
  user_manageable: boolean
  enabled: boolean
  created_at: Date | string
  updated_at: Date | string
}

export interface OAuthLinkRow {
  id: string
  provider_id: string
  user_id: string
  identifier: string
  created_at: Date | string
  last_used_at: Date | string | null
}

export interface OsTemplateRow {
  id: string
  group_id?: string | null
  name: string
  version?: string
  os: string
  release: string
  arch: string
  variant: string
  image_alias: string
  cloud_init?: boolean
  uefi?: boolean
  description?: string
  eol_date?: string | null
  eol_action?: string
  eol_action_days?: number
  eol_warning?: string
  eol_warning_days?: number
  enabled: boolean
  group_name?: string
  group_logo?: string
  created_at: Date | string
  updated_at: Date | string
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
  hostname?: string
  timezone?: string
  swap_mb?: number
  dns_servers?: unknown
  node_id?: string | null
  suspend_reason?: string | null
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
