// SPDX-License-Identifier: AGPL-3.0-or-later
// Redacted share image: totals only, never names, subjects or addresses.
import { formatBytes, formatCount } from '../util/format'

export async function renderShareCard(totals: { bytes: number; items: number; actions: number }): Promise<Blob | null> {
  const c = document.createElement('canvas')
  c.width = 1200
  c.height = 630
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const g = ctx.createLinearGradient(0, 0, 1200, 630)
  g.addColorStop(0, '#080a14')
  g.addColorStop(1, '#1b1240')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1200, 630)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 140; i++) {
    ctx.globalAlpha = 0.2 + rnd() * 0.6
    ctx.fillStyle = '#e9ecfb'
    ctx.beginPath()
    ctx.arc(rnd() * 1200, rnd() * 630, rnd() * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = '#8b7bff'
  ctx.lineWidth = 3
  for (const r of [150, 200, 250]) {
    ctx.beginPath()
    ctx.arc(960, 315, r, Math.PI * 0.2, Math.PI * 1.6)
    ctx.stroke()
  }
  ctx.fillStyle = '#5ef2c1'
  ctx.font = 'bold 34px system-ui, sans-serif'
  ctx.fillText('GMAIL STORAGE LENS', 80, 120)
  ctx.fillStyle = '#e9ecfb'
  ctx.font = 'bold 110px system-ui, sans-serif'
  ctx.fillText(formatBytes(totals.bytes), 80, 300)
  ctx.font = '40px system-ui, sans-serif'
  ctx.fillStyle = '#98a0c4'
  ctx.fillText(`cleared from ${formatCount(totals.items)} items in ${formatCount(totals.actions)} steps`, 80, 380)
  ctx.font = '28px system-ui, sans-serif'
  ctx.fillText('Open source · runs in your browser · no data collected', 80, 540)
  return new Promise((r) => c.toBlob((b) => r(b), 'image/png'))
}
