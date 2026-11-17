# Plan: Add Privacy Policy, Terms of Service, and Plausible Analytics to Solstice Landing

- **Target App**: `apps/landing` (deployed to Cloudflare Worker `solstice-landing` on `solstice.host`)
- **User Decisions**:
  - Privacy policy and Terms of service live on the landing site (`/privacy/` and `/terms/`).
  - Plausible analytics tag loaded on the landing site only.
  - Analytics snippet:
    ```html
    <script async src="https://analytics.lumis.tf/js/pa-96lNX8Z14ZTTKJ9rJYF5Z.js"></script>
    <script>
      window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
      plausible.init()
    </script>
    ```

---

## Architecture & Scope Checklist

Per project rules in `AGENTS.md`:
> Adding a landing page means four edits, not one:
> 1. `apps/landing/vite.config.ts` inputs
> 2. `vite.config.ssr.ts` inputs
> 3. `scripts/prerender-landing.mjs` `PAGES`
> 4. `scripts/check-landing.mjs` route list

Additional touchpoints:
- `apps/landing/public/sitemap.xml`: Add `/privacy/` and `/terms/`.
- `apps/landing/src/components/site-shell.tsx`: Add footer links to Privacy and Terms.
- Plausible script injection: Add to all HTML shell files (`index.html`, `features/index.html`, `architecture/index.html`, `install/index.html`, `docs/index.html`, plus new `privacy/index.html` and `terms/index.html`).

---

## Tasks

### Task 1: Add Plausible Analytics to Existing HTML Templates
- Update HTML files in `apps/landing/`:
  - `index.html`
  - `features/index.html`
  - `architecture/index.html`
  - `install/index.html`
  - `docs/index.html`
- Insert the async Plausible script and initialization inline in `<head>`.

### Task 2: Create Privacy Policy and Terms of Service Content
- Create `apps/landing/privacy/index.html` and `apps/landing/terms/index.html` with appropriate metadata, dark theme styling, and the Plausible snippet.
- Create page components:
  - `apps/landing/src/pages/privacy.tsx` (PrivacyPage): clear, human-readable policy for solstice.host, demo.solstice.host, and self-hosted instances (noting self-hosters manage their own data, solstice.host collects privacy-respecting analytics via Plausible, no cookies/surveillance, relay email processing transiently).
  - `apps/landing/src/pages/terms.tsx` (TermsPage): clear, plain terms (MIT-licensed open source software provided "as is", rules for solstice.host and demo.solstice.host services, acceptable use for demo instances and cloud relay).

### Task 3: Wire Routes into Landing Configs & Scripts
- `apps/landing/vite.config.ts`: add `privacy: 'privacy/index.html'` and `terms: 'terms/index.html'` to `build.rollupOptions.input`.
- `apps/landing/vite.config.ssr.ts`: add `privacy: 'src/pages/privacy.tsx'` and `terms: 'src/pages/terms.tsx'`.
- `scripts/prerender-landing.mjs`: add entries for `privacy` and `terms`.
- `scripts/check-landing.mjs`: add `/privacy/` and `/terms/` to `ROUTES`.
- `apps/landing/public/sitemap.xml`: include `/privacy/` and `/terms/`.
- `apps/landing/src/components/site-shell.tsx`: add Privacy and Terms links in `Footer()`.

### Task 4: Verification & Build
- Run `npm run build:landing`.
- Ensure all 7 pages build, prerender, and pass `scripts/check-landing.mjs`.
- Test local output to confirm Plausible is present and pages render properly.

### Task 5: Deploy Landing Site
- Deploy using `npm run deploy:landing` with Cloudflare credentials.
- Verify live responses on `https://solstice.host/privacy/`, `https://solstice.host/terms/`, and check for Plausible script tag on `https://solstice.host/`.
