// Scene 3: it runs in your browser. Browser <-> Google only, through a client you own; no project server.
import { COL, E, arrow, circle, clamp, drawOn, g, icon, line, path, pe, prog, rect, text } from '../lib.js'

export function build({ root, cue, sc }) {
  const c = (n) => cue(n).s
  const s0 = sc.start

  const node = (cx, cy, w, h, ico, title, sub, note, o = {}) => {
    const grp = g(root, { opacity: 0 })
    const frame = rect(grp, cx - w / 2, cy - h / 2, w, h, { fill: COL.bg2, stroke: o.stroke ?? COL.line, w: 2, rx: 16, dash: o.dash })
    icon(grp, ico, cx - w / 2 + 28, cy - h / 2 + 26, 56, o.color ?? COL.ink2)
    text(grp, title, cx - w / 2 + 104, cy - h / 2 + 56, { font: 'mono', size: 24, fill: COL.ink, weight: 500, spacing: 0.1 })
    text(grp, sub, cx - w / 2 + 104, cy - h / 2 + 86, { font: 'mono', size: 17, fill: COL.mute, spacing: 0.08 })
    if (note) {
      line(grp, cx - w / 2 + 28, cy - h / 2 + h - 56, cx + w / 2 - 28, cy - h / 2 + h - 56, { stroke: COL.faint, w: 1.5 })
      text(grp, note, cx - w / 2 + 28, cy - h / 2 + h - 24, { font: 'mono', size: 16, fill: COL.ink2, spacing: 0.08 })
    }
    return { grp, frame }
  }
  const BX = 410
  const GX = 1510
  const NY = 470
  const browser = node(BX, NY, 380, 200, 'browser', 'YOUR BROWSER', 'RUNS THE APP', 'TOKEN LIVES IN MEMORY ONLY')
  const google = node(GX, NY, 380, 200, 'cloud', 'GOOGLE APIS', 'GMAIL  ·  DRIVE  ·  SIGN-IN', 'ONLY HOSTS ON THE ALLOWLIST')
  const oauth = node(960, 690, 420, 130, 'key', 'YOUR OAUTH CLIENT', 'CREATED BY YOU  ·  NO SECRET', null, { color: COL.brass })
  const server = node(960, 235, 420, 120, 'server', 'PROJECT SERVER', 'THERE IS NONE', null, {
    dash: '6 7',
    color: COL.dim,
    stroke: COL.dim,
  })

  // lanes between the browser and Google
  const lanes = g(root, { opacity: 0 })
  const laneReq = arrow(lanes, BX + 200, NY - 40, GX - 200, NY - 40, { stroke: COL.brass, w: 2.5, head: 16 })
  const laneRes = arrow(lanes, GX - 200, NY + 40, BX + 200, NY + 40, { stroke: COL.teal, w: 2.5, head: 16 })
  text(lanes, 'REQUEST  ·  HEADERS, SIZES, LABELS', 960, NY - 62, {
    font: 'mono',
    size: 18,
    fill: COL.brass,
    anchor: 'middle',
    spacing: 0.1,
  })
  text(lanes, 'RESPONSE  ·  METADATA ONLY', 960, NY + 78, { font: 'mono', size: 18, fill: COL.teal, anchor: 'middle', spacing: 0.1 })
  const packets = Array.from({ length: 6 }, (_, i) => ({
    r: circle(lanes, 0, 0, 6, { fill: COL.brass }),
    b: circle(lanes, 0, 0, 6, { fill: COL.teal }),
    i,
  }))

  // client links
  const links = g(root, { opacity: 0 })
  const l1 = path(links, `M${BX} ${NY + 100}V690H${960 - 210}`, { stroke: COL.mute, w: 2, dash: '5 7' })
  const l2 = path(links, `M${960 + 210} 690H${GX}V${NY + 100}`, { stroke: COL.mute, w: 2, dash: '5 7' })
  text(links, 'SIGN-IN POPUP', 560, 668, { font: 'mono', size: 15, fill: COL.mute, anchor: 'middle', spacing: 0.1 })
  text(links, 'ACCESS TOKEN, ~1 HOUR', 1360, 668, { font: 'mono', size: 15, fill: COL.mute, anchor: 'middle', spacing: 0.1 })

  // "no server": a crossed-out badge on the ghost node
  const badge = g(root, { opacity: 0 })
  circle(badge, 960 + 250, 235, 24, { stroke: COL.coral, w: 3 })
  const badgeX = path(
    badge,
    `M${960 + 250 - 9} ${235 - 9}L${960 + 250 + 9} ${235 + 9}M${960 + 250 + 9} ${235 - 9}L${960 + 250 - 9} ${235 + 9}`,
    { stroke: COL.coral, w: 3.5 },
  )
  const nots = ['ANALYTICS', 'COOKIES', 'ACCOUNTS'].map((s, i) => {
    const grp = g(root, { opacity: 0 })
    const x = 960 - 230 + i * 230
    path(grp, `M${x - 74} 336l12 12M${x - 62} 336l-12 12`, { stroke: COL.coral, w: 3 })
    text(grp, s, x - 44, 350, { font: 'mono', size: 20, fill: COL.ink2, spacing: 0.12, weight: 500 })
    return grp
  })

  // counters
  const counters = g(root, { opacity: 0 })
  const cn = [
    ['REQUESTS', 480, COL.ink],
    ['TO GOOGLE', 960, COL.ink],
    ['ANYWHERE ELSE', 1440, COL.teal],
  ].map(([lb, x, col]) => {
    text(counters, lb, x, 868, { font: 'mono', size: 15, fill: COL.mute, anchor: 'middle', spacing: 0.2 })
    return text(counters, '0', x, 836, { font: 'mono', size: 44, fill: col, anchor: 'middle', weight: 500 })
  })

  const lenL1 = l1.getTotalLength()
  const lenL2 = l2.getTotalLength()

  function update(t) {
    const a = t - s0
    const nb = pe(t, s0 + 0.25, s0 + 0.7)
    browser.grp.setAttribute('opacity', nb)
    google.grp.setAttribute('opacity', pe(t, s0 + 0.4, s0 + 0.85))
    browser.grp.setAttribute('transform', `translate(0 ${(1 - nb) * 14})`)
    lanes.setAttribute('opacity', pe(t, s0 + 0.7, s0 + 1.0))
    laneReq.set(pe(t, s0 + 0.7, s0 + 1.3, E.out))
    laneRes.set(pe(t, s0 + 0.9, s0 + 1.5, E.out))
    // packets travel along the lanes
    const run = clamp(prog(t, s0 + 1.2, s0 + 99))
    packets.forEach((p) => {
      const ph = ((((a - 1.2) * 0.62 + p.i / 6) % 1) + 1) % 1
      const x1 = BX + 214 + ph * (GX - 214 - (BX + 214))
      const x2 = GX - 214 - ph * (GX - 214 - (BX + 214))
      p.r.setAttribute('cx', x1)
      p.r.setAttribute('cy', NY - 40)
      p.r.setAttribute('opacity', run * Math.sin(ph * Math.PI))
      p.b.setAttribute('cx', x2)
      p.b.setAttribute('cy', NY + 40)
      p.b.setAttribute('opacity', run * Math.sin(ph * Math.PI) * 0.9)
    })
    // browser highlight on "browser"
    const hb = Math.sin(Math.PI * prog(t, c('browser') - 0.1, c('browser') + 0.9))
    browser.frame.setAttribute('stroke', hb > 0.02 ? COL.brass : COL.line)
    browser.frame.setAttribute('stroke-width', 2 + 2 * hb)

    // client
    const oc = pe(t, c('client') - 0.4, c('client') + 0.1)
    oauth.grp.setAttribute('opacity', oc)
    oauth.grp.setAttribute('transform', `translate(0 ${(1 - oc) * 14})`)
    links.setAttribute('opacity', oc)
    drawOn(l1, pe(t, c('client') - 0.3, c('client') + 0.5), lenL1)
    drawOn(l2, pe(t, c('client') - 0.1, c('client') + 0.7), lenL2)
    l1.setAttribute('stroke-dasharray', pe(t, c('client') - 0.3, c('client') + 0.5) < 1 ? `${lenL1}` : '5 7')
    l2.setAttribute('stroke-dasharray', pe(t, c('client') - 0.1, c('client') + 0.7) < 1 ? `${lenL2}` : '5 7')
    const ho = Math.sin(Math.PI * prog(t, c('client'), c('client') + 1.0))
    oauth.frame.setAttribute('stroke', ho > 0.02 ? COL.brass : COL.line)
    oauth.frame.setAttribute('stroke-width', 2 + 2 * ho)

    // no server
    const sv = pe(t, c('noserver') - 0.55, c('noserver') - 0.1)
    server.grp.setAttribute('opacity', sv * 0.9)
    const st = pe(t, c('noserver') - 0.05, c('noserver') + 0.35, E.out)
    badge.setAttribute('opacity', st)
    badge.setAttribute('transform', `translate(1210 235) scale(${0.6 + 0.4 * st}) translate(-1210 -235)`)
    drawOn(badgeX, st, 40)
    nots.forEach((n, i) => {
      const p = pe(t, c('tracking') - 0.15 + i * 0.2, c('tracking') + 0.2 + i * 0.2)
      n.setAttribute('opacity', p)
      n.setAttribute('transform', `translate(0 ${(1 - p) * 10})`)
    })

    // counters
    counters.setAttribute('opacity', pe(t, s0 + 1.3, s0 + 1.7))
    const n = Math.round(128 * E.out(prog(t, s0 + 1.4, c('tracking') + 0.4)))
    cn[0].textContent = String(n)
    cn[1].textContent = String(n)
    cn[2].textContent = '0'
  }
  return { update }
}
