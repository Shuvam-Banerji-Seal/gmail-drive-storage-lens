// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="node" />
import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptJson, encryptJson, PBKDF2_ITERATIONS, type EncryptedBlob } from './vault'

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

const FAILURE = /Wrong passphrase or corrupted data/
const sample = { name: 'Lab notes', sizes: [1, 2, 3], nested: { ok: true, text: 'héllo ✓' } }

describe('vault', () => {
  it('uses at least the OWASP PBKDF2-SHA-256 work factor', () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(310_000)
  })

  it('round-trips a JSON value', async () => {
    const blob = await encryptJson(sample, 'correct horse')
    expect(await decryptJson<typeof sample>(blob, 'correct horse')).toEqual(sample)
  })

  it('emits the documented blob shape with 16-byte salt and 12-byte IV', async () => {
    const blob = await encryptJson(sample, 'pw')
    expect(blob.v).toBe(1)
    expect(Buffer.from(blob.salt, 'base64')).toHaveLength(16)
    expect(Buffer.from(blob.iv, 'base64')).toHaveLength(12)
    expect(blob.data).not.toContain(sample.name)
  })

  it('rejects a wrong passphrase with a clear error', async () => {
    const blob = await encryptJson(sample, 'right')
    await expect(decryptJson(blob, 'wrong')).rejects.toThrow(FAILURE)
  })

  it('produces different ciphertext, salt and IV on every call', async () => {
    const a = await encryptJson(sample, 'pw')
    const b = await encryptJson(sample, 'pw')
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
    expect(await decryptJson(a, 'pw')).toEqual(sample)
    expect(await decryptJson(b, 'pw')).toEqual(sample)
  })

  it('detects tampering with the ciphertext', async () => {
    const blob = await encryptJson(sample, 'pw')
    const bytes = Buffer.from(blob.data, 'base64')
    bytes[0] = bytes[0]! ^ 0x01
    const tampered: EncryptedBlob = { ...blob, data: bytes.toString('base64') }
    await expect(decryptJson(tampered, 'pw')).rejects.toThrow(FAILURE)
  })

  it('detects tampering with the salt', async () => {
    const blob = await encryptJson(sample, 'pw')
    const salt = Buffer.from(blob.salt, 'base64')
    salt[0] = salt[0]! ^ 0x80
    await expect(decryptJson({ ...blob, salt: salt.toString('base64') }, 'pw')).rejects.toThrow(FAILURE)
  })

  it('rejects malformed blobs with the same generic error', async () => {
    const bogus = { v: 2, salt: '', iv: '', data: '' } as unknown as EncryptedBlob
    await expect(decryptJson(bogus, 'pw')).rejects.toThrow(FAILURE)
  })

  it('refuses an empty passphrase on encrypt', async () => {
    await expect(encryptJson(sample, '')).rejects.toThrow(/Passphrase must not be empty/)
  })
})
