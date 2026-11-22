// Scene 1: the problem. Capacity bar overflows -> Drive is a sliver -> the weight is Gmail -> one tile per email ->
// the same attachment stored again in every reply -> Google tells you it is full but never why.
import { COL, E, arrow, clamp, fmt, g, icon, lerp, line, path, pe, prog, rect, rng, text, treemap } from '../lib.js'

export function build({ root, cue }) {
  const c = (n) => cue(n).s

  // ---------- data (illustrative) ----------
  const GIB = { drive: 3.5, gmail: 18.1, trash: 0.1 }
  const TOTAL = 21.7
  const CAP = 20
  const BX = 160
  const BY = 590
  const BH = 64
  const PX = 69
  const capX = BX + CAP * PX

  // emails grouped by sender: a few heavy mailing lists, a long tail of light senders
  const R = rng(11)
  const N = 1606
  const K = 16
  const wts = Array.from({ length: K }, (_, k) => 1 / Math.pow(k + 1, 0.8))
  const wsum = wts.reduce((s, w) => s + w, 0)
  const heat = Array.from({ length: K }, () => 0.5 + 0.9 * R())
  const groups = Array.from({ length: K }, () => [])
  for (let n = 0; n < N; n++) {
    let u = R() * wsum
    let k = 0
    while (k < K - 1 && u > wts[k]) u -= wts[k++]
    const v = clamp((1 + 33 * Math.pow(R(), 2.2)) * heat[k] + 0.4, 1, 34)
    groups[k].push({ v, k })
  }
  const MX = 160
  const MY = 252
  const MW = 1600
  const MH = 616
  const sums = groups.map((arr, k) => ({ v: arr.reduce((s, e) => s + e.v, 0), k })).sort((a, b) => b.v - a.v)
  const cells = treemap(sums, MX, MY, MW, MH)
  const tiles = []
  for (const cell of cells) {
    const arr = groups[cell.k].sort((a, b) => b.v - a.v)
    tiles.push(...treemap(arr, cell.x + 3, cell.y + 3, cell.w - 6, cell.h - 6).map((t) => ({ ...t, cell: cell.k })))
  }
  const sum = tiles.reduce((s, t) => s + t.v, 0)
  const bySize = [...tiles].sort((a, b) => b.v - a.v)
  const top40 = bySize.slice(0, 40)
  const top40Sum = top40.reduce((s, t) => s + t.v, 0)

  // ---------- layers ----------
  const mosaic = g(root, { opacity: 0, display: 'none' })
  const bars = g(root)
  const morph = rect(root, BX, BY, 10, BH, { fill: COL.coral })
  const chain = g(root, { opacity: 0 })
  const why = g(root, { opacity: 0 })

  // ---------- mosaic ----------
  const mosHead = g(mosaic, { opacity: 0 })
  text(mosHead, 'GMAIL + PHOTOS  ·  18.1 GiB', MX, MY - 22, { font: 'mono', size: 20, fill: COL.coral, spacing: 0.14, weight: 500 })
  text(mosHead, 'ONE TILE = ONE EMAIL  ·  AREA = SIZE  ·  GROUPED BY SENDER  ·  ILLUSTRATIVE DATA', MX + MW, MY - 22, {
    font: 'mono',
    size: 17,
    fill: COL.mute,
    spacing: 0.1,
    anchor: 'end',
  })
  const bins = Array.from({ length: 8 }, () => g(mosaic, { opacity: 0 }))
  const rb = rng(5)
  for (const t of tiles) {
    const k = Math.floor(rb() * 8)
    const a = 0.2 + 0.7 * Math.pow(t.v / 34, 0.75)
    rect(bins[k], t.x, t.y, Math.max(0.5, t.w - 1.2), Math.max(0.5, t.h - 1.2), { fill: COL.coral, opacity: a })
  }
  const senderFrames = g(mosaic, { opacity: 0 })
  for (const cell of cells) rect(senderFrames, cell.x + 0.75, cell.y + 0.75, cell.w - 1.5, cell.h - 1.5, { stroke: COL.line, w: 1.5 })
  const hl = top40.map((t) => rect(mosaic, t.x + 0.8, t.y + 0.8, t.w - 2.6, t.h - 2.6, { stroke: COL.brass, w: 2.2, opacity: 0 }))
  const clips = bySize.slice(0, 16).map((t) => {
    const s = Math.min(t.w, t.h) * 0.58
    return icon(mosaic, 'clip', t.x + t.w / 2 - s / 2, t.y + t.h / 2 - s / 2, s, COL.brass)
  })
  const hlStat = text(
    mosaic,
    `TOP 40 EMAILS  =  ${fmt(top40Sum / 1024, 2)} GiB  ·  ${Math.round((top40Sum / sum) * 100)}% OF ALL MAIL BYTES`,
    MX,
    MY + MH + 38,
    { font: 'mono', size: 20, fill: COL.brass, spacing: 0.08, opacity: 0 },
  )

  // ---------- capacity bar ----------
  const grid = g(bars)
  for (let gb = 0; gb <= 20; gb += 5) {
    const x = BX + gb * PX
    line(grid, x, BY + BH + 6, x, BY + BH + 16, { stroke: COL.mute, w: 1.5 })
    if (gb < 20) text(grid, String(gb), x, BY + BH + 40, { font: 'mono', size: 16, fill: COL.mute, anchor: 'middle' })
  }
  text(grid, 'GiB', BX + 20 * PX - 4, BY + BH + 40, { font: 'mono', size: 16, fill: COL.dim })
  rect(grid, BX - 0.75, BY - 0.75, TOTAL * PX + 1.5, BH + 1.5, { stroke: COL.line, w: 1.5 })
  const rDrive = rect(bars, BX, BY, 0, BH, { fill: COL.blue })
  const rTrash = rect(bars, BX, BY, 0, BH, { fill: COL.brass })
  const rOver = rect(bars, capX, BY, 0, BH, { fill: 'url(#hatch)' })
  const capLine = line(bars, capX, BY - 76, capX, BY + BH + 14, { stroke: COL.brass, w: 2.5 })
  text(bars, 'LIMIT 20.0 GiB', capX - 12, BY - 56, { font: 'mono', size: 20, fill: COL.brass, anchor: 'end', spacing: 0.1, weight: 500 })
  const overLbl = text(bars, '+1.7 GiB OVER', capX + 12, BY - 56, {
    font: 'mono',
    size: 20,
    fill: COL.coral,
    spacing: 0.1,
    weight: 500,
    opacity: 0,
  })
  const big = text(bars, '0.0', BX - 4, 428, { font: 'display', size: 250, weight: 440, fill: COL.ink, spacing: -0.03 })
  text(bars, 'GiB USED', 740, 366, { font: 'mono', size: 28, fill: COL.ink2, spacing: 0.12 })
  text(bars, 'OF A 20.0 GiB LIMIT', 740, 410, { font: 'mono', size: 22, fill: COL.mute, spacing: 0.1 })
  const pct = text(bars, '108%', BX + TOTAL * PX, 428, {
    font: 'display',
    size: 150,
    italic: true,
    weight: 420,
    fill: COL.coral,
    anchor: 'end',
    opacity: 0,
  })
  const tag = g(bars, { opacity: 0 })
  icon(tag, 'warn', BX, 168, 38, COL.coral)
  text(tag, 'STORAGE FULL', BX + 56, 196, { font: 'mono', size: 26, fill: COL.coral, spacing: 0.24, weight: 500 })
  const legend = g(bars)
  const leg = [
    [BX, COL.blue, 'DRIVE', '3.5 GiB', '16%'],
    [BX + 520, COL.coral, 'GMAIL + PHOTOS', '18.1 GiB', '83%'],
    [BX + 1150, COL.brass, 'TRASH', '0.1 GiB', '1%'],
  ]
  for (const [x, col, name, val, pc] of leg) {
    rect(legend, x, 792, 16, 16, { fill: col })
    text(legend, name, x + 30, 806, { font: 'mono', size: 20, fill: COL.mute, spacing: 0.12 })
    text(legend, val, x + 30, 842, { font: 'mono', size: 30, fill: COL.ink, weight: 500 })
    text(legend, pc, x + 30 + val.length * 18.5 + 18, 842, { font: 'mono', size: 22, fill: COL.mute })
  }
  const brDrive = g(bars, { opacity: 0 })
  path(brDrive, `M${BX} ${BY + BH + 58}v14H${BX + GIB.drive * PX}v-14`, { stroke: COL.blue, w: 2.5 })
  text(brDrive, 'DRIVE  ·  3.5 GiB  ·  16%', BX, BY + BH + 112, { font: 'mono', size: 24, fill: COL.blue, spacing: 0.1, weight: 500 })
  const gx0 = BX + GIB.drive * PX
  const gx1 = gx0 + GIB.gmail * PX
  const brGmail = g(bars, { opacity: 0 })
  path(brGmail, `M${gx0} ${BY + BH + 58}v14H${gx1}v-14`, { stroke: COL.coral, w: 2.5 })
  text(brGmail, 'GMAIL + PHOTOS  ·  18.1 GiB  ·  83%', (gx0 + gx1) / 2, BY + BH + 112, {
    font: 'mono',
    size: 24,
    fill: COL.coral,
    spacing: 0.1,
    weight: 500,
    anchor: 'middle',
  })

  // ---------- reply chain ----------
  const cardW = 270
  const cardH = 208
  const cx0 = 300
  const cy0 = 330
  const gap = 80
  const subjects = ['Weekend Screenings #9', 'Re: Weekend Screenings #9', 'Re: Re: Weekend Scree…', 'Re: Re: Re: Weekend S…']
  const cards = subjects.map((s, i) => {
    const x = cx0 + i * (cardW + gap)
    const grp = g(chain, { opacity: 0 })
    rect(grp, x, cy0, cardW, cardH, { fill: COL.bg2, stroke: COL.line, w: 1.5, rx: 10 })
    rect(grp, x + 20, cy0 + 24, 120, 9, { fill: COL.dim, rx: 3 })
    rect(grp, x + 20, cy0 + 44, 72, 7, { fill: COL.faint, rx: 3 })
    text(grp, s, x + 20, cy0 + 100, { font: 'mono', size: 17, fill: COL.ink2 })
    line(grp, x + 20, cy0 + 124, x + cardW - 20, cy0 + 124, { stroke: COL.faint, w: 1.5 })
    icon(grp, 'clip', x + 18, cy0 + 140, 30, COL.brass)
    text(grp, 'poster.pdf', x + 58, cy0 + 163, { font: 'mono', size: 18, fill: COL.ink2 })
    text(grp, '33.9 MiB', x + cardW - 20, cy0 + 189, { font: 'mono', size: 22, fill: COL.brass, anchor: 'end', weight: 500 })
    return grp
  })
  const arrows = [0, 1, 2].map((i) => {
    const x = cx0 + i * (cardW + gap) + cardW
    return arrow(chain, x + 8, cy0 + 104, x + gap - 8, cy0 + 104, { stroke: COL.mute, w: 2.2, head: 12 })
  })
  const chainEnd = cx0 + 4 * cardW + 3 * gap
  const sumG = g(chain, { opacity: 0 })
  path(sumG, `M${cx0} ${cy0 + cardH + 32}v18H${chainEnd}v-18`, { stroke: COL.brass, w: 2.5 })
  text(sumG, '4 × 33.9 MiB  =  135.6 MiB', (cx0 + chainEnd) / 2, cy0 + cardH + 124, {
    font: 'display',
    size: 64,
    weight: 430,
    anchor: 'middle',
    fill: COL.ink,
  })
  text(sumG, 'ONE ATTACHMENT, STORED AGAIN IN EVERY REPLY', (cx0 + chainEnd) / 2, cy0 + cardH + 170, {
    font: 'mono',
    size: 20,
    fill: COL.mute,
    anchor: 'middle',
    spacing: 0.14,
  })

  // ---------- what you see / what you do not ----------
  text(why, 'WHAT GOOGLE SHOWS', 160, 296, { font: 'mono', size: 20, fill: COL.mute, spacing: 0.2 })
  const seeNum = text(why, '21.7', 156, 520, { font: 'display', size: 230, weight: 440, fill: COL.ink, spacing: -0.03 })
  text(why, '/ 20.0 GiB USED', 160, 584, { font: 'mono', size: 28, fill: COL.ink2, spacing: 0.1 })
  rect(why, 160, 650, 580, 18, { stroke: COL.line, w: 1.5 })
  rect(why, 160, 650, 580, 18, { fill: COL.coral, opacity: 0.85 })
  text(why, 'One number.', 160, 740, { font: 'display', size: 48, italic: true, fill: COL.ink2, weight: 400 })
  line(why, 960, 270, 960, 800, { stroke: COL.line, w: 1.5, dash: '3 8' })
  const dontLbl = text(why, "WHAT IT DOESN'T", 1060, 296, { font: 'mono', size: 20, fill: COL.mute, spacing: 0.2, opacity: 0 })
  const rowEls = ['SENDER', 'THREAD', 'ATTACHMENT', 'AGE', 'OPENED'].map((lb, i) => {
    const y = 392 + i * 94
    const grp = g(why, { opacity: 0 })
    text(grp, lb, 1060, y, { font: 'mono', size: 28, fill: COL.ink2, spacing: 0.14 })
    line(grp, 1330, y + 2, 1700, y + 2, { stroke: COL.mute, w: 2, dash: '2 9', cap: 'round' })
    const q = text(grp, '?', 1760, y + 16, { font: 'display', size: 84, italic: true, fill: COL.brass, anchor: 'end', weight: 420 })
    return { grp, q, y }
  })

  function update(t) {
    // ----- capacity bar fill: Drive first, then Gmail + Photos, which crosses the limit -----
    const f = pe(t, 0.15, 2.25, E.inOut)
    const a = f * TOTAL
    const wDrive = clamp(a, 0, GIB.drive) * PX
    const wGmail = clamp(a - GIB.drive, 0, GIB.gmail) * PX
    const wTrash = clamp(a - GIB.drive - GIB.gmail, 0, GIB.trash) * PX
    rDrive.setAttribute('width', wDrive)
    rTrash.setAttribute('x', BX + (GIB.drive + GIB.gmail) * PX)
    rTrash.setAttribute('width', wTrash)
    rOver.setAttribute('width', clamp(BX + a * PX - capX, 0, 2 * PX))
    big.textContent = fmt(a, 1)
    const full = pe(t, c('full') - 0.15, c('full') + 0.35, E.out)
    pct.setAttribute('opacity', full)
    pct.setAttribute('transform', `translate(0 ${(1 - full) * 14})`)
    tag.setAttribute('opacity', full)
    overLbl.setAttribute('opacity', pe(t, 2.0, 2.4))
    capLine.setAttribute('stroke-width', 2.5 + 3 * Math.sin(Math.PI * prog(t, c('full') - 0.1, c('full') + 0.5)))

    // emphasis: Drive (a sliver), then Gmail
    const sl = pe(t, c('sliver') - 0.5, c('sliver') - 0.1)
    const gm = pe(t, c('weight') - 0.1, c('weight') + 0.3)
    legend.setAttribute('opacity', 1 - sl)
    brDrive.setAttribute('opacity', sl * (1 - gm))
    brGmail.setAttribute('opacity', gm)
    rDrive.setAttribute('opacity', 1 - 0.72 * gm)

    // morph: the Gmail segment grows into the mosaic of emails
    const mp = pe(t, c('gmail') - 0.2, c('gmail') + 0.75, E.inOut)
    morph.setAttribute('x', lerp(BX + GIB.drive * PX, MX, mp))
    morph.setAttribute('y', lerp(BY, MY, mp))
    morph.setAttribute('width', lerp(wGmail, MW, mp))
    morph.setAttribute('height', lerp(BH, MH, mp))
    const gone = t < c('gmail') ? 1 : 0.1 + 0.9 * (1 - prog(t, c('gmail') + 0.6, c('gmail') + 1.35))
    const dimG = 1 - 0.72 * sl * (1 - gm)
    const morphOut = 1 - pe(t, c('tells') - 0.55, c('tells') - 0.1)
    morph.setAttribute('opacity', dimG * gone * morphOut * (1 - pe(t, c('again') - 0.2, c('again') + 0.2)))
    const barsFade = 1 - pe(t, c('gmail') - 0.35, c('gmail') + 0.3)
    bars.setAttribute('opacity', barsFade)
    bars.setAttribute('display', barsFade <= 0.001 ? 'none' : 'inline')

    // ----- mosaic -----
    const chainP = pe(t, c('again') - 0.2, c('again') + 0.25)
    const chainOut = pe(t, c('tells') - 0.55, c('tells') - 0.1)
    mosaic.setAttribute('display', t >= c('gmail') + 0.5 && chainOut < 1 ? 'inline' : 'none')
    mosaic.setAttribute('opacity', (1 - 0.97 * chainP) * (1 - chainOut))
    mosHead.setAttribute('opacity', pe(t, c('gmail') + 0.7, c('gmail') + 1.1))
    bins.forEach((b, k) => b.setAttribute('opacity', pe(t, c('gmail') + 0.62 + 0.05 * k, c('gmail') + 1.0 + 0.05 * k)))
    senderFrames.setAttribute('opacity', pe(t, c('gmail') + 1.0, c('gmail') + 1.5))
    hl.forEach((r, i) => r.setAttribute('opacity', pe(t, c('years') - 0.1 + 0.018 * i, c('years') + 0.25 + 0.018 * i)))
    clips.forEach((n, i) => n.setAttribute('opacity', pe(t, c('years') + 0.1 + 0.05 * i, c('years') + 0.35 + 0.05 * i)))
    hlStat.setAttribute('opacity', pe(t, c('years') + 0.5, c('years') + 0.9) * (1 - chainP))

    // ----- reply chain -----
    chain.setAttribute('opacity', chainP * (1 - chainOut))
    cards.forEach((n, i) => {
      const p = pe(t, c('again') - 0.05 + i * 0.42, c('again') + 0.35 + i * 0.42)
      n.setAttribute('opacity', p)
      n.setAttribute('transform', `translate(0 ${(1 - p) * 18})`)
    })
    arrows.forEach((n, i) => n.set(pe(t, c('again') + 0.3 + i * 0.42, c('again') + 0.6 + i * 0.42, E.out)))
    sumG.setAttribute('opacity', pe(t, c('chains') - 0.1, c('chains') + 0.4))

    // ----- what you see / what you do not -----
    const wy = pe(t, c('tells') - 0.35, c('tells') + 0.05)
    why.setAttribute('opacity', wy)
    seeNum.setAttribute('transform', `translate(0 ${(1 - wy) * 20})`)
    dontLbl.setAttribute('opacity', pe(t, c('never') - 0.15, c('never') + 0.2))
    rowEls.forEach((r, i) => {
      const p = pe(t, c('never') - 0.05 + i * 0.16, c('never') + 0.3 + i * 0.16)
      r.grp.setAttribute('opacity', p)
      const pulse = Math.sin(Math.PI * prog(t, c('why') - 0.05 + i * 0.05, c('why') + 0.4 + i * 0.05))
      r.q.setAttribute('transform', `translate(1760 ${r.y + 16}) scale(${1 + 0.22 * pulse}) translate(-1760 ${-(r.y + 16)})`)
    })
  }
  return { update }
}
