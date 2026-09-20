# HANDOFF — Solstice Host (incus-vps-panel)

Updated: 2026-09-20  
Git Origin: `https://github.com/heyitslumi/solstice.git` (branch `main`)  
Git Identity: `heyitslumi <hi@lumis.moe>`

---

## 1. What this project is

Solstice Host is a customer-facing, multi-tenant VPS control panel backed by **Incus** (managing both LXC system containers and KVM virtual machines).

- **Current state**: Complete passwordless auth system (email link/code + WebAuthn passkeys), avatar upload system, full-screen ops console dashboard with mock telemetry/power actions, and automated test suites (93/93 tests passing).
- **Next milestone**: Incus control plane implementation (Phase 1: installing & binding Incus daemon).
- Moving from Windows WSL2 to a dedicated Debian 13 VM eliminates WSL mirrored-networking socket drops and Hyper-V nested virtualization issues for KVM.

---

## 2. Repo Architecture & Tech Stack

```
solstice-host/
├── apps/
│   ├── api/          # Node 24 TypeScript backend (Hono + @hono/node-server)
│   │   ├── src/
│   │   │   ├── index.ts        # Entrypoint with request logger
│   │   │   ├── app.ts          # REST endpoints, error handler, rate limits
│   │   │   ├── db.ts           # Schema migrations & pg.Pool
│   │   │   ├── mail.ts         # Fastmail SMTP / file transport
│   │   │   ├── passkeys.ts     # @simplewebauthn server verification
│   │   │   ├── session.ts      # SHA256 hashed DB sessions
│   │   │   ├── two-factor.ts   # Email challenge & link verification
│   │   │   ├── verification.ts # Account confirmation links/codes
│   │   │   └── *.test.ts       # 93 node:test suites
│   └── web/          # React 19 + Vite 8 + Tailwind v4 + Radix + Phosphor
│       ├── src/
│       │   ├── App.tsx         # Route tree
│       │   ├── pages/
│       │   │   ├── login.tsx       # Unified sign-in + register modal
│       │   │   ├── dashboard.tsx   # Fullscreen ops console & instance list
│       │   │   ├── account.tsx     # Profile, avatar crop/upload, passkeys
│       │   │   └── verify-email.tsx
│       │   └── components/     # shadcn-style dark ops UI primitives
```

### Key Decisions Implemented
- **Unified Login/Register**: `/register` page removed. Entering an unknown email on `/login` prompts for "Full name", creates the account, and immediately dispatches confirmation code/link.
- **Avatar System**: Canvas-based 256x256 square crop to WebP (15–30 KB payload), stored in `users.avatar_url` with validation up to 500 KB.
- **Control Plane Architecture**: Chosen to stay in TypeScript within `apps/api` (Hono + native fetch/WebSockets to Incus REST socket `/var/lib/incus/unix.socket`), maintaining a single service and unified test runner.

---

## 3. Dedicated Debian 13 Setup Guide

Execute these steps on the new Debian 13 machine/VM:

### Step 1: System Packages & Node 24
```bash
sudo apt update -y && sudo apt upgrade -y
sudo apt install -y curl git build-essential ca-certificates gnupg

# Install Node.js 24 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
sudo apt install -y nodejs
```

### Step 2: PostgreSQL 17 Setup
```bash
sudo apt install -y postgresql-17 postgresql-client-17

# Configure port 5433 and local trust auth
sudo sed -i 's/^port = .*/port = 5433/' /etc/postgresql/17/main/postgresql.conf
sudo sed -i "s/^#listen_addresses = .*/listen_addresses = '*'/" /etc/postgresql/17/main/postgresql.conf
sudo sed -i "s/scram-sha-256/trust/g" /etc/postgresql/17/main/pg_hba.conf
sudo systemctl restart postgresql

# Create role & database (solstice needs CREATEDB for per-test DB creation)
sudo -u postgres psql -p 5433 -c "CREATE USER solstice WITH PASSWORD 'password' CREATEDB SUPERUSER;"
sudo -u postgres psql -p 5433 -c "CREATE DATABASE solstice OWNER solstice;"
```

### Step 3: Install & Initialize Incus
```bash
sudo apt install -y incus incus-client
sudo adduser $USER incus-admin
newgrp incus-admin

# Initialize Incus with default network and storage pool
sudo incus admin init --minimal
incus version
```

### Step 4: Clone & Configure Repo
```bash
git clone https://github.com/heyitslumi/solstice.git
cd solstice
npm install

# apps/api/.env
cat << 'EOF' > apps/api/.env
PORT=8788
DATABASE_URL=postgres://solstice:password@127.0.0.1:5433/solstice
PUBLIC_ORIGIN=http://localhost:5173
DEV_MAILBOX=0
MAIL_DIR=./data/mail
RATE_LIMIT_STORE=memory
SMTP_URL=smtp://hi%40lumis.moe:9d8k9n2n8c2j2j64@smtp.fastmail.com:587
SMTP_REQUIRE_TLS=1
MAIL_FROM=Solstice Host <no-reply@lumis.tf>
EOF

# apps/web/.env
cat << 'EOF' > apps/web/.env
API_URL=http://127.0.0.1:8788
EOF
```

### Step 5: Verify & Run
```bash
# Run backend test suite (asserts 93/93 passing)
npm test --workspace @solstice/api

# Run web typecheck & lint
npm run build --workspace @solstice/web
npx oxlint apps/web

# Run development servers
npm run dev --workspace @solstice/web &
node --env-file=apps/api/.env apps/api/src/index.ts
```

---

## 4. Next Implementation Phase: Incus Control Plane

Reference: `.omo/drafts/incus-vps-panel.md`

1. **Incus REST Driver (`apps/api/src/incus/`)**:
   - Communicate directly with `/var/lib/incus/unix.socket` using Node's native `fetch` dispatcher or `undici`.
   - Implement `GET /1.0`, verify `api_extensions`.
   - Implement instance CRUD: `createInstance`, `startInstance`, `stopInstance`, `deleteInstance`.
2. **Database Models (`apps/api/src/db.ts`)**:
   - `hosts`: multi-host management records.
   - `instances`: mapping tenant instance to Incus project + container/VM name.
   - `tasks`: async job tracking table wrapping Incus operation polling (`/1.0/operations/<id>/wait`).
3. **Frontend Wiring**:
   - Replace mock array in `apps/web/src/pages/dashboard.tsx` with live `useQuery`/`fetch` calls to `/api/instances`.
   - Wire "New Server" modal with cloud-init image picker (Debian, Ubuntu, Alpine).
   - Wire console gateway using `@xterm/xterm` over WebSocket to `/1.0/instances/<name>/console`.

---

## 5. Critical Environment Traps (Must-Read)

1. **Postgres Port 5433**:
   Always connect to port 5433. The database role `solstice` **must** have `CREATEDB` privileges because test files dynamically spin up and tear down isolated databases (`solstice-test-...`).
2. **Vite IPv6 / localhost**:
   Vite listens on IPv6 localhost (`[::1]:5173`). Probe via `http://localhost:5173` or `[::1]`, not `127.0.0.1`.
3. **Fastmail SMTP Encoding**:
   The `@` character in `hi@lumis.moe` must be percent-encoded as `%40` in `SMTP_URL`.
4. **React 19 StrictMode & Single-Use Tokens**:
   StrictMode runs `useEffect` twice on initial mount in dev mode. Any single-use token endpoint (magic links, email verifications) must be guarded with `useRef(false)` to avoid burning the token on mount 1 and failing mount 2.
5. **No Build Step on Backend**:
   Node 24 executes native TypeScript directly without TSX or compilation steps. Run with `node --env-file=.env src/index.ts`.
