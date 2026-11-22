// Scene 9: end card.
import { COL, E, W, circle, el, g, line, pe, text } from '../lib.js'

export function build({ root, sc }) {
  const CX = W / 2
  const K = 7.4
  const mark = g(root, { transform: `translate(${CX - 14 * K} ${300 - 14 * K}) scale(${K})`, opacity: 0 })
  circle(mark, 14, 14, 9.5, { stroke: COL.brass, w: 2.2 })
  el(
    'ellipse',
    { cx: 14, cy: 14, rx: 13, ry: 4.6, fill: 'none', stroke: COL.ink, 'stroke-width': 1, opacity: 0.55, transform: 'rotate(-24 14 14)' },
    mark,
  )
  line(mark, 21, 21, 28, 28, { stroke: COL.brass, w: 3, cap: 'round' })
  circle(mark, 14, 14, 2.2, { fill: COL.brass })
  const name = text(root, 'Gmail Storage Lens', CX, 520, {
    font: 'display',
    size: 116,
    weight: 440,
    fill: COL.ink,
    anchor: 'middle',
    spacing: -0.02,
    opacity: 0,
  })
  const sub = text(root, 'FREE  ·  OPEN SOURCE  ·  RUNS IN YOUR BROWSER', CX, 584, {
    font: 'mono',
    size: 22,
    fill: COL.mute,
    anchor: 'middle',
    spacing: 0.3,
    opacity: 0,
  })
  line(root, CX - 140, 640, CX + 140, 640, { stroke: COL.brass, w: 2.5, opacity: 0.9 })
  const url = text(root, 'shuvam-banerji-seal.github.io/gmail-drive-storage-lens', CX, 716, {
    font: 'mono',
    size: 34,
    fill: COL.brass,
    anchor: 'middle',
    weight: 500,
    spacing: 0.02,
    opacity: 0,
  })
  const lic = text(root, 'AGPL-3.0-OR-LATER  ·  GITHUB.COM/SHUVAM-BANERJI-SEAL/GMAIL-DRIVE-STORAGE-LENS', CX, 772, {
    font: 'mono',
    size: 17,
    fill: COL.ink2,
    anchor: 'middle',
    spacing: 0.1,
    opacity: 0,
  })
  const credit = text(
    root,
    'NARRATION: SYNTHETIC VOICE (BREEZE-TTS-2)  ·  MUSIC: ORIGINAL, GENERATED IN CODE  ·  ILLUSTRATIVE DATA  ·  NOT AFFILIATED WITH GOOGLE',
    CX,
    940,
    { font: 'mono', size: 16, fill: COL.dim, anchor: 'middle', spacing: 0.1, opacity: 0 },
  )

  function update(t) {
    const a = t - sc.start
    const p = (s, d = 0.45) => pe(a, s, s + d, E.out4)
    mark.setAttribute('opacity', p(0.05))
    name.setAttribute('opacity', p(0.2))
    name.setAttribute('transform', `translate(0 ${(1 - p(0.2)) * 18})`)
    sub.setAttribute('opacity', p(0.4))
    url.setAttribute('opacity', p(0.6))
    lic.setAttribute('opacity', p(0.8))
    credit.setAttribute('opacity', p(1.0))
  }
  return { update }
}
