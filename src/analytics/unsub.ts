// SPDX-License-Identifier: AGPL-3.0-or-later
import type { GmailMsg } from '../types'
import { parseListUnsubscribe } from './parse'

export interface UnsubRow {
  key: string
  label: string
  http: string[]
  mailto: string[]
  bytes: number
  count: number
  readRate: number
}

/**
 * Senders that publish a List-Unsubscribe header. Only http(s) and mailto targets
 * survive parseListUnsubscribe; senders with neither are dropped. Sorted by bytes desc.
 */
export function unsubscribeRadar(msgs: GmailMsg[]): UnsubRow[] {
  const groups = new Map<string, { label: string; http: Set<string>; mailto: Set<string>; bytes: number; count: number; read: number }>()
  for (const m of msgs) {
    if (!m.listUnsub) continue
    const links = parseListUnsubscribe(m.listUnsub)
    if (links.http.length === 0 && links.mailto.length === 0) continue
    const key = m.listId || m.fromEmail
    let g = groups.get(key)
    if (!g) {
      g = { label: m.fromName || m.fromEmail || key, http: new Set(), mailto: new Set(), bytes: 0, count: 0, read: 0 }
      groups.set(key, g)
    }
    links.http.forEach((u) => g.http.add(u))
    links.mailto.forEach((u) => g.mailto.add(u))
    g.bytes += m.size
    g.count += 1
    if (!m.labels.includes('UNREAD')) g.read += 1
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      label: g.label,
      http: [...g.http],
      mailto: [...g.mailto],
      bytes: g.bytes,
      count: g.count,
      readRate: g.count ? g.read / g.count : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
