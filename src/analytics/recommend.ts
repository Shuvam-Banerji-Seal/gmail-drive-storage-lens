// SPDX-License-Identifier: AGPL-3.0-or-later
// Explainable cleanup recommendations. Every rule is a plain condition with its numbers in the text.
// Gmail targets never include blocked (protected) or high-risk mail, and no message or file is
// offered by more than one recommendation.
import type { Cluster, DriveFile, GmailMsg, SafetyResult } from '../types'
import { formatBytes, formatCount } from '../util/format'
import { coldFiles, findDuplicates, keepRule } from './drive'
import { repeatedAttachmentGroups } from './graphs'

export interface Recommendation {
  id: string
  title: string
  why: string
  bytes: number
  risk: 'low' | 'medium' | 'high'
  target: { kind: 'gmail'; ids: string[] } | { kind: 'drive'; ids: string[] }
}

export interface RecommendInput {
  gmail: GmailMsg[]
  drive: DriveFile[]
  safety: Map<string, SafetyResult>
  now: number
}

export interface Offender {
  kind: 'gmail' | 'drive'
  label: string
  bytes: number
  detail: string
}

const MIB = 2 ** 20
const DAY_MS = 86_400_000
const YEAR_MS = 365.25 * DAY_MS
/** A promotion must be at least this big to be recommended. */
const LARGE_PROMO_BYTES = MIB
const NEVER_OPENED_SENDERS = 5

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
/** Drive bytes as the Airlock counts them: quota when known, else the head blob. */
const driveBytes = (f: DriveFile) => (f.quota > 0 ? f.quota : f.size)
const sumBytes = <T>(xs: T[], size: (x: T) => number) => xs.reduce((s, x) => s + size(x), 0)

function byBytesThenId(a: Recommendation, b: Recommendation): number {
  return b.bytes - a.bytes || cmpStr(a.id, b.id)
}

export function recommend(input: RecommendInput): Recommendation[] {
  const { gmail, drive, safety, now } = input
  const byId = new Map(gmail.map((m) => [m.id, m]))
  // Missing safety data counts as not eligible: a message is only offered when its risk is known to be low or medium.
  const eligible = (m: GmailMsg) => {
    const level = safety.get(m.id)?.level
    return level === 'low' || level === 'medium'
  }
  const gmailRisk = (ids: string[]): 'low' | 'medium' => (ids.some((id) => safety.get(id)?.level === 'medium') ? 'medium' : 'low')

  const claimedMail = new Set<string>()
  const claimedDrive = new Set<string>()
  const out: Recommendation[] = []
  const push = (r: Recommendation) => {
    if (r.bytes > 0 && r.target.ids.length > 0) out.push(r)
  }

  // 1. Mailing lists you never opened, top senders by bytes.
  const bySender = new Map<string, GmailMsg[]>()
  for (const m of gmail) {
    if (!m.listId) continue
    const arr = bySender.get(m.fromEmail)
    if (arr) arr.push(m)
    else bySender.set(m.fromEmail, [m])
  }
  const listCandidates: Recommendation[] = []
  for (const [sender, all] of bySender) {
    const opened = all.filter((m) => !m.labels.includes('UNREAD')).length
    if (opened > 0) continue // read rate must be exactly 0
    const ok = all.filter(eligible)
    if (ok.length === 0) continue
    const bytes = sumBytes(ok, (m) => m.size)
    const name = all.find((m) => m.fromName)?.fromName || sender
    listCandidates.push({
      id: `never-opened:${sender}`,
      title: `Never-opened mailing list: ${name}`,
      why: `Rule: mailing-list mail from ${sender} where you have opened 0 of ${formatCount(all.length)} emails (read rate 0%). ${formatCount(ok.length)} emails, ${formatBytes(bytes)}. Starred, sent, draft and high-risk mail is left out.`,
      bytes,
      risk: gmailRisk(ok.map((m) => m.id)),
      target: { kind: 'gmail', ids: ok.map((m) => m.id) },
    })
  }
  for (const r of listCandidates.sort(byBytesThenId).slice(0, NEVER_OPENED_SENDERS)) {
    if (r.target.kind === 'gmail') for (const id of r.target.ids) claimedMail.add(id)
    push(r)
  }

  // 2. Reply chains that re-attach the same file: keep the newest copy of each group.
  const repeatIds: string[] = []
  let repeatGroups = 0
  for (const g of repeatedAttachmentGroups(gmail)) {
    const members = g.ids.map((id) => byId.get(id)).filter((m): m is GmailMsg => !!m)
    if (members.length < 2) continue
    const newest = members.reduce((a, b) => (b.ts > a.ts || (b.ts === a.ts && b.id < a.id) ? b : a))
    const extra = members.filter((m) => m.id !== newest.id && eligible(m) && !claimedMail.has(m.id))
    if (extra.length === 0) continue
    repeatGroups++
    for (const m of extra) repeatIds.push(m.id)
  }
  for (const id of repeatIds) claimedMail.add(id)
  push({
    id: 'repeated-attachments',
    title: 'Repeated attachments in reply chains',
    why: `Rule: three or more messages with the same subject and attachment size (within 2%). The newest copy of each of the ${formatCount(repeatGroups)} groups is kept; ${formatCount(repeatIds.length)} older copies are offered.`,
    bytes: sumBytes(repeatIds, (id) => byId.get(id)?.size ?? 0),
    risk: gmailRisk(repeatIds),
    target: { kind: 'gmail', ids: repeatIds },
  })

  // 3. Mail promotions older than one year.
  const promoIds = gmail
    .filter((m) => m.labels.includes('CATEGORY_PROMOTIONS') && m.size >= LARGE_PROMO_BYTES && m.ts < now - YEAR_MS && eligible(m) && !claimedMail.has(m.id))
    .map((m) => m.id)
  for (const id of promoIds) claimedMail.add(id)
  push({
    id: 'old-promotions',
    title: 'Large promotions older than a year',
    why: `Rule: promotions over 1 MiB received more than 12 months ago. ${formatCount(promoIds.length)} emails; newer or important mail is not offered.`,
    bytes: sumBytes(promoIds, (id) => byId.get(id)?.size ?? 0),
    risk: gmailRisk(promoIds),
    target: { kind: 'gmail', ids: promoIds },
  })

  // 4. Extra Drive copies with identical content: keep the newest of each group.
  const dupFiles: DriveFile[] = []
  const dupGroups = findDuplicates(drive)
  for (const g of dupGroups) for (const f of keepRule(g, 'newest').remove) dupFiles.push(f)
  for (const f of dupFiles) claimedDrive.add(f.id)
  push({
    id: 'drive-duplicates',
    title: 'Duplicate Drive copies',
    why: `Rule: files with identical content (checksum). ${formatCount(dupGroups.length)} groups; the newest copy of each is kept and ${formatCount(dupFiles.length)} extra copies are offered.`,
    bytes: sumBytes(dupFiles, driveBytes),
    risk: dupFiles.some((f) => f.shared || f.publicLink) ? 'medium' : 'low',
    target: { kind: 'drive', ids: dupFiles.map((f) => f.id) },
  })

  // 5. Large Drive files nobody has opened or changed for two years.
  const cold = coldFiles(drive, now).filter((f) => !claimedDrive.has(f.id))
  for (const f of cold) claimedDrive.add(f.id)
  push({
    id: 'cold-drive',
    title: 'Cold Drive files: large and untouched for 2+ years',
    why: `Rule: owned files of at least 10 MiB whose last view (or last change, if never viewed) is over 2 years old. ${formatCount(cold.length)} files. Check them before removing: some may be references you still need.`,
    bytes: sumBytes(cold, driveBytes),
    risk: 'medium',
    target: { kind: 'drive', ids: cold.map((f) => f.id) },
  })

  return out.sort(byBytesThenId)
}

/**
 * Biggest things in the account: the largest Gmail clusters and the largest owned, not-trashed Drive
 * files, mixed and sorted by bytes. Folders are excluded.
 */
export function topOffenders(clusters: Cluster[], drive: DriveFile[], n = 15): Offender[] {
  const limit = Math.max(0, Math.floor(n))
  const mail: Offender[] = [...clusters]
    .sort((a, b) => b.bytes - a.bytes || cmpStr(a.id, b.id))
    .slice(0, limit)
    .map((c) => ({
      kind: 'gmail' as const,
      label: c.label,
      bytes: c.bytes,
      detail: `${formatCount(c.messageIds.length)} emails · ${c.kind === 'list' ? 'mailing list' : 'sender'}`,
    }))
  const files: Offender[] = drive
    .filter((f) => f.owned && !f.trashed && !f.isFolder)
    .sort((a, b) => driveBytes(b) - driveBytes(a) || cmpStr(a.id, b.id))
    .slice(0, limit)
    .map((f) => ({ kind: 'drive' as const, label: f.name, bytes: driveBytes(f), detail: f.mime }))
  return [...mail, ...files].sort((a, b) => b.bytes - a.bytes || cmpStr(a.label, b.label)).slice(0, limit)
}
