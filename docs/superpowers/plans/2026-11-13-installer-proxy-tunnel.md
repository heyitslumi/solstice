# Installer: reverse-proxy choice + own-domain tunnel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let installers pick Caddy / Nginx / Apache / none, and use a Cloudflare named tunnel (own domain) via token alongside the quick tunnel.

**Architecture:** All changes are in the bash installer `install.sh` plus two new vhost templates in `deploy/`. The proxy step becomes `setup_proxy` dispatching on `$PROXY` (caddy|nginx|apache|none); tunnel mode gains a token path that runs `cloudflared service install <token>`. Existing helpers (`ui_choose`, `ui_input`, `run_step`, `die`, `INSTALL_META`) are reused; nothing else in the repo changes.

**Tech Stack:** bash, certbot (python3-certbot-nginx / -apache), cloudflared.

**Spec:** `docs/superpowers/specs/2026-11-13-installer-proxy-tunnel-design.md`

## Global Constraints

- Default flow with no flags is unchanged: Caddy + HTTPS domain, same prompts as today.
- Never collect Cloudflare API keys/Global keys — only a tunnel token the user pastes from their dashboard.
- Existing flag aliases must keep working: `--tunnel`, `--no-caddy`, `--domain`, `--yes`.
- Installer must keep working piped (`stdin` redirected; prompts via `/dev/tty`); every new prompt must be skipped with a sane default when `--yes` or no TTY.
- Non-root panel user unchanged; proxy configs only ever touch Solstice's own files.

## Review Focus

- Piped install (no TTY): every new prompt must have a non-interactive default or flag equivalent, or die with a clear message — pin by running the installer with `--yes` and each flag path.
- Invalid `--proxy` value must die in arg parsing before any apt side effect — test: `--proxy traefik` exits with usage hint, nothing installed.
- Token mode without `--tunnel-token` and no TTY must die before install proceeds — test: `--tunnel --yes` non-interactive errors with "pass --tunnel-token".
- nginx/Apache already installed: installer must add its vhost without clobbering other sites — template writes a uniquely named file (`solstice.conf`), no default-site removal.
- certbot failure (DNS not pointed): install continues on HTTP with a printed manual command, never `die` mid-install after the panel is up.

---

### Task 1: Proxy choice — flags, prompt, templates, nginx/Apache setup

**Files:**
- Modify: `install.sh` (arg parsing ~line 160, usage ~line 130, preflight port check ~line 290, prompt_config ~line 690, main proxy dispatch ~line 755, uninstall ~line 245, summary ~line 640)
- Create: `deploy/nginx-vhost.conf.template`, `deploy/apache-vhost.conf.template`

**Interfaces:**
- Consumes: `ui_choose`, `ui_input`, `run_step`, `die`, `warn`, `$DOMAIN`, `$ADMIN_EMAIL`, `$API_PORT`, `$APP_DIR` (all existing).
- Produces: `PROXY` variable (`caddy`|`nginx`|`apache`|`none`, default `caddy`), written to `INSTALL_META` so `--upgrade`/`--uninstall` reuse it; functions `setup_nginx`, `setup_apache` called from `main`.

- [ ] **Step 1: Add templates.** `deploy/nginx-vhost.conf.template`: server block on 80, `server_name __DOMAIN__`, `location /api/ { proxy_pass http://127.0.0.1:__API_PORT__; proxy_http_version 1.1; proxy_set_header Upgrade/Connection/Host/X-Forwarded-*; }` (console needs websockets), `location / { root __APP_DIR__/apps/web/dist; try_files $uri /index.html; }`. `deploy/apache-vhost.conf.template`: same shape as `<VirtualHost *:80>` with `ProxyPreserveHost On` and `ProxyPass /api/ ws/http` split for websockets. Headers comment: "Managed by install.sh --proxy nginx; do not edit by hand."
- [ ] **Step 2: Arg parsing.** `--proxy VAL` sets `PROXY` (validate `caddy|nginx|apache|none`, else `die`); `--no-caddy` sets `PROXY=none` (alias); keep `INSTALL_CADDY` as derived var (`[ "$PROXY" = caddy ]`) so the preflight port check and verify() keep working untouched.
- [ ] **Step 3: Prompt.** In `prompt_config`, when `PROXY` unset and TTY and not `--yes`: `ui_choose "Web server" "Caddy (recommended, automatic TLS)" "Nginx" "Apache" "None - my own setup"` mapping to caddy/nginx/apache/none. Non-TTY default: caddy. `PROXY=none` skips the domain-required prompt logic (no domain needed).
- [ ] **Step 4: Implement `setup_nginx` / `setup_apache`.** If package missing, `apt-get install -y nginx` / `apache2`. Write template → `/etc/nginx/sites-available/solstice.conf` + symlink into `sites-enabled` (nginx), or `/etc/apache2/sites-available/solstice.conf` + `a2ensite` + `a2enmod proxy proxy_http proxy_wstunnel rewrite` (apache). `nginx -t` / `apachectl configtest` before reload; reload service. Then certbot: if not installed, apt-get install `certbot python3-certbot-nginx` (or `-apache`); run `certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" --redirect`; on non-zero, `warn` + print manual command, continue. Idempotent: skip certbot if `/etc/letsencrypt/live/$DOMAIN` exists.
- [ ] **Step 5: Wire into `main`.** Replace the `elif [ "$INSTALL_CADDY" -eq 1 ]` dispatch with `case "$PROXY" in caddy) setup_caddy;; nginx) setup_nginx;; apache) setup_apache;; none) log hint;; esac`. Keep quick-tunnel branch first as today.
- [ ] **Step 6: Meta + uninstall + summary.** Write `PROXY=$PROXY` to `INSTALL_META`; uninstall removes `/etc/nginx/sites-{available,enabled}/solstice.conf` and `/etc/apache2/sites-available/solstice.conf` + `a2dissite` (packages left). Summary line prints chosen proxy.
- [ ] **Step 7: Checks.** `bash -n install.sh` and `shellcheck -x install.sh` clean; `--proxy traefik --yes` dies in parsing with no install attempted (run with `--uninstall` guard or in sandbox).
- [ ] **Step 8: Commit** `feat(installer): nginx/apache proxy choice with certbot TLS`.

### Task 2: Tunnel token mode (own domain)

**Files:**
- Modify: `install.sh` (arg parsing, `prompt_config`, `setup_tunnel`, summary, `solstice status` CLI block)

**Interfaces:**
- Consumes: existing `ui_choose`, `cloudflared` install code in `setup_tunnel`.
- Produces: `TUNNEL_TOKEN` variable; `MODE` concept: `quick` (today's `--tunnel`) vs `token` vs `proxy` path; `install.meta` gains `TUNNEL_TOKEN_SET=1` (never store the token).

- [ ] **Step 1: Flag.** `--tunnel-token TOKEN` sets `TUNNEL_TOKEN`, implies tunnel mode. Validation: token must be non-empty (no format check — CF tokens are opaque base64).
- [ ] **Step 2: Prompt.** When tunnel mode requested without token and TTY and not `--yes`: `ui_choose "Tunnel type" "Quick tunnel (no account, random URL)" "Own domain (paste a Cloudflare tunnel token)"`. Own-domain: `ui_input "Tunnel token"` (password-style ok) + `ui_input "Public hostname"` (required; used for `app_url`/mail relay domain since a token tunnel has no URL to grep). Non-TTY without token/hostname: die with flag hints.
- [ ] **Step 3: Implement token path in `setup_tunnel`.** Install cloudflared (existing code). Run `cloudflared service install "$TUNNEL_TOKEN"`; `systemctl enable --now cloudflared`; check active + `journalctl -u cloudflared` shows registered connection within 60s (warn-only on grep, hard-fail only if service inactive). Public URL = `https://$DOMAIN` (user's own domain, CNAME handled by their tunnel config).
- [ ] **Step 4: Wire through.** `verify`/`write_settings`/`write_mail_settings`/`summary` treat token mode like the domain path (`url=https://$DOMAIN`) except no Caddy/HTTPS front-door check (the tunnel is the front door): reuse the `TUNNEL=0 && INSTALL_CADDY=1` guard shape — token mode skips the direct HTTPS probe. `solstice status` prints "Panel: https://$DOMAIN (Cloudflare tunnel)" for token mode.
- [ ] **Step 5: Checks.** `bash -n` + `shellcheck` clean; `--tunnel --yes` without TTY/token dies with hint; interactive prompt path shows both options (sandbox test).
- [ ] **Step 6: Commit** `feat(installer): own-domain Cloudflare tunnel via token`.

### Task 3: End-to-end verification on a disposable VM

**Files:** none (verification only).

**Interfaces:** Consumes installer as built in Tasks 1–2.

- [ ] **Step 1: Spin up a fresh Debian 12 sandbox VM** (cua sandbox or any throwaway box), run `install.sh --proxy nginx --domain <test-domain> --admin-email ... --yes` (mail relay will warn-fail without DNS — acceptable) and confirm: nginx installed, `solstice.conf` present, certbot attempted, panel reachable via local curl through nginx.
- [ ] **Step 2: Re-run with `--proxy caddy` flow** (default, no flags + TTY) to confirm prompts appear and default flow unchanged; abort before install completes if the box is disposable-only.
- [ ] **Step 3: Quick-tunnel + token paths** — quick tunnel on the sandbox (no domain needed); token mode only smoke-tested to the "cloudflared service install" call shape with a dummy token (fails cleanly with the warn path, does not hang).
- [ ] **Step 4: Uninstall** on the sandbox removes nginx site file and leaves other packages.
- [ ] **Step 5: Ship.** Merge to main; landing worker serves `/install.sh` from raw main (60s cache) so solstice.host/install.sh picks it up automatically — curl the new script and diff against local `install.sh` to confirm propagation.
