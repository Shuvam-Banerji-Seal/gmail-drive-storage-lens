// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DriveFile, DriveRawFile, GmailMsg, GmailRawMessage } from '../types'

const ADDR = /<([^<>\s]+@[^<>\s]+)>/
const BARE = /([^\s<>",;()]+@[^\s<>",;()]+)/g

/** Parse an RFC 5322 From header into name/email/domain (lower-cased address). */
export function parseFrom(header: string): { name: string; email: string; domain: string } {
  const h = (header ?? '').trim()
  const m = ADDR.exec(h)
  let email = ''
  let name = ''
  if (m) {
    email = m[1]!.toLowerCase()
    name = h.slice(0, m.index).trim().replace(/^"+|"+$/g, '').trim()
  } else {
    const b = h.match(BARE)
    email = (b?.[0] ?? '').toLowerCase()
  }
  const at = email.lastIndexOf('@')
  const domain = at >= 0 ? email.slice(at + 1) : ''
  return { name: name || email, email, domain }
}

/** All addresses found in a To/Cc style header, lower-cased and de-duplicated. */
export function parseAddresses(header: string | undefined): string[] {
  if (!header) return []
  const out = new Set<string>()
  for (const part of header.matchAll(/<([^<>\s]+@[^<>\s]+)>/g)) out.add(part[1]!.toLowerCase())
  if (out.size === 0) for (const b of header.match(BARE) ?? []) out.add(b.toLowerCase())
  return [...out]
}

/** Strip Re:/Fwd: prefixes, digits and punctuation so repeated series compare equal. */
export function normalizeSubject(s: string): string {
  let t = (s ?? '').toLowerCase()
  for (;;) {
    const n = t.replace(/^\s*(re|fwd?|fw)\s*:\s*/i, '')
    if (n === t) break
    t = n
  }
  return t
    .replace(/\d+/g, '#')
    .replace(/[^\p{L}\p{N}#\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Only http(s) and mailto targets are ever surfaced to the UI. */
export function parseListUnsubscribe(h?: string): { http: string[]; mailto: string[] } {
  const res = { http: [] as string[], mailto: [] as string[] }
  if (!h) return res
  for (const m of h.matchAll(/<([^<>]+)>/g)) {
    const u = m[1]!.trim()
    if (/^https?:\/\//i.test(u)) res.http.push(u)
    else if (/^mailto:/i.test(u)) res.mailto.push(u)
  }
  return res
}

/** Convert a Gmail metadata response into our model. */
export function toGmailMsg(raw: GmailRawMessage): GmailMsg {
  const headers = new Map<string, string>()
  for (const h of raw.payload?.headers ?? []) {
    const k = h.name.toLowerCase()
    headers.set(k, headers.has(k) ? `${headers.get(k)}, ${h.value}` : h.value)
  }
  const from = headers.get('from') ?? ''
  const p = parseFrom(from)
  const recips = new Set([...parseAddresses(headers.get('to')), ...parseAddresses(headers.get('cc'))])
  const date = Number(raw.internalDate)
  return {
    id: raw.id,
    threadId: raw.threadId,
    size: raw.sizeEstimate ?? 0,
    from,
    fromName: p.name,
    fromEmail: p.email,
    domain: p.domain,
    recipients: [...recips],
    subject: headers.get('subject') ?? '',
    ts: Number.isFinite(date) ? date : 0,
    labels: raw.labelIds ?? [],
    listId: headers.get('list-id') || undefined,
    listUnsub: headers.get('list-unsubscribe') || undefined,
  }
}

const FOLDER = 'application/vnd.google-apps.folder'
const t = (s?: string) => {
  const n = s ? Date.parse(s) : NaN
  return Number.isFinite(n) ? n : 0
}

/** Convert a Drive files.list item into our model. */
export function toDriveFile(r: DriveRawFile): DriveFile {
  return {
    id: r.id,
    name: r.name ?? '(unnamed)',
    mime: r.mimeType ?? '',
    size: Number(r.size ?? 0) || 0,
    quota: Number(r.quotaBytesUsed ?? 0) || 0,
    md5: r.md5Checksum,
    sha256: r.sha256Checksum,
    parents: r.parents ?? [],
    owned: r.ownedByMe === true,
    shared: r.shared === true,
    trashed: r.trashed === true,
    viewed: r.viewedByMeTime ? t(r.viewedByMeTime) : undefined,
    modified: t(r.modifiedTime),
    created: t(r.createdTime),
    ownerEmails: (r.owners ?? []).map((o) => (o.emailAddress ?? '').toLowerCase()).filter(Boolean),
    publicLink: (r.permissions ?? []).some((p) => p.type === 'anyone'),
    isFolder: r.mimeType === FOLDER,
  }
}
