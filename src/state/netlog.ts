// SPDX-License-Identifier: AGPL-3.0-or-later
// Records every network request the app makes, so users can see that they all go to Google.

export interface NetEntry {
  at: number
  method: string
  host: string
  path: string
  status: number
  ms: number
}

/** Replace long opaque ids in a path so the log is readable and not identifying. */
export function redactPath(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => (seg.length >= 12 && /^[A-Za-z0-9_-]+$/.test(seg) && /\d/.test(seg) ? ':id' : seg))
    .join('/')
}

export function loggingFetch(onEntry: (e: NetEntry) => void, base: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return async (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const u = new URL(raw, typeof location !== 'undefined' ? location.href : 'http://localhost/')
    const t0 = performance.now()
    const entry = (status: number): NetEntry => ({
      at: Date.now(),
      method: (init?.method ?? 'GET').toUpperCase(),
      host: u.host,
      path: redactPath(u.pathname),
      status,
      ms: Math.round(performance.now() - t0),
    })
    try {
      const res = await base(input, init)
      onEntry(entry(res.status))
      return res
    } catch (e) {
      onEntry(entry(0))
      throw e
    }
  }
}
