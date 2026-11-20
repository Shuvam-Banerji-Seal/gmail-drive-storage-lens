// SPDX-License-Identifier: AGPL-3.0-or-later
// Gmail REST client. Only metadata is requested (format=metadata); message bodies are never fetched.
import { toGmailMsg } from '../analytics/parse'
import type { GmailMsg, GmailRawMessage, ScanProgress } from '../types'
import { ApiError } from './http'
import type { GoogleHttp } from './http'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const META_HEADERS = ['From', 'To', 'Cc', 'Subject', 'List-Id', 'List-Unsubscribe']
const META_FIELDS = 'id,threadId,labelIds,sizeEstimate,internalDate,payload/headers'
/** Quota units per call, see docs/MODULES.md. */
const COST = { get: 5, list: 5, batchModify: 50, batchDelete: 50, label: 1, history: 2, profile: 1 }

type Pairs = Array<[string, string]>
interface RawPart {
  mimeType?: string
  filename?: string
  body?: { size?: number }
  parts?: RawPart[]
}
export interface MimePart {
  filename: string
  mimeType: string
  size: number
}
const qs = (pairs: Pairs): string => new URLSearchParams(pairs).toString()
const enc = (s: string): string => encodeURIComponent(s)
const isAbort = (e: unknown): boolean => (e as { name?: string } | null)?.name === 'AbortError'

function chunks<T>(xs: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

function guardDelete(n: number, confirmation: string): void {
  if (n === 0) throw new Error('No message ids given')
  if (confirmation !== `DELETE ${n}`) throw new Error(`Confirmation must be exactly "DELETE ${n}"`)
}

export class GmailApi {
  private readonly http: GoogleHttp

  constructor(http: GoogleHttp) {
    this.http = http
  }

  async profile(): Promise<{ email: string; messagesTotal: number; historyId: string }> {
    const r = await this.http.request<{ emailAddress: string; messagesTotal: number; historyId: string | number }>(
      `${BASE}/profile`,
      { units: COST.profile },
    )
    return { email: r.emailAddress, messagesTotal: r.messagesTotal, historyId: String(r.historyId) }
  }

  async labelCounts(ids: string[]): Promise<Array<{ id: string; name: string; messagesTotal: number; messagesUnread: number }>> {
    const out: Array<{ id: string; name: string; messagesTotal: number; messagesUnread: number }> = []
    for (const id of ids) {
      const url = `${BASE}/labels/${enc(id)}?${qs([['fields', 'id,name,messagesTotal,messagesUnread']])}`
      const r = await this.http.request<{ id: string; name: string; messagesTotal?: number; messagesUnread?: number }>(url, {
        units: COST.label,
      })
      out.push({ id: r.id, name: r.name, messagesTotal: r.messagesTotal ?? 0, messagesUnread: r.messagesUnread ?? 0 })
    }
    return out
  }

  async listIds(
    q: string,
    o: { includeSpamTrash?: boolean; signal?: AbortSignal; onPage?: (n: number) => void; max?: number } = {},
  ): Promise<string[]> {
    const ids: string[] = []
    let pageToken: string | undefined
    for (;;) {
      const params: Pairs = [
        ['q', q],
        ['maxResults', '500'],
        ['fields', 'messages/id,nextPageToken'],
      ]
      if (o.includeSpamTrash) params.push(['includeSpamTrash', 'true'])
      if (pageToken) params.push(['pageToken', pageToken])
      const page = await this.http.request<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(
        `${BASE}/messages?${qs(params)}`,
        { units: COST.list, signal: o.signal },
      )
      for (const m of page.messages ?? []) ids.push(m.id)
      o.onPage?.(ids.length)
      if (o.max !== undefined && ids.length >= o.max) return ids.slice(0, o.max)
      pageToken = page.nextPageToken
      if (!pageToken) return ids
    }
  }

  async getMeta(id: string, signal?: AbortSignal): Promise<GmailMsg> {
    const params: Pairs = [
      ['format', 'metadata'],
      ...META_HEADERS.map((h): [string, string] => ['metadataHeaders', h]),
      ['fields', META_FIELDS],
    ]
    const raw = await this.http.request<GmailRawMessage>(`${BASE}/messages/${enc(id)}?${qs(params)}`, {
      units: COST.get,
      signal,
    })
    return toGmailMsg(raw)
  }

  /**
   * Opt-in deep scan: MIME structure only (file names, types, sizes). The fields mask returns
   * `body/size` but never `body/data`, so no message content is transferred.
   */
  async getParts(id: string, signal?: AbortSignal): Promise<MimePart[]> {
    const params: Pairs = [
      ['format', 'full'], // structure-only: the fields mask on the next line excludes body data
      ['fields', 'id,payload(mimeType,filename,body/size,parts(mimeType,filename,body/size,parts(mimeType,filename,body/size,parts(mimeType,filename,body/size))))'],
    ]
    const raw = await this.http.request<{ payload?: RawPart }>(`${BASE}/messages/${enc(id)}?${qs(params)}`, { units: COST.get, signal })
    const out: MimePart[] = []
    const walk = (p?: RawPart) => {
      if (!p) return
      if (p.filename) out.push({ filename: p.filename, mimeType: p.mimeType ?? 'application/octet-stream', size: p.body?.size ?? 0 })
      for (const c of p.parts ?? []) walk(c)
    }
    walk(raw.payload)
    return out
  }

  /**
   * Archive-before-delete only: downloads the full RFC 822 message (base64url) so it can be saved to the
   * user's own disk. Called exclusively when the user presses "Download archive" in the Airlock.
   */
  async getRawForArchive(id: string, signal?: AbortSignal): Promise<string> {
    const raw = await this.http.request<{ raw?: string }>(`${BASE}/messages/${enc(id)}?${qs([['format', 'raw'], ['fields', 'raw']])}`, { units: COST.get, signal }) // OPT-IN-ARCHIVE
    return raw.raw ?? ''
  }

  /**
   * Lists every tier query (in order), dedupes ids across tiers, skips `known` ids and fetches metadata
   * with a worker pool. Result order follows first appearance across the tiers. On abort, returns what
   * was collected so far with phase 'cancelled' instead of throwing.
   */
  async scan(
    tiers: string[],
    o: { signal?: AbortSignal; onProgress?: (p: ScanProgress) => void; concurrency?: number; known?: Set<string> },
  ): Promise<GmailMsg[]> {
    const { signal } = o
    const report = (p: ScanProgress): void => o.onProgress?.(p)
    const concurrency = Math.max(1, o.concurrency ?? 8)
    const known = o.known ?? new Set<string>()

    const ordered: string[] = []
    const seen = new Set<string>()
    try {
      report({ phase: 'listing', done: 0, total: 0, bytesSeen: 0 })
      for (const tier of tiers) {
        const ids = await this.listIds(tier, { signal, onPage: (n) => report({ phase: 'listing', done: n, total: 0, bytesSeen: 0 }) })
        for (const id of ids) {
          if (seen.has(id)) continue
          seen.add(id)
          ordered.push(id)
        }
      }
    } catch (e) {
      if (isAbort(e) || signal?.aborted) {
        report({ phase: 'cancelled', done: 0, total: 0, bytesSeen: 0 })
        return []
      }
      report({ phase: 'error', done: 0, total: 0, bytesSeen: 0, message: (e as Error).message })
      throw e
    }

    const todo = ordered.filter((id) => !known.has(id))
    const results: Array<GmailMsg | undefined> = new Array<GmailMsg | undefined>(todo.length)
    let next = 0
    let done = 0
    let bytesSeen = 0
    let cancelled = false
    report({ phase: 'fetching', done: 0, total: todo.length, bytesSeen: 0 })

    const worker = async (): Promise<void> => {
      while (next < todo.length) {
        if (signal?.aborted) {
          cancelled = true
          return
        }
        const i = next++
        try {
          const msg = await this.getMeta(todo[i]!, signal)
          results[i] = msg
          bytesSeen += msg.size
        } catch (e) {
          if (isAbort(e) || signal?.aborted) {
            cancelled = true
            return
          }
          // Message deleted between listing and fetching: skip it.
          if (!(e instanceof ApiError && e.status === 404)) {
            next = todo.length
            throw e
          }
        }
        done++
        report({ phase: 'fetching', done, total: todo.length, bytesSeen })
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, () => worker()))
    } catch (e) {
      report({ phase: 'error', done, total: todo.length, bytesSeen, message: (e as Error).message })
      throw e
    }

    report({ phase: cancelled ? 'cancelled' : 'done', done, total: todo.length, bytesSeen })
    return results.filter((m): m is GmailMsg => m !== undefined)
  }

  async history(startHistoryId: string): Promise<{ added: string[]; deleted: string[]; historyId: string }> {
    const added = new Set<string>()
    const deleted = new Set<string>()
    let historyId = startHistoryId
    let pageToken: string | undefined
    try {
      for (;;) {
        const params: Pairs = [
          ['startHistoryId', startHistoryId],
          ['historyTypes', 'messageAdded'],
          ['historyTypes', 'messageDeleted'],
        ]
        if (pageToken) params.push(['pageToken', pageToken])
        const page = await this.http.request<{
          history?: Array<{
            messagesAdded?: Array<{ message?: { id?: string } }>
            messagesDeleted?: Array<{ message?: { id?: string } }>
          }>
          nextPageToken?: string
          historyId?: string | number
        }>(`${BASE}/history?${qs(params)}`, { units: COST.history })
        for (const h of page.history ?? []) {
          for (const a of h.messagesAdded ?? []) if (a.message?.id) added.add(a.message.id)
          for (const d of h.messagesDeleted ?? []) if (d.message?.id) deleted.add(d.message.id)
        }
        if (page.historyId !== undefined) historyId = String(page.historyId)
        pageToken = page.nextPageToken
        if (!pageToken) break
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        throw new ApiError(404, 'History expired; a full rescan is required', 'historyExpired')
      }
      throw e
    }
    return { added: [...added], deleted: [...deleted], historyId }
  }

  private async modify(ids: string[], body: { addLabelIds?: string[]; removeLabelIds?: string[] }): Promise<void> {
    for (const c of chunks(ids, 1000)) {
      await this.http.request<void>(`${BASE}/messages/batchModify`, {
        method: 'POST',
        body: { ids: c, ...body },
        units: COST.batchModify,
      })
    }
  }

  async trash(ids: string[]): Promise<void> {
    await this.modify(ids, { addLabelIds: ['TRASH'] })
  }

  async untrash(ids: string[]): Promise<void> {
    await this.modify(ids, { removeLabelIds: ['TRASH'] })
  }

  async deletePermanently(ids: string[], confirmation: string): Promise<void> {
    guardDelete(ids.length, confirmation)
    for (const c of chunks(ids, 500)) {
      await this.http.request<void>(`${BASE}/messages/batchDelete`, {
        method: 'POST',
        body: { ids: c },
        units: COST.batchDelete,
      })
    }
  }

  async createLabel(name: string): Promise<{ id: string; name: string }> {
    const r = await this.http.request<{ id: string; name: string }>(`${BASE}/labels`, {
      method: 'POST',
      body: { name },
      units: COST.label,
    })
    return { id: r.id, name: r.name }
  }

  async addLabel(ids: string[], labelId: string): Promise<void> {
    await this.modify(ids, { addLabelIds: [labelId] })
  }

  async listFilters(): Promise<unknown[]> {
    const r = await this.http.request<{ filter?: unknown[] }>(`${BASE}/settings/filters`, { units: COST.label })
    return r.filter ?? []
  }

  async createFilter(body: unknown): Promise<{ id: string }> {
    const r = await this.http.request<{ id: string }>(`${BASE}/settings/filters`, {
      method: 'POST',
      body,
      units: COST.label,
    })
    return { id: r.id }
  }

  async deleteFilter(id: string): Promise<void> {
    await this.http.request<void>(`${BASE}/settings/filters/${enc(id)}`, { method: 'DELETE', units: COST.label })
  }
}
