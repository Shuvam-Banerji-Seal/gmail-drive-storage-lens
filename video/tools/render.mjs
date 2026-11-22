// Renders the film to PNG frames with headless Chromium (deterministic: every frame is window.__seek(t)).
// usage: node video/tools/render.mjs [--out video/build/frames] [--jobs 6] [--from 0] [--to N] [--times 1.5,20.2] [--scale 1]
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { serve } from './serve.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : d
}
const out = arg('out', join(ROOT, 'build/frames'))
const jobs = Number(arg('jobs', 6))
const scale = Number(arg('scale', 1))
mkdirSync(out, { recursive: true })

const { server, port } = await serve(ROOT)
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--hide-scrollbars'] })

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('page error:', e.message))
  await page.goto(`http://127.0.0.1:${port}/index.html`)
  await page.waitForFunction('window.__ready === true || window.__error', null, { timeout: 30000 })
  const err = await page.evaluate('window.__error')
  if (err) throw new Error(err)
  return page
}

const probe = await open()
const fps = await probe.evaluate('window.__fps')
const duration = await probe.evaluate('window.__duration')
const total = Math.round(duration * fps)

let frames
const times = arg('times')
if (times) frames = times.split(',').map((s) => ({ name: `t${s}`, t: Number(s) }))
else {
  const from = Number(arg('from', 0))
  const to = Number(arg('to', total))
  frames = []
  for (let f = from; f < to; f++) frames.push({ name: String(f).padStart(5, '0'), t: f / fps })
}

let done = 0
const t0 = Date.now()
async function worker(k) {
  const page = k === 0 ? probe : await open()
  for (let i = k; i < frames.length; i += jobs) {
    const fr = frames[i]
    await page.evaluate((t) => window.__seek(t), fr.t)
    await page.screenshot({ path: join(out, `${fr.name}.png`), type: 'png' })
    if (++done % 100 === 0) console.log(`${done}/${frames.length} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  }
}
await Promise.all(Array.from({ length: Math.min(jobs, frames.length) }, (_, k) => worker(k)))
console.log(`rendered ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${out}`)
await browser.close()
server.close()
