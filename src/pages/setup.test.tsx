// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { isRegistrableOrigin } from '../auth/gis'

describe('isRegistrableOrigin', () => {
  it('accepts https and localhost', () => {
    expect(isRegistrableOrigin('https://example.github.io')).toBe(true)
    expect(isRegistrableOrigin('http://localhost:5173')).toBe(true)
    expect(isRegistrableOrigin('http://127.0.0.1:8080')).toBe(true)
  })
  it('rejects plain http on network addresses', () => {
    expect(isRegistrableOrigin('http://10.20.82.147:8080')).toBe(false)
    expect(isRegistrableOrigin('http://192.168.1.5')).toBe(false)
  })
})
