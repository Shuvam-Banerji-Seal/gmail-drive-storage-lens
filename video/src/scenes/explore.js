// Scene 4: explore. Constellation of senders -> Sankey of where the bytes flow -> stream of bytes per month.
import { COL, E, SERIES, W, circle, clamp, el, fmt, g, line, path, pe, rect, rng, smooth, subWipes, text } from '../lib.js'

let uid = 0

export function build({ root, cue }) {
  const c = (n) => cue(n).s
  const p1 = g(root)
  const p2 = g(root)
  const p3 = g(root)
  const wipe = subWipes(root, [
    { g: p1, at: null },
    { g: p2, at: c('rivers') - 0.1 },
    { g: p3, at: c('tides') - 0.1 },
  ])

  // ============================ panel 1: constellation ============================
  const R = rng(7)
  const names = [
    ['Movie Night Society', 3.4, 0],
    ['Photography Circle', 3.4, 1],
    ['Podcast Digest', 2.4, 0],
    ['Coding Meetup', 2.1, 2],
    ['Hiking Trails Newsletter', 1.8, 1],
    ['Board Game Guild', 1.3, 2],
    ['Local Bake Sale', 0.8, 0],
  ]
  const nodes = []
  const comm = [15, 11, 8]
  comm.forEach((count, cidx) => {
    for (let i = 0; i < count; i++) nodes.push({ c: cidx, v: 0.05 + 0.5 * Math.pow(R(), 2.4), name: '' })
  })
  names.forEach(([nm, v, cc], i) => {
    const idx = nodes.findIndex((n, k) => n.c === cc && !n.name && k >= i)
    const n = nodes[idx >= 0 ? idx : i]
    n.name = nm
    n.v = v
  })
  nodes.forEach((n, i) => (n.i = i))
  const links = []
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const same = nodes[a].c === nodes[b].c
      if (R() < (same ? 0.45 : 0.018)) links.push([a, b])
    }
  }
  nodes.forEach((n) => {
    n.r = 6 + Math.sqrt(n.v) * 11.5
    const ang = (n.c / 3) * Math.PI * 2 + R() * 1.4
    n.x = Math.cos(ang) * 220 + (R() - 0.5) * 120
    n.y = Math.sin(ang) * 160 + (R() - 0.5) * 120
  })
  const CENTERS = [
    [-250, -30],
    [240, -90],
    [30, 190],
  ]
  for (let it = 0; it < 420; it++) {
    const cool = 1 - it / 420
    for (const a of nodes) {
      const cc = CENTERS[a.c]
      let fx = (cc[0] - a.x) * 0.03
      let fy = (cc[1] - a.y) * 0.03
      for (const b of nodes) {
        if (a === b) continue
        const dx = a.x - b.x
        const dy = a.y - b.y
        const d2 = Math.max(dx * dx + dy * dy, 60)
        const d = Math.sqrt(d2)
        const rep = 3200 / d2
        fx += (dx / d) * rep
        fy += (dy / d) * rep
        const minD = a.r + b.r + 10
        if (d < minD) {
          fx += (dx / d) * (minD - d) * 0.5
          fy += (dy / d) * (minD - d) * 0.5
        }
      }
      a.fx = fx
      a.fy = fy
    }
    for (const [i, j] of links) {
      const a = nodes[i]
      const b = nodes[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.max(Math.hypot(dx, dy), 1)
      const f = (d - 80) * 0.04
      a.fx += (dx / d) * f
      a.fy += (dy / d) * f
      b.fx -= (dx / d) * f
      b.fy -= (dy / d) * f
    }
    for (const a of nodes) {
      a.x += clamp(a.fx, -12, 12) * cool
      a.y += clamp(a.fy, -12, 12) * cool
    }
  }
  const gx0 = 190
  const gx1 = 1230
  const gy0 = 200
  const gy1 = 830
  const minX = Math.min(...nodes.map((n) => n.x - n.r))
  const maxX = Math.max(...nodes.map((n) => n.x + n.r))
  const minY = Math.min(...nodes.map((n) => n.y - n.r))
  const maxY = Math.max(...nodes.map((n) => n.y + n.r))
  const sc = Math.min((gx1 - gx0) / (maxX - minX), (gy1 - gy0) / (maxY - minY))
  for (const n of nodes) {
    n.x = gx0 + (n.x - minX) * sc + (gx1 - gx0 - (maxX - minX) * sc) / 2
    n.y = gy0 + (n.y - minY) * sc + (gy1 - gy0 - (maxY - minY) * sc) / 2
    n.r *= Math.min(1.15, sc)
  }
  const CC = [COL.brass, COL.blue, COL.teal]
  const edgeEls = links.map(([i, j]) => line(p1, nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y, { stroke: COL.mute, w: 1.2, opacity: 0 }))
  const nodeEls = nodes.map((n) => {
    const grp = g(p1, { opacity: 0 })
    circle(grp, n.x, n.y, n.r + 5, { fill: CC[n.c], opacity: 0.12 })
    circle(grp, n.x, n.y, n.r, { fill: CC[n.c] })
    return grp
  })
  const labeled = nodes.filter((n) => n.name).sort((a, b) => b.v - a.v)
  const rankEls = labeled.map((n, i) =>
    text(p1, String(i + 1), n.x, n.y + Math.max(6, n.r * 0.34), {
      font: 'mono',
      size: Math.max(14, n.r * 0.95),
      fill: COL.bg,
      anchor: 'middle',
      weight: 600,
      opacity: 0,
    }),
  )
  const top = labeled[0]
  const ring = circle(p1, top.x, top.y, top.r + 12, { stroke: COL.brass, w: 2.5, opacity: 0 })
  const callout = g(p1, { opacity: 0 })
  text(callout, '01  MOVIE NIGHT SOCIETY', gx0, 226, { font: 'mono', size: 21, fill: COL.brass, weight: 500, spacing: 0.1 })
  text(callout, '3.4 GiB  ·  136 EMAILS  ·  18% OPENED', gx0, 256, { font: 'mono', size: 17, fill: COL.ink2, spacing: 0.08 })
  const stat1 = text(p1, `${nodes.length} SENDERS  ·  ${links.length} LINKS  ·  3 COMMUNITIES`, gx0, 868, {
    font: 'mono',
    size: 17,
    fill: COL.mute,
    spacing: 0.12,
    opacity: 0,
  })
  // ranking list
  const rank = g(p1)
  text(rank, 'HEAVIEST SENDERS', 1370, 214, { font: 'mono', size: 18, fill: COL.mute, spacing: 0.2 })
  line(rank, 1370, 232, 1760, 232, { stroke: COL.line, w: 1.5 })
  const rows = [...names].map(([nm, v, cc], i) => {
    const y = 290 + i * 78
    const grp = g(rank, { opacity: 0 })
    text(grp, String(i + 1).padStart(2, '0'), 1370, y, { font: 'mono', size: 18, fill: COL.brass, weight: 500 })
    text(grp, nm.toUpperCase().slice(0, 22), 1416, y, { font: 'mono', size: 18, fill: COL.ink2, spacing: 0.04 })
    text(grp, `${fmt(v, 1)} GiB`, 1760, y, { font: 'mono', size: 18, fill: COL.ink, anchor: 'end', weight: 500 })
    rect(grp, 1416, y + 16, 344, 8, { fill: COL.faint, rx: 4 })
    const bar = rect(grp, 1416, y + 16, 1, 8, { fill: CC[cc], rx: 4 })
    return { grp, bar, w: (v / 3.4) * 344 }
  })

  // ============================ panel 2: sankey ============================
  const SX = [200, 640, 1080, 1520]
  const NW = 26
  const cols = [
    [
      ['example.com', 12.4, COL.brass],
      ['example.org', 3.7, COL.blue],
      ['example.edu', 1.9, COL.teal],
    ],
    [
      ['Forums', 10.5, COL.coral],
      ['Promotions', 6.1, COL.rose],
      ['Updates', 1.4, COL.sand],
    ],
    [
      ['Unread', 11.6, COL.coral],
      ['Read', 6.4, COL.teal],
    ],
    [
      ['Safe to clean', 17.5, COL.brass],
      ['Review', 0.3, COL.sand],
      ['Keep', 0.2, COL.teal],
    ],
  ]
  const flows = [
    [0, 0, 0, 7.4],
    [0, 0, 1, 4.0],
    [0, 0, 2, 1.0],
    [0, 1, 0, 2.1],
    [0, 1, 1, 1.4],
    [0, 1, 2, 0.2],
    [0, 2, 0, 1.0],
    [0, 2, 1, 0.7],
    [0, 2, 2, 0.2],
    [1, 0, 0, 6.9],
    [1, 0, 1, 3.6],
    [1, 1, 0, 3.9],
    [1, 1, 1, 2.2],
    [1, 2, 0, 0.8],
    [1, 2, 1, 0.6],
    [2, 0, 0, 11.5],
    [2, 0, 1, 0.1],
    [2, 0, 2, 0.0],
    [2, 1, 0, 6.0],
    [2, 1, 1, 0.2],
    [2, 1, 2, 0.2],
  ].filter((f) => f[3] > 0)
  const SC = 27
  const GAP = 22
  const lay = cols.map((col) => {
    const total = col.reduce((s, n) => s + n[1] * SC, 0) + GAP * (col.length - 1)
    let y = 540 - total / 2
    return col.map((n) => {
      const o = { name: n[0], v: n[1], color: n[2], y, h: Math.max(3, n[1] * SC), outOff: 0, inOff: 0 }
      y += o.h + GAP
      return o
    })
  })
  const reveal2 = g(p2)
  const cpId = `sk-${uid++}`
  const defs2 = el('defs', {}, p2)
  const cp2 = el('clipPath', { id: cpId }, defs2)
  const cpR = el('rect', { x: 0, y: 150, width: 0, height: 800 }, cp2)
  reveal2.setAttribute('clip-path', `url(#${cpId})`)
  const ribbons = g(reveal2)
  const nodeG = g(reveal2)
  for (const [ci, a, b, v] of flows) {
    const A = lay[ci][a]
    const B = lay[ci + 1][b]
    const h = v * SC
    const x1 = SX[ci] + NW
    const x2 = SX[ci + 1]
    const ya = A.y + A.outOff
    const yb = B.y + B.inOff
    A.outOff += h
    B.inOff += h
    const xm = (x1 + x2) / 2
    const col = ci === 2 ? B.color : A.color
    path(ribbons, `M${x1} ${ya}C${xm} ${ya} ${xm} ${yb} ${x2} ${yb}L${x2} ${yb + h}C${xm} ${yb + h} ${xm} ${ya + h} ${x1} ${ya + h}Z`, {
      fill: col,
      opacity: 0.34,
    })
  }
  lay.forEach((col, ci) => {
    let prev = -1e9
    col.forEach((n) => {
      rect(nodeG, SX[ci], n.y, NW, n.h, { fill: n.color, rx: 3 })
      const mid = n.y + n.h / 2
      const ly = Math.max(mid, prev + 52) // keep labels of tiny neighbouring nodes apart
      prev = ly
      if (Math.abs(ly - mid) > 4) line(nodeG, SX[ci] + NW, mid, SX[ci] + NW + 10, ly - 6, { stroke: COL.mute, w: 1.2 })
      text(nodeG, n.name.toUpperCase(), SX[ci] + NW + 14, ly - 2, { font: 'mono', size: 20, fill: COL.ink, weight: 500, spacing: 0.06 })
      text(nodeG, `${fmt(n.v, 1)} GiB`, SX[ci] + NW + 14, ly + 22, { font: 'mono', size: 17, fill: COL.mute, spacing: 0.04 })
    })
  })
  const heads = ['SENDER DOMAIN', 'CATEGORY', 'READ STATE', 'ACTION']
  heads.forEach((h, i) => text(p2, h, SX[i], 214, { font: 'mono', size: 16, fill: COL.mute, spacing: 0.2 }))
  line(p2, 200, 232, 1720, 232, { stroke: COL.line, w: 1.5 })
  text(p2, 'WHERE THE GIGABYTES FLOW  ·  ILLUSTRATIVE DATA', 200, 868, { font: 'mono', size: 15, fill: COL.dim, spacing: 0.14 })

  // ============================ panel 3: tides ============================
  const MON = 42
  const R3 = rng(31)
  const seriesNames = ['Movie Night Society', 'Photography Circle', 'Podcast Digest', 'Coding Meetup', 'Other senders']
  const base = [0.17, 0.12, 0.085, 0.065, 0.05]
  const data = base.map((b, k) =>
    Array.from({ length: MON }, (_, m) => {
      const seasonal = 1 + 0.45 * Math.sin((m / 12) * Math.PI * 2 + k * 1.3)
      const growth = 0.6 + 0.8 * (m / MON)
      let v = b * seasonal * growth * (0.65 + 0.7 * R3())
      if (k === 0 && m === 17) v += 0.78
      if (k === 1 && m === 31) v += 0.62
      return v
    }),
  )
  const totals = Array.from({ length: MON }, (_, m) => data.reduce((s, d) => s + d[m], 0))
  const avg = totals.reduce((s, v) => s + v, 0) / MON
  const peak = Math.max(...totals)
  const CX0 = 230
  const CX1 = 1700
  const CY0 = 250
  const CY1 = 790
  const YMAX = 1.5
  const xAt = (m) => CX0 + (m / (MON - 1)) * (CX1 - CX0)
  const yAt = (v) => CY1 - (v / YMAX) * (CY1 - CY0)
  const monthLabel = (m) => {
    const idx = 4 + m
    return `${2023 + Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
  }
  for (let v = 0; v <= YMAX + 0.01; v += 0.5) {
    line(p3, CX0, yAt(v), CX1, yAt(v), { stroke: COL.faint, w: 1.5 })
    text(p3, `${fmt(v, 1)}`, CX0 - 18, yAt(v) + 6, { font: 'mono', size: 15, fill: COL.mute, anchor: 'end' })
  }
  text(p3, 'GiB / MONTH', CX0 - 18, CY0 - 34, { font: 'mono', size: 14, fill: COL.dim, anchor: 'end', spacing: 0.1 })
  for (let m = 0; m < MON; m += 6) {
    line(p3, xAt(m), CY1, xAt(m), CY1 + 10, { stroke: COL.mute, w: 1.5 })
    text(p3, monthLabel(m), xAt(m), CY1 + 36, { font: 'mono', size: 15, fill: COL.mute, anchor: 'middle' })
  }
  const reveal3 = g(p3)
  const cp3Id = `sk-${uid++}`
  const defs3 = el('defs', {}, p3)
  const cp3 = el('clipPath', { id: cp3Id }, defs3)
  const cp3R = el('rect', { x: 0, y: 150, width: 0, height: 800 }, cp3)
  reveal3.setAttribute('clip-path', `url(#${cp3Id})`)
  const cum = Array.from({ length: MON }, () => 0)
  const layers = data.map((d, k) => {
    const lo = cum.slice()
    d.forEach((v, m) => (cum[m] += v))
    const top = cum.map((v, m) => [xAt(m), yAt(v)])
    const bot = lo.map((v, m) => [xAt(m), yAt(v)]).reverse()
    const dTop = smooth(top)
    const dBot = smooth(bot).replace(/^M[^C]*/, '')
    return path(reveal3, `${dTop}L${bot[0][0]} ${bot[0][1]}${dBot}Z`, { fill: SERIES[k], opacity: 0.82 })
  })
  const totalLine = path(reveal3, smooth(totals.map((v, m) => [xAt(m), yAt(v)])), { stroke: COL.ink, w: 2 })
  void layers
  void totalLine
  const cursor = g(p3, { opacity: 0 })
  line(cursor, 0, CY0 - 10, 0, CY1, { stroke: COL.brass, w: 2 })
  const cDot = circle(cursor, 0, 0, 6, { fill: COL.brass })
  const cText = text(cursor, '', 0, CY0 - 22, { font: 'mono', size: 18, fill: COL.brass, anchor: 'middle', weight: 500, spacing: 0.08 })
  const spikeM = 17
  const spike = g(p3, { opacity: 0 })
  line(spike, xAt(spikeM), yAt(totals[spikeM]) - 6, xAt(spikeM) + 60, yAt(totals[spikeM]) - 70, { stroke: COL.coral, w: 1.5 })
  text(spike, `SPIKE  ·  ${monthLabel(spikeM)}`, xAt(spikeM) + 68, yAt(totals[spikeM]) - 70, {
    font: 'mono',
    size: 18,
    fill: COL.coral,
    weight: 500,
    spacing: 0.08,
  })
  text(spike, `${fmt(totals[spikeM], 1)} GiB IN ONE MONTH`, xAt(spikeM) + 68, yAt(totals[spikeM]) - 46, {
    font: 'mono',
    size: 15,
    fill: COL.ink2,
    spacing: 0.06,
  })
  const leg = g(p3)
  seriesNames.forEach((nm, k) => {
    const x = 240 + k * 300
    rect(leg, x, 848, 14, 14, { fill: SERIES[k] })
    text(leg, nm.toUpperCase(), x + 24, 861, { font: 'mono', size: 14, fill: COL.mute, spacing: 0.06 })
  })
  text(p3, `AVERAGE ${fmt(avg, 2)} GiB / MONTH   ·   PEAK ${fmt(peak, 2)} GiB`, CX1, CY0 - 74, {
    font: 'mono',
    size: 17,
    fill: COL.ink2,
    anchor: 'end',
    spacing: 0.08,
  })

  function update(t) {
    wipe(t)
    // ---- constellation ----
    nodeEls.forEach((n, i) => {
      const p = pe(t, c('senders') + 0.05 + i * 0.022, c('senders') + 0.45 + i * 0.022, E.back)
      n.setAttribute('opacity', clamp(p * 3))
      const nd = nodes[i]
      n.setAttribute('transform', `translate(${nd.x} ${nd.y}) scale(${p}) translate(${-nd.x} ${-nd.y})`)
    })
    edgeEls.forEach((e, i) =>
      e.setAttribute(
        'opacity',
        0.55 * pe(t, c('senders') + 0.5 + (i / edgeEls.length) * 0.7, c('senders') + 0.9 + (i / edgeEls.length) * 0.7),
      ),
    )
    rankEls.forEach((l, i) => l.setAttribute('opacity', pe(t, c('senders') + 0.9 + i * 0.07, c('senders') + 1.2 + i * 0.07)))
    const hi = pe(t, c('inbox') - 0.05, c('inbox') + 0.35)
    ring.setAttribute('opacity', hi)
    callout.setAttribute('opacity', hi)
    stat1.setAttribute('opacity', pe(t, c('senders') + 1.0, c('senders') + 1.4))
    rows.forEach((r, i) => {
      const p = pe(t, c('inbox') - 0.1 + i * 0.1, c('inbox') + 0.4 + i * 0.1)
      r.grp.setAttribute('opacity', p)
      r.bar.setAttribute('width', Math.max(1, r.w * pe(t, c('inbox') + i * 0.1, c('inbox') + 0.7 + i * 0.1)))
    })

    // ---- sankey ----
    cpR.setAttribute('width', pe(t, c('rivers') + 0.0, c('rivers') + 2.0, E.inOut) * (W + 40))

    // ---- tides ----
    const pr = pe(t, c('tides') + 0.1, c('month') + 0.5, E.inOut)
    cp3R.setAttribute('width', 200 + pr * (CX1 - 200 + 40))
    const mi = clamp(pr * (MON - 1), 0, MON - 1)
    const mFloor = Math.floor(mi)
    const x = xAt(mi)
    cursor.setAttribute(
      'opacity',
      pr > 0 && pr < 1 ? 1 : pe(t, c('month') + 0.5, c('month') + 0.9, E.lin) === 0 ? 0 : 1 - pe(t, c('month') + 0.5, c('month') + 1.0),
    )
    cursor.setAttribute('transform', `translate(${x} 0)`)
    cDot.setAttribute('cy', yAt(totals[mFloor] * (1 - (mi - mFloor)) + totals[Math.min(MON - 1, mFloor + 1)] * (mi - mFloor)))
    cText.textContent = `${monthLabel(mFloor)}  ·  ${fmt(totals[mFloor], 2)} GiB`
    spike.setAttribute(
      'opacity',
      pe(
        t,
        c('tides') + 0.1 + (spikeM / (MON - 1)) * (c('month') + 0.5 - c('tides') - 0.1) + 0.2,
        c('tides') + 0.1 + (spikeM / (MON - 1)) * (c('month') + 0.5 - c('tides') - 0.1) + 0.6,
      ),
    )
  }
  return { update }
}
