// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure attachment analytics over metadata only: names, MIME types, sizes and message ids. Never content.
import type { MimePart } from '../api/gmail'
import type { Cluster, GmailMsg, GraphData, GraphLink, GraphNode } from '../types'
import { monthKey } from '../util/format'

export type AttachmentType = 'Images' | 'Video' | 'Audio' | 'PDF' | 'Documents' | 'Spreadsheets' | 'Slides' | 'Archives' | 'Other'

const KIB = 1024

const SHEET_EXT = new Set(['xls', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv', 'numbers'])
const SLIDE_EXT = new Set(['ppt', 'pptx', 'pps', 'ppsx', 'odp', 'key'])
const DOC_EXT = new Set(['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages'])
const ARCHIVE_EXT = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'])
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'svg'])
const VIDEO_EXT = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus'])

const SHEET_MIME = new Set(['application/vnd.ms-excel', 'text/csv', 'text/tab-separated-values', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.apple.numbers'])
const SLIDE_MIME = new Set(['application/vnd.ms-powerpoint', 'application/vnd.oasis.opendocument.presentation', 'application/vnd.apple.keynote'])
const DOC_MIME = new Set(['application/msword', 'application/rtf', 'text/rtf', 'text/plain', 'text/markdown', 'application/vnd.oasis.opendocument.text'])
const ARCHIVE_MIME = new Set(['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/vnd.rar', 'application/x-7z-compressed', 'application/x-tar', 'application/gzip', 'application/x-gzip', 'application/x-bzip2', 'application/x-xz'])

const extOf = (filename: string): string => {
  const base = filename.trim().toLowerCase()
  const dot = base.lastIndexOf('.')
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1) : ''
}

/** Type from the MIME category first; a generic or unknown MIME falls back to the file extension. */
function typeByMime(mime: string): AttachmentType | null {
  if (mime.startsWith('image/')) return 'Images'
  if (mime.startsWith('video/')) return 'Video'
  if (mime.startsWith('audio/')) return 'Audio'
  if (mime === 'application/pdf') return 'PDF'
  if (SHEET_MIME.has(mime) || mime.includes('spreadsheet')) return 'Spreadsheets'
  if (SLIDE_MIME.has(mime) || mime.includes('presentation')) return 'Slides'
  if (ARCHIVE_MIME.has(mime)) return 'Archives'
  if (DOC_MIME.has(mime) || mime.includes('wordprocessing') || mime.includes('msword')) return 'Documents'
  return null
}

function typeByExt(ext: string): AttachmentType | null {
  if (ext === 'pdf') return 'PDF'
  if (IMAGE_EXT.has(ext)) return 'Images'
  if (VIDEO_EXT.has(ext)) return 'Video'
  if (AUDIO_EXT.has(ext)) return 'Audio'
  if (SHEET_EXT.has(ext)) return 'Spreadsheets'
  if (SLIDE_EXT.has(ext)) return 'Slides'
  if (DOC_EXT.has(ext)) return 'Documents'
  if (ARCHIVE_EXT.has(ext)) return 'Archives'
  return null
}

/** Coarse file category for display. Pure: same inputs always give the same type. */
export function typeOf(mime: string, filename: string): AttachmentType {
  const m = (mime ?? '').toLowerCase().split(';')[0]!.trim()
  return typeByMime(m) ?? typeByExt(extOf(filename ?? '')) ?? 'Other'
}

const finiteBytes = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)

/** Bytes and file count per type across every scanned part. Parts without a filename are ignored. Bytes desc, then name. */
export function typeBreakdown(parts: Record<string, MimePart[]>): Array<{ type: string; bytes: number; count: number }> {
  const acc = new Map<string, { type: string; bytes: number; count: number }>()
  for (const list of Object.values(parts)) {
    for (const p of list) {
      if (!p.filename || !p.filename.trim()) continue
      const type = typeOf(p.mimeType, p.filename)
      const e = acc.get(type) ?? { type, bytes: 0, count: 0 }
      e.bytes += finiteBytes(p.size)
      e.count += 1
      acc.set(type, e)
    }
  }
  return [...acc.values()].sort((a, b) => b.bytes - a.bytes || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
}

export interface DuplicateAttachment {
  key: string
  filename: string
  size: number
  copies: number
  /** Distinct messages holding this attachment, newest first (id breaks ties). The first one is the copy to keep. */
  messageIds: string[]
  wasted: number
}

/**
 * Attachments that appear in two or more messages. Identity is the lower-cased filename plus the size rounded to the
 * nearest KiB, so re-sent files with a tiny size drift still match. Parts whose message is not in `msgs` are ignored.
 * `size` is the largest raw size seen in the group; `wasted` is size * (copies - 1). Sorted by wasted desc.
 */
export function duplicateAttachments(parts: Record<string, MimePart[]>, msgs: GmailMsg[]): DuplicateAttachment[] {
  const byId = new Map(msgs.map((m) => [m.id, m] as const))
  const groups = new Map<string, { filename: string; size: number; msgIds: Set<string> }>()
  for (const [msgId, list] of Object.entries(parts)) {
    if (!byId.has(msgId)) continue
    for (const p of list) {
      const filename = (p.filename ?? '').trim()
      if (!filename) continue
      const size = finiteBytes(p.size)
      const key = `${filename.toLowerCase()}|${Math.round(size / KIB)}`
      let g = groups.get(key)
      if (!g) {
        g = { filename, size: 0, msgIds: new Set() }
        groups.set(key, g)
      }
      g.size = Math.max(g.size, size)
      g.msgIds.add(msgId)
    }
  }

  const out: DuplicateAttachment[] = []
  for (const [key, g] of groups) {
    const copies = g.msgIds.size
    if (copies < 2) continue
    const messageIds = [...g.msgIds].sort((a, b) => {
      const ta = byId.get(a)?.ts ?? 0
      const tb = byId.get(b)?.ts ?? 0
      return tb - ta || (a < b ? -1 : a > b ? 1 : 0)
    })
    out.push({ key, filename: g.filename, size: g.size, copies, messageIds, wasted: g.size * (copies - 1) })
  }
  return out.sort((a, b) => b.wasted - a.wasted || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/**
 * Constellation of repeated attachments. Attachment nodes (id 'a:'+key) are valued by size * copies. Sender nodes
 * (id 's:'+fromEmail) are valued by the bytes of their messages that hold a listed attachment. Each sender-attachment
 * link is weighted by how many of that sender's messages carry the attachment. Only the `max` heaviest attachments are kept.
 */
export function attachmentGraph(dups: DuplicateAttachment[], msgs: GmailMsg[], max = 60): GraphData {
  const byId = new Map(msgs.map((m) => [m.id, m] as const))
  const kept = dups.slice(0, Math.max(0, max))
  const nodes = new Map<string, GraphNode>()
  const senderBytes = new Map<string, Set<string>>()
  const senderLabel = new Map<string, string>()
  const links: GraphLink[] = []

  for (const d of kept) {
    const aId = `a:${d.key}`
    nodes.set(aId, { id: aId, label: d.filename, value: d.size * d.copies })
    const perSender = new Map<string, number>()
    for (const mid of d.messageIds) {
      const m = byId.get(mid)
      if (!m) continue
      const sId = `s:${m.fromEmail}`
      perSender.set(sId, (perSender.get(sId) ?? 0) + 1)
      let set = senderBytes.get(sId)
      if (!set) {
        set = new Set()
        senderBytes.set(sId, set)
      }
      set.add(m.id)
      if (!senderLabel.has(sId)) senderLabel.set(sId, m.fromName || m.fromEmail)
    }
    for (const [sId, weight] of [...perSender].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      links.push({ source: sId, target: aId, weight })
    }
  }

  for (const [sId, ids] of senderBytes) {
    let bytes = 0
    for (const mid of ids) bytes += byId.get(mid)?.size ?? 0
    nodes.set(sId, { id: sId, label: senderLabel.get(sId) ?? sId, value: bytes })
  }
  return { nodes: [...nodes.values()], links }
}

/**
 * Running totals per series. `months` gives the order; each series contributes its cumulative sum up to and
 * including that month. Missing or negative values count as zero, so every total is non-decreasing.
 */
export function cumulativeByMonth(
  months: string[],
  series: Array<{ key: string; label: string; values: number[] }>,
): Array<{ month: string; rows: Array<{ key: string; label: string; value: number }> }> {
  const running = series.map(() => 0)
  return months.map((month, i) => ({
    month,
    rows: series.map((s, si) => {
      const v = s.values[i]
      running[si] = (running[si] ?? 0) + (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
      return { key: s.key, label: s.label, value: running[si] ?? 0 }
    }),
  }))
}

function nextMonth(key: string): string {
  let y = Number(key.slice(0, 4))
  let m = Number(key.slice(5, 7)) + 1
  if (m > 12) {
    m = 1
    y++
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

/**
 * Bytes per (cluster label x UTC month). Rows are the `topN` clusters by bytes (dated messages only), columns are
 * contiguous YYYY-MM months from the earliest to the latest dated message. Messages without a valid date are skipped.
 */
export function senderMonthMatrix(
  msgs: GmailMsg[],
  clusters: Cluster[],
  topN = 15,
): { rows: string[]; cols: string[]; values: number[][] } {
  const dated = msgs.filter((m) => Number.isFinite(m.ts) && m.ts > 0)
  if (dated.length === 0) return { rows: [], cols: [], values: [] }

  let minTs = Infinity
  let maxTs = -Infinity
  for (const m of dated) {
    minTs = Math.min(minTs, m.ts)
    maxTs = Math.max(maxTs, m.ts)
  }
  const cols: string[] = []
  for (let k = monthKey(minTs), last = monthKey(maxTs); k <= last; k = nextMonth(k)) cols.push(k)
  const colIndex = new Map(cols.map((k, i) => [k, i] as const))

  const byId = new Map(dated.map((m) => [m.id, m] as const))
  const scored: Array<{ id: string; label: string; total: number; values: number[] }> = []
  const seen = new Set<string>()
  for (const c of clusters) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    const values = new Array<number>(cols.length).fill(0)
    let total = 0
    for (const id of c.messageIds) {
      const m = byId.get(id)
      if (!m) continue
      const ci = colIndex.get(monthKey(m.ts))
      if (ci === undefined) continue
      values[ci]! += m.size
      total += m.size
    }
    if (total > 0) scored.push({ id: c.id, label: c.label, total, values })
  }
  scored.sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const top = scored.slice(0, Math.max(0, topN))
  return { rows: top.map((s) => s.label), cols, values: top.map((s) => s.values) }
}
