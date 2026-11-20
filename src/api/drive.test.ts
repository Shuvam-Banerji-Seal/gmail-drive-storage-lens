// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import { DriveApi } from './drive'
import { ApiError, GoogleHttp } from './http'
import type { ScanProgress } from '../types'

const BASE = 'https://www.googleapis.com/drive/v3'

interface Call {
  url: string
  method: string
  body: unknown
}
type Handler = (url: URL, call: Call) => Response | Promise<Response>

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function fake(handler: Handler) {
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
  })
  return { http, calls, api: new DriveApi(http) }
}

const rawFile = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `file-${id}.bin`,
  mimeType: 'application/octet-stream',
  size: '2048',
  quotaBytesUsed: '4096',
  md5Checksum: 'md5-' + id,
  parents: ['root'],
  ownedByMe: true,
  shared: false,
  trashed: false,
  modifiedTime: '2024-01-02T00:00:00.000Z',
  createdTime: '2023-01-02T00:00:00.000Z',
  owners: [{ emailAddress: 'Me@Example.com' }],
  permissions: [{ type: 'user', role: 'owner', emailAddress: 'me@example.com' }],
  ...extra,
})

describe('DriveApi.about', () => {
  it('maps quota strings to numbers and reads the user email', async () => {
    const { api, calls } = fake(() =>
      json(200, {
        storageQuota: { limit: '15000000000', usage: '1234', usageInDrive: '1000', usageInDriveTrash: '200' },
        user: { emailAddress: 'me@example.com' },
      }),
    )
    expect(await api.about()).toEqual({
      limit: 15000000000,
      usage: 1234,
      usageInDrive: 1000,
      usageInTrash: 200,
      email: 'me@example.com',
    })
    const u = new URL(calls[0]!.url)
    expect(u.origin + u.pathname).toBe(`${BASE}/about`)
    expect(u.searchParams.get('fields')).toBe('storageQuota,user(emailAddress)')
  })

  it('leaves limit undefined when the account is unlimited', async () => {
    const { api } = fake(() => json(200, { storageQuota: { usage: '5', usageInDrive: '5', usageInDriveTrash: '0' } }))
    const q = await api.about()
    expect(q.limit).toBeUndefined()
    expect(q.usage).toBe(5)
    expect(q.usageInTrash).toBe(0)
  })
})

describe('DriveApi.listFiles', () => {
  it('follows pages with the documented params, includes trashed files and maps them', async () => {
    const pages: Record<string, unknown> = {
      '': { files: [rawFile('f1'), rawFile('f2', { trashed: true, ownedByMe: false })], nextPageToken: 'n2' },
      n2: { files: [rawFile('f3', { permissions: [{ type: 'anyone', role: 'reader' }] })] },
    }
    const { api, calls } = fake((url) => json(200, pages[url.searchParams.get('pageToken') ?? '']))
    const progress: ScanProgress[] = []
    const files = await api.listFiles({ onProgress: (p) => progress.push(p) })

    expect(files.map((f) => f.id)).toEqual(['f1', 'f2', 'f3'])
    expect(files[0]).toMatchObject({
      id: 'f1',
      size: 2048,
      quota: 4096,
      md5: 'md5-f1',
      owned: true,
      trashed: false,
      ownerEmails: ['me@example.com'],
      publicLink: false,
      isFolder: false,
    })
    expect(files[1]).toMatchObject({ trashed: true, owned: false })
    expect(files[2]!.publicLink).toBe(true)

    const u0 = new URL(calls[0]!.url)
    expect(u0.origin + u0.pathname).toBe(`${BASE}/files`)
    expect(u0.searchParams.get('pageSize')).toBe('1000')
    expect(u0.searchParams.get('corpora')).toBe('user')
    expect(u0.searchParams.get('spaces')).toBe('drive')
    expect(u0.searchParams.has('q')).toBe(false)
    expect(u0.searchParams.has('pageToken')).toBe(false)
    const fields = u0.searchParams.get('fields') ?? ''
    expect(fields.startsWith('nextPageToken,files(')).toBe(true)
    for (const f of [
      'id',
      'name',
      'mimeType',
      'size',
      'quotaBytesUsed',
      'md5Checksum',
      'sha256Checksum',
      'parents',
      'ownedByMe',
      'shared',
      'trashed',
      'viewedByMeTime',
      'modifiedTime',
      'createdTime',
      'owners(emailAddress)',
      'permissions(type,role,emailAddress)',
    ]) {
      expect(fields).toContain(f)
    }
    expect(new URL(calls[1]!.url).searchParams.get('pageToken')).toBe('n2')
    expect(progress.at(-1)).toEqual({ phase: 'done', done: 3, total: 3, bytesSeen: 6144 })
  })
})

describe('DriveApi.revisions and deleteRevision', () => {
  it('maps revisions and follows pages', async () => {
    const pages: Record<string, unknown> = {
      '': {
        revisions: [{ id: 'r1', size: '100', keepForever: true, modifiedTime: '2024-01-01T00:00:00.000Z' }],
        nextPageToken: 'x',
      },
      x: { revisions: [{ id: 'r2', modifiedTime: 'not a date' }] },
    }
    const { api, calls } = fake((url) => json(200, pages[url.searchParams.get('pageToken') ?? '']))
    expect(await api.revisions('file/1')).toEqual([
      { id: 'r1', size: 100, keepForever: true, modifiedTime: Date.parse('2024-01-01T00:00:00.000Z') },
      { id: 'r2', size: 0, keepForever: false, modifiedTime: 0 },
    ])
    const u = new URL(calls[0]!.url)
    expect(u.pathname).toBe('/drive/v3/files/file%2F1/revisions')
    expect(u.searchParams.get('fields')).toBe('nextPageToken,revisions(id,size,keepForever,modifiedTime)')
  })

  it('deleteRevision issues DELETE on the revision path', async () => {
    const { api, calls } = fake(() => new Response(null, { status: 204 }))
    await api.deleteRevision('f1', 'r9')
    expect(calls).toEqual([{ url: `${BASE}/files/f1/revisions/r9`, method: 'DELETE', body: undefined }])
  })
})

describe('DriveApi writes', () => {
  const ok = () => json(200, {})

  it('trash and untrash PATCH each file with the trashed flag', async () => {
    const { api, calls } = fake(ok)
    await api.trash(['a', 'b'])
    await api.untrash(['a'])
    expect(calls).toHaveLength(3)
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { trashed: true } })
    expect(calls[0]!.url).toBe(`${BASE}/files/a?fields=id`)
    expect(calls[1]!.url).toBe(`${BASE}/files/b?fields=id`)
    expect(calls[2]).toMatchObject({ method: 'PATCH', body: { trashed: false } })
  })

  it('deletePermanently refuses a wrong confirmation before any request', async () => {
    const { api, calls } = fake(ok)
    await expect(api.deletePermanently(['a', 'b'], 'DELETE 1')).rejects.toThrow()
    await expect(api.deletePermanently([], 'DELETE 0')).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('deletePermanently with the right confirmation DELETEs each file', async () => {
    const { api, calls } = fake(() => new Response(null, { status: 204 }))
    await api.deletePermanently(['a', 'b'], 'DELETE 2')
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['DELETE', `${BASE}/files/a`],
      ['DELETE', `${BASE}/files/b`],
    ])
  })

  it('emptyTrash requires the exact phrase before any request', async () => {
    const { api, calls } = fake(() => new Response(null, { status: 204 }))
    await expect(api.emptyTrash('empty trash')).rejects.toThrow()
    await expect(api.emptyTrash('DELETE 0')).rejects.toThrow()
    expect(calls).toHaveLength(0)
    await api.emptyTrash('EMPTY TRASH')
    expect(calls).toEqual([{ url: `${BASE}/files/trash`, method: 'DELETE', body: undefined }])
  })

  it('surfaces API errors as ApiError', async () => {
    const { api } = fake(() => json(403, { error: { message: 'nope', errors: [{ reason: 'insufficientPermissions' }] } }))
    await expect(api.trash(['a'])).rejects.toBeInstanceOf(ApiError)
  })
})
