// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { generateDemo } from './generate'
import { parseFrom } from '../analytics/parse'

const GIB = 1024 ** 3
const EXAMPLE_ADDRESS = /@example\.(com|org|edu)$/

const demo = generateDemo(7)

describe('generateDemo', () => {
  it('is deterministic for the same seed', () => {
    expect(JSON.stringify(generateDemo(7))).toBe(JSON.stringify(demo))
  })

  it('differs for another seed', () => {
    const other = generateDemo(8)
    expect(JSON.stringify(other.gmail)).not.toBe(JSON.stringify(demo.gmail))
    expect(JSON.stringify(other.drive)).not.toBe(JSON.stringify(demo.drive))
  })

  it('uses only example.com / example.org / example.edu addresses', () => {
    const addresses = [
      demo.me,
      ...demo.gmail.flatMap((m) => [m.fromEmail, ...m.recipients]),
      ...demo.drive.flatMap((f) => f.ownerEmails),
      demo.quota.email ?? '',
    ]
    for (const a of addresses) expect(a).toMatch(EXAMPLE_ADDRESS)
    expect(demo.me).toBe('you@example.edu')
  })

  it('keeps every GmailMsg from/fromName/fromEmail/domain field consistent', () => {
    for (const m of demo.gmail) {
      const p = parseFrom(m.from)
      expect({ name: m.fromName, email: m.fromEmail, domain: m.domain }).toEqual(p)
      expect(m.domain).toBe(m.fromEmail.slice(m.fromEmail.indexOf('@') + 1))
    }
  })

  it('has at least 1000 Gmail messages, with mailing lists carrying most bytes', () => {
    expect(demo.gmail.length).toBeGreaterThanOrEqual(1000)
    const total = demo.gmail.reduce((s, m) => s + m.size, 0)
    const listBytes = demo.gmail.filter((m) => m.listId).reduce((s, m) => s + m.size, 0)
    expect(listBytes / total).toBeGreaterThan(0.9)
    expect(demo.gmail.filter((m) => m.listUnsub).every((m) => m.listUnsub!.includes('https://example.com/unsub?'))).toBe(true)
  })

  it('uses real Gmail label ids and includes SENT, starred and personal mail', () => {
    const ids = new Set(demo.labelCounts.map((l) => l.id))
    for (const id of ['INBOX', 'UNREAD', 'STARRED', 'IMPORTANT', 'SENT', 'CATEGORY_FORUMS', 'CATEGORY_UPDATES', 'CATEGORY_PROMOTIONS', 'CATEGORY_PERSONAL']) {
      expect(ids.has(id)).toBe(true)
    }
    const sent = demo.gmail.filter((m) => m.labels.includes('SENT'))
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every((m) => m.fromEmail === demo.me && m.recipients.length > 0)).toBe(true)
    expect(demo.gmail.some((m) => m.labels.includes('STARRED'))).toBe(true)
    const unread = demo.labelCounts.find((l) => l.id === 'UNREAD')!
    expect(unread.messagesTotal).toBe(demo.gmail.filter((m) => m.labels.includes('UNREAD')).length)
  })

  it('has exact duplicate groups in Drive (same sha256, md5 and size)', () => {
    const groups = new Map<string, typeof demo.drive>()
    for (const f of demo.drive) {
      if (!f.sha256) continue
      groups.set(f.sha256, [...(groups.get(f.sha256) ?? []), f])
    }
    const dups = [...groups.values()].filter((g) => g.length > 1)
    expect(dups.length).toBeGreaterThanOrEqual(15)
    expect(dups.some((g) => g.length >= 3)).toBe(true)
    for (const g of dups) {
      expect(new Set(g.map((f) => f.size)).size).toBe(1)
      expect(new Set(g.map((f) => f.md5)).size).toBe(1)
    }
  })

  it('wires Drive parents, with three levels of nesting and root as the top parent', () => {
    const byId = new Map(demo.drive.map((f) => [f.id, f]))
    const depth = (f: (typeof demo.drive)[number]): number => {
      let d = 0
      let cur = f
      while (cur.parents[0] !== 'root') {
        const parent = byId.get(cur.parents[0] ?? '')
        if (!parent) throw new Error(`dangling parent for ${cur.id}`)
        cur = parent
        d++
      }
      return d
    }
    expect(Math.max(...demo.drive.map(depth))).toBeGreaterThanOrEqual(2)
    expect(demo.drive.filter((f) => f.isFolder && f.parents[0] === 'root').length).toBeGreaterThan(0)
  })

  it('has the required Drive edge cases', () => {
    expect(demo.drive.length).toBeGreaterThanOrEqual(380)
    expect(demo.drive.some((f) => f.quota > f.size && !f.isFolder)).toBe(true)
    expect(demo.drive.some((f) => f.publicLink)).toBe(true)
    expect(demo.drive.some((f) => !f.owned)).toBe(true)
    expect(demo.drive.some((f) => f.viewed === undefined && f.created < Date.UTC(2024, 10, 1))).toBe(true)
    expect(demo.drive.some((f) => f.size >= 1.1 * GIB && f.size <= 1.3 * GIB)).toBe(true)
  })

  it('reports the storage-full case: usage over the 20 GiB limit', () => {
    expect(demo.quota.limit).toBe(20 * GIB)
    expect(demo.quota.usage).toBeGreaterThan(demo.quota.limit!)
    expect(demo.quota.usage).toBeLessThan(23 * GIB)
    expect(demo.quota.usageInDrive).toBeGreaterThan(2.5 * GIB)
    expect(demo.quota.usageInDrive).toBeLessThan(4.5 * GIB)
  })

  it('has non-negative integer sizes and quotas', () => {
    for (const f of demo.drive) {
      expect(Number.isInteger(f.size) && f.size >= 0).toBe(true)
      expect(Number.isInteger(f.quota) && f.quota >= 0).toBe(true)
    }
    for (const m of demo.gmail) expect(Number.isInteger(m.size) && m.size >= 0).toBe(true)
  })

  it('is JSON-serialisable without loss', () => {
    expect(JSON.parse(JSON.stringify(demo))).toEqual(demo)
  })
})
