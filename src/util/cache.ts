// SPDX-License-Identifier: AGPL-3.0-or-later
// IndexedDB cache: one Dexie database ("storagelens") with one table ("blobs").
//
// PRIVACY RULE: callers store METADATA ONLY (file and message ids, sizes, timestamps, label
// counts, aggregated statistics). Message bodies, attachment or file contents, and OAuth tokens
// must never be passed to this module. Anything that is still sensitive goes through
// saveEncrypted, which wraps it with a passphrase-derived AES-GCM key (see ./vault).
// savePlain is only for non-sensitive settings such as UI preferences.
import Dexie, { type Table } from 'dexie'
import { decryptJson, encryptJson, type EncryptedBlob } from './vault'

const DB_NAME = 'storagelens'

type Row =
  | { key: string; mode: 'enc'; value: EncryptedBlob }
  | { key: string; mode: 'plain'; value: string }

interface Store {
  db: Dexie
  blobs: Table<Row, string>
}

let store: Store | null = null

function open(): Store {
  if (!store) {
    const db = new Dexie(DB_NAME)
    db.version(1).stores({ blobs: 'key' })
    store = { db, blobs: db.table<Row, string>('blobs') }
  }
  return store
}

/** Encrypt `value` with `passphrase` and store it under `key`. */
export async function saveEncrypted(key: string, value: unknown, passphrase: string): Promise<void> {
  const blob = await encryptJson(value, passphrase)
  await open().blobs.put({ key, mode: 'enc', value: blob })
}

/** Load and decrypt the value under `key`. Resolves null when absent. Rejects on a wrong passphrase. */
export async function loadEncrypted<T>(key: string, passphrase: string): Promise<T | null> {
  const row = await open().blobs.get(key)
  if (!row || row.mode !== 'enc') return null
  return decryptJson<T>(row.value, passphrase)
}

/** Store a non-sensitive JSON-serialisable setting. Do not use for metadata about private data. */
export async function savePlain(key: string, value: unknown): Promise<void> {
  const json: string | undefined = JSON.stringify(value)
  if (json === undefined) throw new TypeError('Value is not JSON-serialisable')
  await open().blobs.put({ key, mode: 'plain', value: json })
}

/** Load a plain setting. Resolves null when absent. */
export async function loadPlain<T>(key: string): Promise<T | null> {
  const row = await open().blobs.get(key)
  if (!row || row.mode !== 'plain') return null
  return JSON.parse(row.value) as T
}

/** True if any row (encrypted or plain) exists under `key`. */
export async function hasKey(key: string): Promise<boolean> {
  return (await open().blobs.where('key').equals(key).count()) > 0
}

/** Delete the entire database: every encrypted and plain entry. */
export async function wipeAll(): Promise<void> {
  const current = store
  store = null
  current?.db.close()
  await Dexie.delete(DB_NAME)
}
