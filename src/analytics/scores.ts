// SPDX-License-Identifier: AGPL-3.0-or-later
import type { GmailMsg, Risk, SafetyResult } from '../types'
import { clamp } from '../util/format'
import { mergeSenders } from './cluster'

const DAY_MS = 86_400_000
const YOUNG_MS = 30 * DAY_MS
const MONTH_MS = (365.25 / 12) * DAY_MS
const PROMO_LABELS = ['CATEGORY_PROMOTIONS', 'CATEGORY_FORUMS', 'CATEGORY_UPDATES', 'CATEGORY_SOCIAL']

export interface SafetyCtx {
  vip: Set<string>
  me: string
  now: number
  userLabels: Set<string>
  repliedThreads: Set<string>
}

export interface NoiseRow {
  key: string
  label: string
  bytes: number
  count: number
  readRate: number
  perMonth: number
  score: number
}

/** Addresses the user has written to (lower-cased, excluding the user's own address). */
export function buildVip(sent: Array<{ recipients: string[] }>, me: string): Set<string> {
  const self = me.trim().toLowerCase()
  const out = new Set<string>()
  for (const m of sent) {
    for (const r of m.recipients) {
      const e = r.trim().toLowerCase()
      if (e && e !== self) out.add(e)
    }
  }
  return out
}

/** Thread ids that contain at least one message labelled SENT. */
export function repliedThreads(sent: GmailMsg[]): Set<string> {
  const out = new Set<string>()
  for (const m of sent) if (m.labels.includes('SENT')) out.add(m.threadId)
  return out
}

/**
 * Deletion risk for one message. Blocked messages (starred, sent, draft, or from the user)
 * score 100. Every rule that fires is listed in reasons.
 */
export function safety(m: GmailMsg, ctx: SafetyCtx): SafetyResult {
  const labels = new Set(m.labels)
  const me = ctx.me.trim().toLowerCase()
  const reasons: string[] = []

  const blocks: string[] = []
  if (labels.has('STARRED')) blocks.push('blocked: starred')
  if (labels.has('SENT')) blocks.push('blocked: sent mail')
  if (labels.has('DRAFT')) blocks.push('blocked: draft')
  if (me !== '' && m.fromEmail === me) blocks.push('blocked: sent by you')

  let score = 0
  const rule = (pts: number, why: string) => {
    score += pts
    reasons.push(`${why} (${pts > 0 ? '+' : ''}${pts})`)
  }

  if (ctx.vip.has(m.fromEmail)) rule(60, 'you have written to this sender')
  if (ctx.repliedThreads.has(m.threadId)) rule(40, 'you replied in this thread')
  if (m.labels.some((l) => ctx.userLabels.has(l))) rule(25, 'has a label you created')
  if (labels.has('IMPORTANT')) rule(20, 'marked important')
  if (ctx.now - m.ts < YOUNG_MS) rule(15, 'newer than 30 days')
  if (m.listId) rule(-25, 'mailing list message')
  if (m.listUnsub) rule(-15, 'has an unsubscribe header')
  if (PROMO_LABELS.some((l) => labels.has(l))) rule(-20, 'promotions, forums, updates or social category')
  if (labels.has('UNREAD')) rule(-10, 'unread')

  if (blocks.length > 0) {
    return { score: 100, level: 'blocked', reasons: [...blocks, ...reasons] }
  }
  const final = clamp(score, 0, 100)
  const level: Risk = final >= 60 ? 'high' : final >= 30 ? 'medium' : 'low'
  return { score: final, level, reasons }
}

function labelOf(ms: GmailMsg[], fallback: string): string {
  const counts = new Map<string, number>()
  for (const m of ms) {
    const n = m.fromName.trim()
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  let best = ''
  let bestN = 0
  for (const [n, c] of counts) {
    if (c > bestN || (c === bestN && n < best)) {
      best = n
      bestN = c
    }
  }
  return best || fallback
}

/**
 * Per sender group (merged addresses): score = bytes * unreadShare * (1 + log10(1 + perMonth)).
 * readRate is the share of messages without the UNREAD label. perMonth is count divided by the
 * group's time span in months (at least one month). Sorted by score desc.
 */
export function noiseScores(msgs: GmailMsg[]): NoiseRow[] {
  const canon = mergeSenders(msgs)
  const groups = new Map<string, GmailMsg[]>()
  for (const m of msgs) {
    const key = canon.get(m.fromEmail) ?? m.fromEmail
    const arr = groups.get(key)
    if (arr) arr.push(m)
    else groups.set(key, [m])
  }
  const rows: NoiseRow[] = []
  for (const [key, ms] of groups) {
    let bytes = 0
    let unread = 0
    let min = Infinity
    let max = -Infinity
    for (const m of ms) {
      bytes += m.size
      if (m.labels.includes('UNREAD')) unread++
      min = Math.min(min, m.ts)
      max = Math.max(max, m.ts)
    }
    const count = ms.length
    const readRate = (count - unread) / count
    const months = Math.max(1, (max - min) / MONTH_MS)
    const perMonth = count / months
    const score = bytes * (1 - readRate) * (1 + Math.log10(1 + perMonth))
    rows.push({ key, label: labelOf(ms, key), bytes, count, readRate, perMonth, score })
  }
  return rows.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
