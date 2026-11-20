// SPDX-License-Identifier: AGPL-3.0-or-later
// Side-effect layer: sign-in, scanning, and cleanup actions. In demo mode nothing touches the network.
import { ApiError, GoogleHttp, Scheduler } from '../api/http'
import { GmailApi, type MimePart } from '../api/gmail'
import { DriveApi } from '../api/drive'
import { AuthError, GoogleAuth, explainAuthError, loadGis } from '../auth/gis'
import { generateDemo } from '../demo/generate'
import { buildFilter, type FilterSpec } from '../analytics/filters'
import { loadEncrypted, saveEncrypted } from '../util/cache'
import { formatBytes } from '../util/format'
import { downloadText } from '../util/download'
import { toMbox } from '../util/mbox'
import { SCOPES, type BasketItem, type DriveFile, type GmailMsg, type QuotaInfo } from '../types'
import { loggingFetch } from './netlog'
import { SCAN_TIERS } from './settings'
import { useApp, type LabelCount, type Receipt } from './store'

const READ_SCOPES = [SCOPES.driveRead, SCOPES.gmailRead]
const LABEL_IDS = ['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'UNREAD', 'STARRED', 'IMPORTANT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS']

let auth: GoogleAuth | null = null
let gmailApi: GmailApi | null = null
let driveApi: DriveApi | null = null
let scanAbort: AbortController | null = null

const st = () => useApp.getState()

function buildApis(a: GoogleAuth) {
  const http = new GoogleHttp({
    getToken: () => a.token(),
    scheduler: new Scheduler({ concurrency: 8, unitsPerSecond: 200 }),
    fetchImpl: loggingFetch((e) => st().logNet(e)),
    onAuthExpired: () => st().toast('Your Google session expired. Press "Reconnect" to continue.', 'warn'),
  })
  gmailApi = new GmailApi(http)
  driveApi = new DriveApi(http)
}

/** Warm the Google library so the consent popup opens instantly on click (popup blockers need that). */
export function preloadSignIn(): void {
  loadGis().catch(() => {
    /* surfaced when the user actually clicks */
  })
}

export function describeError(e: unknown): { title: string; fix: string } {
  if (e instanceof AuthError) return explainAuthError(e.code)
  if (e instanceof ApiError) {
    const r = `${e.reason ?? ''} ${e.message}`
    if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(r)) return explainAuthError('accessNotConfigured')
    if (e.status === 403 && /insufficient|scope/i.test(r)) return explainAuthError('scope')
    return { title: `Google API error ${e.status}`, fix: e.message }
  }
  return { title: 'Something went wrong', fix: e instanceof Error ? e.message : String(e) }
}

export interface ConnectCheck {
  signIn: boolean
  drive: boolean
  gmail: boolean
  email?: string
  error?: { title: string; fix: string }
}

/** Sign in with the user's own client (read-only scopes) and verify both APIs respond. */
export async function connect(clientId: string): Promise<ConnectCheck> {
  const res: ConnectCheck = { signIn: false, drive: false, gmail: false }
  try {
    auth = new GoogleAuth(clientId)
    const g = await auth.request(READ_SCOPES, { prompt: 'select_account' })
    res.signIn = true
    st().setGranted([...g.scopes])
    buildApis(auth)
    const q = await driveApi!.about()
    res.drive = true
    const p = await gmailApi!.profile()
    res.gmail = true
    res.email = p.email || q.email
    st().reset()
    st().load({ me: (p.email || q.email || '').toLowerCase(), quota: q, historyId: p.historyId })
    st().setGranted([...g.scopes])
    st().setSettings({ clientId: clientId.trim() })
    st().setMode('live')
  } catch (e) {
    res.error = describeError(e)
  }
  return res
}

export async function reconnect(): Promise<void> {
  if (!auth) throw new AuthError('expired', 'Not connected')
  const g = await auth.request([...new Set([...READ_SCOPES, ...st().granted])])
  st().setGranted([...g.scopes])
}

export function startDemo(): void {
  const d = generateDemo()
  st().reset()
  st().load({ me: d.me, quota: d.quota, gmail: d.gmail, sent: d.gmail.filter((m) => m.labels.includes('SENT')), drive: d.drive, labelCounts: d.labelCounts, historyId: null })
  st().setScan('gmail', { phase: 'done', done: d.gmail.length, total: d.gmail.length, bytesSeen: d.gmail.reduce((s, m) => s + m.size, 0) })
  st().setScan('drive', { phase: 'done', done: d.drive.length, total: d.drive.length, bytesSeen: d.drive.reduce((s, f) => s + f.quota, 0) })
  st().setMode('demo')
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const out: R[] = []
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length && !signal?.aborted) {
        const item = items[i++] as T
        out.push(await fn(item))
      }
    }),
  )
  return out
}

/** Full scan: quota, label counts, Drive metadata, who you write to, then Gmail by size tiers. */
export async function scanAll(): Promise<void> {
  if (st().mode !== 'live' || !gmailApi || !driveApi) return
  scanAbort?.abort()
  const ac = new AbortController()
  scanAbort = ac
  const s = st()
  try {
    const [quota, labels] = await Promise.all([driveApi.about(), gmailApi.labelCounts(LABEL_IDS).catch(() => [] as LabelCount[])])
    s.load({ quota, labelCounts: labels })
    s.setScan('drive', { phase: 'listing', done: 0, total: 0, bytesSeen: 0 })
    // Take the change token BEFORE listing so nothing that changes during the listing is missed later.
    const driveToken = await driveApi.startPageToken().catch(() => null)
    const drive = await driveApi.listFiles({ signal: ac.signal, onProgress: (p) => st().setScan('drive', p) })
    s.load({ drive, driveToken })
    s.setScan('drive', { phase: 'done', done: drive.length, total: drive.length, bytesSeen: drive.reduce((a, f) => a + f.quota, 0) })

    const sentIds = await gmailApi.listIds('in:sent', { max: 300, signal: ac.signal })
    const sent = await pool(sentIds, 8, (id) => gmailApi!.getMeta(id, ac.signal), ac.signal)
    s.load({ sent })

    const tiers = SCAN_TIERS[st().settings.scanDepth]
    const gmail = await gmailApi.scan(tiers, {
      signal: ac.signal,
      concurrency: 8,
      onProgress: (p) => {
        st().setScan('gmail', p)
      },
    })
    s.load({ gmail })
    if (!ac.signal.aborted) {
      const p = await gmailApi.profile()
      s.load({ historyId: p.historyId })
    }
  } catch (e) {
    const d = describeError(e)
    s.setScan('gmail', { ...st().gmailScan, phase: 'error', message: `${d.title}: ${d.fix}` })
    s.toast(`${d.title}. ${d.fix}`, 'bad')
  } finally {
    if (scanAbort === ac) scanAbort = null
  }
}

export function cancelScan(): void {
  scanAbort?.abort()
}

function minTierBytes(): number {
  const t = SCAN_TIERS[st().settings.scanDepth]
  const last = t[t.length - 1] ?? ''
  const m = /larger:(\d+)M/.exec(last)
  return m ? Number(m[1]) * 2 ** 20 : 0
}

/** Incremental refresh using Gmail history (falls back to a rescan when history expired). */
export async function refreshChanges(): Promise<void> {
  if (st().mode !== 'live' || !gmailApi || !driveApi) return
  const hid = st().historyId
  if (!hid) return scanAll()
  try {
    const h = await gmailApi.history(hid)
    const known = new Set(st().gmail.map((m) => m.id))
    const fresh = await pool(h.added.filter((id) => !known.has(id)), 8, (id) => gmailApi!.getMeta(id).catch(() => null))
    const min = minTierBytes()
    const deleted = new Set(h.deleted)
    const gmail = [...st().gmail.filter((m) => !deleted.has(m.id)), ...fresh.filter((m): m is GmailMsg => !!m && m.size >= min)]
    let drive = st().drive
    let driveToken = st().driveToken
    if (driveToken) {
      const c = await driveApi.changes(driveToken)
      const gone = new Set([...c.removed, ...c.changed.map((f) => f.id)])
      drive = [...drive.filter((f) => !gone.has(f.id)), ...c.changed]
      driveToken = c.newStartPageToken
    } else {
      drive = await driveApi.listFiles()
      driveToken = await driveApi.startPageToken().catch(() => null)
    }
    const quota = await driveApi.about()
    st().load({ gmail, drive, quota, historyId: h.historyId, driveToken })
    st().toast(`Updated: ${fresh.length} new, ${deleted.size} removed emails since last scan; Drive synced.`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return scanAll()
    const d = describeError(e)
    st().toast(`${d.title}. ${d.fix}`, 'bad')
  }
}

async function ensure(scopes: string[]): Promise<void> {
  if (!auth) throw new AuthError('expired', 'Not connected')
  if (auth.has(scopes)) return
  const g = await auth.request(scopes)
  st().setGranted([...g.scopes])
}

function receipt(action: Receipt['action'], kind: 'gmail' | 'drive', items: BasketItem[]): Receipt {
  const top = [...items].sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((i) => ({ label: i.label, bytes: i.bytes }))
  return { at: Date.now(), action, kind, count: items.length, bytes: items.reduce((s, i) => s + i.bytes, 0), demo: st().mode === 'demo', top }
}

function split(items: BasketItem[]) {
  return { gmail: items.filter((i) => i.kind === 'gmail'), drive: items.filter((i) => i.kind === 'drive') }
}

/** Move to Trash (recoverable for 30 days). Offers an Undo toast. */
export async function trashItems(items: BasketItem[]): Promise<boolean> {
  const { gmail, drive } = split(items)
  const demo = st().mode === 'demo'
  const snapshot = { gmail: st().gmail, drive: st().drive }
  try {
    if (!demo) {
      if (gmail.length) {
        await ensure([SCOPES.gmailModify])
        await gmailApi!.trash(gmail.map((i) => i.id))
      }
      if (drive.length) {
        await ensure([SCOPES.driveFull])
        await driveApi!.trash(drive.map((i) => i.id))
      }
    }
    if (gmail.length) {
      st().applyRemoval('gmail', gmail.map((i) => i.id))
      st().addReceipt(receipt('trash', 'gmail', gmail))
    }
    if (drive.length) {
      st().applyRemoval('drive', drive.map((i) => i.id))
      st().addReceipt(receipt('trash', 'drive', drive))
    }
    const bytes = items.reduce((s, i) => s + i.bytes, 0)
    st().toast(`${demo ? '[Demo] ' : ''}Moved ${items.length} items (${formatBytes(bytes)}) to Trash. Space is freed when Trash is emptied.`, 'ok', () => {
      void undoTrash(items, snapshot)
    })
    return true
  } catch (e) {
    const d = describeError(e)
    st().toast(`${d.title}. ${d.fix}`, 'bad')
    return false
  }
}

async function undoTrash(items: BasketItem[], snapshot: { gmail: GmailMsg[]; drive: DriveFile[] }): Promise<void> {
  const { gmail, drive } = split(items)
  try {
    if (st().mode === 'live') {
      if (gmail.length) await gmailApi!.untrash(gmail.map((i) => i.id))
      if (drive.length) await driveApi!.untrash(drive.map((i) => i.id))
    }
    const gIds = new Set(gmail.map((i) => i.id))
    const dIds = new Set(drive.map((i) => i.id))
    st().load({
      gmail: [...st().gmail, ...snapshot.gmail.filter((m) => gIds.has(m.id))],
      drive: [...st().drive, ...snapshot.drive.filter((f) => dIds.has(f.id))],
    })
    st().addReceipt({ ...receipt('untrash', gmail.length ? 'gmail' : 'drive', items), bytes: 0 })
    st().toast(`Restored ${items.length} items from Trash.`)
  } catch (e) {
    const d = describeError(e)
    st().toast(`Undo failed: ${d.fix}`, 'bad')
  }
}

/** Permanent deletion. The confirmation string must be typed by the user: `DELETE <count>`. */
export async function deleteForever(items: BasketItem[], confirmation: string): Promise<boolean> {
  if (confirmation !== `DELETE ${items.length}` || items.length === 0) {
    st().toast(`Type exactly "DELETE ${items.length}" to confirm.`, 'warn')
    return false
  }
  const { gmail, drive } = split(items)
  try {
    if (st().mode === 'live') {
      if (gmail.length) {
        await ensure([SCOPES.gmailFull])
        await gmailApi!.deletePermanently(gmail.map((i) => i.id), `DELETE ${gmail.length}`)
      }
      if (drive.length) {
        await ensure([SCOPES.driveFull])
        await driveApi!.deletePermanently(drive.map((i) => i.id), `DELETE ${drive.length}`)
      }
    }
    if (gmail.length) {
      st().applyRemoval('gmail', gmail.map((i) => i.id))
      st().addReceipt(receipt('delete', 'gmail', gmail))
    }
    if (drive.length) {
      st().applyRemoval('drive', drive.map((i) => i.id))
      st().addReceipt(receipt('delete', 'drive', drive))
    }
    st().toast(`${st().mode === 'demo' ? '[Demo] ' : ''}Permanently deleted ${items.length} items (${formatBytes(items.reduce((s, i) => s + i.bytes, 0))}).`)
    return true
  } catch (e) {
    const d = describeError(e)
    st().toast(`${d.title}. ${d.fix}`, 'bad')
    return false
  }
}

/** Put candidates under a "Storage Lens/Review" label so they can be checked inside Gmail first. */
export async function labelForReview(items: BasketItem[], name = 'Storage Lens/Review'): Promise<boolean> {
  const ids = items.filter((i) => i.kind === 'gmail').map((i) => i.id)
  if (!ids.length) return false
  try {
    if (st().mode === 'live') {
      await ensure([SCOPES.gmailModify])
      const label = await gmailApi!.createLabel(name)
      await gmailApi!.addLabel(ids, label.id)
    }
    st().addReceipt(receipt('label', 'gmail', items.filter((i) => i.kind === 'gmail')))
    st().toast(`${st().mode === 'demo' ? '[Demo] ' : ''}Labelled ${ids.length} emails "${name}". Open Gmail and search label:${name.replace(/[ /]/g, '-')}`)
    return true
  } catch (e) {
    const d = describeError(e)
    st().toast(`${d.title}. ${d.fix}`, 'bad')
    return false
  }
}

export async function createGmailFilter(spec: FilterSpec): Promise<boolean> {
  try {
    const f = buildFilter(spec)
    if (st().mode === 'live') {
      await ensure([SCOPES.gmailSettings])
      await gmailApi!.createFilter({ criteria: f.criteria, action: f.action })
    }
    st().addReceipt({ at: Date.now(), action: 'filter', kind: 'gmail', count: 1, bytes: 0, demo: st().mode === 'demo', top: [{ label: f.search, bytes: 0 }] })
    st().toast(`${st().mode === 'demo' ? '[Demo] ' : ''}Filter created for: ${f.search}`)
    return true
  } catch (e) {
    const d = describeError(e)
    st().toast(`${d.title}. ${d.fix}`, 'bad')
    return false
  }
}

/** Delete old revisions that were pinned with keepForever (never the current one). */
export async function pruneRevisions(file: DriveFile): Promise<number> {
  try {
    let freed = Math.max(0, file.quota - file.size)
    if (st().mode === 'live') {
      await ensure([SCOPES.driveFull])
      const revs = await driveApi!.revisions(file.id)
      const old = revs.slice(0, -1).filter((r) => r.keepForever)
      freed = old.reduce((s, r) => s + r.size, 0)
      for (const r of old) await driveApi!.deleteRevision(file.id, r.id)
    }
    st().load({ drive: st().drive.map((f) => (f.id === file.id ? { ...f, quota: Math.max(f.size, f.quota - freed) } : f)) })
    st().addReceipt({ at: Date.now(), action: 'revisions', kind: 'drive', count: 1, bytes: freed, demo: st().mode === 'demo', top: [{ label: file.name, bytes: freed }] })
    st().toast(`${st().mode === 'demo' ? '[Demo] ' : ''}Removed old pinned versions of "${file.name}" (${formatBytes(freed)}).`)
    return freed
  } catch (e) {
    const d = describeError(e)
    st().toast(`${d.title}. ${d.fix}`, 'bad')
    return 0
  }
}

export async function emptyDriveTrash(confirmation: string): Promise<boolean> {
  if (confirmation !== 'EMPTY TRASH') {
    st().toast('Type exactly "EMPTY TRASH" to confirm.', 'warn')
    return false
  }
  try {
    const trashed = st().drive.filter((f) => f.trashed && f.owned)
    if (st().mode === 'live') {
      await ensure([SCOPES.driveFull])
      await driveApi!.emptyTrash('EMPTY TRASH')
    }
    st().applyRemoval('drive', trashed.map((f) => f.id))
    st().addReceipt({ at: Date.now(), action: 'emptyTrash', kind: 'drive', count: trashed.length, bytes: trashed.reduce((s, f) => s + f.quota, 0), demo: st().mode === 'demo', top: [] })
    st().toast('Drive Trash emptied.')
    return true
  } catch (e) {
    const d = describeError(e)
    st().toast(`${d.title}. ${d.fix}`, 'bad')
    return false
  }
}

interface CacheBlob {
  v: 1
  me: string
  savedAt: number
  quota: QuotaInfo | null
  gmail: GmailMsg[]
  sent: GmailMsg[]
  drive: DriveFile[]
  labelCounts: LabelCount[]
  historyId: string | null
  driveToken?: string | null
}
const cacheKey = (me: string) => `scan:${me || 'demo'}`

export async function saveScanCache(passphrase: string): Promise<void> {
  const s = st()
  const blob: CacheBlob = { v: 1, me: s.me, savedAt: Date.now(), quota: s.quota, gmail: s.gmail, sent: s.sent, drive: s.drive, labelCounts: s.labelCounts, historyId: s.historyId, driveToken: s.driveToken }
  await saveEncrypted(cacheKey(s.me), blob, passphrase)
  s.toast('Scan saved on this device, encrypted with your passphrase.')
}

export async function loadScanCache(passphrase: string): Promise<boolean> {
  const s = st()
  const blob = await loadEncrypted<CacheBlob>(cacheKey(s.me), passphrase)
  if (!blob) {
    s.toast('No saved scan found for this account on this device.', 'warn')
    return false
  }
  s.load({ quota: blob.quota ?? s.quota, gmail: blob.gmail, sent: blob.sent, drive: blob.drive, labelCounts: blob.labelCounts, historyId: blob.historyId, driveToken: blob.driveToken ?? null })
  s.setScan('gmail', { phase: 'done', done: blob.gmail.length, total: blob.gmail.length, bytesSeen: blob.gmail.reduce((a, m) => a + m.size, 0) })
  s.setScan('drive', { phase: 'done', done: blob.drive.length, total: blob.drive.length, bytesSeen: blob.drive.reduce((a, f) => a + f.quota, 0) })
  s.toast(`Loaded scan from ${new Date(blob.savedAt).toLocaleString()}. Use "Refresh changes" to catch up.`)
  return true
}

export async function signOut(): Promise<void> {
  cancelScan()
  await auth?.signOut()
  auth = null
  gmailApi = null
  driveApi = null
  st().reset()
}

/** Demo stand-in for a raw message: headers only, clearly marked synthetic. */
function demoRaw(m: GmailMsg): string {
  const text = `From: ${m.from}\r\nSubject: ${m.subject}\r\nDate: ${new Date(m.ts).toUTCString()}\r\nX-Storage-Lens: synthetic demo message\r\n\r\n(Demo data: no real content.)\r\n`
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Archive before delete: downloads the selected emails as one .mbox file straight to the user's disk.
 * This is the only feature that reads message content, and only on this explicit click.
 */
export async function archiveToMbox(items: BasketItem[], onProgress?: (done: number, total: number) => void): Promise<number> {
  const ids = items.filter((i) => i.kind === 'gmail').map((i) => i.id)
  if (!ids.length) return 0
  const byId = new Map(st().gmail.map((m) => [m.id, m]))
  try {
    let done = 0
    const msgs = await pool(ids, 4, async (id) => {
      const raw = st().mode === 'live' ? await gmailApi!.getRawForArchive(id) : demoRaw(byId.get(id) ?? ({ from: '', subject: '', ts: 0 } as unknown as GmailMsg))
      onProgress?.(++done, ids.length)
      return { raw, date: byId.get(id)?.ts }
    })
    downloadText(toMbox(msgs), `storage-lens-archive-${new Date().toISOString().slice(0, 10)}.mbox`, 'application/mbox')
    st().toast(`Saved ${msgs.length} emails to an .mbox file on your device.`)
    return msgs.length
  } catch (e) {
    const d = describeError(e)
    st().toast(`${d.title}. ${d.fix}`, 'bad')
    return 0
  }
}

/** Demo stand-in for attachment structure, derived from size and subject. */
function demoParts(m: GmailMsg): MimePart[] {
  const kinds: Array<[string, string]> = [['pdf', 'application/pdf'], ['jpg', 'image/jpeg'], ['png', 'image/png'], ['mp4', 'video/mp4'], ['zip', 'application/zip'], ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']]
  let h = 0
  for (const ch of m.subject.replace(/^(re|fwd?):\s*/gi, '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const [ext, mime] = kinds[h % kinds.length]!
  const base = m.subject.replace(/^(re|fwd?):\s*/gi, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 32) || 'attachment'
  return m.size > 512 * 1024 ? [{ filename: `${base}.${ext}`, mimeType: mime, size: Math.round(m.size * 0.72) }] : []
}

/**
 * Opt-in deep scan: reads only the MIME structure (attachment names, types and sizes) of the given
 * messages, never content. Results are merged into the store.
 */
export async function deepScanParts(ids: string[], onProgress?: (done: number, total: number) => void): Promise<number> {
  const byId = new Map(st().gmail.map((m) => [m.id, m]))
  const todo = ids.filter((id) => !st().parts[id])
  let done = 0
  try {
    const results = await pool(todo, 8, async (id) => {
      const parts = st().mode === 'live' ? await gmailApi!.getParts(id) : demoParts(byId.get(id)!)
      onProgress?.(++done, todo.length)
      return [id, parts] as const
    })
    st().load({ parts: { ...st().parts, ...Object.fromEntries(results) } })
    return results.length
  } catch (e) {
    const d = describeError(e)
    st().toast(`${d.title}. ${d.fix}`, 'bad')
    return 0
  }
}

/** Permanently empties Gmail Trash or Spam (they still count toward storage until emptied). */
export async function emptyGmailBin(which: 'trash' | 'spam', confirmation: string): Promise<boolean> {
  const phrase = which === 'trash' ? 'EMPTY GMAIL TRASH' : 'EMPTY SPAM'
  if (confirmation !== phrase) {
    st().toast(`Type exactly "${phrase}" to confirm.`, 'warn')
    return false
  }
  try {
    let n = st().labelCounts.find((l) => l.id === (which === 'trash' ? 'TRASH' : 'SPAM'))?.messagesTotal ?? 0
    if (st().mode === 'live') {
      await ensure([SCOPES.gmailFull])
      const ids = await gmailApi!.listIds(which === 'trash' ? 'in:trash' : 'in:spam', { includeSpamTrash: true })
      n = ids.length
      if (n) await gmailApi!.deletePermanently(ids, `DELETE ${n}`)
    }
    const id = which === 'trash' ? 'TRASH' : 'SPAM'
    st().load({ labelCounts: st().labelCounts.map((l) => (l.id === id ? { ...l, messagesTotal: 0, messagesUnread: 0 } : l)) })
    st().addReceipt({ at: Date.now(), action: 'emptyTrash', kind: 'gmail', count: n, bytes: 0, demo: st().mode === 'demo', top: [{ label: which === 'trash' ? 'Gmail Trash' : 'Gmail Spam', bytes: 0 }] })
    st().toast(`${st().mode === 'demo' ? '[Demo] ' : ''}Emptied Gmail ${which}: ${n} emails permanently deleted.`)
    return true
  } catch (e) {
    const d = describeError(e)
    st().toast(`${d.title}. ${d.fix}`, 'bad')
    return false
  }
}

/** Sign in as a different Google account with the same client (opens the account chooser). */
export async function switchAccount(): Promise<boolean> {
  const id = st().settings.clientId
  if (!id) return false
  const r = await connect(id)
  if (r.error) st().toast(`${r.error.title}. ${r.error.fix}`, 'bad')
  return !r.error
}
