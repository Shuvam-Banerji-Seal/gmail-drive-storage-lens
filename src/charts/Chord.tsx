// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react'
import { chord as makeChord, ribbon as makeRibbon, type Chord as ChordLink, type ChordGroup } from 'd3-chord'
import { arc as makeArc } from 'd3-shape'
import { formatBytes } from '../util/format'
import { seriesColor } from './colors'
import { useTooltip } from './hooks'
import { Tooltip } from './Tooltip'
import './charts.css'

export interface ChordProps {
  /** Labels, one per matrix row and column. */
  names: string[]
  /** Square matrix; matrix[i][j] is the flow between i and j. Non-finite or negative cells count as zero. */
  matrix: number[][]
  /** Diameter in SVG units; the drawing scales to the container width. */
  size?: number
}

/** Hovering a group lights its ribbons; hovering a ribbon lights just that ribbon. */
type Hover = { kind: 'group'; index: number } | { kind: 'ribbon'; index: number } | null

const cell = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** Chord diagram: arcs are domains, ribbons are bytes shared. Hover or focus an arc to trace its ribbons. */
export function Chord({ names, matrix, size = 480 }: ChordProps) {
  const [hover, setHover] = useState<Hover>(null)
  const tip = useTooltip()

  const n = Math.min(names.length, matrix.length)
  const layout = useMemo(() => {
    if (n === 0) return null
    const clean = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => cell(matrix[i]?.[j])))
    const total = clean.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0)
    if (total <= 0) return null
    const chords = makeChord().padAngle(n > 2 ? 0.03 : 0)(clean)
    return { groups: [...chords.groups], links: [...chords] }
  }, [matrix, n])

  const half = size / 2
  const outerR = half - 56
  const innerR = outerR - Math.max(10, size * 0.03)
  const labelR = outerR + 12
  const ribbonPath = useMemo(() => makeRibbon().radius(innerR), [innerR])
  const arcPath = useMemo(() => makeArc<ChordGroup>().innerRadius(innerR).outerRadius(outerR), [innerR, outerR])

  if (!layout) {
    return (
      <div className="chord">
        <p className="muted">No shared flows to draw yet.</p>
      </div>
    )
  }

  const nameOf = (i: number) => names[i] ?? `#${i + 1}`
  const lit = (ch: ChordLink, k: number): boolean => {
    if (hover === null) return true
    if (hover.kind === 'group') return ch.source.index === hover.index || ch.target.index === hover.index
    return k === hover.index
  }
  const clear = () => {
    setHover(null)
    tip.hide()
  }

  return (
    <div className="chord">
      <svg
        className="chord-svg"
        viewBox={`${-half} ${-half} ${size} ${size}`}
        role="group"
        aria-label="Chord diagram of domains that appear together in mail. The table below lists every pair."
        onPointerLeave={clear}
      >
        <g className="chord-ribbons">
          {layout.links.map((ch, k) => {
            const d = ribbonPath(ch as unknown as Parameters<typeof ribbonPath>[0]) as unknown as string | null
            if (!d) return null
            const s = ch.source.index
            const t = ch.target.index
            const dim = !lit(ch, k)
            return (
              <path
                key={`r-${s}-${t}-${k}`}
                className={`chord-ribbon${dim ? ' is-dim' : ''}`}
                d={d}
                style={{ fill: seriesColor(s) }}
                onPointerEnter={() => setHover({ kind: 'ribbon', index: k })}
                onPointerMove={(e) =>
                  tip.show(
                    e.clientX,
                    e.clientY,
                    s === t ? (
                      <>
                        {nameOf(s)} alone
                        <br />
                        <strong>{formatBytes(ch.source.value)}</strong>
                      </>
                    ) : (
                      <>
                        {nameOf(s)} ↔ {nameOf(t)}
                        <br />
                        <strong>{formatBytes(ch.source.value)}</strong>
                        {ch.target.value !== ch.source.value && <> (reverse {formatBytes(ch.target.value)})</>}
                      </>
                    ),
                  )
                }
                onPointerLeave={clear}
              />
            )
          })}
        </g>
        <g className="chord-groups">
          {layout.groups.map((g) => {
            const mid = (g.startAngle + g.endAngle) / 2
            const deg = (mid * 180) / Math.PI - 90
            const flip = mid > Math.PI
            const x = Math.cos(mid - Math.PI / 2) * labelR
            const y = Math.sin(mid - Math.PI / 2) * labelR
            const text = `${nameOf(g.index)} · ${formatBytes(g.value)}`
            const dim = hover !== null && hover.kind === 'group' && hover.index !== g.index
            return (
              <g key={`g-${g.index}`}>
                <path
                  className={`chord-arc${dim ? ' is-dim' : ''}`}
                  d={arcPath(g) ?? ''}
                  style={{ fill: seriesColor(g.index) }}
                  tabIndex={0}
                  role="img"
                  aria-label={text}
                  onPointerEnter={() => setHover({ kind: 'group', index: g.index })}
                  onFocus={() => setHover({ kind: 'group', index: g.index })}
                  onBlur={clear}
                  onPointerMove={(e) => tip.show(e.clientX, e.clientY, <>{text}</>)}
                  onPointerLeave={clear}
                />
                <text
                  className={`chord-label${dim ? ' is-dim' : ''}`}
                  x={x}
                  y={y}
                  dy="0.35em"
                  textAnchor={flip ? 'end' : 'start'}
                  transform={`rotate(${flip ? deg + 180 : deg} ${x} ${y})`}
                  aria-hidden="true"
                >
                  {nameOf(g.index)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
      <p className="muted chord-hint">Hover a domain to trace its connections. Ribbon width is bytes shared.</p>
      <table className="sr-only">
        <caption>Bytes shared between each pair of domains</caption>
        <thead>
          <tr>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">Bytes</th>
          </tr>
        </thead>
        <tbody>
          {layout.links.map((ch, k) => (
            <tr key={`row-${k}`}>
              <td>{nameOf(ch.source.index)}</td>
              <td>{nameOf(ch.target.index)}</td>
              <td>{formatBytes(ch.source.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Tooltip tip={tip.tip} />
    </div>
  )
}
