// SPDX-License-Identifier: AGPL-3.0-or-later
// Rate-limited, retrying HTTP client for Google REST APIs. Only talks to hosts in the CSP allowlist.

export class AuthExpiredError extends Error {
  constructor() {
    super('Access token expired or revoked')
    this.name = 'AuthExpiredError'
  }
}
export class ApiError extends Error {
  status: number
  reason?: string
  constructor(status: number, message: string, reason?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.reason = reason
  }
}

export interface SchedulerOptions {
  /** Max requests in flight. */
  concurrency: number
  /** Quota units per second (Gmail allows 250 per user). */
  unitsPerSecond: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/** Spaces requests so that sustained usage never exceeds unitsPerSecond, with bounded concurrency. */
export class Scheduler {
  private readonly concurrency: number
  private readonly unitsPerSecond: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private cursor = 0
  private active = 0
  private waiters: Array<() => void> = []

  constructor(opts: SchedulerOptions) {
    if (opts.concurrency < 1 || opts.unitsPerSecond <= 0) throw new RangeError('invalid scheduler options')
    this.concurrency = opts.concurrency
    this.unitsPerSecond = opts.unitsPerSecond
    this.now = opts.now ?? (() => Date.now())
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  private async acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++
      return
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
  }
  private release(): void {
    const next = this.waiters.shift()
    if (next) next()
    else this.active--
  }

  async run<T>(units: number, fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      const slot = Math.max(this.now(), this.cursor)
      this.cursor = slot + (units / this.unitsPerSecond) * 1000
      const wait = slot - this.now()
      if (wait > 0) await this.sleep(wait)
      return await fn()
    } finally {
      this.release()
    }
  }
}

export interface HttpOptions {
  getToken: () => string
  scheduler?: Scheduler
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  maxAttempts?: number
  onAuthExpired?: () => void
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504])
const RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'backendError'])

export interface RequestInitLite {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  units?: number
  signal?: AbortSignal
}

export class GoogleHttp {
  private readonly opts: Required<Omit<HttpOptions, 'scheduler' | 'onAuthExpired'>> &
    Pick<HttpOptions, 'scheduler' | 'onAuthExpired'>

  constructor(opts: HttpOptions) {
    this.opts = {
      fetchImpl: (...a) => fetch(...a),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      maxAttempts: 6,
      ...opts,
    }
  }

  async request<T>(url: string, init: RequestInitLite = {}): Promise<T> {
    const units = init.units ?? 1
    const run = () => this.attempt<T>(url, init)
    return this.opts.scheduler ? this.opts.scheduler.run(units, run) : run()
  }

  private async attempt<T>(url: string, init: RequestInitLite): Promise<T> {
    let lastErr: unknown
    for (let n = 0; n < this.opts.maxAttempts; n++) {
      if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      let res: Response
      try {
        res = await this.opts.fetchImpl(url, {
          method: init.method ?? 'GET',
          headers: {
            Authorization: `Bearer ${this.opts.getToken()}`,
            ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
          signal: init.signal,
        })
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e
        lastErr = e
        await this.opts.sleep(backoff(n))
        continue
      }
      if (res.ok) {
        if (res.status === 204) return undefined as T
        const text = await res.text()
        return (text ? JSON.parse(text) : undefined) as T
      }
      if (res.status === 401) {
        this.opts.onAuthExpired?.()
        throw new AuthExpiredError()
      }
      const info = await readError(res)
      const retryable = RETRY_STATUS.has(res.status) || (res.status === 403 && RATE_REASONS.has(info.reason ?? ''))
      lastErr = new ApiError(res.status, info.message, info.reason)
      if (!retryable) throw lastErr
      const ra = Number(res.headers.get('Retry-After'))
      await this.opts.sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60_000) : backoff(n))
    }
    throw lastErr instanceof Error ? lastErr : new Error('request failed')
  }
}

export function backoff(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250)
}

async function readError(res: Response): Promise<{ message: string; reason?: string }> {
  try {
    const j = (await res.json()) as { error?: { message?: string; errors?: Array<{ reason?: string }>; status?: string } }
    return { message: j.error?.message ?? res.statusText, reason: j.error?.errors?.[0]?.reason ?? j.error?.status }
  } catch {
    return { message: res.statusText }
  }
}
