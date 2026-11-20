// SPDX-License-Identifier: AGPL-3.0-or-later
// Google Drive REST client (metadata only; file contents are never downloaded).
import { toDriveFile } from '../analytics/parse'
import type { DriveFile, DriveRawFile, QuotaInfo, ScanProgress } from '../types'
import type { GoogleHttp } from './http'

const BASE = 'https://www.googleapis.com/drive/v3'
const FILE_FIELDS =
  'id,name,mimeType,size,quotaBytesUsed,md5Checksum,sha256Checksum,parents,ownedByMe,shared,trashed,viewedByMeTime,modifiedTime,createdTime,owners(emailAddress),permissions(type,role,emailAddress)'
const REVISION_FIELDS = 'nextPageToken,revisions(id,size,keepForever,modifiedTime)'

type Pairs = Array<[string, string]>
const qs = (pairs: Pairs): string => new URLSearchParams(pairs).toString()
const enc = (s: string): string => encodeURIComponent(s)
const isAbort = (e: unknown): boolean => (e as { name?: string } | null)?.name === 'AbortError'
const ms = (s?: string): number => {
  const n = s ? Date.parse(s) : NaN
  return Number.isFinite(n) ? n : 0
}

function guardDelete(n: number, confirmation: string): void {
  if (n === 0) throw new Error('No file ids given')
  if (confirmation !== `DELETE ${n}`) throw new Error(`Confirmation must be exactly "DELETE ${n}"`)
}

export class DriveApi {
  private readonly http: GoogleHttp

  constructor(http: GoogleHttp) {
    this.http = http
  }

  async about(): Promise<QuotaInfo> {
    const r = await this.http.request<{
      storageQuota?: { limit?: string; usage?: string; usageInDrive?: string; usageInDriveTrash?: string }
      user?: { emailAddress?: string }
    }>(`${BASE}/about?${qs([['fields', 'storageQuota,user(emailAddress)']])}`, { units: 1 })
    const q = r.storageQuota ?? {}
    return {
      limit: q.limit === undefined ? undefined : Number(q.limit),
      usage: Number(q.usage ?? 0),
      usageInDrive: Number(q.usageInDrive ?? 0),
      usageInTrash: Number(q.usageInDriveTrash ?? 0),
      email: r.user?.emailAddress,
    }
  }

  /** All files visible to the user, including trashed ones. Follows pages of 1000. */
  async listFiles(o: { signal?: AbortSignal; onProgress?: (p: ScanProgress) => void } = {}): Promise<DriveFile[]> {
    const files: DriveFile[] = []
    let bytesSeen = 0
    let pageToken: string | undefined
    try {
      for (;;) {
        const params: Pairs = [
          ['pageSize', '1000'],
          ['corpora', 'user'],
          ['spaces', 'drive'],
          ['fields', `nextPageToken,files(${FILE_FIELDS})`],
        ]
        if (pageToken) params.push(['pageToken', pageToken])
        const page = await this.http.request<{ files?: DriveRawFile[]; nextPageToken?: string }>(
          `${BASE}/files?${qs(params)}`,
          { units: 1, signal: o.signal },
        )
        for (const raw of page.files ?? []) {
          const f = toDriveFile(raw)
          files.push(f)
          bytesSeen += f.size
        }
        o.onProgress?.({ phase: 'listing', done: files.length, total: 0, bytesSeen })
        pageToken = page.nextPageToken
        if (!pageToken) break
      }
    } catch (e) {
      if (isAbort(e) || o.signal?.aborted) o.onProgress?.({ phase: 'cancelled', done: files.length, total: 0, bytesSeen })
      throw e
    }
    o.onProgress?.({ phase: 'done', done: files.length, total: files.length, bytesSeen })
    return files
  }

  /** Token marking "now" for incremental sync with changes(). */
  async startPageToken(): Promise<string> {
    const r = await this.http.request<{ startPageToken?: string }>(`${BASE}/changes/startPageToken?fields=startPageToken`, { units: 1 })
    return r.startPageToken ?? ''
  }

  /** Everything that changed since `pageToken` (incremental sync). */
  async changes(pageToken: string): Promise<{ changed: DriveFile[]; removed: string[]; newStartPageToken: string }> {
    const changed: DriveFile[] = []
    const removed: string[] = []
    let token: string | undefined = pageToken
    let next = pageToken
    while (token) {
      const params: Pairs = [
        ['pageToken', token],
        ['pageSize', '1000'],
        ['spaces', 'drive'],
        ['includeRemoved', 'true'],
        ['fields', `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`],
      ]
      const page = await this.http.request<{
        nextPageToken?: string
        newStartPageToken?: string
        changes?: Array<{ fileId?: string; removed?: boolean; file?: DriveRawFile }>
      }>(`${BASE}/changes?${qs(params)}`, { units: 1 })
      for (const c of page.changes ?? []) {
        if (c.removed || !c.file) {
          if (c.fileId) removed.push(c.fileId)
        } else changed.push(toDriveFile(c.file))
      }
      token = page.nextPageToken
      if (page.newStartPageToken) next = page.newStartPageToken
    }
    return { changed, removed, newStartPageToken: next }
  }

  async revisions(fileId: string): Promise<Array<{ id: string; size: number; keepForever: boolean; modifiedTime: number }>> {
    const out: Array<{ id: string; size: number; keepForever: boolean; modifiedTime: number }> = []
    let pageToken: string | undefined
    for (;;) {
      const params: Pairs = [
        ['pageSize', '1000'],
        ['fields', REVISION_FIELDS],
      ]
      if (pageToken) params.push(['pageToken', pageToken])
      const page = await this.http.request<{
        revisions?: Array<{ id: string; size?: string; keepForever?: boolean; modifiedTime?: string }>
        nextPageToken?: string
      }>(`${BASE}/files/${enc(fileId)}/revisions?${qs(params)}`, { units: 1 })
      for (const r of page.revisions ?? []) {
        out.push({
          id: r.id,
          size: Number(r.size ?? 0) || 0,
          keepForever: r.keepForever === true,
          modifiedTime: ms(r.modifiedTime),
        })
      }
      pageToken = page.nextPageToken
      if (!pageToken) return out
    }
  }

  async deleteRevision(fileId: string, revisionId: string): Promise<void> {
    await this.http.request<void>(`${BASE}/files/${enc(fileId)}/revisions/${enc(revisionId)}`, {
      method: 'DELETE',
      units: 1,
    })
  }

  private async setTrashed(ids: string[], trashed: boolean): Promise<void> {
    // Drive v3 has no batch modify for files, so requests go one at a time.
    for (const id of ids) {
      await this.http.request<void>(`${BASE}/files/${enc(id)}?${qs([['fields', 'id']])}`, {
        method: 'PATCH',
        body: { trashed },
        units: 1,
      })
    }
  }

  async trash(ids: string[]): Promise<void> {
    await this.setTrashed(ids, true)
  }

  async untrash(ids: string[]): Promise<void> {
    await this.setTrashed(ids, false)
  }

  async deletePermanently(ids: string[], confirmation: string): Promise<void> {
    guardDelete(ids.length, confirmation)
    for (const id of ids) {
      await this.http.request<void>(`${BASE}/files/${enc(id)}`, { method: 'DELETE', units: 1 })
    }
  }

  async emptyTrash(confirmation: string): Promise<void> {
    if (confirmation !== 'EMPTY TRASH') throw new Error('Confirmation must be exactly "EMPTY TRASH"')
    await this.http.request<void>(`${BASE}/files/trash`, { method: 'DELETE', units: 1 })
  }
}
