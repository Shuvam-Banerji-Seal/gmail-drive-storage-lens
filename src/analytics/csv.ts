// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BasketItem } from '../types'

/** Cells whose text starts with one of these can be evaluated as formulas by spreadsheets. */
const INJECTION = /^(\s*[=+\-@]|[\t\r])/

function cell(v: string | number | undefined): string {
  if (v === undefined) return ''
  let s = typeof v === 'number' ? String(v) : v
  if (typeof v === 'string' && INJECTION.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

/** RFC 4180 CSV with CRLF line endings and CSV-injection neutralisation. */
export function toCsv(rows: Array<Array<string | number | undefined>>): string {
  return rows.map((r) => r.map(cell).join(',') + '\r\n').join('')
}

/** Basket export: one row per selected Gmail cluster or Drive file. */
export function planToCsv(items: BasketItem[]): string {
  return toCsv([
    ['kind', 'id', 'bytes', 'label'],
    ...items.map((i) => [i.kind, i.id, i.bytes, i.label]),
  ])
}

const MIB = 2 ** 20
const KIB = 2 ** 10

/**
 * Gmail `larger:` search term. At or above 1 MiB the threshold is whole MiB (rounded up,
 * so the filter never matches more than the exact size); below that it is whole KiB.
 */
export function sizeQuery(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) throw new RangeError('sizeQuery: bytes must be a non-negative finite number')
  if (bytes >= MIB) return `larger:${Math.ceil(bytes / MIB)}M`
  return `larger:${Math.ceil(bytes / KIB)}k`
}
