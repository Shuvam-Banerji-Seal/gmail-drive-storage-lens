// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { area, curveBasis, stack, stackOffsetWiggle, stackOrderInsideOut, type SeriesPoint } from 'd3-shape'
import { formatBytes } from '../util/format'
import { seriesColor } from './colors'
import { useElementWidth, useTooltip } from './hooks'
import { Tooltip } from './Tooltip'
import './charts.css'

export interface StreamSeries {
  key: string
  label: string
  values: number[]
}

export interface StreamProps {
  months: string[]
  series: StreamSeries[]
  height?: number
}

type Row = Record<string, number>

const PAD_L = 8
const PAD_R = 8
const PAD_T = 12
const AXIS = 28

const clean = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)

/**
 * "Tides": a streamgraph of bytes per month per cluster. Wiggle offset keeps the silhouette centred,
 * inside-out ordering puts the largest bands in the middle. Hover for per-series numbers; hover a legend item to isolate it.
 */
export function Stream({ months, series, height = 300 }: StreamProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(720)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const tip = useTooltip()

  const keys = useMemo(() => {
    const seen = new Set<string>()
    return series.filter((s) => {
      if (seen.has(s.key)) return false
      seen.add(s.key)
      return true
    })
  }, [series])

  const layers = useMemo(() => {
    if (months.length === 0 || keys.length === 0) return []
    const rows: Row[] = months.map((_, i) => {
      const r: Row = {}
      for (const s of keys) r[s.key] = clean(s.values[i])
      return r
    })
    return stack<Row, string>()
      .keys(keys.map((s) => s.key))
      .offset(stackOffsetWiggle)
      .order(stackOrderInsideOut)(rows)
  }, [months, keys])

  if (months.length === 0 || keys.length === 0) {
    return (
      <div className="stream" ref={ref}>
        <p className="muted">No monthly data yet.</p>
      </div>
    )
  }

  const plotW = Math.max(60, width)
  const plotH = height
  const innerH = plotH - PAD_T - AXIS
  const n = months.length
  const x = scaleLinear()
    .domain([0, Math.max(1, n - 1)])
    .range([PAD_L, plotW - PAD_R])

  let yMin = Infinity
  let yMax = -Infinity
  for (const layer of layers) {
    for (const p of layer) {
      if (p[0] < yMin) yMin = p[0]
      if (p[1] > yMax) yMax = p[1]
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0
    yMax = 1
  }
  const y = scaleLinear()
    .domain([yMin, yMax === yMin ? yMin + 1 : yMax])
    .range([PAD_T + innerH, PAD_T])

  const areaGen = area<SeriesPoint<Row>>()
    .x((_, i) => x(i))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(curveBasis)

  const totals = months.map((_, i) => keys.reduce((s, k) => s + clean(k.values[i]), 0))
  const tickEvery = Math.max(1, Math.ceil(n / 6))

  const indexAt = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect()
    const px = ((clientX - rect.left) / Math.max(1, rect.width)) * plotW
    const i = Math.round(x.invert(px))
    return Math.min(n - 1, Math.max(0, i))
  }

  const showTip = (i: number, clientX: number, clientY: number) => {
    const rows = keys
      .map((s, si) => ({
        s,
        bytes: clean(s.values[i]),
        color: seriesColor(si),
      }))
      .sort((a, b) => b.bytes - a.bytes)
    tip.show(
      clientX,
      clientY,
      <>
        <strong>{months[i]}</strong>
        <div className="muted">Total {formatBytes(totals[i] ?? 0)}</div>
        <ul className="stream-tip-list">
          {rows.map((r) => (
            <li key={r.s.key}>
              <i style={{ background: r.color }} aria-hidden="true" />
              {r.s.label}: {formatBytes(r.bytes)}
            </li>
          ))}
        </ul>
      </>,
    )
  }

  const hoverX = hoverIdx !== null ? x(hoverIdx) : null

  return (
    <div className="stream" ref={ref}>
      <svg
        className="stream-svg"
        viewBox={`0 0 ${plotW} ${plotH}`}
        width="100%"
        aria-hidden="true"
        focusable="false"
        onPointerMove={(e) => {
          const i = indexAt(e.clientX, e.currentTarget)
          setHoverIdx(i)
          showTip(i, e.clientX, e.clientY)
        }}
        onPointerLeave={() => {
          setHoverIdx(null)
          tip.hide()
        }}
      >
        <g className="stream-reveal">
          {layers.map((layer, li) => {
            const s = keys[li]
            if (!s) return null
            const dim = focusKey !== null && focusKey !== s.key
            return (
              <path
                key={s.key}
                className={`stream-band${dim ? ' is-dim' : ''}`}
                d={areaGen(layer) ?? ''}
                style={{ fill: seriesColor(li) }}
              />
            )
          })}
        </g>
        {hoverX !== null && <line className="stream-cursor" x1={hoverX} x2={hoverX} y1={PAD_T} y2={PAD_T + innerH} />}
        {months.map((m, i) =>
          i % tickEvery === 0 || i === n - 1 ? (
            <text
              key={m}
              className="stream-tick"
              x={x(i)}
              y={plotH - 8}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            >
              {m}
            </text>
          ) : null,
        )}
      </svg>
      <ul className="legend stream-legend">
        {keys.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              className={`stream-key${focusKey === s.key ? ' is-active' : ''}`}
              aria-pressed={focusKey === s.key}
              onPointerEnter={() => setFocusKey(s.key)}
              onPointerLeave={() => setFocusKey(null)}
              onFocus={() => setFocusKey(s.key)}
              onBlur={() => setFocusKey(null)}
              onClick={() => setFocusKey((k) => (k === s.key ? null : s.key))}
            >
              <i style={{ background: seriesColor(i) }} aria-hidden="true" />
              {s.label}
            </button>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>Bytes per month by cluster</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            {keys.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((m, i) => (
            <tr key={m}>
              <th scope="row">{m}</th>
              {keys.map((s) => (
                <td key={s.key}>{formatBytes(clean(s.values[i]))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Tooltip tip={tip.tip} />
    </div>
  )
}
