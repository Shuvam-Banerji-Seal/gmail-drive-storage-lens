// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo } from 'react'
import { formatBytes } from '../util/format'
import { seriesColor } from './colors'
import './charts.css'

export interface BarRow {
  id: string
  label: string
  value: number
  sub?: string
  color?: string
  badge?: string
}

export interface BarListProps {
  rows: BarRow[]
  onClick?: (id: string) => void
  /** Value that maps to a full bar. Defaults to the largest row. */
  max?: number
}

/** Ranked horizontal bars. Rendered as an ordered list so screen readers get rank, label and size in order. */
export function BarList({ rows, onClick, max }: BarListProps) {
  const sorted = useMemo(
    () =>
      rows
        .filter((r) => Number.isFinite(r.value) && r.value >= 0)
        .slice()
        .sort((a, b) => b.value - a.value),
    [rows],
  )
  const top = max !== undefined && max > 0 ? max : sorted.reduce((m, r) => Math.max(m, r.value), 0)

  if (sorted.length === 0) return <p className="muted">Nothing ranked yet.</p>

  return (
    <ol className="barlist" aria-label="Ranked by size">
      {sorted.map((r, i) => {
        const pct = top > 0 ? Math.min(1, r.value / top) : 0
        const body = (
          <>
            <span className="barlist-rank" aria-hidden="true">
              {i + 1}
            </span>
            <span className="barlist-main">
              <span className="barlist-head">
                <span className="barlist-label">{r.label}</span>
                {r.badge ? <span className="chip">{r.badge}</span> : null}
                <span className="barlist-value mono-num">{formatBytes(r.value)}</span>
              </span>
              <span className="barlist-track" aria-hidden="true">
                <span
                  className="barlist-fill"
                  style={{
                    width: `${(pct * 100).toFixed(2)}%`,
                    background: r.color ?? seriesColor(i),
                  }}
                />
              </span>
              {r.sub ? <span className="barlist-sub muted">{r.sub}</span> : null}
            </span>
          </>
        )
        return (
          <li key={r.id} className="barlist-row">
            {onClick ? (
              <button type="button" className="barlist-btn" onClick={() => onClick(r.id)}>
                {body}
              </button>
            ) : (
              <div className="barlist-body">{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
