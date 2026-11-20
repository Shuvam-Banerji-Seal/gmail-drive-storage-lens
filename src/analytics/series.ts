// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Cluster, GmailMsg } from '../types'
import { dayKey, monthKey } from '../util/format'

/** Messages with a usable internal date (epoch ms > 0). */
function datedMsgs(msgs: GmailMsg[]): GmailMsg[] {
  return msgs.filter((m) => Number.isFinite(m.ts) && m.ts > 0)
}

function nextMonth(key: string): string {
  let y = Number(key.slice(0, 4))
  let m = Number(key.slice(5, 7)) + 1
  if (m > 12) {
    m = 1
    y++
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

/**
 * Bytes per month for each cluster. Months are contiguous (UTC) from the earliest to the latest
 * message, with zero-filled gaps. The `topN` clusters by bytes get their own series; the rest are
 * summed into a series keyed `other`.
 */
export function monthlyByCluster(
  msgs: GmailMsg[],
  clusters: Cluster[],
  topN = 8,
): { months: string[]; series: Array<{ key: string; label: string; values: number[] }> } {
  const dated = datedMsgs(msgs)
  if (dated.length === 0) return { months: [], series: [] }

  let minTs = Infinity
  let maxTs = -Infinity
  for (const m of dated) {
    minTs = Math.min(minTs, m.ts)
    maxTs = Math.max(maxTs, m.ts)
  }
  const first = monthKey(minTs)
  const last = monthKey(maxTs)
  const months: string[] = []
  for (let k = first; k <= last; k = nextMonth(k)) months.push(k)
  const monthIndex = new Map(months.map((k, i) => [k, i] as const))

  const byId = new Map<string, GmailMsg>()
  for (const m of dated) byId.set(m.id, m)

  const perCluster = new Map<string, { cluster: Cluster; values: number[]; total: number }>()
  for (const c of clusters) {
    if (perCluster.has(c.id)) continue
    const values: number[] = new Array<number>(months.length).fill(0)
    let total = 0
    for (const id of c.messageIds) {
      const m = byId.get(id)
      if (!m) continue
      const i = monthIndex.get(monthKey(m.ts))
      if (i === undefined) continue
      values[i]! += m.size
      total += m.size
    }
    if (total > 0) perCluster.set(c.id, { cluster: c, values, total })
  }

  const ranked = [...perCluster.values()].sort(
    (a, b) => b.total - a.total || a.cluster.id.localeCompare(b.cluster.id),
  )
  const n = Math.max(0, topN)
  const series: Array<{ key: string; label: string; values: number[] }> = ranked
    .slice(0, n)
    .map((e) => ({ key: e.cluster.id, label: e.cluster.label, values: e.values }))

  const rest = ranked.slice(n)
  if (rest.length > 0) {
    const other: number[] = new Array<number>(months.length).fill(0)
    for (const e of rest) e.values.forEach((v, i) => (other[i] = (other[i] ?? 0) + v))
    series.push({ key: 'other', label: 'Other', values: other })
  }
  return { months, series }
}

/** Bytes per UTC day ("YYYY-MM-DD"). Messages without a valid date are ignored. */
export function dailyBytes(msgs: GmailMsg[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of datedMsgs(msgs)) {
    const k = dayKey(m.ts)
    out.set(k, (out.get(k) ?? 0) + m.size)
  }
  return out
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/**
 * Indices whose upward modified z-score, 0.6745 * (x - median) / MAD, exceeds `z`.
 * When MAD is 0 (the typical value is flat) any value above the median counts as an infinite score,
 * so a single spike in a flat series is flagged while a constant series yields [].
 */
export function anomalies(values: number[], z = 3.5): number[] {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return []
  const med = median(finite)
  const mad = median(finite.map((v) => Math.abs(v - med)))
  const out: number[] = []
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) return
    let score: number
    if (mad === 0) score = v > med ? Infinity : 0
    else score = (0.6745 * (v - med)) / mad
    if (score > z) out.push(i)
  })
  return out
}

/**
 * Least-squares slope (per month) over the last 12 values, and the months until `cap` at that pace.
 * `monthsToCap` is null when the slope is not positive or `currentUsed` already exceeds `cap`.
 */
export function linearForecast(
  monthly: number[],
  currentUsed: number,
  cap: number,
): { monthsToCap: number | null; slope: number } {
  const xs = monthly.slice(-12)
  const n = xs.length
  let slope = 0
  if (n >= 2) {
    const xMean = (n - 1) / 2
    const yMean = xs.reduce((s, y) => s + y, 0) / n
    let num = 0
    let den = 0
    xs.forEach((y, i) => {
      num += (i - xMean) * (y - yMean)
      den += (i - xMean) ** 2
    })
    slope = num / den
  }
  if (slope <= 0 || currentUsed > cap) return { monthsToCap: null, slope }
  return { monthsToCap: Math.ceil((cap - currentUsed) / slope), slope }
}

export interface SankeyData {
  nodes: Array<{ id: string; label: string }>
  links: Array<{ source: string; target: string; value: number }>
}

const OTHER_DOMAIN = '*other*'
const SEP = '\u0000'

/**
 * Flow from sender domain to category, then Read/Unread, then recommendation.
 * Domains beyond the `topDomains` largest are folded into one "Other domains" node.
 * Every column carries the full byte total, so link values conserve bytes at each stage.
 * Node ids are prefixed by column: d: domain, c: category, s: status, r: recommendation.
 */
export function sankeyData(
  msgs: GmailMsg[],
  recommend: (m: GmailMsg) => string,
  topDomains = 8,
): SankeyData {
  if (msgs.length === 0) return { nodes: [], links: [] }

  const domainBytes = new Map<string, number>()
  for (const m of msgs) domainBytes.set(m.domain, (domainBytes.get(m.domain) ?? 0) + m.size)
  const ranked = [...domainBytes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const keep = new Set(ranked.slice(0, Math.max(0, topDomains)).map(([d]) => d))

  const nodes = new Map<string, { id: string; label: string }>()
  const links = new Map<string, { source: string; target: string; value: number }>()
  const node = (id: string, label: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, label })
    return id
  }
  const link = (source: string, target: string, value: number) => {
    const k = `${source}${SEP}${target}`
    const l = links.get(k)
    if (l) l.value += value
    else links.set(k, { source, target, value })
  }

  for (const m of msgs) {
    const domain = keep.has(m.domain) ? m.domain : OTHER_DOMAIN
    const dId = node(`d:${domain}`, domain === OTHER_DOMAIN ? 'Other domains' : domain || '(unknown)')

    const cats = m.labels.filter((l) => l.startsWith('CATEGORY_')).sort()
    const cat = cats[0]
    const cName = cat ? cat.slice('CATEGORY_'.length) : 'Other'
    const cLabel = cat ? cName.charAt(0) + cName.slice(1).toLowerCase() : 'Other'
    const cId = node(`c:${cName}`, cLabel)

    const unread = m.labels.includes('UNREAD')
    const sId = node(`s:${unread ? 'unread' : 'read'}`, unread ? 'Unread' : 'Read')

    const rec = recommend(m)
    const rId = node(`r:${rec}`, rec)

    link(dId, cId, m.size)
    link(cId, sId, m.size)
    link(sId, rId, m.size)
  }

  return { nodes: [...nodes.values()], links: [...links.values()] }
}
