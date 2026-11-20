// SPDX-License-Identifier: AGPL-3.0-or-later
// Captures README screenshots (demo data only) and the Open Graph image. Needs `npm run preview` on :4173.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/'
const OUT = process.argv[2] ?? 'docs/screenshots'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
await page.goto(BASE)
await page.screenshot({ path: `${OUT}/landing.png` })
await page.getByRole('button', { name: /Explore the demo/ }).click()
await page.waitForTimeout(800)
const shots = [
  ['overview', '#/overview'],
  ['gmail-senders', '#/gmail/senders'],
  ['gmail-constellation', '#/gmail/constellation'],
  ['gmail-rivers', '#/gmail/rivers'],
  ['gmail-tides', '#/gmail/tides'],
  ['gmail-mailfall', '#/gmail/mailfall'],
  ['gmail-nebula', '#/gmail/nebula'],
  ['gmail-unsubscribe', '#/gmail/unsubscribe'],
  ['drive-continents', '#/drive/continents'],
  ['drive-twins', '#/drive/twins'],
  ['drive-sharing', '#/drive/sharing'],
  ['planner', '#/planner'],
  ['verify', '#/verify'],
  ['setup', '#/setup'],
]
for (const [name, hash] of shots) {
  await page.evaluate((h) => (window.location.hash = h), hash)
  await page.waitForTimeout(name.includes('nebula') || name.includes('constellation') || name.includes('sharing') ? 3500 : 900)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}
await page.evaluate(() => (window.location.hash = '#/overview'))
await page.locator('.barlist button').first().click()
await page.evaluate(() => (window.location.hash = '#/cleanup'))
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/airlock.png` })
await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
await page.evaluate(() => (window.location.hash = '#/overview'))
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/overview-light.png` })
await browser.close()
console.log('screenshots written to', OUT)
