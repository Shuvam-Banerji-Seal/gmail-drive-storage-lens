// Scene 7: Free. Open source. Verifiable.
import { COL, E, circle, g, icon, line, path, pe, text } from '../lib.js'

export function build({ root, cue }) {
  const c = (n) => cue(n).s
  const COLX = [380, 960, 1540]
  const Y = 360

  const cols = [
    {
      cue: 'free',
      ico: 'dollar',
      word: 'Free',
      color: COL.teal,
      rows: [
        ['PRICE', '0.00'],
        ['ADS', '0'],
        ['ACCOUNTS', '0'],
        ['TRACKERS', '0'],
      ],
    },
    {
      cue: 'open',
      ico: 'code',
      word: 'Open source',
      color: COL.brass,
      code: ['// SPDX-License-Identifier:', '// AGPL-3.0-or-later', 'github.com/Shuvam-Banerji-Seal/', 'gmail-drive-storage-lens'],
    },
    { cue: 'verify', ico: 'shield', word: 'Verifiable', color: COL.blue, net: true },
  ]
  const els = cols.map((col, i) => {
    const x = COLX[i]
    const grp = g(root, { opacity: 0 })
    const ring = circle(grp, x, Y, 58, { stroke: col.color, w: 2.5 })
    icon(grp, col.ico, x - 28, Y - 28, 56, col.color)
    if (col.ico === 'dollar') path(grp, `M${x - 46} ${Y + 46}L${x + 46} ${Y - 46}`, { stroke: col.color, w: 3 })
    text(grp, col.word, x, Y + 170, { font: 'display', size: 92, weight: 440, fill: COL.ink, anchor: 'middle', spacing: -0.02 })
    line(grp, x - 180, Y + 206, x + 180, Y + 206, { stroke: COL.line, w: 1.5 })
    const body = g(grp)
    if (col.rows) {
      col.rows.forEach(([k, v], r) => {
        const y = Y + 262 + r * 44
        text(body, k, x - 180, y, { font: 'mono', size: 19, fill: COL.mute, spacing: 0.16 })
        line(body, x - 40, y - 5, x + 110, y - 5, { stroke: COL.dim, w: 1.5, dash: '2 7', cap: 'round' })
        text(body, v, x + 180, y, { font: 'mono', size: 22, fill: col.color, anchor: 'end', weight: 500 })
      })
    }
    if (col.code) {
      col.code.forEach((l, r) =>
        text(body, l, x - 180, Y + 262 + r * 40, {
          font: 'mono',
          size: r < 2 ? 20 : 19,
          fill: r < 2 ? col.color : COL.ink2,
          weight: r < 2 ? 500 : 400,
          spacing: 0.02,
        }),
      )
    }
    if (col.net) {
      const bx = x - 150
      const by = Y + 330
      circle(body, bx, by, 22, { fill: COL.bg2, stroke: COL.blue, w: 2.5 })
      text(body, 'YOU', bx, by + 6, { font: 'mono', size: 14, fill: COL.ink, anchor: 'middle', weight: 500 })
      ;[
        ['googleapis.com', COL.teal, 0],
        ['gmail.googleapis.com', COL.teal, 1],
        ['accounts.google.com', COL.teal, 2],
      ].forEach(([h, colr, k]) => {
        const y = Y + 262 + k * 42
        line(body, bx + 24, by - 4, x - 20, y - 6, { stroke: colr, w: 1.8 })
        circle(body, x - 14, y - 6, 4.5, { fill: colr })
        text(body, h, x - 2, y, { font: 'mono', size: 16, fill: COL.ink2 })
      })
      const y = Y + 262 + 3 * 42
      line(body, bx + 24, by + 2, x - 70, y - 6, { stroke: COL.coral, w: 1.8, dash: '4 5' })
      circle(body, x - 14, y - 6, 9, { stroke: COL.coral, w: 2 })
      path(body, `M${x - 19} ${y - 11}l10 10M${x - 9} ${y - 11}l-10 10`, { stroke: COL.coral, w: 2 })
      text(body, 'example.com  ✕', x + 12, y, { font: 'mono', size: 16, fill: COL.coral })
    }
    return { grp, ring, col }
  })
  line(root, 668, Y, 668, Y + 520, { stroke: COL.faint, w: 1.5, dash: '3 9' })
  line(root, 1252, Y, 1252, Y + 520, { stroke: COL.faint, w: 1.5, dash: '3 9' })

  function update(t) {
    els.forEach((e) => {
      const p = pe(t, c(e.col.cue) - 0.12, c(e.col.cue) + 0.38, E.out4)
      e.grp.setAttribute('opacity', p)
      e.grp.setAttribute('transform', `translate(0 ${(1 - p) * 26})`)
      const k = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - c(e.col.cue)) / 0.9)))
      e.ring.setAttribute('stroke-width', 2.5 + 2.5 * k)
    })
  }
  return { update }
}
