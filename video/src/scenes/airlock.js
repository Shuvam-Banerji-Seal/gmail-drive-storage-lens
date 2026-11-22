// Scene 6: the airlock. Select -> protect -> archive -> trash (undo) -> typed permanent delete, and the bar drops under the limit.
import { COL, E, arrow, circle, clamp, fmt, g, icon, line, lerp, path, pe, prog, rect, text } from '../lib.js'

export function build({ root, T, cue }) {
  const c = (n) => cue(n).s
  void T
  const tType = c('type') - 0.25
  const tConfirm = tType + 1.15

  const NX = [240, 600, 960, 1320, 1680]
  const NY = 290
  const STAGES = [
    ['select', 'SELECT', '299 EMAILS · 3.5 GiB'],
    ['lock', 'PROTECT', 'RULES YOU CANNOT SKIP'],
    ['archive', 'ARCHIVE', 'OPTIONAL .MBOX'],
    ['trash', 'TRASH', '30-DAY UNDO'],
    ['warn', 'DELETE', 'TYPED CONFIRMATION'],
  ]
  const links = [0, 1, 2, 3].map((i) => arrow(root, NX[i] + 64, NY, NX[i + 1] - 64, NY, { stroke: COL.line, w: 2, head: 12 }))
  const nodes = STAGES.map(([ico, name, sub], i) => {
    const grp = g(root, { opacity: 0 })
    const ring = circle(grp, NX[i], NY, 50, { fill: COL.bg2, stroke: COL.line, w: 2.5 })
    icon(grp, ico, NX[i] - 22, NY - 22, 44, i === 4 ? COL.coral : COL.ink2)
    text(grp, name, NX[i], NY + 96, { font: 'mono', size: 22, fill: COL.ink, anchor: 'middle', weight: 500, spacing: 0.16 })
    text(grp, sub, NX[i], NY + 124, { font: 'mono', size: 15, fill: COL.mute, anchor: 'middle', spacing: 0.08 })
    return { grp, ring }
  })

  // items flowing through the pipeline
  const N = 46
  const items = Array.from({ length: N }, (_, i) => ({
    i,
    jy: ((i % 5) - 2) * 7,
    jx: 0,
    prot: [4, 15, 27, 38].includes(i),
    el: rect(root, -7, -7, 14, 14, { fill: COL.brass, rx: 3, opacity: 0 }),
  }))
  const protectedIdx = items.filter((x) => x.prot)

  // protect zone
  const pz = g(root, { opacity: 0 })
  text(pz, 'NEVER SELECTED', NX[1], NY + 196, { font: 'mono', size: 15, fill: COL.teal, anchor: 'middle', spacing: 0.22, weight: 500 })
  ;['STARRED  ·  SENT  ·  DRAFTS', 'PEOPLE YOU WRITE TO'].forEach((s, i) =>
    text(pz, s, NX[1], NY + 296 + i * 26, { font: 'mono', size: 16, fill: COL.ink2, anchor: 'middle', spacing: 0.1 }),
  )
  const locks = protectedIdx.map((_, k) => {
    const x = NX[1] - 84 + k * 56
    const grp = g(pz, { opacity: 0 })
    rect(grp, x - 22, NY + 218, 44, 44, { fill: COL.bg2, stroke: COL.teal, w: 2, rx: 6 })
    icon(grp, 'lock', x - 12, NY + 228, 24, COL.teal)
    return { grp, x }
  })
  // archive note
  const az = g(root, { opacity: 0 })
  icon(az, 'file', NX[2] - 22, NY + 196, 44, COL.ink2)
  text(az, 'A COPY ON YOUR DISK', NX[2], NY + 276, { font: 'mono', size: 15, fill: COL.ink2, anchor: 'middle', spacing: 0.1 })
  text(az, 'NOTHING IS UPLOADED', NX[2], NY + 302, { font: 'mono', size: 14, fill: COL.mute, anchor: 'middle', spacing: 0.14 })
  // trash / undo
  const tz = g(root, { opacity: 0 })
  const undoArc = path(tz, `M${NX[3] + 70} ${NY + 190}C${NX[3] + 70} ${NY + 290} ${NX[3] - 70} ${NY + 290} ${NX[3] - 70} ${NY + 190}`, {
    stroke: COL.teal,
    w: 3,
  })
  path(tz, `M${NX[3] - 84} ${NY + 204}l14-14 14 14`, { stroke: COL.teal, w: 3 })
  text(tz, 'UNDO', NX[3], NY + 316, { font: 'mono', size: 20, fill: COL.teal, anchor: 'middle', spacing: 0.3, weight: 500 })
  const trashCount = text(tz, '0 IN TRASH', NX[3], NY + 346, { font: 'mono', size: 15, fill: COL.mute, anchor: 'middle', spacing: 0.14 })
  const undoLen = undoArc.getTotalLength()
  // delete: typed confirmation
  const dz = g(root, { opacity: 0 })
  text(dz, 'TYPE TO CONFIRM', NX[4], NY + 188, { font: 'mono', size: 15, fill: COL.mute, anchor: 'middle', spacing: 0.22 })
  const field = rect(dz, NX[4] - 170, NY + 204, 340, 62, { fill: COL.bg2, stroke: COL.mute, w: 2, rx: 10 })
  const typed = text(dz, '', NX[4] - 150, NY + 244, { font: 'mono', size: 28, fill: COL.ink, weight: 500, spacing: 0.08 })
  const caret = rect(dz, NX[4] - 150, NY + 218, 3, 34, { fill: COL.ink })
  const btn = rect(dz, NX[4] - 170, NY + 288, 340, 56, { fill: 'none', stroke: COL.coral, w: 2, rx: 10, opacity: 0.45 })
  const btnTxt = text(dz, 'DELETE 299 EMAILS', NX[4], NY + 324, {
    font: 'mono',
    size: 20,
    fill: COL.coral,
    anchor: 'middle',
    spacing: 0.12,
    weight: 500,
    opacity: 0.55,
  })
  text(dz, 'CANNOT BE UNDONE', NX[4], NY + 376, { font: 'mono', size: 14, fill: COL.coral, anchor: 'middle', spacing: 0.2 })

  // result strip: the capacity bar returns, now under the limit
  const BX = 160
  const BY = 830
  const PX = 69
  const strip = g(root, { opacity: 0 })
  text(strip, 'USED', BX, 744, { font: 'mono', size: 17, fill: COL.mute, spacing: 0.22 })
  const big = text(strip, '21.7', BX - 3, 818, { font: 'display', size: 96, weight: 440, fill: COL.ink, spacing: -0.03 })
  text(strip, 'GiB', BX + 232, 818, { font: 'mono', size: 26, fill: COL.ink2, spacing: 0.12 })
  const minus = text(strip, '−3.5 GiB', 1760, 818, {
    font: 'display',
    size: 96,
    italic: true,
    weight: 420,
    fill: COL.teal,
    anchor: 'end',
    opacity: 0,
  })
  const capX = BX + 20 * PX
  rect(strip, BX - 0.75, BY - 0.75, 21.7 * PX + 1.5, 28 + 1.5, { stroke: COL.line, w: 1.5 })
  const bFill = rect(strip, BX, BY, 21.7 * PX, 28, { fill: COL.coral })
  const bHatch = rect(strip, capX, BY, 1.7 * PX, 28, { fill: 'url(#hatch)' })
  const bGhost = rect(strip, BX + 18.2 * PX, BY, 3.5 * PX, 28, { fill: 'none', stroke: COL.teal, w: 2, dash: '5 5', opacity: 0 })
  line(strip, capX, BY - 16, capX, BY + 42, { stroke: COL.brass, w: 2.5 })
  text(strip, 'LIMIT 20.0', capX + 10, BY + 62, { font: 'mono', size: 15, fill: COL.brass, spacing: 0.1 })
  const ok = g(strip, { opacity: 0 })
  icon(ok, 'check', BX + 18.2 * PX - 160, BY + 40, 34, COL.teal)
  text(ok, 'UNDER THE LIMIT', BX + 18.2 * PX - 118, BY + 66, { font: 'mono', size: 18, fill: COL.teal, spacing: 0.16, weight: 500 })

  function update(t) {
    // pipeline reveals
    const sel = c('select')
    nodes.forEach((n, i) => {
      const at =
        i === 0 ? sel - 0.55 : i === 1 ? c('protect') - 0.7 : i === 2 ? c('sent') + 0.2 : i === 3 ? c('trash') - 0.5 : c('type') - 0.5
      const p = pe(t, at, at + 0.4)
      n.grp.setAttribute('opacity', p)
      n.grp.setAttribute('transform', `translate(0 ${(1 - p) * 16})`)
    })
    links.forEach((l, i) => {
      const at = [sel + 0.1, c('protect') - 0.4, c('sent') + 0.5, c('trash') - 0.2][i]
      l.set(pe(t, at, at + 0.35))
    })
    const hot = (i, a, b) => {
      const k = Math.sin(Math.PI * prog(t, a, b))
      nodes[i].ring.setAttribute('stroke', k > 0.02 ? (i === 4 ? COL.coral : COL.brass) : COL.line)
      nodes[i].ring.setAttribute('stroke-width', 2.5 + 3 * k)
    }
    hot(0, sel - 0.1, sel + 1.0)
    hot(1, c('protect') - 0.1, c('sent') + 0.7)
    hot(2, c('sent') + 0.7, c('trash') - 0.2)
    hot(3, c('trash') - 0.1, c('undo') + 0.9)
    hot(4, tType - 0.2, tConfirm + 0.8)

    // items flow in an orderly lane: select -> protect -> (archive) -> trash
    const dep = (i) => sel + 0.45 + (i / N) * 1.2
    const arrProt = (i) => dep(i) + 1.0
    const arrTrash = (i) => arrProt(i) + 2.3
    items.forEach((it) => {
      const born = pe(t, dep(it.i) - 0.05, dep(it.i) + 0.15)
      const a1 = prog(t, dep(it.i), arrProt(it.i))
      let x = lerp(NX[0], NX[1], a1)
      let y = NY + it.jy
      let s = 0.5 + 0.5 * born
      let op = born
      if (it.prot) {
        const k = protectedIdx.indexOf(it)
        const drop = pe(t, arrProt(it.i), arrProt(it.i) + 0.55, E.inOut)
        x = lerp(x, locks[k].x, drop)
        y = lerp(y, NY + 240, drop)
        s *= lerp(1, 1.3, drop)
        it.el.setAttribute('fill', drop > 0.5 ? COL.teal : COL.brass)
      } else {
        const a2 = prog(t, arrProt(it.i), arrTrash(it.i))
        x = a1 < 1 ? x : lerp(NX[1], NX[3], a2)
        const sink = pe(t, arrTrash(it.i), arrTrash(it.i) + 0.22)
        s *= 1 - 0.9 * sink
        op *= 1 - sink
        it.el.setAttribute('fill', COL.brass)
      }
      it.el.setAttribute('transform', `translate(${x} ${y}) scale(${s})`)
      it.el.setAttribute('opacity', op)
    })
    pz.setAttribute('opacity', pe(t, c('protect') + 0.1, c('protect') + 0.5))
    locks.forEach((l, k) => l.grp.setAttribute('opacity', pe(t, c('protect') + 0.45 + k * 0.12, c('protect') + 0.75 + k * 0.12)))
    az.setAttribute('opacity', pe(t, c('sent') + 0.6, c('sent') + 1.0) * (1 - 0.5 * pe(t, c('trash') + 0.3, c('trash') + 0.8)))
    tz.setAttribute('opacity', pe(t, c('trash') + 0.2, c('trash') + 0.6))
    const arrived = items.filter((x) => !x.prot && t >= arrTrash(x.i) + 0.12).length
    trashCount.textContent = `${Math.round((arrived / (N - 4)) * 295)} IN TRASH`
    const ua = pe(t, c('undo') - 0.1, c('undo') + 0.6, E.out)
    undoArc.setAttribute('stroke-dasharray', `${undoLen}`)
    undoArc.setAttribute('stroke-dashoffset', `${undoLen * (1 - ua)}`)

    // typed confirmation
    dz.setAttribute('opacity', pe(t, c('type') - 0.25, c('type') + 0.15))
    const nchar = Math.floor(clamp(prog(t, tType, tType + 1.0)) * 10 + 1e-6)
    const str = 'DELETE 299'.slice(0, nchar)
    typed.textContent = str
    caret.setAttribute('x', NX[4] - 148 + str.length * 16.9)
    caret.setAttribute('opacity', Math.floor(t * 3) % 2 === 0 || nchar < 10 ? (t > tConfirm ? 0 : 1) : 0.2)
    const armed = pe(t, tType + 1.0, tType + 1.1)
    field.setAttribute('stroke', armed > 0.5 ? COL.coral : COL.mute)
    const pressed = pe(t, tConfirm, tConfirm + 0.15)
    btn.setAttribute('opacity', 0.45 + 0.55 * armed)
    btn.setAttribute('fill', pressed > 0 ? COL.coral : 'none')
    btn.setAttribute('fill-opacity', 0.25 * pressed)
    btnTxt.setAttribute('opacity', 0.55 + 0.45 * armed)

    // result strip
    const sp = pe(t, sel + 0.4, sel + 0.9)
    strip.setAttribute('opacity', sp)
    const shrink = pe(t, tConfirm + 0.1, tConfirm + 0.9, E.inOut)
    const used = lerp(21.7, 18.2, shrink)
    bFill.setAttribute('width', used * PX)
    bHatch.setAttribute('width', clamp(used * PX - 20 * PX, 0, 1.7 * PX))
    bHatch.setAttribute('opacity', 1 - pe(t, tConfirm + 0.3, tConfirm + 0.7))
    bGhost.setAttribute('opacity', pe(t, tConfirm + 0.5, tConfirm + 0.9) * 0.9)
    big.textContent = fmt(used, 1)
    big.setAttribute('fill', shrink > 0.98 ? COL.teal : COL.ink)
    minus.setAttribute('opacity', pe(t, tConfirm + 0.55, tConfirm + 0.95))
    ok.setAttribute('opacity', pe(t, tConfirm + 0.85, tConfirm + 1.2))
  }
  return { update }
}
