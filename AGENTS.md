# AGENTS.md

Self-hosted VPS panel (Incus: LXC + KVM), an installer, and a marketing site in one
npm-workspace repo. MIT licensed.

## Layout

- `apps/api` — Hono API on Node 24. **No build step**: systemd and dev both run
  `node src/index.ts`, which strips types directly. Never add `tsc`/`tsx` to the run path.
- `apps/web` — the panel: React 19 + Vite SPA. Served same-origin with the API under `/api`.
- `apps/landing` — solstice.host, a **separate** Vite multi-page site. Not in the panel build,
  deployed on its own to Cloudflare Workers.
- `deploy/` — systemd units and Caddy/nginx/Apache templates containing `__PLACEHOLDER__`s.
  `install.sh` renders them. Edit the templates, never the installed files.
- `install.sh` — the shipped installer (also served at `solstice.host/install.sh`).
- `scripts/` — landing build checks/prerender, demo seeding, screenshot capture, dev supervisor.

## Commands

```bash
npm run dev:all                  # api + web dev servers
npm test                         # apps/api tests only (node:test); web/landing have none
npm run build                    # builds @solstice/web ONLY (tsc -b + vite)
npm run lint                     # oxlint, web workspace only
npm run build:landing            # landing build + prerender + scripts/check-landing.mjs
npm run deploy:landing           # the above, then wrangler deploy (needs CLOUDFLARE_API_TOKEN)
```

- `npm run build` is the only typecheck the panel gets in practice — the web build runs `tsc -b`.
- **`npm run typecheck` is red on `main`** (13 pre-existing errors in `apps/api`). Do not treat it
  as a gate and do not "fix" it by loosening tsconfig.
- Single API test file: `cd apps/api && node --env-file-if-exists=.env --test src/auth.test.ts`.
- Installer checks: `bash scripts/install-flags.test.sh` and `shellcheck -x install.sh`.

## Environment

- `apps/api/.env` is gitignored and required for dev. It needs `PORT=8788` — the API defaults to
  **8787** (`src/index.ts`) while the Vite dev proxy targets **8788**, so a missing `.env` looks
  like a dead proxy. Also needs `DATABASE_URL`.
- Tests are isolated per file: `src/test-db.ts` creates a scratch database, runs migrations, and
  drops it. The role in `DATABASE_URL` therefore needs `CREATEDB`. With no reachable Postgres the
  suite dies with `ECONNREFUSED`.
- Vite binds IPv6 `localhost`. Probe dev servers with `curl localhost:5173`, not `127.0.0.1`.
- In production the env file is `/etc/solstice/api.env` (written by the installer), not `.env`.

## Wiring worth knowing

- The instance console is a websocket upgrade at `/api/instances/:id/console`. Any proxy change must
  keep upgrade headers (see `deploy/*-vhost.conf.template`); Apache needs `ProxyPassMatch … ws://`
  ahead of the generic `/api/` rule, and the SPA rewrite must skip `/api/`.
- `DEMO_MODE=true` turns on one-click login (`/api/auth/demo`) and rewrites instance, node and
  activity IPs to RFC 5737 mock addresses (`mockDemoIp4/6` in `app.ts`). It is the demo box's only
  protection against leaking real addresses — never bypass it when touching those endpoints.
- Adding a landing page means four edits, not one: `apps/landing/vite.config.ts` inputs,
  `vite.config.ssr.ts` inputs, `scripts/prerender-landing.mjs` `PAGES`, and the route list in
  `scripts/check-landing.mjs`. The check fails if a page ships without built CSS/JS links, which is
  exactly the "component imported but never mounted" bug it was written for.

## Deploy

| Target | Host | Path | Serves |
|---|---|---|---|
| Production panel | `ssh -p 2250 aria` | `/root/solstice-vps-panel` | `dev.goon.codes` via nginx |
| Demo | `ssh elysia` | `/opt/solstice` | `demo.solstice.host` via Caddy, `DEMO_MODE=true` |
| Landing | Cloudflare Worker `solstice-landing` | `npm run deploy:landing` | `solstice.host/*` |

Panel deploy on either box: `git pull --ff-only && npm run build && systemctl restart solstice-web solstice-api`.

## Existing docs

- `MEMORY.md` — hard-won environment/tooling gotchas (Playwright, ports, tool quirks). Read it before
  debugging tooling; it is not stale the way prose docs usually are.
- `HANDOFF.md` — **stale** (Sept 2026; describes Incus as future work). Don't trust it.
- `docs/superpowers/{specs,plans}/` — design and plan record for larger changes; follow the same
  pattern for anything multi-step.
- `README.md` quick start is accurate for env setup; `DOCS-INSTALL.md` covers manual installs.
