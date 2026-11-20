// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import type { DriveFile, GmailMsg } from '../types'
import { bridgeRows, domainCooccurrence, OTHER_DOMAIN, peopleBridge } from './cross'

const ME = 'me@mine.org'

function msg(id: string, from: string, to: string[], size: number, fromName = ''): GmailMsg {
  const fromEmail = from.toLowerCase()
  return {
    id,
    threadId: 't' + id,
    size,
    from,
    fromName,
    fromEmail,
    domain: fromEmail.slice(fromEmail.indexOf('@') + 1),
    recipients: to.map((t) => t.toLowerCase()),
    subject: 's',
    ts: 0,
    labels: [],
  }
}

function file(id: string, owners: string[], bytes: number, extra: Partial<DriveFile> = {}): DriveFile {
  return {
    id,
    name: id,
    mime: 'application/pdf',
    size: bytes,
    quota: bytes,
    parents: [],
    owned: false,
    shared: true,
    trashed: false,
    modified: 0,
    created: 0,
    ownerEmails: owners,
    publicLink: false,
    isFolder: false,
    ...extra,
  }
}

describe('domainCooccurrence', () => {
  it('builds a symmetric matrix weighted by message bytes', () => {
    const msgs = [
      msg('1', 'a@acme.com', [ME, 'b@beta.io'], 100),
      msg('2', 'c@beta.io', [ME, 'd@acme.com'], 50),
      msg('3', 'x@solo.net', [ME], 10),
    ]
    const { domains, matrix } = domainCooccurrence(msgs, ME, 12)
    expect(domains).toEqual(['acme.com', 'beta.io', 'solo.net'])
    const [a, b, s] = [0, 1, 2]
    expect(matrix[a]![b]).toBe(150)
    expect(matrix[b]![a]).toBe(150)
    expect(matrix[a]![s]).toBe(0)
    expect(matrix[s]![s]).toBe(10)
    matrix.forEach((row, i) => row.forEach((v, j) => expect(v).toBe(matrix[j]![i])))
  })

  it('excludes me, so my own domain only counts when someone else shares it', () => {
    const selfOnly = domainCooccurrence([msg('1', ME, ['a@acme.com'], 40)], ME)
    expect(selfOnly.domains).toEqual(['acme.com'])
    expect(selfOnly.matrix[0]![0]).toBe(40)
    const sameDomain = domainCooccurrence([msg('2', 'boss@mine.org', [ME, 'x@other.com'], 30)], ME)
    expect(sameDomain.domains).toEqual(['mine.org', 'other.com'])
    expect(sameDomain.matrix[0]![1]).toBe(30)
    const noOne = domainCooccurrence([msg('3', ME, [ME], 99)], ME)
    expect(noOne).toEqual({ domains: [], matrix: [] })
  })

  it('keeps the top N domains and folds the rest into other', () => {
    const msgs = [
      msg('1', 'a@big.com', ['b@mid.com'], 1000),
      msg('2', 'c@mid.com', ['d@small.com'], 100),
      msg('3', 'e@tiny.com', ['f@tiny2.com'], 5),
    ]
    const { domains, matrix } = domainCooccurrence(msgs, ME, 2)
    // Totals: mid 1100, big 1000, small 100, tiny and tiny2 5 each. Top 2 kept, rest folded.
    expect(domains).toEqual(['mid.com', 'big.com', OTHER_DOMAIN])
    const total = matrix.flat().reduce((s, v) => s + v, 0)
    expect(matrix[0]![1]).toBe(1000)
    expect(matrix[0]![2]).toBe(100)
    expect(matrix[2]![2]).toBe(5)
    expect(total).toBe(2 * 1000 + 2 * 100 + 5)
  })

  it('returns an empty result for no messages', () => {
    expect(domainCooccurrence([], ME)).toEqual({ domains: [], matrix: [] })
  })
})

describe('peopleBridge and bridgeRows', () => {
  const gmail = [
    msg('1', 'ann@shared.org', [ME], 500, 'Ann Lee'),
    msg('2', 'ann@shared.org', [ME], 300, 'Ann Lee'),
    msg('3', 'bob@mailonly.com', [ME], 900),
    msg('4', ME, ['carl@shared.org'], 1000),
  ]
  const drive = [
    file('f1', ['ann@shared.org'], 200),
    file('f2', ['ann@shared.org', 'dan@drive.net'], 100),
    file('f3', ['zed@drive.net'], 700),
    file('f4', ['bob@mailonly.com'], 50, { trashed: true }),
    file('f5', [ME], 80, { owned: true }),
  ]

  it('only includes people who both mail me and own visible files', () => {
    const g = peopleBridge(gmail, drive, ME)
    const ids = g.nodes.map((n) => n.id).sort()
    expect(ids).toEqual(['hub:drive', 'hub:mail', 'p:ann@shared.org'])
    expect(g.nodes.find((n) => n.id === 'p:ann@shared.org')?.label).toBe('Ann Lee')
    expect(g.nodes.find((n) => n.id === 'p:ann@shared.org')?.value).toBe(800 + 300)
    expect(g.links).toEqual([
      { source: 'hub:mail', target: 'p:ann@shared.org', weight: 800 },
      { source: 'hub:drive', target: 'p:ann@shared.org', weight: 300 },
    ])
  })

  it('is bipartite: every link joins a hub to a person', () => {
    const g = peopleBridge(gmail, drive, ME)
    for (const l of g.links) {
      expect(l.source.startsWith('hub:')).toBe(true)
      expect(l.target.startsWith('p:')).toBe(true)
    }
  })

  it('returns an empty graph when nobody bridges the two sides', () => {
    expect(peopleBridge(gmail.slice(2, 3), [file('x', ['zed@drive.net'], 1)], ME)).toEqual({ nodes: [], links: [] })
  })

  it('bridgeRows gives per-person totals sorted by footprint', () => {
    const rows = bridgeRows(gmail, drive, ME)
    expect(rows).toEqual([
      { email: 'ann@shared.org', name: 'Ann Lee', mailBytes: 800, fileBytes: 300, messages: 2, files: 2, totalBytes: 1100 },
    ])
  })
})
