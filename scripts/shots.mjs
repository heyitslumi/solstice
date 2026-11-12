// Capture the landing page's panel screenshots from a running install.
//
//   node scripts/shots.mjs <base-url> <email> <login-code> [out-dir]
//
// The login code comes from the instance's mail log, e.g. on the demo box:
//   psql "$DATABASE_URL" -tAc "select body_text from email_logs order by created_at desc limit 1"
//
// Requires Playwright (not a project dependency): run it from a checkout that
// has one, or `npx playwright install chromium` first.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ??
  '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js'

const { chromium } = (await import(playwrightPath)).default

const baseUrl = process.argv[2]
const email = process.argv[3]
const outDir = process.argv[4] ?? 'apps/landing/public/shots'
// The code is single-use and tied to the login request, so for a remote demo
// pass a command that prints the newest one (see scripts/demo-code.sh).
const codeCmd = process.env.CODE_CMD

if (!baseUrl || !email) {
  console.error('usage: [CODE_CMD=...] shots.mjs <base-url> <email> [out-dir]')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })

const pages = [
  { path: '/dashboard', name: 'overview' },
  { path: '/admin', name: 'admin' },
]

const browser = await chromium.launch()
const context = await browser.newContext({
  baseURL: baseUrl,
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
  reducedMotion: 'reduce',
})
const page = await context.newPage()

const login = await page.request.post('/api/auth/login', { data: { email } })
if (!login.ok()) throw new Error(`login request failed: ${login.status()} ${await login.text()}`)

if (!codeCmd) throw new Error('set CODE_CMD to a command that prints the login code')
const code = execFileSync('bash', ['-c', codeCmd], { encoding: 'utf8' }).trim()
if (!/^\d{4,8}$/.test(code)) throw new Error(`unexpected code: ${JSON.stringify(code)}`)

const verify = await page.request.post('/api/auth/login/verify', { data: { email, code } })
if (!verify.ok()) throw new Error(`verify failed: ${verify.status()} ${await verify.text()}`)

for (const target of pages) {
  await page.goto(target.path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const png = join(outDir, `${target.name}.png`)
  await page.screenshot({ path: png })
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-quality', '88', `${png.replace(/\.png$/, '.webp')}`])
  rmSync(png)
  console.log(`captured ${target.name}`)
}

// The console is captured from the first server's detail page, which is where
// the terminal is reachable without knowing an instance id up front.
const servers = await page.request.get('/api/instances')
const list = servers.ok() ? ((await servers.json()).instances ?? []) : []
if (list.length > 0) {
  const id = list[0].id
  await page.goto(`/servers/${id}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const detail = join(outDir, 'server.png')
  await page.screenshot({ path: detail })
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', detail, '-quality', '88', detail.replace(/\.png$/, '.webp')])
  rmSync(detail)

  await page.goto(`/servers/${id}/console`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1600)

  // An empty prompt is a boring screenshot: run something real in the shell.
  const term = page.locator('.xterm').first()
  if ((await term.count()) > 0) {
    await term.click()
    await page.keyboard.type('uname -sr && free -h && df -h /', { delay: 20 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)
  }
  const consolePng = join(outDir, 'console.png')
  await page.screenshot({ path: consolePng })
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', consolePng, '-quality', '88', consolePng.replace(/\.png$/, '.webp')])
  rmSync(consolePng)
  console.log('captured server + console')
} else {
  console.warn('no servers found; skipping server and console shots')
}

await browser.close()
