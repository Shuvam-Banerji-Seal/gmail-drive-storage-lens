// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthError, GoogleAuth, explainAuthError, extractClientId, isValidClientId } from './gis'

const ID = '1234567890-abcdefghijklmnop0123456789abcdef.apps.googleusercontent.com'

function fakeGoogle(response: Record<string, unknown>) {
  const revoke = vi.fn((_t: string, done: () => void) => done())
  const init = vi.fn((cfg: { callback: (r: unknown) => void; scope: string }) => ({
    requestAccessToken: () => cfg.callback({ ...response, scope: response.scope ?? cfg.scope }),
  }))
  window.google = { accounts: { oauth2: { initTokenClient: init, revoke } as never } }
  return { init, revoke }
}
afterEach(() => {
  delete window.google
})

describe('client id helpers', () => {
  it('validates', () => {
    expect(isValidClientId(ID)).toBe(true)
    expect(isValidClientId('GOCSPX-secret')).toBe(false)
    expect(isValidClientId('abc.apps.googleusercontent.com')).toBe(false)
  })
  it('extracts from pasted JSON', () => {
    expect(extractClientId(`{"web":{"client_id":"${ID}","project_id":"x"}}`)).toBe(ID)
    expect(extractClientId('nothing here')).toBeNull()
  })
  it('rejects bad id in constructor', () => {
    expect(() => new GoogleAuth('nope')).toThrow(AuthError)
  })
})

describe('GoogleAuth', () => {
  it('stores grant in memory and reports scopes', async () => {
    fakeGoogle({ access_token: 'tok', expires_in: 3600 })
    const a = new GoogleAuth(ID, () => 1000)
    const g = await a.request(['s1', 's2'])
    expect(g.token).toBe('tok')
    expect(a.has(['s1'])).toBe(true)
    expect(a.token()).toBe('tok')
  })
  it('merges previously granted scopes into the next request', async () => {
    const { init } = fakeGoogle({ access_token: 't', expires_in: 3600 })
    const a = new GoogleAuth(ID)
    await a.request(['s1'])
    await a.request(['s2'])
    expect(init.mock.calls[1]![0].scope).toBe('s1 s2')
  })
  it('rejects when a scope was unticked (granular consent)', async () => {
    fakeGoogle({ access_token: 't', expires_in: 3600, scope: 's1' })
    await expect(new GoogleAuth(ID).request(['s1', 's2'])).rejects.toMatchObject({ code: 'scope_missing' })
  })
  it('rejects on oauth error', async () => {
    fakeGoogle({ error: 'access_denied' })
    await expect(new GoogleAuth(ID).request(['s1'])).rejects.toMatchObject({ code: 'access_denied' })
  })
  it('treats tokens about to expire as expired', async () => {
    let now = 0
    fakeGoogle({ access_token: 't', expires_in: 60 })
    const a = new GoogleAuth(ID, () => now)
    await a.request(['s'])
    now = 40_000
    expect(() => a.token()).toThrow(/expired/)
  })
  it('revokes on sign out', async () => {
    const { revoke } = fakeGoogle({ access_token: 't', expires_in: 3600 })
    const a = new GoogleAuth(ID)
    await a.request(['s'])
    await a.signOut()
    expect(revoke).toHaveBeenCalledWith('t', expect.any(Function))
    expect(a.current).toBeNull()
  })
})

describe('explainAuthError', () => {
  it('maps common codes', () => {
    expect(explainAuthError('access_denied').fix).toMatch(/Test user/)
    expect(explainAuthError('popup_failed_to_open').title).toMatch(/blocked/)
    expect(explainAuthError('idpiframe_initialization_failed origin').title).toMatch(/origin/)
    expect(explainAuthError('weird').title).toBe('Sign-in failed')
  })
})

describe('invalid_client guidance', () => {
  it('points at the JavaScript origins setting', () => {
    expect(explainAuthError('invalid_client').fix).toMatch(/Authorized JavaScript origins/)
  })
})
