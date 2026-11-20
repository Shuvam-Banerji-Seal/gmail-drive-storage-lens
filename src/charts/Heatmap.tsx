// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo } from 'react'
import { formatBytes } from '../util/format'
import { levelColor, type Level } from './calendar'
import { useElementWidth, useTooltip } from './hooks'
import { Tooltip } from './Tooltip'
import './charts.css'

export interface HeatmapProps {
  rows: string[]
  cols: string[]
  /** values[row][col] in bytes. Missing or negative cells count as zero. */
  values: number[][]
  /** Target height in px. Rows shrink or grow to fit it, within limits. */
  height?: number
}

const LEFT_MAX = 150
const LABEL_CHARS = 22
const TOP = 22
const BOTTOM = 8
const MIN_ROW = 12
const MAX_ROW = 28
const COL_LABEL_PX = 52
const TOP_CELLS = 10

const clean = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)

/** Five intensity steps from --surface (zero) to --accent (the largest cell), mirroring the mailfall calendar. */
function levelFor(v: number, max: number): Level {
  if (v <= 0 || max <= 0) return 0
  return (1 + Math.min(3, Math.floor((v / max) * 4))) as Level
}

const shorten = (s: string) => (s.length > LABEL_CHARS ? `${s.slice(0, LABEL_CHARS - 1)}…` : s)

/**
 * Matrix of bytes per row (sender cluster) and column (month). Cell intensity is the share of the largest cell.
 * Column labels thin out so they never collide. Hover a cell for its exact size; the table lists the heaviest cells.
 */
export function Heatmap({ rows, cols, values, height = 260 }: HeatmapProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(720)
  const tip = useTooltip()

  const grid = useMemo(() => rows.map((_, r) => cols.map((__, c) => clean(values[r]?.[c]))), [rows, cols, values])
  const max = useMemo(() => grid.reduce((m, row) => row.reduce((mm, v) => Math.max(mm, v), m), 0), [grid])
  const top = useMemo(() => {
    const cells: Array<{ row: string; col: string; value: number }> = []
    grid.forEach((row, r) =>
      row.forEach((value, c) => {
        if (value > 0) cells.push({ row: rows[r] ?? '', col: cols[c] ?? '', value })
      }),
    )
    return cells.sort((a, b) => b.value - a.value || (a.row < b.row ? -1 : a.row > b.row ? 1 : 0)).slice(0, TOP_CELLS)
  }, [grid, rows, cols])

  if (rows.length === 0 || cols.length === 0) {
    return (
      <div className="heat" ref={ref}>
        <p className="muted">No monthly data yet.</p>
      </div>
    )
  }

  const labelW = Math.min(LEFT_MAX, Math.max(60, Math.max(...rows.map((r) => shorten(r).length)) * 7 + 12))
  const rowH = Math.min(MAX_ROW, Math.max(MIN_ROW, Math.floor((height - TOP - BOTTOM) / rows.length)))
  const plotW = Math.max(120, width)
  const cellW = Math.max(4, (plotW - labelW) / cols.length)
  const gridH = rowH * rows.length
  const totalH = TOP + gridH + BOTTOM
  const labelEvery = Math.max(1, Math.ceil(COL_LABEL_PX / cellW))
  const total = grid.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0)

  return (
    <div className="heat chart" ref={ref}>
      <svg
        className="heat-svg"
        viewBox={`0 0 ${plotW} ${totalH}`}
        width="100%"
        height={totalH}
        aria-hidden="true"
        focusable="false"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {cols.map((c, i) =>
          i % labelEvery === 0 ? (
            <text key={`c-${c}`} x={labelW + i * cellW} y={TOP - 8} fontSize={11} style={{ fill: 'var(--muted)' }}>
              {c}
            </text>
          ) : null,
        )}
        {rows.map((r, ri) => (
          <g key={`r-${ri}`}>
            <text x={0} y={TOP + ri * rowH + rowH / 2} dominantBaseline="middle" fontSize={11} style={{ fill: 'var(--muted)' }}>
              <title>{r}</title>
              {shorten(r)}
            </text>
            {cols.map((c, ci) => {
              const value = grid[ri]?.[ci] ?? 0
              return (
                <rect
                  key={`${ri}-${ci}`}
                  x={labelW + ci * cellW + 1}
                  y={TOP + ri * rowH + 1}
                  width={Math.max(1, cellW - 2)}
                  height={Math.max(1, rowH - 2)}
                  rx={2}
                  style={{ fill: levelColor(levelFor(value, max)) }}
                  onPointerMove={(e) =>
                    tip.show(
                      e.clientX,
                      e.clientY,
                      <>
                        <strong>{r}</strong>
                        <div className="muted">{c}</div>
                        {formatBytes(value)}
                      </>,
                    )
                  }
                  onPointerLeave={tip.hide}
                />
              )
            })}
          </g>
        ))}
      </svg>
      <p className="muted cal-stats" style={{ marginTop: 8, fontSize: '0.85rem' }}>
        {formatBytes(total)} across {rows.length} {rows.length === 1 ? 'sender' : 'senders'} and {cols.length} months
      </p>
      <table className="sr-only">
        <caption>Largest sender and month cells, bytes</caption>
        <thead>
          <tr>
            <th scope="col">Sender</th>
            <th scope="col">Month</th>
            <th scope="col">Size</th>
          </tr>
        </thead>
        <tbody>
          {top.map((t) => (
            <tr key={`${t.row}|${t.col}`}>
              <th scope="row">{t.row}</th>
              <td>{t.col}</td>
              <td>{formatBytes(t.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Tooltip tip={tip.tip} />
    </div>
  )
}
