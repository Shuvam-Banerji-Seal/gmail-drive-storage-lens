// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import type { GmailMsg } from '../types'
import { buildVip, noiseScores, repliedThreads, safety, type SafetyCtx } from './scores'

const DAY = 86_400_000
const NOW = 1_800_000_000_000

const msg = (id: string, o: Partial<GmailMsg> = {}): GmailMsg => {
  const fromEmail = o.fromEmail ?? 'news@example.org'
  return {
    id,
    threadId: `thr-${id}`,
    size: 100,
    from: '',
    fromName: 'News',
    fromEmail,
    domain: fromEmail.slice(fromEmail.indexOf('@') + 1),
    recipients: [],
    subject: '',
    ts: NOW - 365 * DAY,
    labels: [],
    ...o,
  }
}

const ctx: SafetyCtx = {
  vip: new Set(['vip@example.com']),
  me: 'me@example.com',
  now: NOW,
  userLabels: new Set(['Label_7']),
  repliedThreads: new Set(['thr-replied']),
}

describe('buildVip', () => {
  it('collects lower-cased recipients and excludes the user', () => {
    const vip = buildVip(
      [{ recipients: ['a@example.com', 'me@example.com'] }, { recipients: ['B@Example.com', 'a@example.com'] }],
      'ME@example.com',
    )
    expect([...vip].sort()).toEqual(['a@example.com', 'b@example.com'])
  })
  it('returns an empty set when nothing was sent', () => {
    expect(buildVip([], 'me@example.com').size).toBe(0)
  })
})

describe('repliedThreads', () => {
  it('returns thread ids of messages labelled SENT only', () => {
    const r = repliedThreads([
      msg('m1', { threadId: 't1', labels: ['SENT'] }),
      msg('m2', { threadId: 't2', labels: ['INBOX'] }),
    ])
    expect([...r]).toEqual(['t1'])
  })
  it('returns an empty set for no messages', () => {
    expect(repliedThreads([]).size).toBe(0)
  })
})

describe('safety', () => {
  it('scores a plain old message as 0 and low with no reasons', () => {
    expect(safety(msg('m1'), ctx)).toEqual({ score: 0, level: 'low', reasons: [] })
  })
  it('adds 60 for a VIP sender, which is high', () => {
    const r = safety(msg('m1', { fromEmail: 'vip@example.com' }), ctx)
    expect(r.score).toBe(60)
    expect(r.level).toBe('high')
    expect(r.reasons).toHaveLength(1)
  })
  it('clamps the score to 100', () => {
    const r = safety(
      msg('m1', {
        fromEmail: 'vip@example.com',
        threadId: 'thr-replied',
        labels: ['Label_7'],
        ts: NOW - DAY,
      }),
      ctx,
    )
    // 60 + 40 + 25 + 15 = 140
    expect(r.score).toBe(100)
    expect(r.level).toBe('high')
    expect(r.reasons).toHaveLength(4)
  })
  it('scores IMPORTANT plus young as 35, medium', () => {
    const r = safety(msg('m1', { labels: ['IMPORTANT'], ts: NOW - DAY }), ctx)
    expect(r.score).toBe(35)
    expect(r.level).toBe('medium')
  })
  it('subtracts 10 for UNREAD: 20 + 15 - 10 = 25, low', () => {
    const r = safety(msg('m1', { labels: ['IMPORTANT', 'UNREAD'], ts: NOW - DAY }), ctx)
    expect(r.score).toBe(25)
    expect(r.level).toBe('low')
  })
  it('reaches high at exactly 60 and medium at exactly 30', () => {
    // VIP alone is exactly 60, which is high.
    expect(safety(msg('m1', { fromEmail: 'vip@example.com' }), ctx)).toMatchObject({ score: 60, level: 'high' })
    // Replied thread (40) plus UNREAD (-10) is exactly 30, which is medium.
    const r = safety(msg('m1', { threadId: 'thr-replied', labels: ['UNREAD'] }), ctx)
    expect(r).toMatchObject({ score: 30, level: 'medium' })
    // Replied thread alone is 40, still medium.
    expect(safety(msg('m1', { threadId: 'thr-replied' }), ctx)).toMatchObject({ score: 40, level: 'medium' })
  })
  it('treats exactly 30 days old as not young', () => {
    const at30 = safety(msg('m1', { labels: ['IMPORTANT'], ts: NOW - 30 * DAY }), ctx)
    expect(at30.score).toBe(20)
    const at29 = safety(msg('m1', { labels: ['IMPORTANT'], ts: NOW - 29 * DAY }), ctx)
    expect(at29.score).toBe(35)
  })
  it('applies mailing-list, unsubscribe and promotion penalties, clamped at 0', () => {
    const r = safety(
      msg('m1', { listId: 'news.example.org', listUnsub: '<https://example.org/u>', labels: ['CATEGORY_PROMOTIONS'] }),
      ctx,
    )
    expect(r.score).toBe(0)
    expect(r.level).toBe('low')
    expect(r.reasons).toHaveLength(3)
  })
  it('applies only one category penalty even when several category labels are present', () => {
    const r = safety(msg('m1', { labels: ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL'] }), ctx)
    expect(r.reasons).toHaveLength(1)
    expect(r.score).toBe(0)
  })
  it('blocks starred messages with score 100 and level blocked', () => {
    const r = safety(msg('m1', { labels: ['STARRED'] }), ctx)
    expect(r.score).toBe(100)
    expect(r.level).toBe('blocked')
    expect(r.reasons.some((s) => s.includes('starred'))).toBe(true)
  })
  it('blocks sent, draft and self-authored messages', () => {
    expect(safety(msg('m1', { labels: ['SENT'] }), ctx).level).toBe('blocked')
    expect(safety(msg('m1', { labels: ['DRAFT'] }), ctx).level).toBe('blocked')
    const own = safety(msg('m1', { fromEmail: 'me@example.com' }), ctx)
    expect(own.level).toBe('blocked')
    expect(own.score).toBe(100)
  })
  it('keeps blocked score at 100 even when penalties apply', () => {
    const r = safety(msg('m1', { labels: ['STARRED', 'UNREAD'], listId: 'x.example.org' }), ctx)
    expect(r.score).toBe(100)
    expect(r.level).toBe('blocked')
  })
})

describe('noiseScores', () => {
  it('returns no rows for empty input', () => {
    expect(noiseScores([])).toEqual([])
  })
  it('computes the exact score arithmetic for one group', () => {
    // Same timestamp: span 0 gives one month, so perMonth = count = 2.
    // readRate = 1/2, score = 4000 * 0.5 * (1 + log10(3)).
    const rows = noiseScores([
      msg('m1', { size: 2000, ts: NOW, labels: ['UNREAD'] }),
      msg('m2', { size: 2000, ts: NOW, labels: [] }),
    ])
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    expect(r.key).toBe('news@example.org')
    expect(r.bytes).toBe(4000)
    expect(r.count).toBe(2)
    expect(r.readRate).toBeCloseTo(0.5, 10)
    expect(r.perMonth).toBeCloseTo(2, 10)
    expect(r.score).toBeCloseTo(2000 * (1 + Math.log10(3)), 6)
  })
  it('scores a fully read group as 0 and ranks unread bulk first', () => {
    const rows = noiseScores([
      msg('a1', { fromEmail: 'read@example.org', size: 500, ts: NOW, labels: [] }),
      msg('b1', { fromEmail: 'bulk@example.net', size: 1000, ts: NOW, labels: ['UNREAD'] }),
      msg('b2', { fromEmail: 'bulk@example.net', size: 1000, ts: NOW, labels: ['UNREAD'] }),
    ])
    expect(rows.map((r) => r.key)).toEqual(['bulk@example.net', 'read@example.org'])
    expect(rows[1]!.score).toBe(0)
    expect(rows[0]!.readRate).toBe(0)
  })
  it('merges similar addresses on the same domain into one row', () => {
    const rows = noiseScores([
      msg('m1', { fromEmail: 'alice@example.com', fromName: 'Alice Smith', size: 300, ts: NOW, labels: ['UNREAD'] }),
      msg('m2', { fromEmail: 'alice.m@example.com', fromName: 'Alice M Smith', size: 300, ts: NOW, labels: ['UNREAD'] }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.count).toBe(2)
    expect(rows[0]!.bytes).toBe(600)
    // Names tie at one each, so the label is the alphabetically first name.
    expect(rows[0]!.label).toBe('Alice M Smith')
  })
})
