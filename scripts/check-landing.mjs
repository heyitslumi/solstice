#!/usr/bin/env node
// Static self-check for the landing site build: every route is a real document
// with its own metadata, and every internal link points at something that exists.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const LANDING = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'apps/landing')
const DIST = join(LANDING, 'dist')
const ORIGIN = 'https://solstice.host'
const ROUTES = ['/', '/features/', '/architecture/', '/install/', '/docs/']

// Paths the Worker serves itself, so they are not files in dist.
const WORKER_PATHS = new Set(['/install.sh', '/_headers', '/_redirects'])

const failures = []
const titles = new Map()

const fileFor = (route) => join(DIST, route.slice(1), 'index.html')
const attr = (html, re) => html.match(re)?.[1]?.trim() ?? ''

for (const route of ROUTES) {
  const file = fileFor(route)
  if (!existsSync(file)) {
    failures.push(`${route}: missing ${file}`)
    continue
  }
  const html = readFileSync(file, 'utf8')

  const title = attr(html, /<title>([^<]*)<\/title>/)
  if (!title) failures.push(`${route}: no <title>`)
  else if (titles.has(title)) failures.push(`${route}: title duplicates ${titles.get(title)} ("${title}")`)
  else titles.set(title, route)

  const description = attr(html, /<meta\s+name="description"\s+content="([^"]*)"/)
  if (!description) failures.push(`${route}: no meta description`)

  const canonical = attr(html, /<link\s+rel="canonical"\s+href="([^"]*)"/)
  const want = `${ORIGIN}${route}`
  if (!canonical) failures.push(`${route}: no canonical`)
  else if (canonical !== want) failures.push(`${route}: canonical is ${canonical}, expected ${want}`)

  if (!html.includes('<div id="root"')) failures.push(`${route}: no #root mount point`)
}

// Every internal href must resolve: a page route, a file in dist, or a worker path.
const targets = new Set()
for (const route of ROUTES) {
  const file = fileFor(route)
  if (!existsSync(file)) continue
  for (const m of readFileSync(file, 'utf8').matchAll(/href="(\/[^"#?]*)/g)) targets.add(m[1])
}
for (const href of [...targets].sort()) {
  if (href.startsWith('/assets/') || href.endsWith('.svg') || href.endsWith('.webp') || href.endsWith('.png')) {
    if (!existsSync(join(DIST, href.slice(1)))) failures.push(`link ${href}: missing file in dist`)
    continue
  }
  if (WORKER_PATHS.has(href)) continue
  const isRoute = ROUTES.includes(href) || ROUTES.includes(`${href}/`)
  if (!isRoute && !existsSync(join(DIST, href.slice(1)))) {
    failures.push(`link ${href}: no route or file`)
  }
}

// Task 2-5 content checks land here as the pages get written. Prerendered body
// only: meta tags in <head> would make these assertions pass on an empty page.
const body = (route) => {
  const file = fileFor(route)
  if (!existsSync(file)) return ''
  const html = readFileSync(file, 'utf8')
  return html.slice(html.indexOf('<body'))
}
const EXPECT = {
  '/features/': ['Incus', 'snapshots', 'console', 'port forwards', 'mail', 'passkeys'],
  '/architecture/': ['browser', 'Caddy', 'Incus', 'LXD', 'KVM', 'relay'],
  '/install/': ['--proxy', '--tunnel-token', '--domain'],
}
for (const [route, needles] of Object.entries(EXPECT)) {
  const html = body(route)
  if (!html) continue
  for (const needle of needles) {
    if (!html.toLowerCase().includes(needle.toLowerCase())) {
      failures.push(`${route}: body missing "${needle}"`)
    }
  }
}

// The install command builder: a tunnel replaces the proxy, so the two must
// never appear together, and token mode always needs a hostname.
const installModule = join(LANDING, 'dist-ssr/install.js')
if (existsSync(installModule)) {
  const { buildCommand, needsDomain } = await import(pathToFileURL(installModule).href)
  const base = 'curl -fsSL https://solstice.host/install.sh | sudo bash'
  const cases = [
    ['caddy default', { proxy: 'caddy', tunnel: 'none' }, [base], ['--proxy', '--tunnel']],
    ['nginx proxy', { proxy: 'nginx', tunnel: 'none' }, ['--proxy nginx'], ['--tunnel']],
    ['quick tunnel drops proxy', { proxy: 'nginx', tunnel: 'quick' }, ['--tunnel'], ['--proxy', '--tunnel-token']],
    [
      'token tunnel drops proxy',
      { proxy: 'apache', tunnel: 'token', token: 'abc', domain: 'p.example.com' },
      ['--tunnel-token abc', '--domain p.example.com'],
      ['--proxy', '--tunnel '],
    ],
    [
      'flags appended',
      { proxy: 'caddy', tunnel: 'none', domain: 'p.example.com', email: 'a@b.co' },
      ['--domain p.example.com', '--admin-email a@b.co'],
      [],
    ],
  ]
  for (const [name, options, wanted, forbidden] of cases) {
    const command = buildCommand(options)
    for (const needle of wanted) {
      if (!command.includes(needle)) failures.push(`install builder (${name}): missing "${needle}" in ${command}`)
    }
    for (const needle of forbidden) {
      if (command.includes(needle)) failures.push(`install builder (${name}): unexpected "${needle}" in ${command}`)
    }
  }
  for (const [name, options, want] of [
    ['token needs domain', { tunnel: 'token', proxy: 'caddy' }, true],
    ['quick needs none', { tunnel: 'quick', proxy: 'caddy' }, false],
    ['own proxy needs none', { tunnel: 'none', proxy: 'none' }, false],
    ['direct needs domain', { tunnel: 'none', proxy: 'caddy' }, true],
  ]) {
    if (needsDomain(options) !== want) failures.push(`needsDomain (${name}): expected ${want}`)
  }
} else {
  failures.push('missing dist-ssr/install.js (build the SSR bundle first)')
}

for (const file of ['robots.txt', 'sitemap.xml']) {
  if (!existsSync(join(DIST, file))) failures.push(`missing dist/${file}`)
}
const sitemap = join(DIST, 'sitemap.xml')
if (existsSync(sitemap)) {
  const xml = readFileSync(sitemap, 'utf8')
  for (const route of ROUTES) {
    if (!xml.includes(`${ORIGIN}${route}`)) failures.push(`sitemap: missing ${route}`)
  }
}

if (failures.length > 0) {
  console.error(`landing check: ${failures.length} failure(s)`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`landing check: ok — ${ROUTES.length} routes, ${titles.size} unique titles, ${targets.size} links`)
