# solstice.host multi-page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-page landing app into five real HTML pages (`/`, `/features/`, `/architecture/`, `/install/`, `/docs/`) with per-page metadata, sharing one nav/footer shell, deployed unchanged to the `solstice-landing` Worker.

**Architecture:** Vite multi-page: each route is its own HTML entry under `apps/landing/` with its own meta block, mounting one React component. A `SiteShell` component renders nav (with `aria-current`) + footer around every page. No client-side router.

**Tech Stack:** Vite 8 (`build.rollupOptions.input`), React 19, Tailwind v4, motion 13, Cloudflare Workers static assets.

**Spec:** `docs/superpowers/specs/2026-11-13-landing-multipage-design.md`

## Global Constraints

- No new npm dependencies. Brand tokens in `apps/landing/src/index.css` are the only palette.
- Dark-only site: `<html lang="en" class="dark">`; do not add a theme toggle.
- `/install.sh`, `/_headers`, `/_redirects` stay worker-first in `wrangler.toml`; `install.sh` keeps being proxied.
- Site text must be readable with JavaScript disabled (motion is decoration only).
- Nav links use trailing slashes (`/features/`, `/architecture/`, `/install/`, `/docs/`).
- Commands shown on `/install/` must use only real `install.sh` flags: `--domain`, `--proxy caddy|nginx|apache|none`, `--tunnel`, `--tunnel-token`, `--admin-email`, `--mail relay|smtp`, `--yes`.

## Review Focus

- JS disabled: every page still shows its heading, body copy and working nav links — no blank `#root`.
- Deep link straight to `/features/` (or any route) returns that page's own title and canonical, with no redirect loop.
- `/install/` flag combinations: `--tunnel` must never appear together with `--proxy nginx|apache` in a generated command, and token mode must always include `--domain`.
- `/install.sh` still returns the shell script, not an HTML page (worker-first path).
- 390px-wide viewport: nav collapses to a working menu and no page scrolls horizontally.

---

### Task 1: Multi-page scaffolding, shared shell, route stubs

**Files:**
- Modify: `apps/landing/vite.config.ts`, `apps/landing/index.html`, `apps/landing/wrangler.toml`, `apps/landing/package.json`
- Create: `apps/landing/features/index.html`, `apps/landing/architecture/index.html`, `apps/landing/install/index.html`, `apps/landing/docs/index.html`
- Create: `apps/landing/src/components/site-shell.tsx`, `apps/landing/src/pages/{home,features,architecture,install,docs}.tsx`, `apps/landing/src/page.tsx`
- Move: `apps/landing/src/App.tsx` → `apps/landing/src/pages/home.tsx`
- Test: `scripts/check-landing.mjs`

**Interfaces:**
- Consumes: existing `NAV`, `Mark`, `Footer`, `Reveal`, `useCopy` and section components in `App.tsx`.
- Produces: `SiteShell({ path, children }: { path: string; children: React.ReactNode })`; `PageMeta` values in each HTML file; `scripts/check-landing.mjs` asserting built HTML.

- [ ] **Step 1: Write the failing check script** `scripts/check-landing.mjs`: for each of `/`, `/features/`, `/architecture/`, `/install/`, `/docs/`, assert `apps/landing/dist/<route>index.html` exists, contains a non-empty unique `<title>`, a `<meta name="description">`, and `<link rel="canonical" href="https://solstice.host<route>">`. Then collect every `href="/..."` in those files and assert a matching file exists in `dist/` (allowing `/install.sh` as worker-handled). Exit non-zero listing failures.
- [ ] **Step 2: Run it and watch it fail**

Run: `node scripts/check-landing.mjs`
Expected: FAIL, missing `dist/features/index.html` etc.

- [ ] **Step 3: Add MPA inputs** in `vite.config.ts`: `build.rollupOptions.input` mapping `home: 'index.html'`, `features: 'features/index.html'`, `architecture: ...`, `install: ...`, `docs: ...`.
- [ ] **Step 4: Extract the shell** into `src/components/site-shell.tsx` from `App.tsx`: nav (logo, links with `aria-current={path === href ? 'page' : undefined}`, GitHub, Install button), `<main>{children}</main>`, footer. `src/page.tsx` exports `mountPage(Component)` which calls `createRoot(...).render(<Component />)` plus the font/css imports.
- [ ] **Step 5: Split pages.** `src/pages/home.tsx` holds today's sections; `features.tsx`, `architecture.tsx`, `install.tsx`, `docs.tsx` render a heading + one paragraph placeholder so the build passes.
- [ ] **Step 6: Per-page HTML.** Each `*/index.html` copies the home `<head>`, changing `<title>`, description, `og:title`, `og:description`, `og:url`, and adding `<link rel="canonical">`, with `<script type="module" src="/src/pages/<name>.tsx">` (home keeps `/src/main.tsx`).
- [ ] **Step 7: Worker config.** Leave `run_worker_first` as-is; confirm `[assets]` still points at `./dist` and that `/install.sh` wins over the assets handler.
- [ ] **Step 8: Build and check**

Run: `npm run build:landing && node scripts/check-landing.mjs`
Expected: PASS (0 failures). Also `grep -c '<div id="root"' apps/landing/dist/*/index.html` shows one per page.

- [ ] **Step 9: Commit** `feat(landing): multi-page structure with shared shell`.

### Task 2: Features page

**Files:**
- Modify: `apps/landing/src/pages/features.tsx`, `apps/landing/features/index.html` (title/description only if copy demands)
- Test: `scripts/check-landing.mjs` (already covers meta) plus a content assertion

**Interfaces:**
- Consumes: `Reveal`, `SiteShell`, brand tokens.
- Produces: `/features/` document; add to `scripts/check-landing.mjs` an assertion that the page body contains the strings `Incus`, `snapshots`, `console`, `port forwards`, `mail`, `passkeys`.

- [ ] **Step 1: Add the content assertion** to `scripts/check-landing.mjs` (fails now).
- [ ] **Step 2: Run it, watch it fail** — `node scripts/check-landing.mjs`.
- [ ] **Step 3: Write the page**: intro, then grouped sections (Compute, Console & snapshots, Network, Mail, Auth, Admin & ops), each with a heading, 2–4 sentence body, and screenshot where one exists (`/shots/server.webp`, `/shots/console.webp`, `/shots/admin.webp`); reuse the existing feature-card visual language.
- [ ] **Step 4: Run the check, expect PASS.**
- [ ] **Step 5: Commit** `feat(landing): features page`.

### Task 3: Architecture page

**Files:**
- Modify: `apps/landing/src/pages/architecture.tsx`
- Test: `scripts/check-landing.mjs` (content assertion: `browser`, `Caddy`, `Incus`, `LXD`, `KVM`, `relay`)

**Interfaces:**
- Consumes: `Reveal`, `SiteShell`.
- Produces: `/architecture/` document with a pure HTML/CSS request-path diagram (no images, no canvas).

- [ ] **Step 1: Add assertion, watch it fail.**
- [ ] **Step 2: Implement** the four-hop diagram as a grid of labelled boxes with connecting rules: browser → proxy (Caddy/nginx/Apache or Cloudflare tunnel) → Solstice API (Node, systemd, non-root `solstice` user) → Incus → LXD container / KVM VM. Then sections: isolation (per-instance limits, bridge network), mail path (panel → relay worker → SES), and "what we never do" (no control plane, no telemetry).
- [ ] **Step 3: Run the check, expect PASS; confirm the diagram stacks at 390px.**
- [ ] **Step 4: Commit** `feat(landing): architecture page`.

### Task 4: Install page with command builder

**Files:**
- Modify: `apps/landing/src/pages/install.tsx`
- Test: `scripts/check-landing.mjs` (content assertion: `--proxy`, `--tunnel-token`, `--domain`)

**Interfaces:**
- Consumes: `useCopy` (move it to `src/components/use-copy.ts` from `home.tsx`), `SiteShell`.
- Produces: `buildCommand({ proxy, tunnel, domain, email }): string` exported from `install.tsx` for the assertion; page renders the command in a copyable block.

- [ ] **Step 1: Add assertion, watch it fail.**
- [ ] **Step 2: Implement `buildCommand`** exactly:
  - base: `curl -fsSL https://solstice.host/install.sh | sudo bash`
  - proxy select `caddy|nginx|apache|none` → append `--proxy <v>` only when not `caddy`
  - tunnel select `none|quick|token` → `none` appends nothing; `quick` appends `--tunnel` and drops `--proxy`; `token` appends `--tunnel-token <TOKEN>` and drops `--proxy`
  - hostname input appended as `--domain <host>` when non-empty; required whenever the result is not a quick tunnel
  - email input appended as `--admin-email <email>` when non-empty
- [ ] **Step 3: Render** proxy cards (Caddy recommended / nginx / Apache / none), tunnel choice, hostname + email fields, the generated command with copy button, and the requirements table (moved from home).
- [ ] **Step 4: Run the check, expect PASS; manually confirm the four invalid combinations from Review Focus are unreachable in the UI.**
- [ ] **Step 5: Commit** `feat(landing): install page with command builder`.

### Task 5: Docs page, robots, sitemap, deploy

**Files:**
- Modify: `apps/landing/src/pages/docs.tsx`, `apps/landing/src/pages/home.tsx` (link out to new routes, drop moved sections)
- Create: `apps/landing/public/robots.txt`, `apps/landing/public/sitemap.xml`
- Test: `scripts/check-landing.mjs` (assert `dist/robots.txt` and `dist/sitemap.xml` exist and sitemap lists all five URLs)

**Interfaces:**
- Consumes: `SiteShell`, `Reveal`.
- Produces: `/docs/` document; sitemap with the five canonical URLs.

- [ ] **Step 1: Add assertions, watch them fail.**
- [ ] **Step 2: Write `/docs/`**: quick start (three steps), requirements, CLI table (`solstice status|doctor|logs|restart|upgrade|uninstall`), troubleshooting pointers, GitHub links.
- [ ] **Step 3: Trim home** to hero + screenshot strip + short feature trio + install one-liner, with links to the deeper pages; keep `#features`/`#install` anchors redirecting to the new routes via `<a href="/features/">`.
- [ ] **Step 4: Add `robots.txt`** (allow all, sitemap URL) and `sitemap.xml` (five URLs with `changefreq`/`priority`).
- [ ] **Step 5: Build + check**

Run: `npm run build:landing && node scripts/check-landing.mjs`
Expected: PASS.

- [ ] **Step 6: Deploy to the Worker** (`solstice-landing`, account `e40783cbc98e269ecad290eac0daf4b6`) and verify live:

Run for each route: `curl -s -o /dev/null -w '%{http_code} ' https://solstice.host/features/` (etc.)
Expected: `200 200 200 200 200`, and `curl -sI https://solstice.host/install.sh | head -1` still `200` with `content-type: text/x-shellscript`.

- [ ] **Step 7: Commit** `feat(landing): docs page, sitemap, cross-links`.
