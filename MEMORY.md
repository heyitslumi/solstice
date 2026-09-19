# MEMORY

## Playwright clicks hang when other tabs are open
Chrome throttles `requestAnimationFrame` in backgrounded tabs, so Playwright's element-stability check never resolves and clicks time out after 30s with "waiting for element to be visible, enabled and stable". Close every page except the active one and call `page.bringToFront()` before interacting.

## Use `read` for images, not `look_at`
`look_at` times out after 120s every time in this environment. Read image files with the `read` tool instead — it returns them as viewable attachments.

## Probe the dev server via `localhost`, not `127.0.0.1`
Vite binds IPv6 localhost here, so `curl 127.0.0.1:5173` returns `000` while `curl localhost:5173` returns `200`.

## `write` requires a prior `read` in the same session
Overwriting an existing file fails with "File already exists. Use edit tool instead." until that file has been read. Read it first, or use `edit`.

## `critique` requires bun on PATH
bun is installed to `~/.bun/bin` and added to `~/.bashrc`. Prefix critique calls with `export PATH="$HOME/.bun/bin:$PATH"`.

## egaki reads provider keys from stdin
`npx egaki login --provider fal` accepts the key on stdin, which keeps it out of process args. Verified working with fal: `fal-ai/flux-pro/v1.1-ultra` ($0.06/image) for hero-grade output, 21:9 supported.

## Image generation has no fallback here
There is no image-gen tool other than egaki, and egaki had no credentials until the fal key was added. Design skills that mandate photography will otherwise ship image-less pages.

## Node 24 needs no build step for a backend
Node 24 runs `.ts` files directly, and `node:sqlite` plus `node:crypto` scrypt are built in. A working API needs only `hono` and `@hono/node-server` — no tsx, no better-sqlite3, no argon2.

## Cast `node:sqlite` rows through `unknown`
`DatabaseSync.prepare().get()` returns `Record<string, SQLOutputValue>`, which does not overlap with your row interface. A direct `as UserRow` fails; use `as unknown as UserRow`.

## Vite proxy lives in vite.config.ts
The `/api` dev proxy must be added there, and Vite restarts itself when that file changes. A running dev server picks it up without a manual restart, but the first request after the edit can race the restart.

## Session-check 401s are expected console noise
A `/api/auth/me` endpoint returning 401 when signed out shows up in the browser console as an error, and React StrictMode doubles it in dev. It is how the SPA asks "am I signed in", not a bug.

## Postgres is on 5433, not 5432
This box runs Postgres 17 under `postgresql.service`, but its port is 5433. Port 5432 belongs to an unrelated service (`calagopus-db-ag`), so a connection string that assumes the default reaches the wrong server or nothing. The `solstice` role needs CREATEDB, because the test suite builds and drops a database per test file.

## The API runs under systemd, without `node --watch`
`solstice-api.service` runs `node src/index.ts` directly, so systemd supervises the actual app and `Restart=always` brings it back from a crash — verified by SIGKILLing it. Under `--watch` systemd would supervise the watcher instead of the app, so a dead app would still look healthy, which is how the API once stayed down unnoticed. For auto-reload while editing, stop the service and use `npm run dev`.

## The pool captures DATABASE_URL at import time
`apps/api/src/db.ts` builds the `pg.Pool` when the module is first imported, so a test needing an isolated database must set `process.env.DATABASE_URL` and only then `await import('./db.ts')`. `src/test-db.ts` does that, and drops the database in `after()` *after* closing the pool — dropping it first fails while connections are still open. Tests read `.env` through `npm test`, so they need the server running.

## PGlite's data directory is not portable to native Postgres
PGlite's WASM build is compiled without `USE_FLOAT8_BYVAL`, so a native server rejects its cluster outright with `FATAL: database files are incompatible with server`. Rescuing a damaged PGlite database with a Docker `postgres:18` is impossible however the directory is mounted, and `pg_dump` cannot reach it either. This is why the project moved to a real server: the database used to live inside the API process, so every API restart was also a database shutdown, and one unclean restart bricked the directory with no recovery path.

## `/tmp` is a private tmpfs, so Docker cannot mount it
`/tmp` here is a `systemd-private-...-kimaki.service-...` tmpfs, so anything under `/tmp/opencode/...` lives in a mount namespace Docker cannot see: `-v /tmp/x:/x` silently delivers an empty directory instead of an error. Use a path under `/home/lumi` whenever a container needs to read host files.

## Password reset links land in the dev mailbox
With `SMTP_URL` unset the API writes mail to `MAIL_DIR` (default `data/mail`) as `.eml` files rather than sending it, and `GET /api/dev/mailbox` lists them. That route only exists when `DEV_MAILBOX=1`, and it returns an empty list whenever a real relay is configured, because nothing is written to the mailbox in that mode.

## Fastmail wants the SMTP username percent-encoded
`smtp.fastmail.com:587` needs STARTTLS (`SMTP_REQUIRE_TLS=1`) and the login is the full address, so the `@` has to be escaped in `SMTP_URL` — `smtp://hi%40lumis.moe:password@smtp.fastmail.com:587`. A literal `@` is ambiguous in the userinfo section.

## Docker and sudo both work here
An earlier note claimed the opposite; verified directly: `sudo -n id` returns `uid=0`, `lumi` is in the `docker` group, and `docker ps` lists a running container (`calagopus-wings-tundra`). Containerising Postgres is a real option, and so is binding ports below 1024.

## Rate-limit keys must identify a real client
`x-forwarded-for` is absent unless a proxy sets it, so a `?? 'local'` fallback puts every request in one bucket and lets a single attacker lock out all users. Use `getConnInfo(c).remote.address` from `@hono/node-server/conninfo` as the fallback.

## The dev mailbox is empty in practice
`apps/api/.env` sets `SMTP_URL`, so the running dev API sends real mail and `GET /api/dev/mailbox` returns `[]` even with `DEV_MAILBOX=1`. To exercise a mail-based flow end to end, start a second API with its own `DATABASE_DIR`/`MAIL_DIR` and no `SMTP_URL`, then a second Vite with `API_URL` pointed at it — leave port 5173 and the tunnel alone.

## Backfills must be gated on the column being absent
`migrate()` runs on every boot, so an unconditional `UPDATE` would re-verify accounts created after the migration. Read `information_schema.columns` before `db.exec(SCHEMA)`, since afterwards the column always exists and a fresh database becomes indistinguishable from an upgraded one.

## This box is behind NAT
The LAN address is `192.168.50.20` behind gateway `192.168.50.1`, while the public address is `80.66.197.101`. Inbound 80/443 therefore needs a router port-forward, so a tunnel is the practical way to expose a dev server. Vite listens on `[::1]:5173` only, so anything proxying to it must target IPv6 localhost.

## An LSP diagnostic inside a file is real; one past its end is stale
Check the reported line against the file's length before dismissing it: `api.ts:227` in a 225-line file is a leftover from an older, longer version, while `app-shell.tsx:114 ')' expected` in a 200-line file is the truth. The second kind was dismissed as stale for several turns while the app sat blank, because `app-shell.tsx` wraps every authenticated route, so a single JSX imbalance takes the whole app down at once — Vite serves a 500 and `#root` stays empty.

