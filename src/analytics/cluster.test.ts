// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import type { GmailMsg } from '../types'
import { clusterMessages, cosine, mergeSenders, senderKey, subjectClusters, tfidf } from './cluster'

const msg = (id: string, o: Partial<GmailMsg> = {}): GmailMsg => {
  const fromEmail = o.fromEmail ?? 'alice@example.com'
  return {
    id,
    threadId: `thr-${id}`,
    size: 100,
    from: '',
    fromName: 'Alice',
    fromEmail,
    domain: fromEmail.slice(fromEmail.indexOf('@') + 1),
    recipients: [],
    subject: '',
    ts: 0,
    labels: [],
    ...o,
  }
}

describe('senderKey', () => {
  it('uses listId when present', () => {
    expect(senderKey(msg('m1', { listId: 'news.example.org', fromEmail: 'bob@example.org' }))).toBe('news.example.org')
  })
  it('falls back to fromEmail', () => {
    expect(senderKey(msg('m1', { fromEmail: 'bob@example.org' }))).toBe('bob@example.org')
  })
})

describe('mergeSenders', () => {
  it('merges same-domain addresses with similar display names', () => {
    const map = mergeSenders([
      msg('m1', { fromEmail: 'alice@example.com', fromName: 'Alice Smith' }),
      msg('m2', { fromEmail: 'alice.m@example.com', fromName: 'Alice M Smith' }),
    ])
    expect(map.get('alice@example.com')).toBe(map.get('alice.m@example.com'))
  })
  it('does not merge across domains even with identical names', () => {
    const map = mergeSenders([
      msg('m1', { fromEmail: 'alice@example.com', fromName: 'Alice Smith' }),
      msg('m2', { fromEmail: 'alice@example.edu', fromName: 'Alice Smith' }),
    ])
    expect(map.get('alice@example.com')).toBe('alice@example.com')
    expect(map.get('alice@example.edu')).toBe('alice@example.edu')
  })
  it('does not merge same-domain addresses with dissimilar names', () => {
    const map = mergeSenders([
      msg('m1', { fromEmail: 'alice@example.com', fromName: 'Alice Smith' }),
      msg('m2', { fromEmail: 'bob@example.com', fromName: 'Bob Jones' }),
    ])
    expect(map.get('alice@example.com')).not.toBe(map.get('bob@example.com'))
  })
  it('returns an empty map for no messages', () => {
    expect(mergeSenders([]).size).toBe(0)
  })
})

describe('clusterMessages', () => {
  it('returns no clusters for empty input', () => {
    expect(clusterMessages([])).toEqual([])
  })
  it('makes one sender cluster for a single message', () => {
    const [c, ...rest] = clusterMessages([msg('m1', { size: 250, fromName: 'Alice' })])
    expect(rest).toEqual([])
    expect(c).toEqual({
      id: 'sender:alice@example.com',
      label: 'Alice',
      kind: 'sender',
      messageIds: ['m1'],
      bytes: 250,
    })
  })
  it('groups list messages by listId regardless of sender', () => {
    const cs = clusterMessages([
      msg('m1', { listId: 'news.example.org', fromEmail: 'a@example.org', size: 10 }),
      msg('m2', { listId: 'news.example.org', fromEmail: 'b@example.org', size: 20 }),
    ])
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ id: 'list:news.example.org', kind: 'list', bytes: 30 })
    expect(cs[0]!.messageIds).toEqual(['m1', 'm2'])
  })
  it('merges similar senders into one sender cluster', () => {
    const cs = clusterMessages([
      msg('m1', { fromEmail: 'alice@example.com', fromName: 'Alice Smith' }),
      msg('m2', { fromEmail: 'alice.m@example.com', fromName: 'Alice M Smith' }),
      msg('m3', { fromEmail: 'bob@example.com', fromName: 'Bob Jones' }),
    ])
    expect(cs).toHaveLength(2)
    const merged = cs.find((c) => c.messageIds.includes('m1'))!
    expect(merged.messageIds.sort()).toEqual(['m1', 'm2'])
    expect(merged.kind).toBe('sender')
  })
  it('sorts by bytes desc with ties broken by id', () => {
    const cs = clusterMessages([
      msg('m1', { fromEmail: 'bob@example.com', fromName: 'Bob', size: 500 }),
      msg('m2', { fromEmail: 'alice@example.com', fromName: 'Alice', size: 500 }),
      msg('m3', { fromEmail: 'carol@example.net', fromName: 'Carol', size: 900 }),
    ])
    expect(cs.map((c) => c.id)).toEqual(['sender:carol@example.net', 'sender:alice@example.com', 'sender:bob@example.com'])
  })
  it('labels a sender cluster with its most common display name', () => {
    const cs = clusterMessages([
      msg('m1', { fromName: 'Alice' }),
      msg('m2', { fromName: 'Alice Smith' }),
      msg('m3', { fromName: 'Alice Smith' }),
    ])
    expect(cs[0]!.label).toBe('Alice Smith')
  })
})

describe('tfidf and cosine', () => {
  it('gives cosine 1 for identical texts', () => {
    const { vectors } = tfidf(['weekend screenings schedule', 'weekend screenings schedule'])
    expect(cosine(vectors[0]!, vectors[1]!)).toBeCloseTo(1, 10)
  })
  it('gives cosine 0 for disjoint texts', () => {
    const { vectors } = tfidf(['alpha beta', 'gamma delta'])
    expect(cosine(vectors[0]!, vectors[1]!)).toBe(0)
  })
  it('produces L2-normalised vectors with a sorted vocabulary', () => {
    const { vectors, vocab } = tfidf(['Budget review budget', 'review notes'])
    expect(vocab).toEqual(['budget', 'notes', 'review'])
    for (const v of vectors) {
      let sq = 0
      for (const w of v.values()) sq += w * w
      expect(sq).toBeCloseTo(1, 10)
    }
  })
  it('handles empty input and empty texts', () => {
    expect(tfidf([])).toEqual({ vectors: [], vocab: [] })
    const { vectors } = tfidf(['', 'hello'])
    expect(vectors[0]!.size).toBe(0)
    expect(cosine(vectors[0]!, vectors[1]!)).toBe(0)
  })
  it('cosine of raw maps handles zero and partial overlap', () => {
    expect(cosine(new Map(), new Map([[0, 1]]))).toBe(0)
    expect(cosine(new Map([[0, 1]]), new Map([[0, 1]]))).toBeCloseTo(1, 10)
    expect(cosine(new Map([[0, 1]]), new Map([[1, 1]]))).toBe(0)
    expect(cosine(new Map([[0, 1]]), new Map([[0, 1], [1, 1]]))).toBeCloseTo(Math.SQRT1_2, 10)
  })
})

describe('subjectClusters', () => {
  it('returns no clusters for empty input', () => {
    expect(subjectClusters([])).toEqual([])
  })
  it('returns one cluster for a single message', () => {
    const cs = subjectClusters([msg('m1', { subject: 'Hello there', ts: 1 })])
    expect(cs).toEqual([{ id: expect.any(String), label: 'Hello there', kind: 'subject', messageIds: ['m1'], bytes: 100 }])
  })
  it('groups numbered series with a reply prefix but not unrelated subjects', () => {
    const msgs = [
      msg('m1', { subject: 'Weekend Screenings 3', ts: 1 }),
      msg('m2', { subject: 'Re: Weekend Screenings 7', ts: 2 }),
      msg('m3', { subject: 'Quarterly budget review', ts: 3 }),
    ]
    const cs = subjectClusters(msgs)
    expect(cs).toHaveLength(2)
    const series = cs.find((c) => c.messageIds.includes('m1'))!
    expect(series.kind).toBe('subject')
    expect(series.messageIds).toEqual(['m1', 'm2'])
    expect(series.label).toBe('Weekend Screenings 3')
    expect(cs.find((c) => c.messageIds.includes('m3'))!.messageIds).toEqual(['m3'])
  })
  it('is deterministic regardless of input order', () => {
    const msgs = [
      msg('m1', { subject: 'Weekend Screenings 3', ts: 1 }),
      msg('m2', { subject: 'Re: Weekend Screenings 7', ts: 2 }),
      msg('m3', { subject: 'Quarterly budget review', ts: 3 }),
    ]
    const norm = (cs: ReturnType<typeof subjectClusters>) =>
      cs.map((c) => [...c.messageIds].sort().join(',')).sort()
    expect(norm(subjectClusters([...msgs].reverse()))).toEqual(norm(subjectClusters(msgs)))
    expect(subjectClusters(msgs)).toEqual(subjectClusters(msgs))
  })
})
