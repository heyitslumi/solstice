# Solstice VPS Panel — Complete Installation Guide

> A production-ready, multi-tenant VPS control panel backed by **Incus** (LXC + KVM).  
> Built with: **Node 24**, **PostgreSQL**, **React 19 + Vite 8 + Tailwind v4**, **Hono**, **TypeScript**.

---

## Quick Start (One-Command Install)

### With a Domain (Production — Caddy + Auto TLS)
```bash
sudo ./install.sh --domain panel.yourdomain.com --admin-email you@example.com
```

### Without a Domain (Quick Test — Cloudflare Tunnel)
```bash
sudo ./install.sh --tunnel --admin-email you@example.com
```

### Interactive Mode (No Flags)
```bash
sudo ./install.sh
```
> Gum-powered prompts walk you through everything.

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Debian 12/13, Ubuntu 22.04/24.04 (fresh) | Debian 13 (Trixie) |
| **Arch** | x86_64 (amd64) | x86_64 |
| **RAM** | 2 GB | 4 GB+ |
| **Disk** | 20 GB free | 50 GB+ |
| **CPU** | 2 vCPU | 4+ vCPU (for KVM guests) |
| **Network** | Public IPv4 + IPv6 | Public IPv4 + IPv6 |
| **Root** | Required | Required |

> **Nested Virtualization**: If installing on a VM (e.g., Incus, Proxmox, AWS, Hetzner), ensure the host exposes nested KVM (`/dev/kvm` must be present and writable by the `incus-admin` group). For production KVM guests, run on bare metal or a provider that supports nested virt.

---

## What the Installer Does

| Step | Description |
|------|-------------|
| 1 | Installs **Node 24** (NodeSource) |
| 2 | Installs **PostgreSQL** (or uses your `--db-url`) + creates `panel` role + DB |
| 3 | Installs **Incus** (via Zabbly repo) + `incus admin init --auto` (skipped with `--no-incus`) |
| 4 | Installs **Caddy** (domain mode) or **cloudflared** (tunnel mode) |
| 5 | `npm ci` + builds the React web UI (`npm run build --workspace @solstice/web`) |
| 6 | Generates `apps/api/.env` with DB URL, admin email, `TRUST_PROXY=1` |
| 7 | Installs & starts systemd services: `solstice-api.service` (+ `solstice-web` + `solstice-tunnel` in tunnel mode) |
| 8 | Configures Caddyfile (domain) or waits for tunnel URL |
| 9 | Writes public URL → `system_settings` (`app_url`, `webauthn_origin`, `webauthn_rp_id`) |

---

## Installer Flags Reference

| Flag | Required | Description |
|------|----------|-------------|
| `--domain HOST` | One of `--domain` or `--tunnel` | Public hostname (e.g. `panel.example.com`) — Caddy provisions automatic TLS via Let's Encrypt |
| `--tunnel` | One of `--domain` or `--tunnel` | Use Cloudflare Quick Tunnel (`trycloudflare.com`) — zero config, URL rotates on restart |
| `--admin-email EMAIL` | Yes | Operator email; registering with this email makes you admin immediately |
| `--db-url URL` | No | Reuse existing PostgreSQL (format: `postgres://user:pass@host:port/db`) |
| `--no-incus` | No | Skip Incus install/init (panel only, no local workloads) |
| `--app-dir DIR` | No | Target directory (default: current working directory) |
| `--yes` | No | Non-interactive; answer yes to all confirmations |

---

## Post-Install Steps

1. **Open the printed URL** (domain or tunnel URL)
2. **Register with your `--admin-email`** — you become admin instantly, no restart needed
3. **No SMTP configured?** Sign-in codes are saved as `.eml` files in `$APP_DIR/data/mail/` on the host
4. **As admin, review Settings** (`/settings` or admin panel):
   - Panel name & tagline
   - Mail provider (SMTP)
   - Captcha (Turnstile/hCaptcha/reCAPTCHA)
   - Legal URLs (ToS, Privacy, AUP)
   - OAuth providers (GitHub, Google, Discord, etc.)

---

## Manual / Step-by-Step Install (If You Prefer Control)

### 1. System Packages & Node 24
```bash
sudo apt update -y && sudo apt upgrade -y
sudo apt install -y curl git build-essential ca-certificates gnupg openssl
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
sudo apt install -y nodejs
```

### 2. PostgreSQL
```bash
sudo apt install -y postgresql postgresql-client
DB_PASS="$(openssl rand -hex 24)"
sudo -u postgres psql -c "CREATE USER panel WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "CREATE DATABASE panel OWNER panel;"
DB_URL="postgres://panel:$DB_PASS@127.0.0.1:5432/panel"
```

### 3. Incus (Zabbly Repo — Latest Stable)
```bash
curl -fsSL https://pkgs.zabbly.com/key.asc -o /etc/apt/keyrings/zabbly.asc
cat > /etc/apt/sources.list.d/zabbly-incus-stable.sources <<EOF
Enabled: yes
Types: deb
URIs: https://pkgs.zabbly.com/incus/stable
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: main
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/zabbly.asc
EOF
sudo apt update -qq
sudo apt install -y -qq incus
sudo incus admin init --auto
# Ensure defaults exist
incus storage show default >/dev/null 2>&1 || incus storage create default dir
incus network show incusbr0 >/dev/null 2>&1 || incus network create incusbr0
incus profile device show default root >/dev/null 2>&1 || incus profile device add default root disk path=/ pool=default
incus profile device show default eth0 >/dev/null 2>&1 || incus profile device add default eth0 nic network=incusbr0 name=eth0
```

### 4. Clone & Build
```bash
git clone https://github.com/heyitslumi/solstice.git
cd solstice
npm ci --no-audit --no-fund
npm run build --workspace @solstice/web
```

### 5. Configure API Environment
```bash
cat > apps/api/.env <<EOF
PORT=8788
DATABASE_URL=$DB_URL
ADMIN_EMAILS=you@example.com
TRUST_PROXY=1
EOF
chmod 600 apps/api/.env
```

### 6. Systemd Services
```bash
mkdir -p data
sed "s#__APP_DIR__#$(pwd)#g" deploy/solstice-api.service > /etc/systemd/system/solstice-api.service
systemctl daemon-reload
systemctl enable --now solstice-api.service
```

### 7. Frontend (Choose One)

#### Domain Mode (Caddy)
```bash
# Install Caddy
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy-stable.list
apt update -qq && apt install -y -qq caddy

# Configure
sed -e "s#__DOMAIN__#panel.yourdomain.com#g" -e "s#__APP_DIR__#$(pwd)#g" deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy
```

#### Tunnel Mode (Cloudflare Quick Tunnel)
```bash
# Install cloudflared
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb || apt-get install -f -y -qq

# Services
sed "s#__APP_DIR__#$(pwd)#g" deploy/solstice-web.service > /etc/systemd/system/solstice-web.service
sed "s#__APP_DIR__#$(pwd)#g" deploy/solstice-tunnel.service > /etc/systemd/system/solstice-tunnel.service
sed "s#__APP_DIR__#$(pwd)#g" scripts/tunnel.sh > /usr/local/bin/solstice-tunnel.sh
chmod +x /usr/local/bin/solstice-tunnel.sh
systemctl daemon-reload
systemctl enable --now solstice-web.service solstice-tunnel.service

# Wait for URL (check journalctl -u solstice-tunnel.service)
```

### 8. Record Public URL in DB
```bash
TUNNEL_URL="https://panel.yourdomain.com"  # or the trycloudflare URL
PGPASSWORD="your-db-password" psql "$DB_URL" -c "
INSERT INTO system_settings (key, value) VALUES
  ('app_url', '$TUNNEL_URL'),
  ('webauthn_origin', '$TUNNEL_URL'),
  ('webauthn_rp_id', '${TUNNEL_URL#https://}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;"
```

---

## Configuration Reference

### `apps/api/.env` (Generated by installer, editable)
```bash
PORT=8788                          # API port
DATABASE_URL=postgres://...        # PostgreSQL connection string
ADMIN_EMAILS=you@example.com       # Comma-separated; these emails become admin on first register
TRUST_PROXY=1                      # Trust X-Forwarded-* headers (required behind Caddy/tunnel)
SMTP_URL=smtp://user:pass@host:587 # Optional: Fastmail/Postmark/SendGrid/etc.
SMTP_REQUIRE_TLS=1                 # Require STARTTLS
MAIL_FROM="Panel <no-reply@you.com>" # From address
RATE_LIMIT_STORE=memory            # or "redis" with REDIS_URL
PUBLIC_ORIGIN=https://panel.you.com # CORS origin for WebAuthn/passkeys
DEV_MAILBOX=0                      # 1 = write .eml files to data/mail/ (no SMTP)
MAIL_DIR=./data/mail               # Where .eml files go when DEV_MAILBOX=1
```

### `apps/web/.env`
```bash
API_URL=https://panel.yourdomain.com  # Must match public URL for cookies/auth
```

### Database Settings (Admin UI → Settings)
| Key | Description |
|-----|-------------|
| `app_name` | Panel display name |
| `app_tagline` | Short tagline |
| `mail_provider` | `smtp` or `dev` |
| `smtp_*` | SMTP credentials (masked in UI) |
| `captcha_provider` | `turnstile`, `hcaptcha`, `recaptcha`, `none` |
| `captcha_site_key` / `captcha_secret_key` | Provider keys |
| `legal_tos_url` / `legal_privacy_url` / `legal_aup_url` | Footer links |

---

## Incus Requirements & Permissions

- The API connects to **`/var/lib/incus/unix.socket`** (override with `INCUS_SOCKET_PATH`)
- The service user (default: root via systemd) must be in the **`incus-admin` group** or have socket access
- For multi-host: each host runs its own Incus; the panel manages them via projects + REST
- Nested KVM: ensure `/dev/kvm` exists and is accessible (`chmod 660 /dev/kvm; chown root:incus-admin /dev/kvm`)

---

## Backup & Maintenance

### Database Backup (Nightly via Cron)
```bash
# scripts/backup-db.sh creates timestamped dumps
# Usage: ./scripts/backup-db.sh /path/to/backup/dir
# Add to crontab:
# 0 3 * * * /opt/solstice/scripts/backup-db.sh /var/backups/solstice
```

### Update Panel
```bash
cd /opt/solstice
git pull
npm ci --no-audit --no-fund
npm run build --workspace @solstice/web
systemctl restart solstice-api
# Domain mode: systemctl reload caddy
# Tunnel mode: systemctl restart solstice-web solstice-tunnel
```

### Logs
```bash
journalctl -u solstice-api -f
journalctl -u solstice-web -f
journalctl -u solstice-tunnel -f
journalctl -u caddy -f
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `npm ci` fails with native modules | `npm install --foreground-scripts` or ensure `build-essential` + `python3` installed |
| WebAuthn/passkeys fail | Check `PUBLIC_ORIGIN` / `webauthn_origin` / `webauthn_rp_id` match public URL exactly (no trailing slash) |
| Caddy TLS fails | Ensure DNS A/AAAA records point to server; port 80/443 open; Caddy has internet access |
| Tunnel URL not showing | `journalctl -u solstice-tunnel -f` — wait up to 60s; check cloudflared logs |
| Incus commands fail | `incus info` as the service user; verify socket perms; check `incus-admin` group membership |
| SMTP not sending | Test with `DEV_MAILBOX=1` first; check `SMTP_URL` encoding (`@` → `%40`); verify TLS port |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Caddy / cloudflared                   │
│                     (TLS termination, WS proxy)              │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          ▼                                 ▼
┌───────────────────────┐         ┌───────────────────────┐
│   solstice-web        │         │   solstice-api        │
│   (Vite preview /     │         │   (Hono + Node 24)    │
│    static dist)       │         │   /api/* endpoints    │
└───────────────────────┘         └───────────┬───────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
            ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
            │  PostgreSQL   │         │    Incus      │         │   SMTP /      │
            │  (panel DB)   │         │  (unix.sock)  │         │   Mail Dir    │
            └───────────────┘         └───────────────┘         └───────────────┘
```

---

## Security Notes

- **Never expose the API directly** — always behind Caddy/tunnel with `TRUST_PROXY=1`
- **Use strong `ADMIN_EMAILS`** — only these can register as admin
- **Rotate `DATABASE_URL` password** periodically; update `.env` + restart API
- **Enable SMTP** for production — `DEV_MAILBOX` is for testing only
- **Keep Node/Postgres/Incus updated** — `apt upgrade` + `npm ci` regularly
- **Backup DB nightly** — `scripts/backup-db.sh` handles this

---

## Support & Links

- **GitHub**: https://github.com/heyitslumi/solstice
- **Issues**: https://github.com/heyitslumi/solstice/issues
- **Author**: heyitslumi (hi@lumis.moe)

---

*Generated from the Solstice VPS Panel source. For the latest version, check the repo.*