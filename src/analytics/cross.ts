// SPDX-License-Identifier: AGPL-3.0-or-later
// Cross-service views: which organisations appear together in mail, and which people both mail you and share Drive files.
import type { DriveFile, GmailMsg, GraphData, GraphLink, GraphNode } from '../types'

export const OTHER_DOMAIN = 'other'

const domainOf = (addr: string): string => {
  const at = addr.lastIndexOf('@')
  return at >= 0 ? addr.slice(at + 1) : ''
}
const key = (a: string, b: string) => (a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`)
const byTotalThenName = (a: { name: string; total: number }, b: { name: string; total: number }) =>
  b.total - a.total || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/**
 * Domain co-occurrence in mail, weighted by message bytes.
 *
 * Each message contributes its set of domains (sender plus To/Cc), with `me`'s own address excluded so
 * your domain only counts when someone else in the same message shares it. Every unordered pair of
 * domains in a message adds the message's bytes to matrix[a][b] and matrix[b][a]. A domain that appears
 * alone in a message adds the bytes to its diagonal cell. Domains are ranked by their row total; the
 * top `topN` are kept and the rest are folded into a final 'other' row and column.
 */
export function domainCooccurrence(msgs: GmailMsg[], me: string, topN = 12): { domains: string[]; matrix: number[][] } {
  const self = me.trim().toLowerCase()
  const pairs = new Map<string, number>()
  const diag = new Map<string, number>()
  const total = new Map<string, number>()

  for (const m of msgs) {
    const size = Number.isFinite(m.size) && m.size > 0 ? m.size : 0
    const set = new Set<string>()
    for (const addr of [m.fromEmail, ...m.recipients]) {
      const a = (addr ?? '').trim().toLowerCase()
      if (!a || a === self) continue
      const d = domainOf(a)
      if (d) set.add(d)
    }
    if (set.size === 0) continue
    const doms = [...set]
    for (const d of doms) total.set(d, (total.get(d) ?? 0) + size)
    if (doms.length === 1) {
      const only = doms[0]!
      diag.set(only, (diag.get(only) ?? 0) + size)
      continue
    }
    for (let i = 0; i < doms.length; i++) {
      for (let j = i + 1; j < doms.length; j++) {
        const k = key(doms[i]!, doms[j]!)
        pairs.set(k, (pairs.get(k) ?? 0) + size)
      }
    }
  }

  const ranked = [...total.entries()].map(([name, t]) => ({ name, total: t })).sort(byTotalThenName)
  const keep = Math.max(0, Math.floor(topN))
  const kept = ranked.slice(0, keep).map((r) => r.name)
  const folded = ranked.length > keep
  const domains = folded ? [...kept, OTHER_DOMAIN] : kept
  const index = new Map(kept.map((d, i) => [d, i]))
  const otherIdx = folded ? kept.length : -1

  const n = domains.length
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const place = (d: string) => index.get(d) ?? otherIdx

  for (const [d, bytes] of diag) {
    const i = place(d)
    if (i >= 0) matrix[i]![i]! += bytes
  }
  for (const [k, bytes] of pairs) {
    const [a, b] = k.split('\u0001') as [string, string]
    const i = place(a)
    const j = place(b)
    if (i < 0 || j < 0) continue
    matrix[i]![j]! += bytes
    if (i !== j) matrix[j]![i]! += bytes
  }
  return { domains: domains.slice(), matrix }
}

interface PersonIndex {
  name: string
  mailBytes: number
  messages: number
  fileBytes: number
  files: number
}

/** People who both sent `me` mail and own (or co-own) non-trashed Drive files visible to `me`. */
function indexBridge(gmail: GmailMsg[], drive: DriveFile[], me: string): Map<string, PersonIndex> {
  const self = me.trim().toLowerCase()
  const mail = new Map<string, PersonIndex>()
  for (const m of gmail) {
    const addr = (m.fromEmail ?? '').trim().toLowerCase()
    if (!addr || addr === self) continue
    const p = mail.get(addr) ?? { name: '', mailBytes: 0, messages: 0, fileBytes: 0, files: 0 }
    p.mailBytes += Number.isFinite(m.size) ? m.size : 0
    p.messages += 1
    if (!p.name && m.fromName && m.fromName.toLowerCase() !== addr) p.name = m.fromName
    mail.set(addr, p)
  }
  const files = new Map<string, { bytes: number; files: number }>()
  for (const f of drive) {
    if (f.trashed || f.isFolder) continue
    const bytes = f.quota > 0 ? f.quota : f.size
    for (const raw of new Set(f.ownerEmails.map((e) => e.trim().toLowerCase()))) {
      if (!raw || raw === self) continue
      const cur = files.get(raw) ?? { bytes: 0, files: 0 }
      cur.bytes += Number.isFinite(bytes) ? bytes : 0
      cur.files += 1
      files.set(raw, cur)
    }
  }
  const out = new Map<string, PersonIndex>()
  for (const [addr, p] of mail) {
    const f = files.get(addr)
    if (!f) continue
    out.set(addr, { ...p, fileBytes: f.bytes, files: f.files })
  }
  return out
}

/**
 * Bipartite graph: person nodes (`p:<email>`, valued by mail plus file bytes) linked to two hubs,
 * `hub:mail` and `hub:drive`, with link weights equal to each side's bytes for that person.
 * Only people present on both sides appear. Empty when nobody bridges the two.
 */
export function peopleBridge(gmail: GmailMsg[], drive: DriveFile[], me: string): GraphData {
  const people = indexBridge(gmail, drive, me)
  if (people.size === 0) return { nodes: [], links: [] }
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  let mailHub = 0
  let driveHub = 0
  const ordered = [...people.entries()].sort(
    (a, b) => b[1].mailBytes + b[1].fileBytes - (a[1].mailBytes + a[1].fileBytes) || (a[0] < b[0] ? -1 : 1),
  )
  for (const [addr, p] of ordered) {
    nodes.push({ id: `p:${addr}`, label: p.name || addr, value: p.mailBytes + p.fileBytes })
    if (p.mailBytes > 0) {
      links.push({ source: 'hub:mail', target: `p:${addr}`, weight: p.mailBytes })
      mailHub += p.mailBytes
    }
    if (p.fileBytes > 0) {
      links.push({ source: 'hub:drive', target: `p:${addr}`, weight: p.fileBytes })
      driveHub += p.fileBytes
    }
  }
  nodes.unshift({ id: 'hub:mail', label: 'Mail', value: mailHub }, { id: 'hub:drive', label: 'Drive', value: driveHub })
  return { nodes, links }
}

export interface BridgeRow {
  email: string
  name: string
  mailBytes: number
  fileBytes: number
  messages: number
  files: number
  totalBytes: number
}

/** Table form of `peopleBridge`: one row per bridging person, largest combined footprint first. */
export function bridgeRows(gmail: GmailMsg[], drive: DriveFile[], me: string): BridgeRow[] {
  return [...indexBridge(gmail, drive, me)]
    .map(([email, p]) => ({
      email,
      name: p.name || email,
      mailBytes: p.mailBytes,
      fileBytes: p.fileBytes,
      messages: p.messages,
      files: p.files,
      totalBytes: p.mailBytes + p.fileBytes,
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes || (a.email < b.email ? -1 : 1))
}
