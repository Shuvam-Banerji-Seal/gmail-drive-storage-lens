// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo } from 'react'
import { formatBytes } from '../util/format'
import { buildCalendar, levelColor } from './calendar'
import { useTooltip } from './hooks'
import { Tooltip } from './Tooltip'
import './charts.css'

export interface CalendarHeatmapProps {
  /** UTC 'YYYY-MM-DD' -> bytes. */
  days: Map<string, number>
  weeks?: number
}

const CELL = 11
const GAP = 3
const STEP = CELL + GAP
const LEFT = 30
const TOP = 18
const DAY_NAMES: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' }

/** GitHub-style grid: week columns, weekday rows, mailfall intensity in five steps. */
export function CalendarHeatmap({ days, weeks = 53 }: CalendarHeatmapProps) {
  const model = useMemo(() => buildCalendar(days, weeks), [days, weeks])
  const tip = useTooltip()
  const width = LEFT + model.cols * STEP
  const height = TOP + 7 * STEP
  const top = model.cells
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  return (
    <div className="cal">
      <div className="cal-scroll">
        <svg
          className="cal-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          focusable="false"
        >
          {model.months.map((m) => (
            <text key={`m-${m.col}`} className="cal-month" x={LEFT + m.col * STEP} y={10}>
              {m.label}
            </text>
          ))}
          {Object.entries(DAY_NAMES).map(([row, name]) => (
            <text key={name} className="cal-day" x={0} y={TOP + Number(row) * STEP + CELL - 1}>
              {name}
            </text>
          ))}
          {model.cells.map((c) => (
            <rect
              key={c.key}
              className="cal-cell"
              x={LEFT + c.col * STEP}
              y={TOP + c.row * STEP}
              width={CELL}
              height={CELL}
              rx={2.5}
              style={{ fill: levelColor(c.level) }}
              onPointerMove={(e) =>
                tip.show(
                  e.clientX,
                  e.clientY,
                  <>
                    <strong>{c.key}</strong>
                    <br />
                    {formatBytes(c.value)}
                  </>,
                )
              }
              onPointerLeave={tip.hide}
            />
          ))}
        </svg>
      </div>
      <div className="cal-foot">
        <div className="legend cal-legend" aria-hidden="true">
          <span>Less</span>
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <i key={l} style={{ background: levelColor(l) }} />
          ))}
          <span>More</span>
        </div>
        <p className="muted cal-stats">
          {formatBytes(model.total)} across {model.active} active {model.active === 1 ? 'day' : 'days'}
          {model.peak ? ` · busiest ${model.peak.key} (${formatBytes(model.peak.value)})` : ''}
        </p>
      </div>
      <p className="sr-only">
        Bytes per day for {model.cols} weeks ending {model.endKey}. Total {formatBytes(model.total)} over {model.active}{' '}
        active days.
      </p>
      <ul className="sr-only">
        {top.map((c) => (
          <li key={c.key}>
            {c.key}: {formatBytes(c.value)}
          </li>
        ))}
      </ul>
      <Tooltip tip={tip.tip} />
    </div>
  )
}
