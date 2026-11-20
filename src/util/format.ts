// SPDX-License-Identifier: AGPL-3.0-or-later
const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const

/** Human readable binary size, e.g. 1536 -> "1.5 KiB". */
export function formatBytes(n: number, digits = 1): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  let v = n
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  return `${i === 0 ? v.toFixed(0) : v.toFixed(digits)} ${UNITS[i]}`
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en').format(n)
}

export function formatPct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "2024-03" in UTC. */
export function monthKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}
/** "2024-03-05" in UTC. */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${monthKey(ts)}-${pad(d.getUTCDate())}`
}
export function formatDate(ts: number): string {
  return dayKey(ts)
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}
