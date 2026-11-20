// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import { ApiError, AuthExpiredError, GoogleHttp, Scheduler } from './http'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

describe('Scheduler', () => {
  it('spaces requests to respect units per second', async () => {
    let t = 0
    const sleeps: number[] = []
    const s = new Scheduler({
      concurrency: 4,
      unitsPerSecond: 10,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms)
        t += ms
      },
    })
    await Promise.all([1, 2, 3].map(() => s.run(5, async () => 'x')))
    expect(t).toBeGreaterThanOrEqual(1000) // 3 tasks x 5 units at 10/s => last starts at >= 1.0s
  })
  it('never exceeds concurrency', async () => {
    const s = new Scheduler({ concurrency: 2, unitsPerSecond: 1e9, sleep: async () => {} })
    let active = 0
    let peak = 0
    await Promise.all(
      Array.from({ length: 10 }, () =>
        s.run(1, async () => {
          active++
          peak = Math.max(peak, active)
          await new Promise((r) => setTimeout(r, 1))
          active--
        }),
      ),
    )
    expect(peak).toBeLessThanOrEqual(2)
  })
  it('rejects invalid options', () => {
    expect(() => new Scheduler({ concurrency: 0, unitsPerSecond: 1 })).toThrow()
  })
})

describe('GoogleHttp', () => {
  const mk = (responses: Response[]) => {
    const fetchImpl = vi.fn(async () => responses.shift() as Response)
    const sleep = vi.fn(async () => {})
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sleep, spy: fetchImpl, http: undefined as unknown as GoogleHttp }
  }
  it('sends bearer token and parses JSON', async () => {
    const m = mk([json(200, { ok: 1 })])
    const http = new GoogleHttp({ getToken: () => 'tok', fetchImpl: m.fetchImpl, sleep: m.sleep })
    expect(await http.request('https://www.googleapis.com/x')).toEqual({ ok: 1 })
    const init = (m.spy.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })
  it('retries 429 then succeeds', async () => {
    const m = mk([json(429, { error: { message: 'slow' } }), json(200, { ok: 2 })])
    const http = new GoogleHttp({ getToken: () => 't', fetchImpl: m.fetchImpl, sleep: m.sleep })
    expect(await http.request('u')).toEqual({ ok: 2 })
    expect(m.sleep).toHaveBeenCalledTimes(1)
  })
  it('retries 403 rateLimitExceeded', async () => {
    const m = mk([json(403, { error: { message: 'x', errors: [{ reason: 'userRateLimitExceeded' }] } }), json(200, {})])
    const http = new GoogleHttp({ getToken: () => 't', fetchImpl: m.fetchImpl, sleep: m.sleep })
    await http.request('u')
    expect(m.spy).toHaveBeenCalledTimes(2)
  })
  it('does not retry a plain 403', async () => {
    const m = mk([json(403, { error: { message: 'no', errors: [{ reason: 'forbidden' }] } })])
    const http = new GoogleHttp({ getToken: () => 't', fetchImpl: m.fetchImpl, sleep: m.sleep })
    await expect(http.request('u')).rejects.toBeInstanceOf(ApiError)
    expect(m.spy).toHaveBeenCalledTimes(1)
  })
  it('throws AuthExpiredError on 401 and calls callback', async () => {
    const m = mk([json(401, { error: { message: 'expired' } })])
    const cb = vi.fn()
    const http = new GoogleHttp({ getToken: () => 't', fetchImpl: m.fetchImpl, sleep: m.sleep, onAuthExpired: cb })
    await expect(http.request('u')).rejects.toBeInstanceOf(AuthExpiredError)
    expect(cb).toHaveBeenCalled()
  })
  it('gives up after maxAttempts', async () => {
    const m = mk(Array.from({ length: 3 }, () => json(503, { error: { message: 'down' } })))
    const http = new GoogleHttp({ getToken: () => 't', fetchImpl: m.fetchImpl, sleep: m.sleep, maxAttempts: 3 })
    await expect(http.request('u')).rejects.toMatchObject({ status: 503 })
    expect(m.spy).toHaveBeenCalledTimes(3)
  })
  it('handles 204 with no body', async () => {
    const m = mk([new Response(null, { status: 204 })])
    const http = new GoogleHttp({ getToken: () => 't', fetchImpl: m.fetchImpl, sleep: m.sleep })
    expect(await http.request('u', { method: 'DELETE' })).toBeUndefined()
  })
})
