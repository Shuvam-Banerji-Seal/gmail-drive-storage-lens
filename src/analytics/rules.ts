// SPDX-License-Identifier: AGPL-3.0-or-later
// Rule-based selection for Gmail: a plain-language rule, its exact match, a human sentence and the
// equivalent Gmail search. Pure functions only; nothing here changes the mailbox.
import type { GmailMsg } from '../types'

/** Every field is optional. A criterion counts only when it is set to a usable value. */
export interface SelectionRule {
  /** Case-insensitive substring of the From header or address. */
  senderContains?: string
  /** Gmail label id (for example `CATEGORY_PROMOTIONS` or a user label id). Case-insensitive. */
  label?: string
  /** Strictly larger than this many MiB. */
  minSizeMB?: number
  /** Received more than this many months ago. */
  olderThanMonths?: number
  unreadOnly?: boolean
  /** Mailing-list mail only (has a List-Id header). Gmail search cannot filter this, so it is not in the query. */
  listsOnly?: boolean
}

const MIB = 2 ** 20
const DAY_MS = 86_400_000
const MONTH_MS = (365.25 / 12) * DAY_MS

/** Normalised values, or undefined when a criterion is not in use. */
function active(r: SelectionRule) {
  const sender = r.senderContains?.trim().toLowerCase() || undefined
  const label = r.label?.trim().toLowerCase() || undefined
  const minMb = typeof r.minSizeMB === 'number' && Number.isFinite(r.minSizeMB) && r.minSizeMB > 0 ? r.minSizeMB : undefined
  const months = typeof r.olderThanMonths === 'number' && Number.isFinite(r.olderThanMonths) && r.olderThanMonths > 0 ? r.olderThanMonths : undefined
  const unread = r.unreadOnly === true
  const lists = r.listsOnly === true
  return { sender, label, minMb, months, unread, lists, any: !!(sender || label || minMb || months || unread || lists) }
}

/** True when at least one criterion is in use. An empty rule matches nothing. */
export function hasCriteria(r: SelectionRule): boolean {
  return active(r).any
}

/** Every criterion that is in use must hold. An empty rule matches nothing. */
export function matchRule(m: GmailMsg, r: SelectionRule, now: number): boolean {
  const a = active(r)
  if (!a.any) return false
  if (a.sender !== undefined && !`${m.from} ${m.fromEmail}`.toLowerCase().includes(a.sender)) return false
  if (a.label !== undefined && !m.labels.some((l) => l.toLowerCase() === a.label)) return false
  if (a.minMb !== undefined && !(m.size > a.minMb * MIB)) return false
  if (a.months !== undefined && !(m.ts < now - a.months * MONTH_MS)) return false
  if (a.unread && !m.labels.includes('UNREAD')) return false
  if (a.lists && !m.listId) return false
  return true
}

export function applyRule(msgs: GmailMsg[], r: SelectionRule, now: number): GmailMsg[] {
  return msgs.filter((m) => matchRule(m, r, now))
}

const num = (n: number) => String(Math.round(n * 100) / 100)

/** Plain sentence, e.g. "unread mailing-list emails larger than 5 MB older than 12 months from 'club'". */
export function describeRule(r: SelectionRule): string {
  const a = active(r)
  if (!a.any) return 'No criteria set: this rule matches nothing.'
  const adjectives: string[] = []
  if (a.unread) adjectives.push('unread')
  if (a.lists) adjectives.push('mailing-list')
  const parts: string[] = [`${adjectives.length ? adjectives.join(' ') + ' ' : ''}emails`]
  if (a.minMb !== undefined) parts.push(`larger than ${num(a.minMb)} MB`)
  if (a.months !== undefined) parts.push(`older than ${num(a.months)} ${a.months === 1 ? 'month' : 'months'}`)
  if (a.label !== undefined) parts.push(`labelled '${r.label!.trim()}'`)
  if (a.sender !== undefined) parts.push(`from '${r.senderContains!.trim()}'`)
  return parts.join(' ')
}

/** Gmail search operator text that matches the same mail (except mailing lists, which Gmail cannot search). */
export function ruleToGmailQuery(r: SelectionRule): string {
  const a = active(r)
  if (!a.any) return ''
  const terms: string[] = []
  if (a.sender !== undefined) terms.push(`from:${/\s/.test(a.sender) ? `"${a.sender}"` : a.sender}`)
  if (a.label !== undefined) {
    const raw = r.label!.trim()
    if (/^CATEGORY_/i.test(raw)) terms.push(`category:${raw.slice(9).toLowerCase()}`)
    else terms.push(/\s/.test(raw) ? `label:"${raw}"` : `label:${raw}`)
  }
  if (a.minMb !== undefined) {
    terms.push(Number.isInteger(a.minMb) ? `larger:${a.minMb}M` : `larger:${Math.round(a.minMb * MIB)}`)
  }
  if (a.months !== undefined) {
    terms.push(Number.isInteger(a.months) ? `older_than:${a.months}m` : `older_than:${Math.round((a.months * MONTH_MS) / DAY_MS)}d`)
  }
  if (a.unread) terms.push('is:unread')
  return terms.join(' ')
}

/** Keep-period suggestion from how often a sender's mail is opened. */
export function keepMonths(readRate: number): number {
  if (readRate < 0.1) return 3
  if (readRate < 0.5) return 6
  return 12
}

/** Markdown checklist, one line per sender, with a suggested keep period. */
export function retentionChecklist(rows: Array<{ label: string; bytes: number; count: number; readRate: number }>): string {
  const lines = [
    '# Storage Lens retention checklist',
    '',
    'Each line suggests how long to keep mail from a sender, based on how often you open it.',
    'Rule: opened under 10% of the time keeps 3 months, under 50% keeps 6 months, otherwise 12 months.',
    '',
  ]
  if (rows.length === 0) lines.push('_No senders to review._')
  for (const r of rows) {
    const label = r.label.replace(/[\r\n]+/g, ' ').trim() || '(unknown sender)'
    lines.push(`- [ ] ${label}: keep ${keepMonths(r.readRate)} months (opened ${Math.round(r.readRate * 100)}%)`)
  }
  return lines.join('\n') + '\n'
}
