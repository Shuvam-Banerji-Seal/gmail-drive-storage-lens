// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import type { MimePart } from '../api/gmail'
import type { Cluster, GmailMsg } from '../types'
import {
  attachmentGraph,
  cumulativeByMonth,
  duplicateAttachments,
  senderMonthMatrix,
  typeBreakdown,
  typeOf,
} from './attachments'

const KIB = 1024
const DAY = 86_400_000
const T0 = Date.UTC(2024, 0, 15)

function msg(id: string, over: Partial<GmailMsg> = {}): GmailMsg {
  return {
    id,
    threadId: `t-${id}`,
    size: 100 * KIB,
    from: 'Ann <ann@example.org>',
    fromName: 'Ann',
    fromEmail: 'ann@example.org',
    domain: 'example.org',
    recipients: [],
    subject: 'Subject',
    ts: T0,
    labels: [],
    ...over,
  }
}

const part = (filename: string, size: number, mimeType = 'application/pdf'): MimePart => ({ filename, size, mimeType })

describe('typeOf', () => {
  it.each<[string, string, string]>([
    ['image/jpeg', 'a.bin', 'Images'],
    ['video/mp4', 'clip', 'Video'],
    ['audio/mpeg', 'song.mp3', 'Audio'],
    ['application/pdf', 'x.pdf', 'PDF'],
    ['application/msword', 'letter.doc', 'Documents'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx', 'Documents'],
    ['text/plain', 'notes.txt', 'Documents'],
    ['application/vnd.ms-excel', 'budget.xls', 'Spreadsheets'],
    ['text/csv', 'data.csv', 'Spreadsheets'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'deck.pptx', 'Slides'],
    ['application/zip', 'bundle.zip', 'Archives'],
    ['application/x-7z-compressed', 'bundle', 'Archives'],
    ['application/octet-stream', 'photo.HEIC', 'Images'],
    ['application/octet-stream', 'blob.xyz', 'Other'],
    ['', '', 'Other'],
  ])('classifies %s / %s as %s', (mime, name, expected) => {
    expect(typeOf(mime, name)).toBe(expected)
  })

  it('ignores MIME parameters and case', () => {
    expect(typeOf('Application/PDF; name=x', 'x')).toBe('PDF')
  })
})

describe('typeBreakdown', () => {
  it('is empty for no parts', () => {
    expect(typeBreakdown({})).toEqual([])
    expect(typeBreakdown({ m1: [] })).toEqual([])
  })

  it('sums bytes and counts per type, bytes descending', () => {
    const out = typeBreakdown({
      m1: [part('a.pdf', 10), part('b.jpg', 500, 'image/jpeg')],
      m2: [part('c.pdf', 30), part('d.png', 20, 'image/png')],
    })
    expect(out).toEqual([
      { type: 'Images', bytes: 520, count: 2 },
      { type: 'PDF', bytes: 40, count: 2 },
    ])
  })

  it('ignores parts without a filename', () => {
    const out = typeBreakdown({ m1: [part('', 999), part('   ', 999), part('ok.pdf', 5)] })
    expect(out).toEqual([{ type: 'PDF', bytes: 5, count: 1 }])
  })
})

describe('duplicateAttachments', () => {
  it('returns nothing when no attachment repeats', () => {
    const msgs = [msg('m1'), msg('m2')]
    expect(duplicateAttachments({ m1: [part('a.pdf', 5000)], m2: [part('b.pdf', 5000)] }, msgs)).toEqual([])
  })

  it('groups by lower-cased filename and KiB-rounded size, newest copy first', () => {
    const msgs = [msg('old', { ts: T0 }), msg('new', { ts: T0 + DAY }), msg('mid', { ts: T0 + 1000 })]
    const out = duplicateAttachments(
      { old: [part('Deck.PDF', 10 * KIB)], new: [part('deck.pdf', 10 * KIB)], mid: [part('deck.pdf', 10 * KIB)] },
      msgs,
    )
    expect(out).toHaveLength(1)
    const d = out[0]!
    expect(d.key).toBe('deck.pdf|10')
    expect(d.copies).toBe(3)
    expect(d.messageIds).toEqual(['new', 'mid', 'old'])
    expect(d.wasted).toBe(10 * KIB * 2)
  })

  it('rounds sizes to the nearest 1 KiB', () => {
    const msgs = [msg('a'), msg('b'), msg('c')]
    // 1500 bytes is 1.46 KiB and rounds to 1; 1024 also rounds to 1, so they match.
    const same = duplicateAttachments({ a: [part('x.pdf', 1500)], b: [part('x.pdf', 1024)] }, msgs)
    expect(same.map((d) => d.copies)).toEqual([2])
    // 1900 bytes is 1.86 KiB and rounds to 2, so it is a different attachment.
    const apart = duplicateAttachments({ a: [part('x.pdf', 1900)], b: [part('x.pdf', 1024)], c: [part('x.pdf', 1024)] }, msgs)
    expect(apart.map((d) => [d.key, d.copies])).toEqual([['x.pdf|1', 2]])
  })

  it('ignores nameless parts and messages that are not in msgs', () => {
    const msgs = [msg('a'), msg('b')]
    const out = duplicateAttachments(
      { a: [part('', 5 * KIB), part('z.pdf', 5 * KIB)], b: [part('z.pdf', 5 * KIB)], ghost: [part('z.pdf', 5 * KIB)] },
      msgs,
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.copies).toBe(2)
    expect(out[0]!.messageIds.sort()).toEqual(['a', 'b'])
  })

  it('counts a message once even if it carries the same attachment twice', () => {
    const msgs = [msg('a'), msg('b')]
    const out = duplicateAttachments({ a: [part('z.pdf', 5 * KIB), part('z.pdf', 5 * KIB)], b: [part('z.pdf', 5 * KIB)] }, msgs)
    expect(out[0]!.copies).toBe(2)
  })

  it('sorts by wasted bytes descending and uses the largest size', () => {
    const msgs = [msg('a'), msg('b'), msg('c'), msg('d'), msg('e')]
    const out = duplicateAttachments(
      {
        a: [part('small.pdf', KIB), part('big.pdf', 100 * KIB)],
        b: [part('small.pdf', KIB), part('big.pdf', 100 * KIB)],
        c: [part('small.pdf', KIB), part('big.pdf', 100 * KIB)],
        d: [part('mid.pdf', 50 * KIB)],
        e: [part('mid.pdf', 50 * KIB)],
      },
      msgs,
    )
    expect(out.map((d) => d.filename)).toEqual(['big.pdf', 'mid.pdf', 'small.pdf'])
    expect(out[0]!.wasted).toBe(100 * KIB * 2)
    expect(out[2]!.wasted).toBe(KIB * 2)
  })
})

describe('attachmentGraph', () => {
  it('is empty for no duplicates', () => {
    expect(attachmentGraph([], [])).toEqual({ nodes: [], links: [] })
  })

  it('builds attachment and sender nodes with links weighted by copies', () => {
    const msgs = [
      msg('a1', { fromEmail: 'ann@example.org', fromName: 'Ann', size: 1000 }),
      msg('a2', { fromEmail: 'ann@example.org', fromName: 'Ann', size: 2000 }),
      msg('b1', { fromEmail: 'bob@example.org', fromName: 'Bob', size: 500 }),
    ]
    const parts = { a1: [part('x.pdf', 3 * KIB)], a2: [part('x.pdf', 3 * KIB)], b1: [part('x.pdf', 3 * KIB)] }
    const dups = duplicateAttachments(parts, msgs)
    const g = attachmentGraph(dups, msgs)

    const att = g.nodes.find((n) => n.id === 'a:x.pdf|3')!
    expect(att.label).toBe('x.pdf')
    expect(att.value).toBe(3 * KIB * 3)

    const ann = g.nodes.find((n) => n.id === 's:ann@example.org')!
    expect(ann.label).toBe('Ann')
    expect(ann.value).toBe(3000)
    const bob = g.nodes.find((n) => n.id === 's:bob@example.org')!
    expect(bob.value).toBe(500)

    expect(g.links).toEqual([
      { source: 's:ann@example.org', target: 'a:x.pdf|3', weight: 2 },
      { source: 's:bob@example.org', target: 'a:x.pdf|3', weight: 1 },
    ])
  })

  it('keeps only the max heaviest attachments', () => {
    const msgs = [msg('a'), msg('b'), msg('c'), msg('d')]
    const parts = {
      a: [part('one.pdf', KIB), part('two.pdf', 9 * KIB)],
      b: [part('one.pdf', KIB), part('two.pdf', 9 * KIB)],
      c: [part('three.pdf', 2 * KIB)],
      d: [part('three.pdf', 2 * KIB)],
    }
    const dups = duplicateAttachments(parts, msgs)
    const g = attachmentGraph(dups, msgs, 1)
    const attachments = g.nodes.filter((n) => n.id.startsWith('a:'))
    expect(attachments.map((n) => n.label)).toEqual(['two.pdf'])
    expect(g.links.every((l) => l.target === 'a:two.pdf|9')).toBe(true)
  })
})

describe('cumulativeByMonth', () => {
  const months = ['2024-01', '2024-02', '2024-03']
  const series = [
    { key: 'a', label: 'Alpha', values: [10, 0, 5] },
    { key: 'b', label: 'Beta', values: [0, 7, 1] },
  ]

  it('returns one entry per month with running totals per series', () => {
    const out = cumulativeByMonth(months, series)
    expect(out.map((f) => f.month)).toEqual(months)
    expect(out[2]!.rows).toEqual([
      { key: 'a', label: 'Alpha', value: 15 },
      { key: 'b', label: 'Beta', value: 8 },
    ])
  })

  it('is monotonic non-decreasing even with negative or missing values', () => {
    const out = cumulativeByMonth(['m1', 'm2', 'm3', 'm4'], [{ key: 'x', label: 'X', values: [3, -4, NaN] }])
    const vals = out.map((f) => f.rows[0]!.value)
    expect(vals).toEqual([3, 3, 3, 3])
    for (let i = 1; i < vals.length; i++) expect(vals[i]!).toBeGreaterThanOrEqual(vals[i - 1]!)
  })

  it('handles empty inputs', () => {
    expect(cumulativeByMonth([], series)).toEqual([])
    expect(cumulativeByMonth(['2024-01'], [])).toEqual([{ month: '2024-01', rows: [] }])
  })
})

describe('senderMonthMatrix', () => {
  const cluster = (id: string, label: string, ids: string[]): Cluster => ({ id, label, kind: 'sender', messageIds: ids, bytes: 0 })

  it('is empty with no dated messages', () => {
    expect(senderMonthMatrix([], [], 5)).toEqual({ rows: [], cols: [], values: [] })
    const undated = [msg('u', { ts: 0 })]
    expect(senderMonthMatrix(undated, [cluster('c', 'C', ['u'])], 5)).toEqual({ rows: [], cols: [], values: [] })
  })

  it('fills contiguous UTC months and sums bytes per cluster and month', () => {
    const msgs = [
      msg('a', { size: 100, ts: Date.UTC(2024, 0, 3) }),
      msg('b', { size: 50, ts: Date.UTC(2024, 0, 30) }),
      msg('c', { size: 7, ts: Date.UTC(2024, 2, 1) }),
    ]
    const clusters = [cluster('x', 'Xavier', ['a', 'b']), cluster('y', 'Yan', ['c'])]
    const out = senderMonthMatrix(msgs, clusters, 15)
    expect(out.cols).toEqual(['2024-01', '2024-02', '2024-03'])
    expect(out.rows).toEqual(['Xavier', 'Yan'])
    expect(out.values).toEqual([
      [150, 0, 0],
      [0, 0, 7],
    ])
  })

  it('keeps the topN clusters by bytes', () => {
    const msgs = [msg('a', { size: 1 }), msg('b', { size: 10 }), msg('c', { size: 100 })]
    const clusters = [cluster('p', 'Small', ['a']), cluster('q', 'Big', ['c']), cluster('r', 'Mid', ['b'])]
    const out = senderMonthMatrix(msgs, clusters, 2)
    expect(out.rows).toEqual(['Big', 'Mid'])
    expect(out.values).toHaveLength(2)
  })
})
