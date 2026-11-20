// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="node" />
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { hasKey, loadEncrypted, loadPlain, saveEncrypted, savePlain, wipeAll } from './cache'

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

const meta = { fileIds: ['a1', 'b2'], totalBytes: 123_456, scannedAt: 1_700_000_000_000 }

beforeEach(async () => {
  await wipeAll()
})

describe('cache (fake-indexeddb)', () => {
  it('round-trips an encrypted value', async () => {
    await saveEncrypted('scan:drive', meta, 'pw')
    expect(await loadEncrypted<typeof meta>('scan:drive', 'pw')).toEqual(meta)
  })

  it('returns null for absent keys', async () => {
    expect(await loadEncrypted('missing', 'pw')).toBeNull()
    expect(await loadPlain('missing')).toBeNull()
    expect(await hasKey('missing')).toBe(false)
  })

  it('reports presence with hasKey', async () => {
    expect(await hasKey('scan:drive')).toBe(false)
    await saveEncrypted('scan:drive', meta, 'pw')
    expect(await hasKey('scan:drive')).toBe(true)
  })

  it('rejects loadEncrypted with a wrong passphrase', async () => {
    await saveEncrypted('scan:drive', meta, 'right')
    await expect(loadEncrypted('scan:drive', 'wrong')).rejects.toThrow(/Wrong passphrase or corrupted data/)
  })

  it('round-trips plain settings', async () => {
    await savePlain('ui:theme', { mode: 'dark', density: 'compact' })
    expect(await loadPlain<{ mode: string; density: string }>('ui:theme')).toEqual({ mode: 'dark', density: 'compact' })
  })

  it('does not return a plain value through loadEncrypted, or the reverse', async () => {
    await savePlain('k', { x: 1 })
    expect(await loadEncrypted('k', 'pw')).toBeNull()
    await saveEncrypted('e', { y: 2 }, 'pw')
    expect(await loadPlain('e')).toBeNull()
  })

  it('wipeAll removes every entry', async () => {
    await saveEncrypted('scan:drive', meta, 'pw')
    await savePlain('ui:theme', { mode: 'light' })
    await wipeAll()
    expect(await hasKey('scan:drive')).toBe(false)
    expect(await hasKey('ui:theme')).toBe(false)
    expect(await loadPlain('ui:theme')).toBeNull()
    expect(await loadEncrypted('scan:drive', 'pw')).toBeNull()
  })

  it('works again after wipeAll', async () => {
    await saveEncrypted('scan:drive', meta, 'pw')
    await wipeAll()
    await saveEncrypted('scan:drive', { fresh: true }, 'pw')
    expect(await loadEncrypted('scan:drive', 'pw')).toEqual({ fresh: true })
  })
})
