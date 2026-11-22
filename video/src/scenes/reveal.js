// Scene 2: the reveal. The mark draws on, rings sound outward, the name lands in time with the narrator.
import { COL, E, W, circle, drawOn, el, g, line, pe, prog, text, letters, textWidth } from '../lib.js'

export function build({ root, T, sc }) {
  const L = T.lines[3]
  const word = (re) => {
    const w = L.words.find((x) => re.test(x.w))
    return L.start + w.s
  }
  const tGmail = word(/^Gmail/)
  const tStorage = word(/^Storage/)
  const tLens = word(/^Lens/)
  const s0 = sc.start
  const CX = W / 2
  const CY = 400
  const K = 9.5 // mark scale: the 32-unit mark becomes ~300 px

  // sonar rings
  const rings = [0, 1, 2, 3].map(() => circle(root, CX, CY, 10, { stroke: COL.line, w: 1.5, opacity: 0 }))
  const dashRing = circle(root, CX, CY, 214, { stroke: COL.mute, w: 1.5, dash: '2 10', opacity: 0 })
  const ticks = g(root, { opacity: 0 })
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2
    const long = i % 6 === 0
    line(
      ticks,
      CX + 232 * Math.cos(a),
      CY + 232 * Math.sin(a),
      CX + (long ? 250 : 242) * Math.cos(a),
      CY + (long ? 250 : 242) * Math.sin(a),
      { stroke: COL.line, w: long ? 1.8 : 1.2 },
    )
  }

  // the mark (same geometry as the app's logo)
  const mark = g(root, { transform: `translate(${CX - 14 * K} ${CY - 14 * K}) scale(${K})` })
  const mCircle = circle(mark, 14, 14, 9.5, { stroke: COL.brass, w: 2.2 })
  const mOrbit = el(
    'ellipse',
    { cx: 14, cy: 14, rx: 13, ry: 4.6, fill: 'none', stroke: COL.ink, 'stroke-width': 1, opacity: 0.55, transform: 'rotate(-24 14 14)' },
    mark,
  )
  const mHandle = line(mark, 21, 21, 28, 28, { stroke: COL.brass, w: 3, cap: 'round' })
  const mDot = circle(mark, 14, 14, 2.2, { fill: COL.brass, opacity: 0 })
  const star = circle(mark, 0, 0, 1.15, { fill: COL.brass, opacity: 0 })
  const lc = mCircle.getTotalLength()
  const lo = mOrbit.getTotalLength()
  const lh = mHandle.getTotalLength()

  // wordmark
  const opts = { font: 'display', size: 132, weight: 440, fill: COL.ink, anchor: 'middle', spacing: -0.02 }
  const name = letters(root, 'Gmail Storage Lens', CX, 770, opts)
  const wordOf = (i) => (i < 5 ? 0 : i < 13 ? 1 : 2)
  const starts = [tGmail - 0.12, tStorage - 0.12, tLens - 0.12]
  const sub = text(root, 'STORAGE ANALYZER FOR GMAIL & GOOGLE DRIVE', CX, 850, {
    font: 'mono',
    size: 24,
    fill: COL.mute,
    anchor: 'middle',
    spacing: 0.3,
    opacity: 0,
  })
  const sub2 = text(root, 'OPEN SOURCE  ·  RUNS IN YOUR BROWSER', CX, 892, {
    font: 'mono',
    size: 18,
    fill: COL.dim,
    anchor: 'middle',
    spacing: 0.3,
    opacity: 0,
  })
  void textWidth

  function update(t) {
    const a = t - s0
    // sonar: three rings leave the mark on the first beat
    rings.forEach((r, i) => {
      const p = prog(a, 0.2 + i * 0.28, 1.9 + i * 0.28)
      r.setAttribute('r', 150 + E.out(p) * 900)
      r.setAttribute('opacity', 0.9 * (1 - p) * (p > 0 ? 1 : 0))
    })
    dashRing.setAttribute('opacity', pe(a, 0.9, 1.4))
    dashRing.setAttribute('transform', `rotate(${a * 10} ${CX} ${CY})`)
    ticks.setAttribute('opacity', pe(a, 0.7, 1.3))
    ticks.setAttribute('transform', `rotate(${-a * 4} ${CX} ${CY})`)

    // the mark draws on
    drawOn(mCircle, pe(a, 0.25, 1.05, E.inOut), lc)
    drawOn(mOrbit, pe(a, 0.45, 1.35, E.inOut), lo)
    drawOn(mHandle, pe(a, 0.9, 1.3), lh)
    mDot.setAttribute('opacity', pe(a, 0.95, 1.2))
    mDot.setAttribute('r', 2.2 + 0.6 * Math.sin(prog(a, 1.0, 1.3) * Math.PI))
    // a small body orbits along the ellipse
    const th = (a - 1.2) * 2.4
    const phi = (-24 * Math.PI) / 180
    const ex = 13 * Math.cos(th)
    const ey = 4.6 * Math.sin(th)
    star.setAttribute('cx', 14 + ex * Math.cos(phi) - ey * Math.sin(phi))
    star.setAttribute('cy', 14 + ex * Math.sin(phi) + ey * Math.cos(phi))
    star.setAttribute('opacity', pe(a, 1.2, 1.5))

    // letters land with the voice
    for (const it of name.items) {
      const k = wordOf(it.i)
      const within = it.i - (k === 0 ? 0 : k === 1 ? 6 : 14)
      const p = pe(t, starts[k] + within * 0.035, starts[k] + within * 0.035 + 0.38, E.out4)
      it.n.setAttribute('opacity', p)
      it.n.setAttribute('transform', `translate(0 ${(1 - p) * 34})`)
    }
    sub.setAttribute('opacity', pe(t, tLens + 0.1, tLens + 0.5))
    sub2.setAttribute('opacity', pe(t, tLens + 0.3, tLens + 0.7))
  }
  return { update }
}
