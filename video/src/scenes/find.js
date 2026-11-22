// Scene 5: find. Lasso a cloud of look-alike emails; then duplicate files (twins) and hidden old versions (ghosts).
import { COL, E, SERIES, circle, clamp, fmt, g, gauss, icon, line, path, pe, prog, rect, rng, smooth, subWipes, text } from '../lib.js'

export function build({ root, cue }) {
  const c = (n) => cue(n).s
  const p1 = g(root)
  const p2 = g(root)
  const wipe = subWipes(root, [
    { g: p1, at: null },
    { g: p2, at: c('dups') - 0.1 },
  ])

  // ============================ panel 1: nebula + lasso ============================
  const R = rng(19)
  const centers = [
    [330, 390, 90, 50],
    [560, 600, 70, 44],
    [780, 420, 136, 60],
    [1010, 610, 110, 54],
    [1130, 390, 80, 42],
    [400, 730, 60, 38],
    [700, 770, 75, 44],
    [1010, 790, 65, 38],
    [250, 590, 50, 34],
  ]
  const SEL = 2
  const pts = []
  centers.forEach(([cx, cy, n, sd], k) => {
    for (let i = 0; i < n; i++) pts.push({ k, x: cx + gauss(R) * sd, y: cy + gauss(R) * sd * 0.82, r: 3 + R() * 1.6 })
  })
  const [scx, scy] = centers[SEL]
  const lassoR = 138
  const lp = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 - 1.1
    const rr = lassoR * (0.94 + 0.22 * Math.sin(i * 1.7) + 0.06 * R())
    return [scx + Math.cos(a) * rr * 1.08, scy + Math.sin(a) * rr * 0.9]
  })
  const inside = (p) => {
    // point in polygon over the smoothed lasso's control points (close enough for colouring)
    let ins = false
    for (let i = 0, j = lp.length - 1; i < lp.length; j = i++) {
      const [xi, yi] = lp[i]
      const [xj, yj] = lp[j]
      if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) ins = !ins
    }
    return ins
  }
  const dots = pts.map((p) => {
    const sel = inside(p)
    return { p, sel, el: circle(p1, p.x, p.y, p.r, { fill: SERIES[p.k % SERIES.length], opacity: 0 }) }
  })
  const selected = dots.filter((d) => d.sel)
  const selCount = selected.length
  const lassoFill = path(p1, smooth(lp, true), { fill: COL.brass, opacity: 0, stroke: 'none' })
  const lasso = path(p1, smooth(lp, true), { stroke: COL.brass, w: 3, dash: '8 7', cap: 'round' })
  const lassoLen = lasso.getTotalLength()
  const cursor = g(p1, { opacity: 0 })
  path(cursor, 'M0 0L0 26L7 20L12 31L17 29L12 18L21 18Z', { stroke: COL.ink, w: 2, fill: COL.bg })
  text(p1, 'SUBJECT SIMILARITY MAP  ·  ONE DOT = ONE EMAIL  ·  CLOSE DOTS SHARE WORDING', 190, 226, {
    font: 'mono',
    size: 17,
    fill: COL.mute,
    spacing: 0.12,
  })
  text(p1, 'ILLUSTRATIVE DATA', 190, 868, { font: 'mono', size: 14, fill: COL.dim, spacing: 0.14 })
  // readout
  const ro = g(p1, { opacity: 0 })
  text(ro, 'SELECTED', 1400, 270, { font: 'mono', size: 18, fill: COL.mute, spacing: 0.24 })
  line(ro, 1400, 288, 1760, 288, { stroke: COL.line, w: 1.5 })
  const cnt = text(ro, '0', 1396, 430, { font: 'display', size: 170, weight: 440, fill: COL.ink, spacing: -0.03 })
  text(ro, 'EMAILS', 1400, 476, { font: 'mono', size: 22, fill: COL.ink2, spacing: 0.2 })
  const gib = text(ro, '0.0 GiB', 1400, 580, { font: 'display', size: 84, italic: true, weight: 420, fill: COL.brass })
  line(ro, 1400, 626, 1760, 626, { stroke: COL.line, w: 1.5 })
  text(ro, 'SAME SUBJECT PATTERN', 1400, 668, { font: 'mono', size: 15, fill: COL.mute, spacing: 0.16 })
  text(ro, 'Weekend Screenings #n', 1400, 702, { font: 'mono', size: 20, fill: COL.ink2 })
  const toAir = g(p1, { opacity: 0 })
  text(toAir, 'ADD TO AIRLOCK', 1400, 784, { font: 'mono', size: 20, fill: COL.brass, spacing: 0.18, weight: 500 })
  path(toAir, 'M1648 778h40M1676 766l12 12-12 12', { stroke: COL.brass, w: 2.5 })

  // ============================ panel 2: twins and ghosts ============================
  const doc = (parent, x, y, w, h, o = {}) => {
    const grp = g(parent, o.attrs ?? {})
    const f = 26
    path(grp, `M${x} ${y}H${x + w - f}L${x + w} ${y + f}V${y + h}H${x}Z`, {
      fill: o.fill ?? COL.bg2,
      stroke: o.stroke ?? COL.line,
      w: 2,
      dash: o.dash,
    })
    path(grp, `M${x + w - f} ${y}V${y + f}H${x + w}`, { stroke: o.stroke ?? COL.line, w: 2, dash: o.dash })
    if (!o.bare) {
      for (let i = 0; i < 6; i++)
        rect(grp, x + 22, y + 56 + i * 22, i % 3 === 2 ? w * 0.38 : w * 0.62, 7, { fill: COL.dim, rx: 3, opacity: 0.8 })
    }
    return grp
  }
  text(p2, 'TWINS  ·  IDENTICAL CHECKSUM', 190, 226, { font: 'mono', size: 18, fill: COL.blue, spacing: 0.18, weight: 500 })
  const twinNames = ['budget.xlsx', 'budget (1).xlsx', 'Copy of budget.xlsx']
  const twins = twinNames.map((nm, i) => {
    const x = 190 + i * 250
    const grp = g(p2, { opacity: 0 })
    const keep = i === 0
    doc(grp, x, 310, 200, 262, { stroke: keep ? COL.teal : COL.coral, fill: COL.bg2 })
    text(grp, nm, x, 614, { font: 'mono', size: 17, fill: COL.ink2 })
    text(grp, '24 MiB', x, 642, { font: 'mono', size: 17, fill: COL.mute })
    if (keep) {
      icon(grp, 'check', x + 124, 508, 52, COL.teal)
      text(grp, 'KEEP', x + 22, 548, { font: 'mono', size: 15, fill: COL.teal, spacing: 0.2, weight: 500 })
    } else {
      icon(grp, 'trash', x + 124, 508, 52, COL.coral)
      text(grp, 'EXTRA', x + 22, 548, { font: 'mono', size: 15, fill: COL.coral, spacing: 0.2, weight: 500 })
    }
    return grp
  })
  const hashG = g(p2, { opacity: 0 })
  path(hashG, 'M190 674v16H850v-16', { stroke: COL.brass, w: 2 })
  text(hashG, 'sha256  9f2c…a41e  ·  SAME ON ALL THREE', 520, 728, {
    font: 'mono',
    size: 19,
    fill: COL.brass,
    anchor: 'middle',
    spacing: 0.06,
    weight: 500,
  })
  const sumTwins = g(p2, { opacity: 0 })
  text(sumTwins, 'KEEP 1  ·  REMOVE 2  ·  FREE 48 MiB', 190, 800, { font: 'display', size: 40, weight: 430, fill: COL.ink })
  line(p2, 960, 230, 960, 820, { stroke: COL.line, w: 1.5, dash: '3 8' })

  const ghostHead = text(p2, 'GHOSTS  ·  OLD VERSIONS KEPT FOREVER', 1040, 226, {
    font: 'mono',
    size: 18,
    fill: COL.coral,
    spacing: 0.18,
    weight: 500,
    opacity: 0,
  })
  const ghosts = g(p2)
  const GX = 1100
  const GY = 330
  const ghostLayers = Array.from({ length: 5 }, (_, i) => {
    const k = 5 - i
    const grp = g(ghosts, { opacity: 0 })
    doc(grp, GX + k * 22, GY - k * 16 + 12, 200, 262, { stroke: COL.coral, fill: COL.bg, bare: true, dash: '6 5' })
    rect(grp, GX + k * 22, GY - k * 16 + 12, 200, 262, { fill: 'url(#hatch)', opacity: 0.35 })
    return grp
  })
  const front = g(ghosts, { opacity: 0 })
  doc(front, GX, GY + 12, 200, 262, { stroke: COL.ink2, fill: COL.bg2 })
  text(front, 'report.pdf', GX, GY + 314, { font: 'mono', size: 18, fill: COL.ink2 })
  const lbls = g(p2, { opacity: 0 })
  line(lbls, 1400, GY + 120, 1430, GY + 120, { stroke: COL.ink2, w: 1.5 })
  text(lbls, 'VISIBLE', 1440, GY + 100, { font: 'mono', size: 15, fill: COL.mute, spacing: 0.2 })
  text(lbls, '12 MiB', 1440, GY + 134, { font: 'display', size: 54, weight: 430, fill: COL.ink })
  text(lbls, 'USED IN YOUR QUOTA', 1440, GY + 200, { font: 'mono', size: 15, fill: COL.mute, spacing: 0.2 })
  text(lbls, '60 MiB', 1440, GY + 254, { font: 'display', size: 54, italic: true, weight: 430, fill: COL.coral })
  const bar = g(p2, { opacity: 0 })
  rect(bar, 1040, 770, 120, 26, { fill: COL.ink2 })
  rect(bar, 1160, 770, 480, 26, { fill: 'url(#hatch)', stroke: COL.coral, w: 1.5 })
  text(bar, '12', 1100, 760, { font: 'mono', size: 16, fill: COL.mute, anchor: 'middle' })
  text(bar, '+ 48 MiB OF HIDDEN VERSIONS', 1400, 760, { font: 'mono', size: 16, fill: COL.coral, anchor: 'middle', spacing: 0.1 })

  function update(t) {
    wipe(t)
    // ----- lasso -----
    const lp_ = pe(t, c('lasso') - 0.05, c('lasso') + 1.2, E.inOut)
    dots.forEach((d, i) => {
      const vis = pe(t, 30.75 + 0.1 + (i / dots.length) * 0.6, 30.75 + 0.5 + (i / dots.length) * 0.6)
      d.el.setAttribute('opacity', vis * (d.sel ? 1 : 1 - 0.55 * pe(t, c('lasso') + 1.1, c('lasso') + 1.6)))
      if (d.sel) {
        const k = pe(t, c('lasso') + 1.15 + (i % 40) * 0.012, c('lasso') + 1.5 + (i % 40) * 0.012)
        d.el.setAttribute('fill', k > 0.5 ? COL.brass : SERIES[d.p.k % SERIES.length])
        d.el.setAttribute('r', d.p.r * (1 + 0.7 * k))
      }
    })
    lasso.setAttribute('stroke-dasharray', lp_ < 1 ? `${lassoLen}` : '8 7')
    lasso.setAttribute('stroke-dashoffset', lp_ < 1 ? `${lassoLen * (1 - lp_)}` : '0')
    lasso.setAttribute('opacity', lp_ > 0 ? 1 : 0)
    lassoFill.setAttribute('opacity', 0.09 * pe(t, c('lasso') + 1.1, c('lasso') + 1.5))
    if (lp_ > 0 && lp_ < 1) {
      const pt = lasso.getPointAtLength(lassoLen * lp_)
      cursor.setAttribute('transform', `translate(${pt.x + 4} ${pt.y + 4})`)
      cursor.setAttribute('opacity', 1)
    } else cursor.setAttribute('opacity', pe(t, c('lasso') + 1.2, c('lasso') + 1.5) > 0 ? 1 - pe(t, c('lasso') + 1.2, c('lasso') + 1.6) : 0)
    ro.setAttribute('opacity', pe(t, c('lasso') + 0.9, c('lasso') + 1.3))
    const n = E.out(prog(t, c('lasso') + 1.15, c('lasso') + 2.0))
    cnt.textContent = String(Math.round(selCount * n))
    gib.textContent = `${fmt(3.4 * n, 1)} GiB`
    toAir.setAttribute('opacity', pe(t, c('lasso') + 1.9, c('lasso') + 2.2))

    // ----- twins -----
    twins.forEach((n_, i) => {
      const p = pe(t, c('dups') - 0.05 + i * 0.16, c('dups') + 0.35 + i * 0.16)
      n_.setAttribute('opacity', p)
      n_.setAttribute('transform', `translate(0 ${(1 - p) * 20})`)
    })
    hashG.setAttribute('opacity', pe(t, c('dups') + 0.55, c('dups') + 0.95))
    sumTwins.setAttribute('opacity', pe(t, c('dups') + 1.0, c('dups') + 1.4))
    // ----- ghosts -----
    ghostHead.setAttribute('opacity', pe(t, c('ghosts') - 0.2, c('ghosts') + 0.2))
    front.setAttribute('opacity', pe(t, c('ghosts') - 0.15, c('ghosts') + 0.25))
    ghostLayers.forEach((l, i) => {
      const p = pe(t, c('ghosts') + 0.1 + i * 0.1, c('ghosts') + 0.5 + i * 0.1)
      l.setAttribute('opacity', p)
      l.setAttribute('transform', `translate(${(1 - p) * -30} ${(1 - p) * 24})`)
    })
    lbls.setAttribute('opacity', pe(t, c('ghosts') + 0.55, c('ghosts') + 0.95))
    bar.setAttribute('opacity', pe(t, c('ghosts') + 0.9, c('ghosts') + 1.3))
    void clamp
  }
  return { update }
}
