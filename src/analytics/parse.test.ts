// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { normalizeSubject, parseAddresses, parseFrom, parseListUnsubscribe, toDriveFile, toGmailMsg } from './parse'
import { clamp, formatBytes, monthKey, dayKey } from '../util/format'

describe('parseFrom', () => {
  it('parses quoted names with commas', () => {
    expect(parseFrom('"Identity, Maths Club" <Maths@Uni.Edu>')).toEqual({ name: 'Identity, Maths Club', email: 'maths@uni.edu', domain: 'uni.edu' })
  })
  it('parses bare address', () => {
    expect(parseFrom('a@b.com')).toEqual({ name: 'a@b.com', email: 'a@b.com', domain: 'b.com' })
  })
  it('handles garbage', () => {
    expect(parseFrom('')).toEqual({ name: '', email: '', domain: '' })
  })
})
describe('parseAddresses', () => {
  it('extracts and dedupes', () => {
    expect(parseAddresses('A <a@x.com>, b@y.com, "A" <A@x.com>').sort()).toEqual(['a@x.com'])
    expect(parseAddresses('b@y.com, c@z.org').sort()).toEqual(['b@y.com', 'c@z.org'])
  })
  it('undefined -> []', () => expect(parseAddresses(undefined)).toEqual([]))
})
describe('normalizeSubject', () => {
  it('strips Re/Fwd chains and digits', () => {
    expect(normalizeSubject('Re: RE: Fwd: Weekend Screenings 12!')).toBe('weekend screenings #')
  })
})
describe('parseListUnsubscribe', () => {
  it('keeps only http(s)/mailto', () => {
    expect(parseListUnsubscribe('<javascript:alert(1)>, <https://x.com/u>, <mailto:u@x.com?subject=unsub>')).toEqual({
      http: ['https://x.com/u'],
      mailto: ['mailto:u@x.com?subject=unsub'],
    })
  })
})
describe('toGmailMsg', () => {
  it('maps headers', () => {
    const m = toGmailMsg({
      id: '1', threadId: 't', labelIds: ['INBOX', 'UNREAD'], sizeEstimate: 1000, internalDate: '1700000000000',
      payload: { headers: [{ name: 'From', value: 'Club <c@u.edu>' }, { name: 'To', value: 'me@u.edu' }, { name: 'Subject', value: 'Hi' }, { name: 'List-Id', value: '<l.u.edu>' }] },
    })
    expect(m).toMatchObject({ id: '1', size: 1000, fromEmail: 'c@u.edu', domain: 'u.edu', recipients: ['me@u.edu'], ts: 1700000000000, listId: '<l.u.edu>' })
  })
  it('tolerates missing fields', () => {
    expect(toGmailMsg({ id: 'x', threadId: 'y' })).toMatchObject({ size: 0, ts: 0, labels: [], subject: '' })
  })
})
describe('toDriveFile', () => {
  it('maps strings to numbers and flags', () => {
    const f = toDriveFile({ id: 'f', name: 'a.mp4', mimeType: 'video/mp4', size: '100', quotaBytesUsed: '250', ownedByMe: true, permissions: [{ type: 'anyone' }], modifiedTime: '2024-01-01T00:00:00Z' })
    expect(f).toMatchObject({ size: 100, quota: 250, owned: true, publicLink: true, isFolder: false })
    expect(f.modified).toBe(Date.parse('2024-01-01T00:00:00Z'))
  })
})
describe('format', () => {
  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KiB')
    expect(formatBytes(3.5 * 2 ** 30)).toBe('3.5 GiB')
    expect(formatBytes(-1)).toBe('—')
  })
  it('keys', () => {
    expect(monthKey(Date.UTC(2024, 2, 5))).toBe('2024-03')
    expect(dayKey(Date.UTC(2024, 2, 5))).toBe('2024-03-05')
    expect(clamp(5, 0, 3)).toBe(3)
  })
})
