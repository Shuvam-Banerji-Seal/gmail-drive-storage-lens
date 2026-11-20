// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import type { GmailMsg } from '../types'
import { applyRule, describeRule, hasCriteria, matchRule, retentionChecklist, ruleToGmailQuery, type SelectionRule } from './rules'

const MIB = 2 ** 20
const NOW = Date.UTC(2026, 10, 1)
const MONTH = (365.25 / 12) * 86_400_000

function msg(p: Partial<GmailMsg> & { id: string }): GmailMsg {
  return {
    threadId: `t-${p.id}`,
    size: 1000,
    from: 'Someone <someone@example.com>',
    fromName: 'Someone',
    fromEmail: 'someone@example.com',
    domain: 'example.com',
    recipients: [],
    subject: 'Hello',
    ts: NOW - 86_400_000,
    labels: ['INBOX'],
    ...p,
  }
}

const club = msg({
  id: 'club',
  from: '"Club Chair" <chair@club.example>',
  fromName: 'Club Chair',
  fromEmail: 'chair@club.example',
  size: 6 * MIB,
  ts: NOW - 13 * MONTH,
  labels: ['INBOX', 'UNREAD'],
  listId: 'club.example',
})
const small = msg({ id: 'small', size: 2 * MIB, ts: NOW - 20 * MONTH, labels: ['CATEGORY_PROMOTIONS'] })
const exact = msg({ id: 'exact', size: 5 * MIB, ts: NOW - 12 * MONTH })

describe('matchRule', () => {
  it('matches nothing for an empty rule', () => {
    expect(matchRule(club, {}, NOW)).toBe(false)
    expect(matchRule(club, { senderContains: '   ', minSizeMB: 0, unreadOnly: false }, NOW)).toBe(false)
  })

  it('matches sender substrings case-insensitively against name and address', () => {
    expect(matchRule(club, { senderContains: 'CLUB' }, NOW)).toBe(true)
    expect(matchRule(club, { senderContains: 'chair@' }, NOW)).toBe(true)
    expect(matchRule(club, { senderContains: 'boardgames' }, NOW)).toBe(false)
  })

  it('matches label ids case-insensitively', () => {
    expect(matchRule(small, { label: 'category_promotions' }, NOW)).toBe(true)
    expect(matchRule(small, { label: 'CATEGORY_SOCIAL' }, NOW)).toBe(false)
  })

  it('uses a strict size threshold in MiB', () => {
    expect(matchRule(exact, { minSizeMB: 5 }, NOW)).toBe(false)
    expect(matchRule(club, { minSizeMB: 5 }, NOW)).toBe(true)
  })

  it('uses the age threshold relative to now', () => {
    expect(matchRule(club, { olderThanMonths: 12 }, NOW)).toBe(true)
    expect(matchRule(small, { olderThanMonths: 24 }, NOW)).toBe(false)
  })

  it('applies unread and list filters', () => {
    expect(matchRule(club, { unreadOnly: true }, NOW)).toBe(true)
    expect(matchRule(small, { unreadOnly: true }, NOW)).toBe(false)
    expect(matchRule(club, { listsOnly: true }, NOW)).toBe(true)
    expect(matchRule(small, { listsOnly: true }, NOW)).toBe(false)
  })

  it('requires every criterion that is in use', () => {
    expect(matchRule(club, { senderContains: 'club', minSizeMB: 5, olderThanMonths: 12, unreadOnly: true, listsOnly: true }, NOW)).toBe(true)
    expect(matchRule(club, { senderContains: 'club', minSizeMB: 7 }, NOW)).toBe(false)
  })
})

describe('applyRule', () => {
  it('filters the list in order and returns nothing for an empty rule', () => {
    const all = [club, small, exact]
    expect(applyRule(all, { minSizeMB: 1 }, NOW).map((m) => m.id)).toEqual(['club', 'small', 'exact'])
    expect(applyRule(all, { minSizeMB: 2 }, NOW).map((m) => m.id)).toEqual(['club', 'exact'])
    expect(applyRule(all, {}, NOW)).toEqual([])
  })
})

describe('describeRule', () => {
  it('writes the example sentence', () => {
    const r: SelectionRule = { unreadOnly: true, listsOnly: true, minSizeMB: 5, olderThanMonths: 12, senderContains: 'club' }
    expect(describeRule(r)).toBe("unread mailing-list emails larger than 5 MB older than 12 months from 'club'")
  })

  it('handles singular month, fractional sizes and labels', () => {
    expect(describeRule({ olderThanMonths: 1, label: 'CATEGORY_PROMOTIONS' })).toBe("emails older than 1 month labelled 'CATEGORY_PROMOTIONS'")
    expect(describeRule({ minSizeMB: 1.5 })).toBe('emails larger than 1.5 MB')
  })

  it('says when nothing is set', () => {
    expect(describeRule({})).toBe('No criteria set: this rule matches nothing.')
    expect(hasCriteria({ minSizeMB: 0 })).toBe(false)
    expect(hasCriteria({ unreadOnly: true })).toBe(true)
  })
})

describe('ruleToGmailQuery', () => {
  it('returns an empty string for an empty rule', () => {
    expect(ruleToGmailQuery({})).toBe('')
  })

  it('builds the exact operator string in a fixed order', () => {
    expect(
      ruleToGmailQuery({ senderContains: 'club', label: 'Work', minSizeMB: 5, olderThanMonths: 12, unreadOnly: true, listsOnly: true }),
    ).toBe('from:club label:Work larger:5M older_than:12m is:unread')
  })

  it('quotes sender and label text that contains spaces', () => {
    expect(ruleToGmailQuery({ senderContains: 'movie night', label: 'My Stuff' })).toBe('from:"movie night" label:"My Stuff"')
  })

  it('maps category labels to the category operator', () => {
    expect(ruleToGmailQuery({ label: 'CATEGORY_PROMOTIONS' })).toBe('category:promotions')
  })

  it('falls back to days and bytes for fractional thresholds', () => {
    expect(ruleToGmailQuery({ olderThanMonths: 1.5 })).toBe('older_than:46d')
    expect(ruleToGmailQuery({ minSizeMB: 0.5 })).toBe(`larger:${MIB / 2}`)
  })

  it('omits mailing lists, which Gmail cannot search', () => {
    expect(ruleToGmailQuery({ listsOnly: true })).toBe('')
    expect(ruleToGmailQuery({ listsOnly: true, unreadOnly: true })).toBe('is:unread')
  })
})

describe('retentionChecklist', () => {
  it('suggests keep periods from the read rate thresholds', () => {
    const md = retentionChecklist([
      { label: 'Movie Night Society', bytes: 1, count: 10, readRate: 0.03 },
      { label: 'Board Game Guild', bytes: 1, count: 10, readRate: 0.3 },
      { label: 'Recipe Box', bytes: 1, count: 10, readRate: 0.5 },
      { label: 'Bake Sale', bytes: 1, count: 10, readRate: 0.99 },
    ])
    expect(md).toContain('- [ ] Movie Night Society: keep 3 months (opened 3%)')
    expect(md).toContain('- [ ] Board Game Guild: keep 6 months (opened 30%)')
    expect(md).toContain('- [ ] Recipe Box: keep 12 months (opened 50%)')
    expect(md).toContain('- [ ] Bake Sale: keep 12 months (opened 99%)')
  })

  it('keeps labels on one line and handles no rows', () => {
    expect(retentionChecklist([{ label: 'a\nb', bytes: 0, count: 0, readRate: 0 }])).toContain('- [ ] a b: keep 3 months (opened 0%)')
    expect(retentionChecklist([])).toContain('_No senders to review._')
  })
})
