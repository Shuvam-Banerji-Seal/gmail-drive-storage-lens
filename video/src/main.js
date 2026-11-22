// Engine: builds the scenes, and exposes window.__seek(t) so the film can be rendered frame by frame.
import { COL, E, FONT, H, W, clamp, el, g, line, path, pe, prog, set, text } from './lib.js'
import { build as problem } from './scenes/problem.js'
import { build as reveal } from './scenes/reveal.js'
import { build as priv } from './scenes/private.js'
import { build as explore } from './scenes/explore.js'
import { build as find } from './scenes/find.js'
import { build as airlock } from './scenes/airlock.js'
import { build as open } from './scenes/open.js'
import { build as quote } from './scenes/quote.js'
import { build as endcard } from './scenes/end.js'

const BUILDERS = { problem, reveal, private: priv, explore, find, airlock, open, quote, end: endcard }
const HW = 0.22 // half-width of the scan-line wipe between scenes, in seconds
const CAP_MAX = 62 // characters per caption page

async function boot() {
  const tl = await fetch('./build/timeline.json')
  const T = await (tl.ok ? tl : await fetch('./data/timeline.json')).json()
  await Promise.all([
    document.fonts.load("500 40px 'IBM Plex Sans'"),
    document.fonts.load("400 20px 'IBM Plex Mono'"),
    document.fonts.load("500 20px 'IBM Plex Mono'"),
    document.fonts.load("480 100px 'Fraunces'"),
    document.fonts.load("italic 480 100px 'Fraunces'"),
  ])
  await document.fonts.ready

  const svg = document.getElementById('root')
  const defs = el('defs', {}, svg)
  const pat = el('pattern', { id: 'grid', width: 56, height: 56, patternUnits: 'userSpaceOnUse' }, defs)
  path(pat, 'M56 0H0V56', { stroke: COL.faint, w: 1 })
  const hatch = el('pattern', { id: 'hatch', width: 12, height: 12, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs)
  line(hatch, 0, 0, 0, 12, { stroke: COL.coral, w: 4, opacity: 0.55 })
  const clipIn = el('clipPath', { id: 'clipIn' }, defs)
  const clipOut = el('clipPath', { id: 'clipOut' }, defs)
  const rIn = el('rect', { x: 0, y: 0, width: W, height: H }, clipIn)
  const rOut = el('rect', { x: 0, y: 0, width: W, height: H }, clipOut)

  el('rect', { width: W, height: H, fill: COL.bg }, svg)
  el('rect', { width: W, height: H, fill: 'url(#grid)' }, svg)

  const cue = (name) => {
    const c = T.cues[name]
    if (!c) throw new Error(`unknown cue ${name}`)
    return c
  }
  const ctxBase = { T, cue, W, H }

  // scenes
  const stage = g(svg)
  const scenes = T.scenes.map((sc) => {
    const grp = g(stage, { display: 'none' })
    const api = BUILDERS[sc.id]({ ...ctxBase, root: grp, sc })
    return { sc, grp, update: api.update }
  })

  // the scan line used for wipes
  const scan = g(svg, { opacity: 0 })
  line(scan, 0, 0, 0, H, { stroke: COL.brass, w: 2 })
  for (let y = 0; y < H; y += 24) line(scan, -9, y, 0, y, { stroke: COL.brass, w: 1.5, opacity: 0.8 })

  // ---- chrome: crop marks, plate label, timecode, progress -------------------------------------------------
  const chrome = g(svg)
  for (const [x, y, dx, dy] of [
    [64, 64, 1, 1],
    [W - 64, 64, -1, 1],
    [64, H - 64, 1, -1],
    [W - 64, H - 64, -1, -1],
  ]) {
    path(chrome, `M${x} ${y + dy * 32}V${y}H${x + dx * 32}`, { stroke: COL.line, w: 1.5, cap: 'butt' })
  }
  const plates = [
    [0, '01', 'CAPACITY'],
    [cue('sliver').s - 0.25, '02', 'WEIGHT'],
    [cue('tells').s - 0.35, '03', 'UNKNOWN'],
    [cue('scene.reveal').s, '04', 'INSTRUMENT'],
    [cue('scene.private').s, '05', 'DATA FLOW'],
    [cue('senders').s - 0.3, '06', 'SENDERS'],
    [cue('rivers').s - 0.15, '07', 'RIVERS'],
    [cue('tides').s - 0.15, '08', 'TIDES'],
    [cue('scene.find').s, '09', 'NEBULA'],
    [cue('dups').s - 0.2, '10', 'TWINS & GHOSTS'],
    [cue('scene.airlock').s, '11', 'AIRLOCK'],
    [cue('scene.open').s, '12', 'OPEN'],
    [cue('scene.quote').s, '', ''],
  ]
  const plateG = g(chrome)
  const plateNum = text(plateG, '', 112, 92, { font: 'mono', size: 19, fill: COL.brass, spacing: 0.2, weight: 500 })
  const plateName = text(plateG, '', 112, 92, { font: 'mono', size: 19, fill: COL.mute, spacing: 0.2 })
  const plateRule = line(plateG, 112, 106, 112, 106, { stroke: COL.line, w: 1.5 })
  const tc = text(chrome, '', W - 112, 92, { font: 'mono', size: 19, fill: COL.mute, anchor: 'end', spacing: 0.12 })
  const barY = 1034
  line(chrome, 112, barY, W - 112, barY, { stroke: COL.faint, w: 2 })
  for (const sc of T.scenes)
    line(chrome, 112 + (sc.start / T.duration) * (W - 224), barY - 6, 112 + (sc.start / T.duration) * (W - 224), barY + 6, {
      stroke: COL.line,
      w: 1.5,
    })
  const barFill = line(chrome, 112, barY, 112, barY, { stroke: COL.brass, w: 2.5 })
  const barHead = el('circle', { cx: 112, cy: barY, r: 4.5, fill: COL.brass }, chrome)

  // ---- captions ---------------------------------------------------------------------------------------------
  const measure = document.createElement('canvas').getContext('2d')
  const CAP = { size: 40, weight: 500 }
  measure.font = `${CAP.weight} ${CAP.size}px 'IBM Plex Sans'`
  const spaceW = measure.measureText(' ').width
  const pages = []
  for (const L of T.lines) {
    if (L.i === 9) continue // the closing line is set large on screen; a caption would only repeat it
    const toks = L.words.map((w) => ({ w: w.w, s: L.start + w.s, e: L.start + w.e }))
    const sentences = []
    let cur = []
    for (const t of toks) {
      cur.push(t)
      if (/[.?!]$/.test(t.w)) {
        sentences.push(cur)
        cur = []
      }
    }
    if (cur.length) sentences.push(cur)
    for (const s of sentences) {
      const clauses = []
      let c = []
      for (const t of s) {
        c.push(t)
        if (/[,:]$/.test(t.w)) {
          clauses.push(c)
          c = []
        }
      }
      if (c.length) clauses.push(c)
      let page = []
      for (const cl of clauses) {
        const len = (arr) => arr.map((t) => t.w).join(' ').length
        if (page.length && len([...page, ...cl]) > CAP_MAX) {
          pages.push(page)
          page = []
        }
        page = page.concat(cl)
      }
      if (page.length) pages.push(page)
    }
  }
  for (const p of pages) {
    let x = 0
    for (const t of p) {
      t.x = x
      x += measure.measureText(t.w).width + spaceW
    }
    p.width = x - spaceW
    p.s = p[0].s - 0.05
    p.e = p[p.length - 1].e + 0.3
  }
  const capG = g(svg)
  let capIdx = -2
  let capNodes = []
  const showCaption = (t) => {
    const i = pages.findIndex((p) => t >= p.s && t < p.e)
    if (i !== capIdx) {
      capG.replaceChildren()
      capNodes = []
      capIdx = i
      if (i >= 0) {
        const p = pages[i]
        const x0 = (W - p.width) / 2
        capNodes = p.map((tk) => {
          const n = text(capG, tk.w, x0 + tk.x, 972, { size: CAP.size, weight: CAP.weight, fill: COL.ink })
          set(n, { 'paint-order': 'stroke', stroke: COL.bg, 'stroke-width': 10, 'stroke-linejoin': 'round' })
          return n
        })
      }
    }
    if (i < 0) return
    const p = pages[i]
    const fadeIn = prog(t, p.s, p.s + 0.12)
    const fadeOut = 1 - prog(t, p.e - 0.18, p.e)
    p.forEach((tk, k) => {
      const spoken = prog(t, tk.s - 0.02, tk.s + 0.12)
      capNodes[k].setAttribute('fill-opacity', (0.3 + 0.7 * spoken) * fadeIn * fadeOut)
    })
  }

  // ---- per-frame --------------------------------------------------------------------------------------------
  let lastPlate = -1
  function seek(t) {
    // scenes with wipes
    let wipe = null
    for (let k = 0; k < scenes.length; k++) {
      const s = scenes[k]
      const vis = t >= s.sc.start - HW && t < s.sc.end + HW
      s.grp.setAttribute('display', vis ? 'inline' : 'none')
      s.grp.removeAttribute('clip-path')
      if (!vis) continue
      s.update(t)
      if (k > 0 && t < s.sc.start + HW) {
        const p = E.inOut(prog(t, s.sc.start - HW, s.sc.start + HW))
        set(rIn, { width: W * p })
        s.grp.setAttribute('clip-path', 'url(#clipIn)')
        if (p < 1) {
          const prev = scenes[k - 1]
          set(rOut, { x: W * p, width: W - W * p })
          prev.grp.setAttribute('clip-path', 'url(#clipOut)')
          wipe = p
        }
        if (p <= 0) s.grp.setAttribute('display', 'none')
      }
    }
    if (wipe !== null && wipe > 0 && wipe < 1) {
      scan.setAttribute('opacity', 1)
      scan.setAttribute('transform', `translate(${wipe * W} 0)`)
    } else scan.setAttribute('opacity', 0)

    // chrome
    let pi = 0
    for (let k = 0; k < plates.length; k++) if (t >= plates[k][0]) pi = k
    if (pi !== lastPlate) {
      lastPlate = pi
      const [, n, name] = plates[pi]
      plateNum.textContent = n ? `PLATE ${n}` : ''
      const wNum = n ? 140 : 0
      plateName.textContent = name ? `· ${name}` : ''
      set(plateName, { x: 112 + wNum })
      set(plateRule, { x2: n ? 112 + wNum + name.length * 14.5 + 70 : 112 })
    }
    const pfade = pe(t, plates[pi][0], plates[pi][0] + 0.3)
    plateG.setAttribute('opacity', pfade)
    const endIn = T.scenes.find((s) => s.id === 'quote')
    chrome.setAttribute('opacity', t > endIn.start - 0.3 && t < T.scenes[T.scenes.length - 1].start ? 0.55 : 1)
    const sec = Math.floor(t)
    tc.textContent = `00:${String(sec).padStart(2, '0')}.${Math.floor((t - sec) * 10)}`
    const px = 112 + (t / T.duration) * (W - 224)
    set(barFill, { x2: px })
    set(barHead, { cx: px })
    showCaption(t)
  }

  window.__T = T
  window.__seek = seek
  window.__duration = T.duration
  window.__fps = T.fps
  seek(0)
  window.__ready = true

  // preview: ?play runs in real time (space = pause, arrows = seek)
  const q = new URLSearchParams(location.search)
  if (q.has('t')) seek(parseFloat(q.get('t')))
  if (q.has('play')) {
    let t0 = performance.now() - parseFloat(q.get('start') ?? '0') * 1000
    let paused = false
    let pt = 0
    const tick = () => {
      const t = paused ? pt : ((performance.now() - t0) / 1000) % T.duration
      pt = t
      seek(t)
      requestAnimationFrame(tick)
    }
    addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        paused = !paused
        if (!paused) t0 = performance.now() - pt * 1000
      }
      if (e.key === 'ArrowRight') t0 -= 2000
      if (e.key === 'ArrowLeft') t0 += 2000
    })
    requestAnimationFrame(tick)
  }
}
boot().catch((e) => {
  window.__error = String(e && e.stack ? e.stack : e)
  console.error(e)
})
export { COL, FONT, clamp }
