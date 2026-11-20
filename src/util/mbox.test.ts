// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { base64UrlToBytes, escapeFromLines, toMbox } from './mbox'

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('mbox', () => {
  it('decodes base64url without padding', () => {
    expect(new TextDecoder().decode(base64UrlToBytes(b64url('hello?>')))).toBe('hello?>')
  })
  it('escapes From lines (mboxrd)', () => {
    expect(escapeFromLines('a\nFrom me\n>From x')).toBe('a\n>From me\n>>From x')
  })
  it('builds separated messages with From_ lines', () => {
    const out = toMbox([
      { raw: b64url('Subject: one\r\n\r\nFrom here\r\n'), date: Date.UTC(2024, 0, 2, 3, 4, 5) },
      { raw: b64url('Subject: two\r\n\r\nbody') },
    ])
    expect(out.match(/^From storage-lens@localhost /gm)).toHaveLength(2)
    expect(out).toContain('\n>From here\n')
    expect(out).toContain('Subject: two\n\nbody\n\n')
    expect(out).not.toContain('\r')
  })
})
