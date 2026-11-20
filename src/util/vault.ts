// SPDX-License-Identifier: AGPL-3.0-or-later
// Passphrase-based encryption for anything persisted in the browser.
// PBKDF2-SHA-256 derives an AES-256-GCM key from the passphrase. Each encryption uses a fresh
// random salt and IV. GCM authenticates the ciphertext, so a wrong passphrase or any tampering
// is reported as the same generic failure.

/** PBKDF2 work factor. Keep at or above 310000 (OWASP guidance for PBKDF2-HMAC-SHA256). */
export const PBKDF2_ITERATIONS = 310_000

const SALT_BYTES = 16
const IV_BYTES = 12
const FAILURE = 'Wrong passphrase or corrupted data'

export interface EncryptedBlob {
  v: 1
  /** base64 PBKDF2 salt, 16 bytes. */
  salt: string
  /** base64 AES-GCM IV, 12 bytes. */
  iv: string
  /** base64 ciphertext including the GCM tag. */
  data: string
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto
  if (!c?.subtle) throw new Error('Web Crypto is not available in this environment')
  return c.subtle
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n))
  globalThis.crypto.getRandomValues(out)
  return out
}

function toB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const s = subtle()
  const base = await s.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return s.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Serialise `value` as JSON and encrypt it under a key derived from `passphrase`. */
export async function encryptJson(value: unknown, passphrase: string): Promise<EncryptedBlob> {
  if (passphrase.length === 0) throw new Error('Passphrase must not be empty')
  const json: string | undefined = JSON.stringify(value)
  if (json === undefined) throw new TypeError('Value is not JSON-serialisable')
  subtle()
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = await deriveKey(passphrase, salt)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json))
  return { v: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(ct)) }
}

/** Decrypt a blob produced by `encryptJson`. Rejects with a generic error on any failure. */
export async function decryptJson<T>(blob: EncryptedBlob, passphrase: string): Promise<T> {
  subtle()
  try {
    if (!blob || blob.v !== 1 || typeof blob.salt !== 'string' || typeof blob.iv !== 'string' || typeof blob.data !== 'string') {
      throw new Error('bad blob')
    }
    const salt = fromB64(blob.salt)
    const iv = fromB64(blob.iv)
    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) throw new Error('bad blob')
    const key = await deriveKey(passphrase, salt)
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv }, key, fromB64(blob.data))
    return JSON.parse(new TextDecoder().decode(plain)) as T
  } catch {
    throw new Error(FAILURE)
  }
}
