# Solstice

> A modern, multi-tenant VPS & cloud instance control panel powered by **Incus** (KVM virtual machines & LXC containers).

Solstice is built for speed, density, and ease of operations. It pairs a high-performance TypeScript backend with an interactive dark ops dashboard, managing compute workloads directly over the Incus daemon.

---

## Features

- **Hypervisor & Container Native:** First-class support for both KVM VMs and LXC system containers via the Incus control plane.
- **Modern Ops UI:** Fast, dense interface built with React 19, Vite, Tailwind CSS v4, Radix UI primitives, and Phosphor icons.
- **Interactive Web Terminal & Consoles:** Low-latency WebSockets for live console access (exec streams, terminal sessions, VNC/SPICE).
- **Passwordless & Passkey-First Auth:** Built-in WebAuthn / Passkeys (`@simplewebauthn`), one-time magic links/codes, and session tokens.
- **Granular Storage & Networking:** Automated IP/network management, bridge orchestration, disk pool allocations, and volume attachment.
- **Live Metrics & Telemetry:** Real-time CPU, RAM, disk, and network I/O tracking per instance.
- **Operator Ready:** Self-contained installer with Caddy (auto-TLS) or Cloudflare Tunnel mode, automated schema migrations, and systemd integration.

---

## Architecture & Tech Stack

Solstice is structured as an npm monorepo:

```
solstice/
├── apps/
│   ├── api/          # Node 24 + TypeScript + Hono REST & WebSocket backend
│   │   ├── src/
│   │   │   ├── index.ts        # Service entrypoint
│   │   │   ├── app.ts          # REST endpoints, middleware & routing
│   │   │   ├── incus/          # Incus client driver (unix socket & REST client)
│   │   │   ├── console.ts      # WebSocket terminal & console session handler
│   │   │   ├── db.ts           # Schema migrations & PostgreSQL connection pool
│   │   │   ├── passkeys.ts     # WebAuthn registration & verification
│   │   │   ├── storage.ts      # Storage pools & disk volume orchestration
│   │   │   └── metrics.ts      # Telemetry & resource utilization poller
│   │   └── package.json
│   └── web/          # React 19 + Vite 8 frontend
│       ├── src/
│       │   ├── App.tsx         # Application routes & layout tree
│       │   ├── pages/          # Ops console, dashboard, auth, and instance pages
│       │   └── components/     # UI primitives and telemetry meters
│       └── package.json
├── deploy/           # Systemd unit files & deployment templates
├── install.sh        # Automated bootstrap script
└── package.json      # Monorepo workspaces
```

### Core Technologies

- **Runtime:** Node.js 24+
- **Backend Framework:** [Hono](https://hono.dev/) with native `@hono/node-server`
- **Database:** PostgreSQL 16+
- **Hypervisor / Engine:** [Incus](https://linuxcontainers.org/incus/)
- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4
- **Reverse Proxy:** Caddy (automated Let's Encrypt TLS) or Cloudflare Tunnel

---

## Quick Start (Development)

### Prerequisites

- Node.js 24+ and npm
- PostgreSQL database
- Incus daemon running locally (with your user in the `incus-admin` group) or exposed via Unix socket

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy or create `apps/api/.env`:

```env
PORT=8788
DATABASE_URL=postgres://solstice:password@127.0.0.1:5432/solstice
TRUST_PROXY=1
ADMIN_EMAILS=admin@example.com
```

### 3. Run Development Servers

Run backend and frontend concurrently:

```bash
npm run dev:all
```

Or run each workspace individually:

```bash
# Backend (Hono API on port 8788)
npm run dev:api

# Frontend (Vite dev server)
npm run dev
```

---

## Production Deployment

For full deployment documentation and manual setup guides, see [DOCS-INSTALL.md](DOCS-INSTALL.md).

### Automated Installer

Run the bootstrap installer on a clean Debian 12/13 or Ubuntu host:

```bash
# With domain & automatic HTTPS via Caddy:
sudo ./install.sh --domain panel.example.com --admin-email admin@example.com

# Without a domain (via Cloudflare Quick Tunnel):
sudo ./install.sh --tunnel --admin-email admin@example.com
```

---

## License

MIT — see [LICENSE](LICENSE).

Self-host it, fork it, run it for customers, ship it inside your own product. The only
condition is that the copyright notice and permission text travel with the copy.

The Solstice name and logo are not part of the grant: a fork is welcome, but it has to
carry its own name.
