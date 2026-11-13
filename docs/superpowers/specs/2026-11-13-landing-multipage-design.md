# solstice.host as a real multi-page site

## Intent
`solstice.host` is one long React page. It should be a small site: separate URLs for the
product story, the internals, installing it, and docs, each with its own title, description
and share card. Reference points the user named: pterodactyl.io (structure and credibility)
and featherpanel.com (install modal, screenshot gallery).

## Goals
- Routes: `/` (home), `/features`, `/architecture`, `/install`, `/docs`.
- Every route is a real HTML document: own `<title>`, description, canonical, OG/Twitter tags.
- Shared chrome (nav with active state, footer) across pages; no client-side router.
- `/install` builds the command for the user: proxy choice (caddy/nginx/apache/none) and
  tunnel mode (none/quick/token), from the flags `install.sh` actually has.
- Deploy path unchanged: `npm run build:landing` → Cloudflare Worker `solstice-landing`.
- `/install.sh` proxy keeps working; `_headers` cache rules keep applying.

## Non-goals
- Light mode for the marketing site. It stays a dark poster (the panel has light mode; the
  site does not).
- Blog, changelog, pricing, i18n, CMS, MDX pipeline.
- A full docs site: `/docs` is a short quick-start that links to GitHub and the CLI.
- Auth, forms that post anywhere, analytics.

## Constraints
- Vite 8 MPA + React 19 + Tailwind v4 + motion 13, no new dependencies.
- Existing brand tokens in `src/index.css` are the source of truth; no new palette.
- Worker serves `dist/` via `ASSETS`; only `/install.sh`, `/_headers`, `/_redirects` run worker-first.
- Deployed site must work with JS disabled for text content (motion is decoration only).

## Approach (picked)
Vite multi-page: one HTML entry per route in `build.rollupOptions.input`, each mounting a
shared `<Page>` shell around a route component. Alternatives rejected: React Router SPA (one
document, per-page SEO becomes client-side hacks), Astro (second framework, port the existing
page for no gain at five pages).

## Decisions
- **Route files**: `index.html`, `features/index.html`, `architecture/index.html`,
  `install/index.html`, `docs/index.html`. Each has its own meta block and its own
  `src/pages/<name>.tsx` entry.
- **Asset handling**: Worker `[assets]` gets `html_handling = "auto-trailing-slash"` (already the
  default); nav links use trailing slashes (`/features/`) so no redirect chains.
- **Shared shell**: `src/components/site-shell.tsx` (nav + footer + grid backdrop) is used by
  every page; `App.tsx` becomes `pages/home.tsx`. No router; nav is plain `<a>` with an
  `aria-current` set from a `path` prop.
- **`/install`**: client-side selects (distro, proxy, tunnel) that assemble
  `curl -fsSL https://solstice.host/install.sh | sudo bash` plus flags; a note per choice
  explaining what it does; copy button. Flags come from `install.sh --help`, not invented.
- **`/architecture`**: the request path as a static HTML/CSS diagram (browser → proxy → Solstice
  API → Incus → LXD container / KVM VM), plus isolation and mail-relay notes. Text only, works
  without JS.
- **`/features`**: the existing feature set expanded into grouped sections (compute, console,
  networking, mail, auth, admin) with the existing screenshots.
- **`/docs`**: quick start, requirements, CLI commands (`solstice status|doctor|logs|restart|
  upgrade`), link out to GitHub.
- **SEO**: per-page canonical + OG; `public/robots.txt`; `public/sitemap.xml` listing the five
  URLs; home keeps the existing OG image, other pages reuse `/shots/overview.webp` until
  dedicated cards exist.
- **Self-check**: `scripts/check-landing.mjs` reads `dist/` and asserts each route has an
  `index.html`, a unique non-empty `<title>`, a description, and a canonical matching the route;
  plus every `href="/..."` in the built HTML resolves to a file in `dist/`.

## Left to the builder
Exact copy, section rhythm on each page, and which screenshots land where.
