# Installer: reverse-proxy choice + own-domain tunnel

## Intent
Users without Caddy (nginx/Apache shops) and users who want a stable domain via Cloudflare Tunnel
currently have no supported path. Add both to `install.sh` while keeping the default flow identical.

## Goals
- Prompt "Web server": Caddy (recommended) / Nginx / Apache / None — my own setup.
- Flags: `--proxy caddy|nginx|apache|none`; `--no-caddy` kept as alias for `none`.
- Nginx/Apache path: apt-install if missing, write vhost from a `deploy/` template, enable + reload.
- TLS on nginx/Apache: install certbot, run non-interactively with the admin email; on failure fall
  back to HTTP and print the one manual command.
- Tunnel prompt: Quick tunnel (no account, random URL) / Own domain via Cloudflare tunnel token.
  Flags: `--tunnel-token TOKEN`. Token mode: `cloudflared service install <token>`; ask for the
  public hostname (for `app_url` + mail relay domain). No API keys collected.
- Default flow (no flags) unchanged: Caddy, HTTPS domain.

## Non-goals
- Full-auto tunnel creation via CF API (FeatherPanel's Global API Key approach — bad practice).
- Registry choice, dev branches, auto-update config menu, socat updater.
- Support for proxies other than Caddy/nginx/Apache (traefik etc. → "None" + hint).

## Approach (picked)
Template-and-certbot for nginx/Apache; token-based named tunnel. Alternatives rejected: FeatherPanel
Docker/compose base (wrong architecture), HTTP-only vhosts (downgrade from Caddy), CF API full-auto
(key handling in a piped script).

## Builder notes
- Only `install.sh` + new `deploy/nginx-vhost.conf.template` + `deploy/apache-vhost.conf.template`.
- Reuse existing `ui_choose`/`ui_input`/`run_step`/`die` helpers and install.meta persistence.
- Uninstall/upgrade paths must handle the new services (`solstice-tunnel` already handled; nginx/
  apache site files removed on uninstall, packages left alone).
- certbot plugins: `certbot` + `python3-certbot-nginx` / `python3-certbot-apache`.
- Verify step: HTTPS check works for caddy; for token-tunnel mode check local API + service active;
  for nginx/apache check `https://$DOMAIN` after certbot (or HTTP if certbot fell back).
