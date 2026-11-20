// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import type { GmailMsg } from '../types'
import { unsubscribeRadar } from './unsub'

const msg = (over: Partial<GmailMsg> & { id: string }): GmailMsg => ({
  threadId: `t-${over.id}`,
  size: 1000,
  from: 'News <news@example.com>',
  fromName: 'News',
  fromEmail: 'news@example.com',
  domain: 'example.com',
  recipients: ['me@example.org'],
  subject: 'Weekly',
  ts: 0,
  labels: [],
  ...over,
})

describe('unsubscribeRadar', () => {
  it('surfaces only http(s) and mailto links', () => {
    const rows = unsubscribeRadar([
      msg({
        id: 'a',
        listUnsub: '<https://example.com/u?id=1>, <mailto:unsub@example.com>, <javascript:alert(1)>, <ftp://example.com/x>',
      }),
    ])
    expect(rows).toEqual([
      {
        key: 'news@example.com',
        label: 'News',
        http: ['https://example.com/u?id=1'],
        mailto: ['mailto:unsub@example.com'],
        bytes: 1000,
        count: 1,
        readRate: 1,
      },
    ])
  })
  it('drops senders whose header has no usable link', () => {
    expect(unsubscribeRadar([msg({ id: 'a', listUnsub: '<javascript:void(0)>' }), msg({ id: 'b' })])).toEqual([])
  })
  it('aggregates by list id, computes read rate and sorts by bytes desc', () => {
    const rows = unsubscribeRadar([
      msg({ id: 'a', size: 100, listId: 'big.example.com', listUnsub: '<https://example.com/a>', labels: ['UNREAD'] }),
      msg({ id: 'b', size: 300, listId: 'big.example.com', listUnsub: '<https://example.com/a>' }),
      msg({ id: 'c', size: 500, fromEmail: 'shop@example.net', fromName: 'Shop', listUnsub: '<mailto:x@example.net>' }),
    ])
    expect(rows.map((r) => r.key)).toEqual(['shop@example.net', 'big.example.com'])
    expect(rows[1]).toMatchObject({ bytes: 400, count: 2, readRate: 0.5, http: ['https://example.com/a'] })
  })
})
