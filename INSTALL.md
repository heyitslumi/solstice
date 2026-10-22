# Installing the panel

One command on a fresh Debian 12/13 or Ubuntu 22.04/24.04 box, as root, from the repo root:

```bash
sudo ./install.sh --domain panel.example.com --admin-email you@example.com
```

Or without a domain (Cloudflare quick tunnel, URL rotates — fine for trying it out):

```bash
sudo ./install.sh --tunnel --admin-email you@example.com
```

What it does:

1. Installs Node 24, Postgres, Caddy (domain mode) or cloudflared (tunnel mode), and Incus (`incus admin init --auto`, unless `--no-incus`).
2. Creates a `panel` Postgres role + database (or uses `--db-url`).
3. Installs JS dependencies and builds the web UI.
4. Writes `apps/api/.env` (skipped if it already exists) with a random DB password, your admin email, and `TRUST_PROXY=1`.
5. Installs and starts `solstice-api.service` (plus `solstice-web.service` + `solstice-tunnel.service` in tunnel mode).
6. In domain mode, writes `/etc/caddy/Caddyfile`: static build + `/api` reverse proxy (console websockets included) with automatic TLS.
7. Records the public URL in settings (`app_url`, `webauthn_origin`, `webauthn_rp_id`). In tunnel mode a supervisor keeps these in sync across URL rotations.

Then:

1. Open the printed URL and **register with your admin email** — you're admin immediately, no restart needed.
2. No SMTP yet? The sign-in code is in `data/mail/` on the host as `.eml` files.
3. As admin, review Settings: name/tagline, mail provider, captcha, legal URLs.

Notes:

- Incus must be local — the API talks to `/var/lib/incus/unix.socket` (`INCUS_SOCKET_PATH` overrides).
- The tunnel URL changes on every restart; domain mode is the real deployment.
- `scripts/backup-db.sh` handles nightly Postgres dumps; point it at your backup dir.
