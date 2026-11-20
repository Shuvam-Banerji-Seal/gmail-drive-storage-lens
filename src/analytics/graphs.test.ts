// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import type { GmailMsg, GraphData } from '../types'
import { correspondentGraph, louvainCommunities, pageRank, repeatedAttachmentGroups, senderGraph } from './graphs'

const msg = (over: Partial<GmailMsg> & { id: string }): GmailMsg => ({
  threadId: `t-${over.id}`,
  size: 1000,
  from: 'Someone <someone@example.com>',
  fromName: 'Someone',
  fromEmail: 'someone@example.com',
  domain: 'example.com',
  recipients: ['me@example.org'],
  subject: 'Hello',
  ts: 0,
  labels: [],
  ...over,
})

const clique = (ids: string[]) => {
  const links: GraphData['links'] = []
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) links.push({ source: ids[i]!, target: ids[j]!, weight: 1 })
  return links
}

describe('senderGraph', () => {
  it('returns an empty graph for no messages', () => {
    expect(senderGraph([])).toEqual({ nodes: [], links: [] })
  })
  it('creates one node per sender group with summed bytes', () => {
    const g = senderGraph([
      msg({ id: 'a', size: 300, fromEmail: 'alice@example.com', domain: 'example.com', fromName: 'Alice' }),
      msg({ id: 'b', size: 200, fromEmail: 'alice@example.com', domain: 'example.com', fromName: 'Alice' }),
      msg({ id: 'c', size: 50, fromEmail: 'bob@example.net', domain: 'example.net', fromName: 'Bob' }),
    ])
    const alice = g.nodes.find((n) => n.id === 'alice@example.com')
    expect(alice).toMatchObject({ label: 'Alice', value: 500 })
    expect(g.nodes.find((n) => n.id === 'bob@example.net')?.value).toBe(50)
  })
  it('filters by minBytes and caps by maxNodes, keeping the largest', () => {
    const msgs = [
      msg({ id: 'a', size: 900, fromEmail: 'a@example.com' }),
      msg({ id: 'b', size: 500, fromEmail: 'b@example.net', domain: 'example.net' }),
      msg({ id: 'c', size: 10, fromEmail: 'c@example.org', domain: 'example.org' }),
    ]
    expect(senderGraph(msgs, { minBytes: 100 }).nodes.map((n) => n.id)).toEqual(['a@example.com', 'b@example.net'])
    expect(senderGraph(msgs, { maxNodes: 1 }).nodes.map((n) => n.id)).toEqual(['a@example.com'])
  })
  it('links groups sharing a thread (1), a list (1) or a domain (0.2)', () => {
    const g = senderGraph([
      msg({ id: 'a', threadId: 'T', fromEmail: 'a@example.com', fromName: 'Alan Ex', domain: 'example.com' }),
      msg({ id: 'b', threadId: 'T', fromEmail: 'b@example.net', domain: 'example.net' }),
      msg({ id: 'c', threadId: 'U', fromEmail: 'c@example.com', fromName: 'Carol Zed', domain: 'example.com' }),
      msg({ id: 'd', threadId: 'V', fromEmail: 'd@list.org', domain: 'list.org', listId: 'news.list.org' }),
      msg({ id: 'e', threadId: 'W', fromEmail: 'e@other.org', domain: 'other.org', listId: 'news.list.org' }),
    ])
    const w = (s: string, t: string) => g.links.find((l) => [l.source, l.target].sort().join() === [s, t].sort().join())?.weight
    expect(w('a@example.com', 'b@example.net')).toBe(1)
    expect(w('a@example.com', 'c@example.com')).toBe(0.2)
    expect(w('d@list.org', 'e@other.org')).toBe(1)
    expect(w('b@example.net', 'd@list.org')).toBeUndefined()
  })
})

describe('louvainCommunities', () => {
  it('returns an empty map for an empty graph', () => {
    expect(louvainCommunities({ nodes: [], links: [] }).size).toBe(0)
  })
  it('finds the two obvious communities in two cliques joined by one weak edge', () => {
    const left = ['a1', 'a2', 'a3', 'a4']
    const right = ['b1', 'b2', 'b3', 'b4']
    const g: GraphData = {
      nodes: [...left, ...right].map((id) => ({ id, label: id, value: 1 })),
      links: [...clique(left), ...clique(right), { source: 'a1', target: 'b1', weight: 0.01 }],
    }
    const c = louvainCommunities(g)
    expect(c.size).toBe(8)
    const cl = new Set(left.map((id) => c.get(id)))
    const cr = new Set(right.map((id) => c.get(id)))
    expect(cl.size).toBe(1)
    expect(cr.size).toBe(1)
    expect([...cl][0]).not.toBe([...cr][0])
    expect(louvainCommunities(g)).toEqual(c)
  })
  it('gives isolated nodes their own communities without throwing', () => {
    const c = louvainCommunities({ nodes: [{ id: 'x', label: 'x', value: 1 }, { id: 'y', label: 'y', value: 1 }], links: [] })
    expect(c.size).toBe(2)
  })
})

describe('pageRank', () => {
  it('returns an empty map for an empty graph', () => {
    expect(pageRank({ nodes: [], links: [] }).size).toBe(0)
  })
  it('sums to about 1 and ranks a hub highest in a star', () => {
    const leaves = ['l1', 'l2', 'l3', 'l4', 'l5']
    const g: GraphData = {
      nodes: ['hub', ...leaves].map((id) => ({ id, label: id, value: 1 })),
      links: leaves.map((l) => ({ source: 'hub', target: l, weight: 1 })),
    }
    const r = pageRank(g)
    const sum = [...r.values()].reduce((s, x) => s + x, 0)
    expect(sum).toBeCloseTo(1, 9)
    const top = [...r.entries()].sort((a, b) => b[1] - a[1])[0]![0]
    expect(top).toBe('hub')
    expect(r.get('hub')!).toBeGreaterThan(r.get('l1')!)
  })
  it('handles isolated nodes and keeps the total at 1', () => {
    const r = pageRank({ nodes: [{ id: 'a', label: 'a', value: 1 }, { id: 'b', label: 'b', value: 1 }], links: [] })
    expect(r.get('a')).toBeCloseTo(0.5, 9)
    expect(r.get('b')).toBeCloseTo(0.5, 9)
  })
})

describe('correspondentGraph', () => {
  it('excludes me, links people sharing a thread and counts shared threads', () => {
    const g = correspondentGraph(
      [
        msg({ id: 'a', threadId: 'T1', fromEmail: 'ann@example.com', fromName: 'Ann', recipients: ['me@example.org', 'ben@example.net'] }),
        msg({ id: 'b', threadId: 'T1', fromEmail: 'ben@example.net', recipients: ['me@example.org', 'ann@example.com'] }),
        msg({ id: 'c', threadId: 'T2', fromEmail: 'ann@example.com', recipients: ['me@example.org', 'ben@example.net'] }),
        msg({ id: 'd', threadId: 'T3', fromEmail: 'cy@example.org', recipients: ['me@example.org'] }),
      ],
      'ME@example.org',
    )
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['ann@example.com', 'ben@example.net', 'cy@example.org'])
    expect(g.nodes.find((n) => n.id === 'ann@example.com')).toMatchObject({ label: 'Ann', value: 3 })
    expect(g.links).toEqual([{ source: 'ann@example.com', target: 'ben@example.net', weight: 2 }])
  })
})

describe('repeatedAttachmentGroups', () => {
  it('groups same-subject messages with sizes within 2%, requiring at least 3', () => {
    const groups = repeatedAttachmentGroups([
      msg({ id: 'a', subject: 'Invoice 1', size: 1_000_000 }),
      msg({ id: 'b', subject: 'Re: Invoice 2', size: 1_010_000 }),
      msg({ id: 'c', subject: 'Invoice 3', size: 1_015_000 }),
      msg({ id: 'd', subject: 'Invoice 4', size: 9_000_000 }),
      msg({ id: 'e', subject: 'Other', size: 1_000_000 }),
      msg({ id: 'f', subject: 'Other', size: 1_000_000 }),
    ])
    expect(groups).toEqual([{ key: 'invoice #|1000000', ids: ['a', 'b', 'c'], bytes: 3_025_000 }])
  })
  it('does not group messages outside the 2% window or below 3 members', () => {
    expect(
      repeatedAttachmentGroups([
        msg({ id: 'a', subject: 'Report', size: 1000 }),
        msg({ id: 'b', subject: 'Report', size: 1100 }),
        msg({ id: 'c', subject: 'Report', size: 1200 }),
      ]),
    ).toEqual([])
  })
  it('sorts groups by bytes descending', () => {
    const groups = repeatedAttachmentGroups([
      msg({ id: 'a', subject: 'Small', size: 100 }),
      msg({ id: 'b', subject: 'Small', size: 100 }),
      msg({ id: 'c', subject: 'Small', size: 100 }),
      msg({ id: 'd', subject: 'Big', size: 5000 }),
      msg({ id: 'e', subject: 'Big', size: 5000 }),
      msg({ id: 'f', subject: 'Big', size: 5000 }),
    ])
    expect(groups.map((g) => g.ids[0])).toEqual(['d', 'a'])
  })
})
