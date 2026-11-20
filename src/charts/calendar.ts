// SPDX-License-Identifier: AGPL-3.0-or-later
/** Pure model for the calendar heatmap. UTC 'YYYY-MM-DD' keys, weeks are Sunday-first columns. */

const DAY_MS = 86_400_000
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type Level = 0 | 1 | 2 | 3 | 4

export interface CalendarCell {
  key: string
  col: number
  row: number
  value: number
  level: Level
}

export interface CalendarModel {
  cells: CalendarCell[]
  cols: number
  /** Month labels, placed at the first column whose Saturday falls in that month. */
  months: Array<{ col: number; label: string }>
  max: number
  total: number
  active: number
  peak: { key: string; value: number } | null
  endKey: string
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * Last `weeks` columns ending at the newest key in `days` (or today, UTC, when there are none).
 * Intensity is quartile-free: each day's level is its share of the busiest day, in 5 steps.
 */
export function buildCalendar(days: ReadonlyMap<string, number>, weeks = 53, nowMs = Date.now()): CalendarModel {
  const cols = Math.min(104, Math.max(1, Math.floor(weeks) || 53))
  let endKey: string | null = null
  for (const k of days.keys()) {
    if (DAY_KEY.test(k) && (endKey === null || k > endKey)) endKey = k
  }
  const parsed = endKey ? Date.parse(`${endKey}T00:00:00Z`) : NaN
  const endMs = Number.isNaN(parsed) ? Math.floor(nowMs / DAY_MS) * DAY_MS : parsed
  const finalKey = iso(endMs)

  const endDow = new Date(endMs).getUTCDay()
  const firstSunday = endMs - endDow * DAY_MS - (cols - 1) * 7 * DAY_MS

  const cells: CalendarCell[] = []
  const months: Array<{ col: number; label: string }> = []
  let lastMonth = -1
  let max = 0
  let total = 0
  let active = 0
  let peak: { key: string; value: number } | null = null

  for (let c = 0; c < cols; c++) {
    const colStart = firstSunday + c * 7 * DAY_MS
    const saturdayMonth = new Date(colStart + 6 * DAY_MS).getUTCMonth()
    if (saturdayMonth !== lastMonth) {
      months.push({ col: c, label: MONTHS[saturdayMonth] ?? '' })
      lastMonth = saturdayMonth
    }
    for (let r = 0; r < 7; r++) {
      const t = colStart + r * DAY_MS
      if (t > endMs) continue
      const key = iso(t)
      const raw = days.get(key)
      const value = raw !== undefined && Number.isFinite(raw) && raw > 0 ? raw : 0
      cells.push({ key, col: c, row: r, value, level: 0 })
      total += value
      if (value > 0) active++
      if (value > max) {
        max = value
        peak = { key, value }
      }
    }
  }
  for (const cell of cells) {
    cell.level = max > 0 && cell.value > 0 ? (Math.min(4, Math.max(1, Math.ceil((cell.value / max) * 4))) as Level) : 0
  }
  // Drop month labels that would collide with the previous one (first column is always kept).
  const spaced = months.filter((m, i) => i === 0 || m.col - (months[i - 1]?.col ?? 0) >= 3)
  return {
    cells,
    cols,
    months: spaced,
    max,
    total,
    active,
    peak,
    endKey: finalKey,
  }
}

/** Fill colour for an intensity level: --surface at zero, stepping up to --accent. */
export function levelColor(level: Level): string {
  switch (level) {
    case 0:
      return 'var(--surface)'
    case 1:
      return 'color-mix(in srgb, var(--accent) 25%, var(--surface))'
    case 2:
      return 'color-mix(in srgb, var(--accent) 45%, var(--surface))'
    case 3:
      return 'color-mix(in srgb, var(--accent) 68%, var(--surface))'
    default:
      return 'var(--accent)'
  }
}
