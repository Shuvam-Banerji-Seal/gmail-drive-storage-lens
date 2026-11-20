// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { clusterMessages } from './cluster'
import { recommend, topOffenders, type Recommendation } from './recommend'
import type { DriveFile, GmailMsg, Risk, SafetyResult } from '../types'

const MIB = 2 ** 20
const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 1)

function msg(p: Partial<GmailMsg> & { id: string }): GmailMsg {
  return {
    threadId: `t-${p.id}`,
    size: 1000,
    from: 'News <news@list.example>',
    fromName: 'News',
    fromEmail: 'news@list.example',
    domain: 'list.example',
    recipients: [],
    subject: 'Weekly digest',
    ts: NOW - 2 * DAY,
    labels: ['INBOX'],
    ...p,
  }
}

function drv(p: Partial<DriveFile> & { id: string }): DriveFile {
  return {
    name: `${p.id}.bin`,
    mime: 'application/octet-stream',
    size: 0,
    quota: 0,
    parents: [],
    owned: true,
    shared: false,
    trashed: false,
    modified: NOW - DAY,
    created: NOW - 10 * DAY,
    ownerEmails: ['me@example.com'],
    publicLink: false,
    isFolder: false,
    ...p,
  }
}

/** Every message is low risk unless overridden. */
function safetyOf(levels: Record<string, Risk>, ids: string[]): Map<string, SafetyResult> {
  return new Map(ids.map((id) => [id, { score: 0, level: levels[id] ?? 'low', reasons: [] }]))
}

function run(gmail: GmailMsg[], drive: DriveFile[] = [], levels: Record<string, Risk> = {}): Recommendation[] {
  return recommend({ gmail, drive, safety: safetyOf(levels, [...gmail.map((m) => m.id)]), now: NOW })
}

const byId = (recs: Recommendation[], id: string) => recs.find((r) => r.id === id)

describe('recommend: empty input', () => {
  it('returns nothing for an empty account', () => {
    expect(recommend({ gmail: [], drive: [], safety: new Map(), now: NOW })).toEqual([])
  })
})

describe('recommend: never-opened mailing lists', () => {
  const unread = (id: string, extra: Partial<GmailMsg> = {}) =>
    msg({ id, size: 2 * MIB, labels: ['INBOX', 'UNREAD'], listId: 'digest.list.example', ...extra })

  it('offers all unopened list mail from one sender with the rule in the text', () => {
    const recs = run([unread('a'), unread('b'), unread('c')])
    const r = byId(recs, 'never-opened:news@list.example')
    expect(r).toBeDefined()
    expect(r!.title).toBe('Never-opened mailing list: News')
    expect(r!.bytes).toBe(6 * MIB)
    expect(r!.risk).toBe('low')
    expect(r!.target).toEqual({ kind: 'gmail', ids: ['a', 'b', 'c'] })
    expect(r!.why).toContain('opened 0 of 3 emails (read rate 0%)')
  })

  it('skips a sender where any list mail was opened', () => {
    const recs = run([unread('a'), msg({ id: 'b', size: MIB, listId: 'digest.list.example', labels: ['INBOX'] })])
    expect(byId(recs, 'never-opened:news@list.example')).toBeUndefined()
  })

  it('ignores mail without a list id', () => {
    expect(run([msg({ id: 'a', size: MIB, labels: ['UNREAD'] })])).toEqual([])
  })

  it('keeps only the five senders with the most bytes', () => {
    const msgs: GmailMsg[] = []
    for (let s = 1; s <= 6; s++) {
      msgs.push(msg({ id: `s${s}`, size: s * MIB, fromEmail: `s${s}@list.example`, from: `S${s} <s${s}@list.example>`, fromName: `S${s}`, labels: ['UNREAD'], listId: `l${s}` }))
    }
    const recs = run(msgs).filter((r) => r.id.startsWith('never-opened:'))
    expect(recs).toHaveLength(5)
    expect(recs.map((r) => r.id)).not.toContain('never-opened:s1@list.example')
  })
})

describe('recommend: blocked and high-risk exclusion', () => {
  it('never targets blocked or high-risk Gmail ids', () => {
    const gmail = [
      msg({ id: 'ok', size: 3 * MIB, labels: ['UNREAD'], listId: 'x' }),
      msg({ id: 'starred', size: 3 * MIB, labels: ['UNREAD', 'STARRED'], listId: 'x' }),
      msg({ id: 'risky', size: 3 * MIB, labels: ['UNREAD'], listId: 'x' }),
      msg({ id: 'promo', size: 4 * MIB, labels: ['CATEGORY_PROMOTIONS'], ts: NOW - 400 * DAY }),
      msg({ id: 'promo-blocked', size: 4 * MIB, labels: ['CATEGORY_PROMOTIONS', 'STARRED'], ts: NOW - 400 * DAY }),
    ]
    const recs = run(gmail, [], { starred: 'blocked', 'promo-blocked': 'blocked', risky: 'high' })
    const offered = recs.flatMap((r) => (r.target.kind === 'gmail' ? r.target.ids : []))
    expect(offered.sort()).toEqual(['ok', 'promo'])
    expect(offered).not.toContain('starred')
    expect(offered).not.toContain('risky')
  })

  it('treats messages with no safety result as not eligible', () => {
    const recs = recommend({ gmail: [msg({ id: 'x', size: MIB, labels: ['UNREAD'], listId: 'l' })], drive: [], safety: new Map(), now: NOW })
    expect(recs).toEqual([])
  })
})

describe('recommend: repeated attachments', () => {
  const copy = (id: string, ts: number) => msg({ id, size: 5 * MIB, subject: 'Re: Quarterly deck', ts, labels: ['INBOX'], fromEmail: 'boss@work.example', from: 'Boss <boss@work.example>', fromName: 'Boss' })

  it('keeps the newest copy and offers the older ones', () => {
    const recs = run([copy('old1', NOW - 30 * DAY), copy('new', NOW - DAY), copy('old2', NOW - 20 * DAY)])
    const r = byId(recs, 'repeated-attachments')
    expect(r).toBeDefined()
    expect(r!.target).toEqual({ kind: 'gmail', ids: ['old1', 'old2'] })
    expect(r!.bytes).toBe(10 * MIB)
  })

  it('needs at least three copies', () => {
    expect(byId(run([copy('a', NOW), copy('b', NOW - DAY)]), 'repeated-attachments')).toBeUndefined()
  })
})

describe('recommend: old promotions', () => {
  it('offers large promotions older than a year and skips newer or small ones', () => {
    const gmail = [
      msg({ id: 'old-big', subject: 'Spring sale', size: 2 * MIB, labels: ['CATEGORY_PROMOTIONS'], ts: NOW - 400 * DAY }),
      msg({ id: 'new-big', subject: 'Summer sale', size: 2 * MIB, labels: ['CATEGORY_PROMOTIONS'], ts: NOW - 100 * DAY }),
      msg({ id: 'old-small', subject: 'Tiny', size: 1000, labels: ['CATEGORY_PROMOTIONS'], ts: NOW - 400 * DAY }),
      msg({ id: 'old-personal', subject: 'Hello', size: 2 * MIB, labels: ['CATEGORY_PERSONAL'], ts: NOW - 400 * DAY }),
    ]
    const r = byId(run(gmail), 'old-promotions')
    expect(r!.target).toEqual({ kind: 'gmail', ids: ['old-big'] })
    expect(r!.bytes).toBe(2 * MIB)
  })
})

describe('recommend: Drive duplicates and cold files', () => {
  it('keeps the newest duplicate and offers the rest', () => {
    const drive = [
      drv({ id: 'f-old', sha256: 'h1', size: 100 * MIB, quota: 100 * MIB, modified: NOW - 90 * DAY }),
      drv({ id: 'f-new', sha256: 'h1', size: 100 * MIB, quota: 100 * MIB, modified: NOW - DAY }),
      drv({ id: 'f-mid', sha256: 'h1', size: 100 * MIB, quota: 100 * MIB, modified: NOW - 30 * DAY }),
    ]
    const r = byId(run([], drive), 'drive-duplicates')
    expect(r!.target).toEqual({ kind: 'drive', ids: ['f-old', 'f-mid'] })
    expect(r!.bytes).toBe(200 * MIB)
    expect(r!.risk).toBe('low')
  })

  it('marks duplicates medium risk when a copy is shared', () => {
    const drive = [
      drv({ id: 'a', md5: 'm', size: MIB, quota: MIB, modified: NOW - DAY }),
      drv({ id: 'b', md5: 'm', size: MIB, quota: MIB, modified: NOW - 9 * DAY, shared: true }),
    ]
    expect(byId(run([], drive), 'drive-duplicates')!.risk).toBe('medium')
  })

  it('offers large owned files untouched for two years, and nothing else', () => {
    const drive = [
      drv({ id: 'cold', size: 20 * MIB, quota: 20 * MIB, modified: NOW - 3 * 365 * DAY }),
      drv({ id: 'viewed', size: 20 * MIB, quota: 20 * MIB, modified: NOW - 3 * 365 * DAY, viewed: NOW - DAY }),
      drv({ id: 'small', size: MIB, quota: MIB, modified: NOW - 3 * 365 * DAY }),
      drv({ id: 'trashed', size: 20 * MIB, quota: 20 * MIB, modified: NOW - 3 * 365 * DAY, trashed: true }),
      drv({ id: 'theirs', size: 20 * MIB, quota: 20 * MIB, modified: NOW - 3 * 365 * DAY, owned: false }),
    ]
    const r = byId(run([], drive), 'cold-drive')
    expect(r!.target).toEqual({ kind: 'drive', ids: ['cold'] })
    expect(r!.bytes).toBe(20 * MIB)
    expect(r!.risk).toBe('medium')
  })

  it('prefers quota over size when counting Drive bytes', () => {
    const drive = [drv({ id: 'q', size: 10 * MIB, quota: 25 * MIB, modified: NOW - 3 * 365 * DAY })]
    expect(byId(run([], drive), 'cold-drive')!.bytes).toBe(25 * MIB)
  })
})

describe('recommend: ordering and claims', () => {
  it('sorts by bytes descending and never offers a message twice', () => {
    const gmail = [
      msg({ id: 'l1', size: 9 * MIB, labels: ['UNREAD'], listId: 'same', fromEmail: 'a@x.example' }),
      msg({ id: 'l2', size: 9 * MIB, labels: ['UNREAD'], listId: 'same', fromEmail: 'a@x.example', subject: 'Other' }),
      msg({ id: 'p1', size: 2 * MIB, labels: ['CATEGORY_PROMOTIONS'], ts: NOW - 400 * DAY, fromEmail: 'b@x.example' }),
    ]
    const recs = run(gmail, [drv({ id: 'd', size: 50 * MIB, quota: 50 * MIB, modified: NOW - 3 * 365 * DAY })])
    const bytes = recs.map((r) => r.bytes)
    expect(bytes).toEqual([...bytes].sort((a, b) => b - a))
    const offered = recs.flatMap((r) => (r.target.kind === 'gmail' ? r.target.ids : []))
    expect(new Set(offered).size).toBe(offered.length)
  })

  it('emits nothing when no rule yields bytes', () => {
    expect(run([msg({ id: 'tiny', size: 10, labels: ['INBOX'] })])).toEqual([])
  })
})

describe('topOffenders', () => {
  it('mixes the biggest clusters and owned, untrashed files, largest first', () => {
    const gmail = [
      msg({ id: 'a', size: 30 * MIB, fromEmail: 'big@x.example', fromName: 'Big' }),
      msg({ id: 'b', size: MIB, fromEmail: 'small@x.example', fromName: 'Small', listId: 'list.x' }),
    ]
    const clusters = clusterMessages(gmail)
    const drive = [
      drv({ id: 'f1', name: 'Movie.mp4', quota: 80 * MIB, mime: 'video/mp4' }),
      drv({ id: 'f2', name: 'Gone.mp4', quota: 90 * MIB, trashed: true }),
      drv({ id: 'f3', name: 'Theirs.mp4', quota: 90 * MIB, owned: false }),
      drv({ id: 'dir', name: 'Folder', quota: 0, size: 0, isFolder: true }),
    ]
    const out = topOffenders(clusters, drive, 15)
    expect(out.map((o) => o.label)).toEqual(['Movie.mp4', 'Big', 'Small'])
    expect(out[1]!.detail).toBe('1 emails · sender')
    expect(out[2]!.detail).toBe('1 emails · mailing list')
  })

  it('respects n and handles empty input', () => {
    expect(topOffenders([], [], 15)).toEqual([])
    const drive = [drv({ id: 'a', quota: 3 }), drv({ id: 'b', quota: 2 }), drv({ id: 'c', quota: 1 })]
    expect(topOffenders([], drive, 2).map((o) => o.bytes)).toEqual([3, 2])
    expect(topOffenders([], drive, 0)).toEqual([])
  })
})
