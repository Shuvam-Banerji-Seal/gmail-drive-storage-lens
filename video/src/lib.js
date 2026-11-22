// Shared toolkit for the teaser: palette, easing, seeded randomness, SVG helpers and a treemap layout.

export const W = 1920
export const H = 1080
export const SVGNS = 'http://www.w3.org/2000/svg'

export const COL = {
  bg: '#0a0e19',
  bg2: '#0e1323',
  ink: '#e9edf7',
  ink2: '#c3cbe0',
  mute: '#8e98b4',
  dim: '#566081',
  line: 'rgba(196,210,255,0.20)',
  faint: 'rgba(196,210,255,0.09)',
  brass: '#e8b552',
  blue: '#7cb4ff',
  teal: '#5fd6b0',
  coral: '#ff8a73',
  rose: '#f290bd',
  lime: '#a9d46f',
  sand: '#d9c294',
  cyan: '#54c6e0',
}
export const SERIES = [COL.brass, COL.blue, COL.teal, COL.coral, COL.cyan, COL.rose, COL.lime, COL.sand]
export const FONT = {
  display: "'Fraunces', 'Iowan Old Style', Georgia, serif",
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a, b, t) => a + (b - a) * t
/** 0..1 progress of t through the window [a, b]. */
export const prog = (t, a, b) => (b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)))
export const E = {
  lin: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  out4: (t) => 1 - Math.pow(1 - t, 4),
  outx: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => {
    const c = 1.5
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
  },
}
/** progress through [a, b] with an easing. */
export const pe = (t, a, b, f = E.out) => f(prog(t, a, b))

export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function gauss(r) {
  let u = 0
  let v = 0
  while (u === 0) u = r()
  while (v === 0) v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, tag)
  set(n, attrs)
  if (parent) parent.appendChild(n)
  return n
}
export function set(n, attrs) {
  for (const k in attrs) {
    const v = attrs[k]
    if (v === undefined || v === null) n.removeAttribute(k)
    else n.setAttribute(k, v)
  }
  return n
}
export const g = (parent, attrs = {}) => el('g', attrs, parent)

/** Text node. o: size, font (display|sans|mono), weight, fill, anchor, spacing (em), italic, opacity */
export function text(parent, str, x, y, o = {}) {
  const n = el('text', {}, parent)
  n.textContent = str
  styleText(n, x, y, o)
  return n
}
export function styleText(n, x, y, o = {}) {
  const a = {
    x,
    y,
    'font-family': FONT[o.font ?? 'sans'],
    'font-size': o.size ?? 28,
    'font-weight': o.weight ?? 400,
    fill: o.fill ?? COL.ink,
    'text-anchor': o.anchor ?? 'start',
    'letter-spacing': o.spacing !== undefined ? `${o.spacing}em` : undefined,
    'font-style': o.italic ? 'italic' : undefined,
    opacity: o.opacity,
  }
  set(n, a)
  if (o.upper) n.style.textTransform = 'uppercase'
  return n
}

export const line = (parent, x1, y1, x2, y2, o = {}) =>
  el(
    'line',
    {
      x1,
      y1,
      x2,
      y2,
      stroke: o.stroke ?? COL.line,
      'stroke-width': o.w ?? 1.5,
      'stroke-dasharray': o.dash,
      'stroke-linecap': o.cap ?? 'butt',
      opacity: o.opacity,
    },
    parent,
  )
export const rect = (parent, x, y, w, h, o = {}) =>
  el(
    'rect',
    {
      x,
      y,
      width: w,
      height: h,
      rx: o.rx,
      fill: o.fill ?? 'none',
      stroke: o.stroke,
      'stroke-width': o.w ?? 1.5,
      'stroke-dasharray': o.dash,
      opacity: o.opacity,
    },
    parent,
  )
export const circle = (parent, cx, cy, r, o = {}) =>
  el(
    'circle',
    { cx, cy, r, fill: o.fill ?? 'none', stroke: o.stroke, 'stroke-width': o.w ?? 1.5, 'stroke-dasharray': o.dash, opacity: o.opacity },
    parent,
  )
export const path = (parent, d, o = {}) =>
  el(
    'path',
    {
      d,
      fill: o.fill ?? 'none',
      stroke: o.stroke,
      'stroke-width': o.w ?? 1.5,
      'stroke-linecap': o.cap ?? 'round',
      'stroke-linejoin': 'round',
      'stroke-dasharray': o.dash,
      opacity: o.opacity,
    },
    parent,
  )

/** Draw-on effect for a stroked element: p in 0..1. */
export function drawOn(n, p, len) {
  const L = len ?? n.getTotalLength()
  n.setAttribute('stroke-dasharray', `${L}`)
  n.setAttribute('stroke-dashoffset', `${L * (1 - p)}`)
}
export const show = (n, v) => n.setAttribute('opacity', clamp(v))
export const move = (n, x, y, s = 1, rot = 0) =>
  n.setAttribute('transform', `translate(${x} ${y})${rot ? ` rotate(${rot})` : ''}${s !== 1 ? ` scale(${s})` : ''}`)

export const fmt = (n, d = 1) => n.toFixed(d)
export const pad2 = (n) => String(n).padStart(2, '0')

/** Squarified treemap (Bruls et al.). items: [{v, ...}] sorted descending; returns items with x,y,w,h. */
export function treemap(items, x, y, w, h) {
  const total = items.reduce((s, i) => s + i.v, 0)
  const k = (w * h) / total
  const out = []
  let rest = items.map((i) => ({ ...i, a: i.v * k }))
  let rx = x
  let ry = y
  let rw = w
  let rh = h
  const worst = (row, side) => {
    const s = row.reduce((a, i) => a + i.a, 0)
    const mx = Math.max(...row.map((i) => i.a))
    const mn = Math.min(...row.map((i) => i.a))
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn))
  }
  while (rest.length) {
    const side = Math.min(rw, rh)
    let row = [rest[0]]
    let i = 1
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) row.push(rest[i++])
    rest = rest.slice(i)
    const s = row.reduce((a, r) => a + r.a, 0)
    if (rw >= rh) {
      const cw = s / rh
      let cy = ry
      for (const r of row) {
        const ch = r.a / cw
        out.push({ ...r, x: rx, y: cy, w: cw, h: ch })
        cy += ch
      }
      rx += cw
      rw -= cw
    } else {
      const chh = s / rw
      let cx = rx
      for (const r of row) {
        const cw = r.a / chh
        out.push({ ...r, x: cx, y: ry, w: cw, h: chh })
        cx += cw
      }
      ry += chh
      rh -= chh
    }
  }
  return out
}

/** Smooth closed/open path through points (Catmull-Rom to cubic Bezier). */
export function smooth(pts, closed = false) {
  const n = pts.length
  const P = (i) => pts[(i + n) % n]
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = closed ? P(i - 1) : pts[Math.max(0, i - 1)]
    const p1 = P(i)
    const p2 = closed ? P(i + 1) : pts[i + 1]
    const p3 = closed ? P(i + 2) : pts[Math.min(n - 1, i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return closed ? `${d}Z` : d
}

/** A mono label with a small leader line; returns the group. */
export function callout(parent, x1, y1, x2, y2, label, o = {}) {
  const grp = g(parent)
  line(grp, x1, y1, x2, y2, { stroke: o.stroke ?? COL.mute, w: 1.2 })
  circle(grp, x1, y1, 3.5, { fill: o.stroke ?? COL.mute })
  text(grp, label, x2 + (o.dx ?? 12), y2 + 6, {
    font: 'mono',
    size: o.size ?? 20,
    fill: o.fill ?? COL.ink2,
    anchor: o.anchor ?? 'start',
    spacing: 0.04,
  })
  return grp
}

/** Icons drawn in a 48x48 box with 2px strokes. Returns a group translated to (x, y), scaled to size. */
export function icon(parent, name, x, y, size = 48, color = COL.ink) {
  const grp = g(parent, { transform: `translate(${x} ${y}) scale(${size / 48})` })
  const s = { stroke: color, w: 2.4, fill: 'none' }
  const P = (d, o = {}) => path(grp, d, { ...s, ...o })
  if (name === 'clip') P('M31 18 17 32a5 5 0 0 0 7 7l16-17a8 8 0 0 0-11-11L12 29a11 11 0 0 0 16 16l12-13')
  else if (name === 'lock') {
    rect(grp, 10, 22, 28, 20, { ...s, rx: 4 })
    P('M16 22v-6a8 8 0 0 1 16 0v6')
  } else if (name === 'trash') {
    P('M8 14h32M18 14V8h12v6M12 14l2 28h20l2-28M20 22v14M28 22v14')
  } else if (name === 'archive') {
    rect(grp, 6, 8, 36, 10, { ...s, rx: 2 })
    P('M10 18v22h28V18M20 27h8')
  } else if (name === 'select') {
    rect(grp, 8, 8, 32, 32, { ...s, dash: '5 5', rx: 4 })
    P('M16 25l6 6 11-13')
  } else if (name === 'warn') {
    P('M24 6 3 42h42zM24 20v10M24 35v.5')
  } else if (name === 'check') P('M10 25l9 9 19-21')
  else if (name === 'shield') {
    P('M24 5l16 6v12c0 10-7 17-16 20-9-3-16-10-16-20V11z')
    P('M16 24l6 6 11-12')
  } else if (name === 'code') P('M17 14 7 24l10 10M31 14l10 10-10 10M27 10 21 38')
  else if (name === 'browser') {
    rect(grp, 5, 8, 38, 32, { ...s, rx: 4 })
    P('M5 18h38M11 13h.5M17 13h.5')
  } else if (name === 'cloud') P('M14 36a9 9 0 0 1-1-18 12 12 0 0 1 23 3 8 8 0 0 1-1 15z')
  else if (name === 'key') {
    circle(grp, 15, 33, 8, s)
    P('M21 27 40 8M34 14l5 5M29 19l4 4')
  } else if (name === 'mail') {
    rect(grp, 5, 10, 38, 28, { ...s, rx: 3 })
    P('M6 12l18 15L42 12')
  } else if (name === 'file') {
    P('M12 5h17l9 9v29H12zM29 5v9h9')
  } else if (name === 'undo') P('M14 16H30a10 10 0 0 1 0 20H16M14 16l7-7M14 16l7 7')
  else if (name === 'server') {
    rect(grp, 7, 8, 34, 14, { ...s, rx: 3 })
    rect(grp, 7, 26, 34, 14, { ...s, rx: 3 })
    P('M14 15h.5M14 33h.5M22 15h12M22 33h12')
  } else if (name === 'dollar') P('M30 14c-1-3-4-4-7-4-4 0-7 2-7 5s3 4 8 5 8 2 8 5-3 6-8 6c-4 0-7-2-8-5M24 6v36')
  return grp
}

// ---------- text measurement and letter-by-letter text ----------
const mctx = document.createElement('canvas').getContext('2d')
export function textWidth(str, o = {}) {
  const size = o.size ?? 28
  mctx.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${size}px ${FONT[o.font ?? 'sans']}`
  mctx.letterSpacing = `${(o.spacing ?? 0) * size}px`
  return mctx.measureText(str).width
}
/** One <text> per character, positioned with kerning (prefix widths) so letters can be animated separately. */
export function letters(parent, str, x, y, o = {}) {
  const total = textWidth(str, o)
  const x0 = o.anchor === 'middle' ? x - total / 2 : o.anchor === 'end' ? x - total : x
  const out = []
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ' ') continue
    const px = x0 + textWidth(str.slice(0, i), o)
    const n = text(parent, str[i], px, y, { ...o, anchor: 'start' })
    out.push({ n, i, x: px, y, ch: str[i] })
  }
  return { items: out, width: total, x0 }
}

/** In-scene scan-line wipes between panels. panels: [{ g, at }] where at is the time of the cut (first panel: null). */
export function subWipes(root, panels, half = 0.22, H_ = H) {
  const defs = el('defs', {}, root)
  const clips = panels.map((_, i) => {
    const cp = el('clipPath', { id: `sw-${(root.__id ??= Math.random().toString(36).slice(2, 7))}-${i}` }, defs)
    const r = el('rect', { x: 0, y: 0, width: W, height: H_ }, cp)
    return { id: cp.getAttribute('id'), r }
  })
  const scan = g(root, { opacity: 0 })
  line(scan, 0, 0, 0, H_, { stroke: COL.brass, w: 2 })
  for (let y = 0; y < H_; y += 24) line(scan, -9, y, 0, y, { stroke: COL.brass, w: 1.5, opacity: 0.8 })
  panels.forEach((p, i) => p.g.setAttribute('clip-path', `url(#${clips[i].id})`))
  return (t) => {
    const prog_ = panels.map((p, i) => (i === 0 ? 1 : E.inOut(prog(t, p.at - half, p.at + half))))
    let sx = null
    panels.forEach((p, i) => {
      const inP = prog_[i]
      const outP = i + 1 < panels.length ? prog_[i + 1] : 0
      const x0 = outP * W
      const x1 = inP * W
      clips[i].r.setAttribute('x', x0)
      clips[i].r.setAttribute('width', Math.max(0, x1 - x0))
      p.g.setAttribute('display', x1 - x0 > 0.5 ? 'inline' : 'none')
      if (i > 0 && inP > 0 && inP < 1) sx = inP * W
    })
    scan.setAttribute('opacity', sx === null ? 0 : 1)
    if (sx !== null) scan.setAttribute('transform', `translate(${sx} 0)`)
  }
}

/** Straight arrow with a separate head so that draw-on never detaches the head. set(p) draws p in 0..1. */
export function arrow(parent, x1, y1, x2, y2, o = {}) {
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const hl = o.head ?? 14
  const len = Math.hypot(x2 - x1, y2 - y1)
  const grp = g(parent)
  const ln = line(grp, x1, y1, x2, y2, { stroke: o.stroke ?? COL.mute, w: o.w ?? 2.2, cap: 'round' })
  const pt = (a) => `${(x2 - hl * Math.cos(ang + a)).toFixed(1)} ${(y2 - hl * Math.sin(ang + a)).toFixed(1)}`
  const head = path(grp, `M${pt(-0.5)}L${x2} ${y2}L${pt(0.5)}`, { stroke: o.stroke ?? COL.mute, w: o.w ?? 2.2 })
  return {
    g: grp,
    set(p) {
      ln.setAttribute('stroke-dasharray', `${len}`)
      ln.setAttribute('stroke-dashoffset', `${len * (1 - clamp(p))}`)
      head.setAttribute('opacity', clamp((p - 0.9) / 0.1))
    },
  }
}
