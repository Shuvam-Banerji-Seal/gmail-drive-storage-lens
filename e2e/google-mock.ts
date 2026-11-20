// SPDX-License-Identifier: AGPL-3.0-or-later
// Stands in for Google's sign-in library and REST APIs so the full live flow (including deletion)
// can be tested without any real account. Requests are recorded for assertions.
import type { Page, Route } from '@playwright/test'

export const CLIENT_ID = '1234567890-abcdefghijklmnopqrstuv0123456789.apps.googleusercontent.com'
const MiB = 2 ** 20

const FAKE_GIS = `window.google = { accounts: { oauth2: {
  initTokenClient: function (cfg) { return { requestAccessToken: function () {
    setTimeout(function () { cfg.callback({ access_token: 'fake-token', expires_in: 3600, scope: cfg.scope }) }, 20) } } },
  revoke: function (t, done) { done() } } } };`

interface Msg {
  id: string
  from: string
  subject: string
  size: number
  labels: string[]
  listId?: string
}
const MSGS: Msg[] = [
  { id: 'm1', from: 'Stargazers Club <stars@example.edu>', subject: 'Night sky photos', size: 30 * MiB, labels: ['INBOX', 'UNREAD', 'CATEGORY_FORUMS'], listId: '<stars.example.edu>' },
  { id: 'm2', from: 'Stargazers Club <stars@example.edu>', subject: 'Re: Night sky photos', size: 29 * MiB, labels: ['INBOX', 'UNREAD', 'CATEGORY_FORUMS'], listId: '<stars.example.edu>' },
  { id: 'm3', from: 'Movie Night <movies@example.org>', subject: 'Weekend screenings', size: 12 * MiB, labels: ['INBOX', 'UNREAD', 'CATEGORY_FORUMS'], listId: '<movies.example.org>' },
  { id: 'm4', from: 'Best Friend <friend@example.com>', subject: 'Holiday pictures', size: 8 * MiB, labels: ['INBOX', 'STARRED', 'IMPORTANT'] },
]

export interface Recorded {
  method: string
  url: string
  body: unknown
}

export async function mockGoogle(page: Page): Promise<Recorded[]> {
  const calls: Recorded[] = []
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_GIS }))
  await page.route(/https:\/\/(www|gmail)\.googleapis\.com\/.*/, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const body = req.postData() ? JSON.parse(req.postData() as string) : undefined
    calls.push({ method: req.method(), url: req.url(), body })
    const p = url.pathname
    if (p.endsWith('/drive/v3/about'))
      return json(route, { storageQuota: { limit: String(20 * 2 ** 30), usage: String(21 * 2 ** 30), usageInDrive: String(2 * 2 ** 30), usageInDriveTrash: '0' }, user: { emailAddress: 'tester@example.com' } })
    if (p.endsWith('/drive/v3/files'))
      return json(route, {
        files: [
          { id: 'f1', name: 'holiday.mp4', mimeType: 'video/mp4', size: String(500 * MiB), quotaBytesUsed: String(500 * MiB), sha256Checksum: 'aa', md5Checksum: 'a', parents: ['root'], ownedByMe: true, modifiedTime: '2022-01-01T00:00:00Z', createdTime: '2022-01-01T00:00:00Z' },
          { id: 'f2', name: 'holiday copy.mp4', mimeType: 'video/mp4', size: String(500 * MiB), quotaBytesUsed: String(500 * MiB), sha256Checksum: 'aa', md5Checksum: 'a', parents: ['root'], ownedByMe: true, modifiedTime: '2023-01-01T00:00:00Z', createdTime: '2023-01-01T00:00:00Z' },
        ],
      })
    if (p.endsWith('/profile')) return json(route, { emailAddress: 'tester@example.com', messagesTotal: MSGS.length, historyId: '100' })
    if (/\/labels\/[A-Z_]+$/.test(p)) {
      const id = p.split('/').pop()
      return json(route, { id, name: id, messagesTotal: 4, messagesUnread: 3 })
    }
    if (p.endsWith('/messages') && req.method() === 'GET') {
      const q = url.searchParams.get('q') ?? ''
      return json(route, { messages: q.includes('in:sent') ? [] : MSGS.map((m) => ({ id: m.id, threadId: `t-${m.id}` })) })
    }
    if (p.endsWith('/messages/batchModify') || p.endsWith('/messages/batchDelete')) return route.fulfill({ status: 204, body: '' })
    const mm = /\/messages\/(m\d)$/.exec(p)
    if (mm) {
      const m = MSGS.find((x) => x.id === mm[1])!
      const headers = [
        { name: 'From', value: m.from },
        { name: 'To', value: 'tester@example.com' },
        { name: 'Subject', value: m.subject },
        ...(m.listId ? [{ name: 'List-Id', value: m.listId }, { name: 'List-Unsubscribe', value: '<https://example.com/unsub>' }] : []),
      ]
      return json(route, { id: m.id, threadId: `t-${m.id}`, labelIds: m.labels, sizeEstimate: m.size, internalDate: String(Date.UTC(2026, 9, 1)), payload: { headers } })
    }
    return json(route, { error: { code: 404, message: `unmocked ${p}` } }, 404)
  })
  return calls
}
