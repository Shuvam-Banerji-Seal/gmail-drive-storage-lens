// Scene 8: the closing line, set word by word with the narrator.
import { COL, E, line, pe, text, textWidth, g } from '../lib.js'

export function build({ root, T, sc }) {
  const L = T.lines[9]
  const words = L.words.map((w) => ({ w: w.w, s: L.start + w.s, e: L.start + w.e }))
  const first = words.findIndex((w) => /^It's$/.test(w.w))
  const l1 = words.slice(0, first)
  const l2 = words.slice(first)
  const o1 = { font: 'display', size: 78, weight: 400, spacing: -0.015 }
  const o2 = { font: 'display', size: 118, weight: 440, spacing: -0.02 }
  const mk = (arr, y, o) => {
    const space = textWidth(' ', o)
    const widths = arr.map((w) => textWidth(w.w, { ...o, italic: /^forgot/.test(w.w) }))
    const total = widths.reduce((a, b) => a + b, 0) + space * (arr.length - 1)
    let x = 960 - total / 2
    return arr.map((w, i) => {
      const forgot = /^forgot/.test(w.w)
      const n = text(root, w.w, x, y, { ...o, italic: forgot, fill: forgot ? COL.brass : o === o1 ? COL.ink2 : COL.ink, opacity: 0 })
      x += widths[i] + space
      return { n, w, y }
    })
  }
  const rule = line(root, 900, 330, 1020, 330, { stroke: COL.brass, w: 3, cap: 'round' })
  const w1 = mk(l1, 470, o1)
  const w2 = mk(l2, 640, o2)
  const all = [...w1, ...w2]

  function update(t) {
    rule.setAttribute('opacity', pe(t, sc.start + 0.2, sc.start + 0.6))
    all.forEach((it) => {
      const p = pe(t, it.w.s - 0.12, it.w.s + 0.3, E.out4)
      it.n.setAttribute('opacity', p)
      it.n.setAttribute('transform', `translate(0 ${(1 - p) * 22})`)
    })
  }
  void g
  return { update }
}
