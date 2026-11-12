import pw from '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js'
const { chromium } = pw

const url = process.argv[2] ?? 'http://127.0.0.1:4173/'
const out = process.argv[3] ?? '/tmp/landing.png'
const width = Number(process.argv[4] ?? 1440)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(url, { waitUntil: 'networkidle' })
// Walk the page so every scroll-reveal fires before the full-page capture.
const height = await page.evaluate(() => document.body.scrollHeight)
for (let y = 0; y < height; y += 700) {
  await page.evaluate((v) => window.scrollTo(0, v), y)
  await page.waitForTimeout(120)
}
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(500)
await page.screenshot({ path: out, fullPage: true })
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none')
console.log('height:', height)
await browser.close()
