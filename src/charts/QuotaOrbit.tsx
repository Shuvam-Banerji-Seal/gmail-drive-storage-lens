// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CSSProperties } from 'react'
import { formatBytes, formatPct } from '../util/format'
import { seriesColor } from './colors'
import './charts.css'

export interface QuotaRing {
  label: string
  value: number
  color?: string
}

export interface QuotaOrbitProps {
  rings: Array<QuotaRing>
  total: number
  centerLabel: string
  centerSub?: string
}

const SIZE = 300
const C = SIZE / 2
const OUTER = 128
const RING_GAP = 18
const STROKE = 10
const MIN_INNER = 24

const finite = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)

/**
 * Concentric "orbit" rings: each ring is one service's share of the quota total.
 * A satellite dot rides the end of each arc. When the rings add up to more than the total,
 * a pulsing danger ring surrounds the orbit while each service keeps its own colour.
 */
export function QuotaOrbit({ rings, total, centerLabel, centerSub }: QuotaOrbitProps) {
  const cap = finite(total)
  const gap = rings.length > 1 ? Math.min(RING_GAP, (OUTER - MIN_INNER) / (rings.length - 1)) : 0
  const model = rings.map((r, i) => {
    const value = finite(r.value)
    const share = cap > 0 ? value / cap : 0
    return {
      label: r.label,
      value,
      share,
      drawn: Math.min(1, share),
      color: r.color ?? seriesColor(i),
      radius: OUTER - i * gap,
    }
  })
  const used = model.reduce((s, r) => s + r.value, 0)
  const over = used > cap
  const overBy = used - cap
  const usedShare = cap > 0 ? used / cap : 0

  const summary =
    `Storage ${formatBytes(used)} of ${formatBytes(cap)} used (${formatPct(usedShare)}). ` +
    model.map((r) => `${r.label}: ${formatBytes(r.value)}, ${formatPct(r.share)} of quota.`).join(' ') +
    (over ? ` Over capacity by ${formatBytes(overBy)}.` : '')

  return (
    <figure className={`orbit${over ? ' is-over' : ''}`}>
      <div className="orbit-stage">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id="orbit-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" style={{ stopColor: 'var(--accent-2)', stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: 'var(--accent-2)', stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={OUTER + 14} fill="url(#orbit-core)" />
          {model.map((r, i) => {
            const pathLen = 2 * Math.PI * r.radius
            const arcColor = r.color ?? 'var(--accent)'
            const angle = -Math.PI / 2 + r.drawn * 2 * Math.PI
            const sx = C + r.radius * Math.cos(angle)
            const sy = C + r.radius * Math.sin(angle)
            const off = 100 - r.drawn * 100
            return (
              <g key={`${r.label}-${i}`}>
                <circle className="orbit-track" cx={C} cy={C} r={r.radius} strokeWidth={STROKE} />
                <g className="orbit-spin" style={{ animationDuration: `${46 + i * 14}s` }}>
                  <circle
                    className="orbit-dash"
                    cx={C}
                    cy={C}
                    r={r.radius + STROKE / 2 + 4}
                    strokeDasharray={`1 ${Math.max(4, pathLen / 60).toFixed(1)}`}
                  />
                </g>
                {r.drawn > 0 && (
                  <circle
                    className="orbit-arc"
                    cx={C}
                    cy={C}
                    r={r.radius}
                    strokeWidth={STROKE}
                    pathLength={100}
                    strokeDasharray="100 100"
                    strokeDashoffset={off}
                    transform={`rotate(-90 ${C} ${C})`}
                    style={
                      {
                        stroke: arcColor,
                        '--off': off,
                        animationDelay: `${i * 120}ms`,
                      } as CSSProperties
                    }
                  />
                )}
                {r.drawn > 0 && (
                  <>
                    <circle
                      className={`orbit-halo${over ? ' is-over' : ''}`}
                      cx={sx}
                      cy={sy}
                      r={9}
                      style={{ fill: arcColor }}
                    />
                    <circle className="orbit-sat" cx={sx} cy={sy} r={3.8} style={{ fill: arcColor }} />
                  </>
                )}
              </g>
            )
          })}
          {over && <circle className="orbit-warning" cx={C} cy={C} r={OUTER + STROKE / 2 + 6} />}
        </svg>
        <div className="orbit-center">
          <span className="orbit-center-value mono-num">{centerLabel}</span>
          {centerSub && <span className="orbit-center-sub muted">{centerSub}</span>}
        </div>
      </div>
      <ul className="legend orbit-legend" aria-label="Quota breakdown">
        {model.map((r, i) => (
          <li key={`${r.label}-${i}`} className="orbit-legend-item">
            <i style={{ background: r.color ?? 'var(--accent)' }} aria-hidden="true" />
            <span>{r.label}</span>
            <span className="mono-num">
              {formatBytes(r.value)} · {formatPct(r.share)}
            </span>
          </li>
        ))}
      </ul>
      {over ? (
        <p className="orbit-over" role="status">
          Over capacity by {formatBytes(overBy)}
        </p>
      ) : null}
      <p className="sr-only">{summary}</p>
    </figure>
  )
}
