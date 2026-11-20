// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { loggingFetch, redactPath, type NetEntry } from './netlog'

describe('netlog', () => {
  it('redacts ids but keeps API words', () => {
    expect(redactPath('/gmail/v1/users/me/messages/18c2f0a9b7d1e3f4')).toBe('/gmail/v1/users/me/messages/:id')
    expect(redactPath('/drive/v3/files')).toBe('/drive/v3/files')
  })
  it('logs status and host', async () => {
    const log: NetEntry[] = []
    const f = loggingFetch((e) => log.push(e), async () => new Response('{}', { status: 200 }))
    await f('https://gmail.googleapis.com/gmail/v1/users/me/profile', { method: 'GET' })
    expect(log[0]).toMatchObject({ host: 'gmail.googleapis.com', status: 200, method: 'GET' })
  })
  it('logs failures as status 0', async () => {
    const log: NetEntry[] = []
    const f = loggingFetch((e) => log.push(e), async () => {
      throw new TypeError('offline')
    })
    await expect(f('https://www.googleapis.com/x')).rejects.toThrow('offline')
    expect(log[0]!.status).toBe(0)
  })
})
