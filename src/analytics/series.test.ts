// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import type { Cluster, GmailMsg } from '../types'
import {
  anomalies,
  dailyBytes,
  linearForecast,
  monthlyByCluster,
  sankeyData,
} from './series'

const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h)

const msg = (over: Partial<GmailMsg> & { id: string }): GmailMsg => ({
  threadId: `t-${over.id}`,
  size: 1,
  from: 'Sender <sender@shop.example.test>',
  fromName: 'Sender',
  fromEmail: 'sender@shop.example.test',
  domain: 'shop.example.test',
  recipients: ['me@example.test'],
  subject: 'hello',
  ts: at(2024, 1, 5),
  labels: ['INBOX'],
  ...over,
})

const cluster = (id: string, label: string, messageIds: string[]): Cluster => ({
  id,
  label,
  kind: 'sender',
  messageIds,
  bytes: 0,
})

describe('monthlyByCluster', () => {
  it('returns empty months and series for empty input', () => {
    expect(monthlyByCluster([], [])).toEqual({ months: [], series: [] })
    expect(monthlyByCluster([msg({ id: 'x' })], [])).toEqual({
      months: ['2024-01'],
      series: [],
    })
  })

  const msgs = [
    msg({ id: 'm1', size: 100, ts: at(2024, 1, 5) }),
    msg({ id: 'm2', size: 50, ts: at(2024, 1, 20) }),
    msg({ id: 'm3', size: 300, ts: at(2024, 3, 10) }),
    msg({ id: 'm4', size: 10, ts: at(2024, 3, 12) }),
    msg({ id: 'm5', size: 5, ts: at(2024, 2, 1) }),
  ]
  const clusters = [
    cluster('a', 'Alpha', ['m1', 'm3']),
    cluster('b', 'Beta', ['m2', 'm4']),
    cluster('c', 'Gamma', ['m5']),
    cluster('empty', 'Empty', []),
  ]

  it('fills gaps with zeros so months are contiguous', () => {
    const out = monthlyByCluster(msgs, clusters)
    expect(out.months).toEqual(['2024-01', '2024-02', '2024-03'])
    expect(out.series.find((s) => s.key === 'a')!.values).toEqual([100, 0, 300])
    expect(out.series.find((s) => s.key === 'b')!.values).toEqual([50, 0, 10])
    expect(out.series.find((s) => s.key === 'c')!.values).toEqual([0, 5, 0])
    expect(out.series.some((s) => s.key === 'empty')).toBe(false)
  })

  it('orders series by bytes and folds the remainder into other when over topN', () => {
    const out = monthlyByCluster(msgs, clusters, 2)
    expect(out.series.map((s) => s.key)).toEqual(['a', 'b', 'other'])
    expect(out.series[2]!.values).toEqual([0, 5, 0])
    // per-month totals are preserved across series
    const totals = out.months.map((_, i) => out.series.reduce((s, x) => s + x.values[i]!, 0))
    expect(totals).toEqual([150, 5, 310])
  })

  it('does not add an other series when everything fits in topN', () => {
    const out = monthlyByCluster(msgs, clusters, 8)
    expect(out.series.map((s) => s.key)).toEqual(['a', 'b', 'c'])
  })

  it('spans year boundaries in UTC', () => {
    const out = monthlyByCluster(
      [msg({ id: 'x', ts: at(2023, 12, 31, 23), size: 4 }), msg({ id: 'y', ts: at(2024, 2, 1), size: 6 })],
      [cluster('k', 'K', ['x', 'y'])],
    )
    expect(out.months).toEqual(['2023-12', '2024-01', '2024-02'])
    expect(out.series[0]!.values).toEqual([4, 0, 6])
  })
})

describe('dailyBytes', () => {
  it('returns an empty map for empty input', () => {
    expect(dailyBytes([]).size).toBe(0)
  })
  it('sums bytes per UTC day and ignores undated messages', () => {
    const out = dailyBytes([
      msg({ id: 'a', size: 10, ts: at(2024, 3, 5, 1) }),
      msg({ id: 'b', size: 15, ts: at(2024, 3, 5, 23) }),
      msg({ id: 'c', size: 7, ts: at(2024, 3, 6, 0) }),
      msg({ id: 'd', size: 99, ts: 0 }),
    ])
    expect(out.get('2024-03-05')).toBe(25)
    expect(out.get('2024-03-06')).toBe(7)
    expect(out.size).toBe(2)
  })
})

describe('anomalies', () => {
  it('returns [] for empty input', () => {
    expect(anomalies([])).toEqual([])
  })
  it('returns [] for constant input without dividing by a zero MAD', () => {
    expect(anomalies([5, 5, 5, 5, 5])).toEqual([])
  })
  it('flags a single big spike in a flat series', () => {
    expect(anomalies([10, 10, 10, 10, 500, 10, 10])).toEqual([4])
  })
  it('flags an outlier in a noisy series and ignores ordinary variation', () => {
    expect(anomalies([1, 2, 3, 2, 1, 2, 3, 2, 100])).toEqual([8])
  })
  it('does not flag downward dips', () => {
    expect(anomalies([10, 10, 10, 0, 10])).toEqual([])
  })
  it('respects a custom threshold', () => {
    const v = [1, 2, 3, 2, 1, 2, 3, 2, 100]
    expect(anomalies(v, 1e9)).toEqual([])
  })
})

describe('linearForecast', () => {
  it('projects months to cap for a growing series', () => {
    const r = linearForecast([10, 20, 30], 50, 100)
    expect(r.slope).toBeCloseTo(10)
    expect(r.monthsToCap).toBe(5)
  })
  it('rounds months to cap up', () => {
    expect(linearForecast([0, 10, 20], 25, 100).monthsToCap).toBe(8)
  })
  it('returns 0 months when exactly at the cap', () => {
    expect(linearForecast([10, 20, 30], 100, 100)).toEqual({ monthsToCap: 0, slope: 10 })
  })
  it('returns null for a flat series', () => {
    expect(linearForecast([5, 5, 5, 5], 20, 100)).toEqual({ monthsToCap: null, slope: 0 })
  })
  it('returns null for a declining series', () => {
    const r = linearForecast([30, 20, 10], 20, 100)
    expect(r.monthsToCap).toBeNull()
    expect(r.slope).toBeCloseTo(-10)
  })
  it('returns null when already over the cap', () => {
    expect(linearForecast([10, 20, 30], 150, 100).monthsToCap).toBeNull()
  })
  it('handles empty and single-value input', () => {
    expect(linearForecast([], 1, 100)).toEqual({ monthsToCap: null, slope: 0 })
    expect(linearForecast([100], 1, 100)).toEqual({ monthsToCap: null, slope: 0 })
  })
  it('uses only the last 12 values', () => {
    const monthly = [...Array.from({ length: 12 }, () => 1000), ...Array.from({ length: 12 }, (_, i) => i + 1)]
    expect(linearForecast(monthly, 0, 1000).slope).toBeCloseTo(1)
  })
})

describe('sankeyData', () => {
  it('returns empty data for empty input', () => {
    expect(sankeyData([], () => 'Keep')).toEqual({ nodes: [], links: [] })
  })

  const sample = [
    msg({ id: '1', domain: 'a.example.test', size: 100, labels: ['CATEGORY_PROMOTIONS', 'UNREAD'] }),
    msg({ id: '2', domain: 'a.example.test', size: 40, labels: ['CATEGORY_PROMOTIONS'] }),
    msg({ id: '3', domain: 'b.example.test', size: 70, labels: ['UNREAD'] }),
    msg({ id: '4', domain: 'c.example.test', size: 5, labels: ['CATEGORY_SOCIAL', 'UNREAD'] }),
    msg({ id: '5', domain: 'b.example.test', size: 30, labels: [] }),
  ]
  const recommend = (m: GmailMsg) => (m.size >= 50 ? 'Review' : 'Keep')
  const total = sample.reduce((s, m) => s + m.size, 0)

  const sumWhere = (links: Array<{ source: string; target: string; value: number }>, pred: (l: (typeof links)[number]) => boolean) =>
    links.filter(pred).reduce((s, l) => s + l.value, 0)

  it('conserves total bytes at every column', () => {
    const { links } = sankeyData(sample, recommend)
    const byPrefix = (p: string, end: 'source' | 'target') => (l: (typeof links)[number]) => l[end].startsWith(p)
    expect(sumWhere(links, (l) => l.source.startsWith('d:'))).toBe(total)
    expect(sumWhere(links, (l) => l.source.startsWith('c:'))).toBe(total)
    expect(sumWhere(links, (l) => l.source.startsWith('s:'))).toBe(total)
    expect(sumWhere(links, byPrefix('d:', 'source'))).toBe(total)
    expect(sumWhere(links, byPrefix('c:', 'target'))).toBe(total)
    expect(sumWhere(links, byPrefix('s:', 'target'))).toBe(total)
    expect(sumWhere(links, byPrefix('r:', 'target'))).toBe(total)
  })

  it('keeps node ids unique and prefixed per column', () => {
    const { nodes, links } = sankeyData(sample, recommend)
    const ids = nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => /^[dcsr]:/.test(id))).toBe(true)
    const known = new Set(ids)
    expect(links.every((l) => known.has(l.source) && known.has(l.target))).toBe(true)
  })

  it('labels categories, read state and recommendations', () => {
    const { nodes } = sankeyData(sample, recommend)
    const label = (id: string) => nodes.find((n) => n.id === id)?.label
    expect(label('c:PROMOTIONS')).toBe('Promotions')
    expect(label('c:Other')).toBe('Other')
    expect(label('s:unread')).toBe('Unread')
    expect(label('s:read')).toBe('Read')
    expect(label('r:Review')).toBe('Review')
    expect(label('r:Keep')).toBe('Keep')
  })

  it('folds domains beyond topDomains into one node', () => {
    const { nodes, links } = sankeyData(sample, recommend, 1)
    // a.example.test (140) is largest; b (100) and c (5) fold together
    expect(nodes.some((n) => n.id === 'd:a.example.test')).toBe(true)
    expect(nodes.some((n) => n.id === 'd:b.example.test')).toBe(false)
    const other = nodes.find((n) => n.label === 'Other domains')
    expect(other).toBeDefined()
    expect(sumWhere(links, (l) => l.source === other!.id)).toBe(105)
    expect(sumWhere(links, (l) => l.source.startsWith('d:'))).toBe(total)
  })
})
