import pw from '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js'
const { chromium } = pw
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
const height = await page.evaluate(() => document.body.scrollHeight)
for (let y = 0; y < height; y += 600) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(100) }
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/landing-mobile-final.png', fullPage: true })
console.log('errors:', errors.length ? errors : 'none', 'height:', height)
await browser.close()
