# HANDOFF — Solstice Host (incus-vps-panel)

Written 2026-09-18. Read `MEMORY.md` in this repo **first** — it contains environment-specific traps (IPv6 Vite, Postgres port 5433, `/tmp` tmpfs, Playwright tab throttling, etc.) that will cost hours if rediscovered.

## 1. What this project is

A customer-facing, multi-tenant VPS hosting control panel backed by **Incus** (system containers + VMs). The `.omo/drafts/incus-vps-panel.md` file contains the full product plan draft (components C1–C6, assumptions A1–A14, findings from three research lanes, decisions with rationale, scope in/out).

Current state: **the auth + panel shell is done; the Incus control plane is not started.**

The panel is currently a polished React SPA with working passwordless auth (email link+code login, passkeys), account management, and an empty dashboard ("provisioning is not connected yet").

## 2. Stack (as built)

- **Monorepo**: npm workspaces (`apps/web`, `apps/api`)
- **Backend**: Node 24 runs `.ts` directly (no build step). Hono + `@hono/node-server`. Postgres via `pg`. WebAuthn via `@simplewebauthn/server`. No tsx, no better-sqlite3.
  - `apps/api/src/index.ts` — entrypoint, `node --env-file-if-exists=.env`
  - `apps/api/src/app.ts` — all routes (~1100 lines)
  - `apps/api/src/db.ts` — schema + `migrate()` (runs on every boot), `SCHEMA` const inlined
  - `apps/api/src/{session,two-factor,verification,email-change,passkeys,rate-limit,mail,secret}.ts` — domain modules, each with a matching `.test.ts`
- **Frontend**: React + Vite + TypeScript + Tailwind v4 + shadcn-style UI primitives (`apps/web/src/components/ui/`), Phosphor icons, Radix. Dark-first "ops console" design. `@/` path alias → `src`.
  - Routes in `apps/web/src/App.tsx`. Pages in `apps/web/src/pages/`.
  - The Vite `/api` dev proxy lives in `vite.config.ts`.
- **Database**: Postgres 17 on **port 5433** (NOT 5432 — that port belongs to an unrelated service). Role `solstice` has CREATEDB (tests build/drop a DB per file). Connection string in `apps/api/.env` (gitignored; `.env.example` is the template).
- **Deployment**: `solstice-api.service` (systemd) runs `node src/index.ts` directly, NO `--watch`. Restarting it: `sudo systemctl restart solstice-api.service`. For dev auto-reload use `npm run dev` instead — stopping the service first.

## 3. Just-completed work: passwordless auth (UNCOMMITTED)

The whole working tree is one big uncommitted change: **passwords and 2FA (email OTP toggle, TOTP, recovery codes) were removed. Login is now email-issued magic link + 6-digit code in a single email; passkeys remain as the alternative login.**

The API service was restarted after this work, so the running server already serves the new flow.

### API surface now
- `POST /api/auth/register` — `{name, email}` only (no password), then verification email
- `POST /api/auth/login` — `{email, remember?}` → always `{ok:true}` (anti-oracle; sends link+code if account exists+verified, resends verification if unverified)
- `POST /api/auth/login/verify` — `{email, code}` → session
- `POST /api/auth/login/link` — `{token}` (the magic link) → session
- `POST /api/auth/login/resend` — `{email, remember?}` → reissues challenge
- **Removed**: `/forgot-password`, `/reset-password`, `/change-password`, `/two-factor`, `/totp/*`, recovery codes
- Password gates **removed** from: passkey register/remove, change-email (still proves the new address by code + warns the old)
- `publicUser` no longer returns `emailOtpEnabled`/`totpEnabled`

### Schema changes (`apps/api/src/db.ts`)
- `users.password_hash` → nullable, never written; `email_otp_enabled_at`, `totp_secret`, `totp_enabled_at`, `totp_last_step` dropped
- `recovery_codes`, `password_resets` tables dropped
- `login_challenges` gains nullable `link_hash` + unique index (code and link share one row; consuming either retires both)

### Frontend changes
- `login.tsx` — email step → "Check your email" code screen; magic link lands on `/login?token=...` and auto-submits; passkey button kept
- `register.tsx` — no password fields
- `account.tsx` — password change, email-2FA, and authenticator-app panels removed; passkeys is now its own panel; email-change dialog has no password field
- `api.ts` — types/calls trimmed, `loginLink` added
- Deleted: `forgot-password.tsx`, `reset-password.tsx`, `password-strength.tsx`, `lib/password.ts`
- Legal copy updated (privacy, cancel-email-change) to reflect passwordless

### Tests
- `auth.test.ts` rewritten as passwordless-login suite (92 tests total across all files pass)
- `password.test.ts`, `totp.test.ts` deleted; passkeys + email-change tests updated
- Run: `npm test` in `apps/api` (needs Postgres up; loads `.env`; server must be running)

### Verification status
- `npm test` (apps/api): 92/92 pass
- `npm run typecheck`, `npm run lint`, `npm run build`: all clean
- Browser e2e verified live: register→verify→dashboard, sign-in by code, sign-in by magic link, email change without password, account page shows only Profile/Passkeys/Sessions/Danger zone
- Diff URL (ephemeral, ~7 days): was shared in Discord as critique link

## 4. DECISION MADE — pending action (do this next)

The user chose: **"Plan it properly first"** before writing Incus code.

Given that, the handoff task for the next agent is:

1. Run **Metis gap analysis** on `.omo/drafts/incus-vps-panel.md` (intent was marked `unclear`; the plan agent should resolve ambiguities against the actual repo state — the draft assumed a Go control plane, but the repo is Node 24 + Hono + TS, and the draft predates the passwordless auth rework).
2. **Override earlier**: TypeScript control plane in the current API is the likely direction (see §6), but confirm via the analysis.
3. Write the full plan to `.omo/plans/incus-vps-panel.md` (the draft's frontmatter says: write plan → Metis gap analysis → todo waves → human TL;DR → dual high-accuracy review with momus + independent oracle before delivery).
4. Present the plan TL;DR to the user for approval **before** implementing.

## 5. Incus availability on this box

- `incus` binary installed at `/usr/bin/incus`
- Daemon socket live: `/var/lib/incus/unix.socket` (group `incus-admin`)
- No Incus code exists in the repo yet (only the legal pages mention the word)

So a real local host is available for dev/verification — no stubs needed.

## 6. Design notes the planner should weigh

- The draft's `A2` (Go control plane) was written pre-repo. Current repo is TS on Node 24 with everything wired (auth, rate limiting, mail, tests, systemd). A TS control plane via `fetch`/`ws` against the Incus REST API keeps one service/test suite. Go buys the first-class client library but adds a second backend, second test story, second deploy unit.
- `A3` (React+Vite+shadcn, Phosphor) and `A13` (Docker Compose + systemd + Caddy) match the repo. Caddyfile exists at repo root.
- `A10` (containers AND VMs from day one) still stands per draft.
- Metrics/console websocket work will need the panel to hold TLS client certs per host — the draft's `A5` (direct API per host, no agent) implies cert management is in scope.
- The draft's findings cite specific Incus REST paths (`/1.0/instances`, console via `POST /1.0/instances/<n>/console`, metrics at `/1.0/metrics`, Projects as tenant boundary). The planner should re-verify the Incus version floor (draft says 6.0 LTS+, `api_extensions` feature detection).

## 7. Environment traps (TL;DR of MEMORY.md — read the full file)

- Vite binds IPv6: probe with `curl localhost:5173`, not `127.0.0.1`
- Postgres on 5433, `solstice` role needs CREATEDB
- API under systemd without `--watch`; systemd supervises the real app
- `/tmp` is a private tmpfs — Docker cannot mount it. Use paths under `/home/lumi`
- Box is behind NAT (LAN 192.168.50.20); expose dev via tunnel, Vite listens on `[::1]` only
- Dev site has Basic auth (`apps/web/.env`: solstice/meow)
- Playwright clicks hang when other tabs are open → close tabs + `bringToFront()`
- Use the `read` tool for images, not `look_at` (times out)
- `critique` needs `export PATH="$HOME/.bun/bin:$PATH"`
- egaki reads provider keys from stdin; no image-gen fallback
- `write` tool requires a prior `read` of the file in the same session
- Stale LSP diagnostics: check the reported line against the file's length
- Session-check 401s on `/api/auth/me` are expected console noise (React StrictMode doubles them)
- Dev mailbox: to exercise mail flows start a SECOND api with `MAIL_DIR` + no `SMTP_URL` + `DEV_MAILBOX=1` and a second Vite with `API_URL` pointed at it (leave 5173/tunnel alone)

## 8. Useful commands

```bash
npm run dev:all          # api + web dev servers
npm test                 # in apps/api — 92 tests, needs DB up
npm run typecheck        # web build + api tsc
npm run lint             # oxlint on web
npm run build            # web production build
sudo systemctl restart solstice-api.service   # deploy backend change
```

## 9. Unresolved / open items

- The entire working tree (§3) is **uncommitted** — no commit was made (user hasn't asked). Commit or branch before starting the plan.
- `scripts/backup-db.sh` is untracked (nightly pg_dump; not yet scheduled via systemd timer; never restore-tested).
- The critique diff link for §3 (if still wanted) was posted in the Discord thread.
- `.playwright-mcp/` is generated browser-automation output, gitignored.