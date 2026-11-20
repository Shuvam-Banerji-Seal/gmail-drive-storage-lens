// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import { GmailApi } from './gmail'
import { ApiError, GoogleHttp } from './http'
import type { Scheduler } from './http'
import type { ScanProgress } from '../types'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

interface Call {
  url: string
  method: string
  body: unknown
}
type Handler = (url: URL, call: Call) => Response | Promise<Response>

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** GoogleHttp wired to a fake fetch that records every call. */
function fake(handler: Handler, scheduler?: Scheduler) {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    return handler(new URL(call.url), call)
  })
  const http = new GoogleHttp({
    getToken: () => 'fake-token',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => {},
    scheduler,
  })
  return { http, calls, api: new GmailApi(http) }
}

const rawMsg = (id: string) => ({
  id,
  threadId: `t-${id}`,
  labelIds: ['INBOX'],
  sizeEstimate: 1000,
  internalDate: '1700000000000',
  payload: {
    headers: [
      { name: 'From', value: 'Ann Example <ann@example.com>' },
      { name: 'Subject', value: `Subject ${id}` },
    ],
  },
})

const noFullBodies = (calls: Call[]) => {
  for (const c of calls) {
    expect(c.url).not.toMatch(/format=full/)
    expect(c.url).not.toMatch(/format=raw/)
  }
}

describe('GmailApi reads', () => {
  it('profile maps the response fields', async () => {
    const { api, calls } = fake(() =>
      json(200, { emailAddress: 'me@example.com', messagesTotal: 42, historyId: '999' }),
    )
    expect(await api.profile()).toEqual({ email: 'me@example.com', messagesTotal: 42, historyId: '999' })
    expect(calls).toEqual([{ url: `${BASE}/profile`, method: 'GET', body: undefined }])
  })

  it('labelCounts requests one label per id with the field mask', async () => {
    const { api, calls } = fake((url) =>
      json(200, { id: url.pathname.split('/').pop(), name: 'Work', messagesTotal: 5, messagesUnread: 2 }),
    )
    const out = await api.labelCounts(['Label_1'])
    expect(out).toEqual([{ id: 'Label_1', name: 'Work', messagesTotal: 5, messagesUnread: 2 }])
    const u = new URL(calls[0]!.url)
    expect(u.pathname).toBe('/gmail/v1/users/me/labels/Label_1')
    expect(u.searchParams.get('fields')).toBe('id,name,messagesTotal,messagesUnread')
  })

  it('getMeta asks for metadata only and maps headers via toGmailMsg', async () => {
    const { api, calls } = fake(() => json(200, rawMsg('abc')))
    const m = await api.getMeta('abc')
    expect(m).toMatchObject({
      id: 'abc',
      threadId: 't-abc',
      size: 1000,
      fromEmail: 'ann@example.com',
      domain: 'example.com',
      subject: 'Subject abc',
      labels: ['INBOX'],
    })
    const u = new URL(calls[0]!.url)
    expect(u.origin + u.pathname).toBe(`${BASE}/messages/abc`)
    expect(u.searchParams.get('format')).toBe('metadata')
    expect(u.searchParams.getAll('metadataHeaders')).toEqual([
      'From',
      'To',
      'Cc',
      'Subject',
      'List-Id',
      'List-Unsubscribe',
    ])
    expect(u.searchParams.get('fields')).toBe('id,threadId,labelIds,sizeEstimate,internalDate,payload/headers')
    noFullBodies(calls)
  })

  it('listIds encodes q, follows nextPageToken and sends includeSpamTrash', async () => {
    const pages: Record<string, unknown> = {
      '': { messages: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'p2' },
      p2: { messages: [{ id: 'c' }] },
    }
    const { api, calls } = fake((url) => json(200, pages[url.searchParams.get('pageToken') ?? '']))
    const ids = await api.listIds('larger:5M -in:trash', { includeSpamTrash: true })
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(calls).toHaveLength(2)
    expect(calls[0]!.url).toContain('q=larger%3A5M+-in%3Atrash')
    expect(calls[0]!.url).not.toContain('q=larger:')
    expect(new URL(calls[0]!.url).searchParams.get('q')).toBe('larger:5M -in:trash')
    expect(new URL(calls[0]!.url).searchParams.get('maxResults')).toBe('500')
    expect(new URL(calls[0]!.url).searchParams.get('includeSpamTrash')).toBe('true')
    expect(new URL(calls[0]!.url).searchParams.has('pageToken')).toBe(false)
    expect(new URL(calls[1]!.url).searchParams.get('pageToken')).toBe('p2')
  })

  it('listIds stops at max and reports pages', async () => {
    const { api, calls } = fake(() => json(200, { messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], nextPageToken: 'p2' }))
    const seen: number[] = []
    const ids = await api.listIds('x', { max: 2, onPage: (n) => seen.push(n) })
    expect(ids).toEqual(['a', 'b'])
    expect(calls).toHaveLength(1)
    expect(seen).toEqual([3])
  })

  it('history follows pages, collects added and deleted ids and returns the latest historyId', async () => {
    const pages = [
      {
        history: [
          { messagesAdded: [{ message: { id: 'm1' } }] },
          { messagesDeleted: [{ message: { id: 'm2' } }] },
        ],
        nextPageToken: 'h2',
        historyId: '200',
      },
      {
        history: [{ messagesAdded: [{ message: { id: 'm1' } }, { message: { id: 'm3' } }] }],
        historyId: '205',
      },
    ]
    let i = 0
    const { api, calls } = fake(() => json(200, pages[i++]))
    const out = await api.history('100')
    expect(out).toEqual({ added: ['m1', 'm3'], deleted: ['m2'], historyId: '205' })
    const u0 = new URL(calls[0]!.url)
    expect(u0.pathname).toBe('/gmail/v1/users/me/history')
    expect(u0.searchParams.get('startHistoryId')).toBe('100')
    expect(u0.searchParams.getAll('historyTypes')).toEqual(['messageAdded', 'messageDeleted'])
    expect(new URL(calls[1]!.url).searchParams.get('pageToken')).toBe('h2')
  })

  it('history rethrows an ApiError the caller can detect when the history id expired', async () => {
    const { api } = fake(() => json(404, { error: { message: 'Requested entity was not found.' } }))
    await expect(api.history('1')).rejects.toBeInstanceOf(ApiError)
    await expect(api.history('1')).rejects.toMatchObject({ status: 404, reason: 'historyExpired' })
  })
})

describe('GmailApi scan', () => {
  const listPages: Record<string, unknown> = {
    'larger:5M|': { messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], nextPageToken: 'p2' },
    'larger:5M|p2': { messages: [{ id: 'd' }] },
    'older_than:1y|': { messages: [{ id: 'c' }, { id: 'e' }] },
  }
  const route: Handler = (url) => {
    if (url.pathname === '/gmail/v1/users/me/messages') {
      return json(200, listPages[`${url.searchParams.get('q')}|${url.searchParams.get('pageToken') ?? ''}`])
    }
    return json(200, rawMsg(url.pathname.split('/').pop()!))
  }

  it('lists tiers in order, dedupes, skips known ids and reports progress', async () => {
    const { api, calls } = fake(route)
    const progress: ScanProgress[] = []
    const msgs = await api.scan(['larger:5M', 'older_than:1y'], {
      known: new Set(['b']),
      onProgress: (p) => progress.push(p),
    })
    expect(msgs.map((m) => m.id)).toEqual(['a', 'c', 'd', 'e'])
    const metaCalls = calls.filter((c) => new URL(c.url).pathname.includes('/messages/'))
    expect(metaCalls.map((c) => new URL(c.url).pathname.split('/').pop())).not.toContain('b')
    expect(metaCalls).toHaveLength(4)
    expect(progress[0]!.phase).toBe('listing')
    expect(progress.find((p) => p.phase === 'fetching')).toMatchObject({ phase: 'fetching', total: 4 })
    expect(progress.at(-1)).toEqual({ phase: 'done', done: 4, total: 4, bytesSeen: 4000 })
    noFullBodies(calls)
  })

  it('never requests format=full or format=raw', async () => {
    const { api, calls } = fake(route)
    await api.scan(['larger:5M', 'older_than:1y'], {})
    expect(calls.length).toBeGreaterThan(0)
    noFullBodies(calls)
    for (const c of calls) expect(c.url).not.toMatch(/format=(?!metadata)/)
  })

  it('never has more than `concurrency` metadata requests in flight', async () => {
    let active = 0
    let peak = 0
    const { api } = fake(async (url) => {
      if (url.pathname === '/gmail/v1/users/me/messages') {
        return json(200, { messages: Array.from({ length: 10 }, (_, i) => ({ id: `m${i}` })) })
      }
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return json(200, rawMsg(url.pathname.split('/').pop()!))
    })
    const msgs = await api.scan(['x'], { concurrency: 3 })
    expect(msgs).toHaveLength(10)
    expect(peak).toBe(3)
  })

  it('skips messages that vanished between listing and fetching (404)', async () => {
    const { api } = fake((url) => {
      if (url.pathname === '/gmail/v1/users/me/messages') return json(200, { messages: [{ id: 'a' }, { id: 'b' }] })
      if (url.pathname.endsWith('/b')) return json(404, { error: { message: 'gone' } })
      return json(200, rawMsg('a'))
    })
    const msgs = await api.scan(['x'], {})
    expect(msgs.map((m) => m.id)).toEqual(['a'])
  })

  it('returns partial results without throwing when aborted mid-fetch', async () => {
    const controller = new AbortController()
    const progress: ScanProgress[] = []
    const { api, calls } = fake((url) => {
      if (url.pathname === '/gmail/v1/users/me/messages') return json(200, { messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })
      controller.abort()
      return json(200, rawMsg(url.pathname.split('/').pop()!))
    })
    const msgs = await api.scan(['x'], { concurrency: 1, signal: controller.signal, onProgress: (p) => progress.push(p) })
    expect(msgs.map((m) => m.id)).toEqual(['a'])
    expect(calls.filter((c) => c.url.includes('/messages/'))).toHaveLength(1)
    expect(progress.at(-1)?.phase).toBe('cancelled')
  })

  it('returns an empty result without requests when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const progress: ScanProgress[] = []
    const { api, calls } = fake(route)
    const msgs = await api.scan(['larger:5M'], { signal: controller.signal, onProgress: (p) => progress.push(p) })
    expect(msgs).toEqual([])
    expect(calls).toHaveLength(0)
    expect(progress.at(-1)?.phase).toBe('cancelled')
  })
})

describe('GmailApi writes', () => {
  const ok = () => json(200, {})
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`)

  it('trash chunks batchModify by 1000 (1001 ids -> 2 calls)', async () => {
    const { api, calls } = fake(ok)
    await api.trash(ids(1001))
    expect(calls).toHaveLength(2)
    for (const c of calls) {
      expect(c.method).toBe('POST')
      expect(c.url).toBe(`${BASE}/messages/batchModify`)
    }
    expect((calls[0]!.body as { ids: string[] }).ids).toHaveLength(1000)
    expect((calls[1]!.body as { ids: string[] }).ids).toEqual(['m1000'])
    expect(calls[0]!.body).toMatchObject({ addLabelIds: ['TRASH'] })
  })

  it('untrash removes the TRASH label; addLabel adds the given label', async () => {
    const { api, calls } = fake(ok)
    await api.untrash(['a'])
    await api.addLabel(['a', 'b'], 'Label_9')
    expect(calls[0]!.body).toEqual({ ids: ['a'], removeLabelIds: ['TRASH'] })
    expect(calls[1]!.body).toEqual({ ids: ['a', 'b'], addLabelIds: ['Label_9'] })
  })

  it('trash with no ids makes no request', async () => {
    const { api, calls } = fake(ok)
    await api.trash([])
    expect(calls).toHaveLength(0)
  })

  it('deletePermanently refuses a wrong confirmation before any request', async () => {
    const { api, calls } = fake(ok)
    await expect(api.deletePermanently(['a', 'b'], 'DELETE 3')).rejects.toThrow()
    await expect(api.deletePermanently(['a', 'b'], 'delete 2')).rejects.toThrow()
    await expect(api.deletePermanently([], 'DELETE 0')).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('deletePermanently with a correct confirmation chunks batchDelete by 500', async () => {
    const { api, calls } = fake(ok)
    await api.deletePermanently(ids(501), 'DELETE 501')
    expect(calls).toHaveLength(2)
    expect(calls[0]!.url).toBe(`${BASE}/messages/batchDelete`)
    expect((calls[0]!.body as { ids: string[] }).ids).toHaveLength(500)
    expect((calls[1]!.body as { ids: string[] }).ids).toHaveLength(1)
  })

  it('label and filter endpoints use the documented paths and bodies', async () => {
    const { api, calls } = fake((url, call) => {
      if (call.method === 'DELETE') return new Response(null, { status: 204 })
      if (url.pathname.endsWith('/labels')) return json(200, { id: 'Label_2', name: 'Receipts' })
      if (url.pathname.endsWith('/settings/filters') && call.method === 'GET') return json(200, { filter: [{ id: 'f1' }] })
      return json(200, { id: 'f2' })
    })
    expect(await api.createLabel('Receipts')).toEqual({ id: 'Label_2', name: 'Receipts' })
    expect(await api.listFilters()).toEqual([{ id: 'f1' }])
    expect(await api.createFilter({ criteria: { from: 'x@example.com' } })).toEqual({ id: 'f2' })
    await api.deleteFilter('f2')
    expect(calls.map((c) => [c.method, new URL(c.url).pathname])).toEqual([
      ['POST', '/gmail/v1/users/me/labels'],
      ['GET', '/gmail/v1/users/me/settings/filters'],
      ['POST', '/gmail/v1/users/me/settings/filters'],
      ['DELETE', '/gmail/v1/users/me/settings/filters/f2'],
    ])
    expect(calls[0]!.body).toEqual({ name: 'Receipts' })
  })
})

describe('GmailApi quota units', () => {
  it('charges the documented unit cost per endpoint', async () => {
    const units: number[] = []
    const scheduler = {
      run: async (u: number, fn: () => Promise<unknown>) => {
        units.push(u)
        return fn()
      },
    } as unknown as Scheduler
    const { api } = fake(() => json(200, {}), scheduler)
    await api.getMeta('a')
    await api.trash(['a'])
    await api.labelCounts(['L'])
    await api.history('1')
    await api.profile()
    await api.listIds('q')
    expect(units).toEqual([5, 50, 1, 2, 1, 5])
  })
})
