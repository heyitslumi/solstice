#!/usr/bin/env node
// Renders each landing page to static HTML so the copy exists without JS
// (crawlers, no-JS, and share-card scrapers). React hydrates over it in the browser.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

// Runs from apps/landing via npm; anchor on the script so cwd does not matter.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'apps/landing')
const DIST = join(ROOT, 'dist')
const SSR = join(ROOT, 'dist-ssr')

const PAGES = {
  home: { chunk: 'home.js', export: 'HomePage', file: join(DIST, 'index.html') },
  features: { chunk: 'features.js', export: 'FeaturesPage', file: join(DIST, 'features/index.html') },
  architecture: {
    chunk: 'architecture.js',
    export: 'ArchitecturePage',
    file: join(DIST, 'architecture/index.html'),
  },
  install: { chunk: 'install.js', export: 'InstallPage', file: join(DIST, 'install/index.html') },
  docs: { chunk: 'docs.js', export: 'DocsPage', file: join(DIST, 'docs/index.html') },
}

const failures = []
for (const [name, page] of Object.entries(PAGES)) {
  const mod = await import(pathToFileURL(join(SSR, page.chunk)).href)
  const Component = mod[page.export]
  if (typeof Component !== 'function') {
    failures.push(`${name}: ${page.chunk} does not export ${page.export}`)
    continue
  }

  let html
  try {
    html = renderToString(createElement(Component))
  } catch (err) {
    failures.push(`${name}: render failed — ${err?.message ?? err}`)
    continue
  }

  const shell = readFileSync(page.file, 'utf8')
  if (!shell.includes('<div id="root"></div>')) {
    failures.push(`${name}: shell has no empty #root`)
    continue
  }
  writeFileSync(page.file, shell.replace('<div id="root"></div>', `<div id="root">${html}</div>`))
  console.log(`prerendered ${name} (${html.length} bytes of HTML)`)
}

if (failures.length > 0) {
  console.error(`prerender: ${failures.length} failure(s)`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
