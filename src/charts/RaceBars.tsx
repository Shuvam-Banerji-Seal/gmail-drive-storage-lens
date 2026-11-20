// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { formatBytes } from '../util/format'
import { hashIndex, seriesColor } from './colors'
import { usePrefersReducedMotion } from './hooks'
import './charts.css'

export interface RaceRow {
  key: string
  label: string
  value: number
}

export interface RaceFrame {
  month: string
  rows: RaceRow[]
}

export interface RaceBarsProps {
  frames: RaceFrame[]
  /** How many bars to show per frame. */
  top?: number
}

const ROW_H = 34
const TICK_MS = 900
const TRANSITION = 'transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1), width 0.7s cubic-bezier(0.2, 0.7, 0.2, 1)'

const clean = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)

/**
 * "Storage time machine": cumulative bytes per cluster, one frame per month. Bars re-rank by sliding up or down
 * when the month changes. Autoplay is off; Play steps the months on a timer that is cleared on unmount.
 * Scrubbing with the slider pauses playback. Under prefers-reduced-motion the bars jump without transitions.
 */
export function RaceBars({ frames, top = 10 }: RaceBarsProps) {
  const reduced = usePrefersReducedMotion()
  // Index and play state live together so the timer can stop at the last frame without a synchronous effect update.
  const [play, setPlay] = useState<{ index: number; playing: boolean }>({ index: 0, playing: false })

  const last = Math.max(0, frames.length - 1)
  const safeIndex = Math.min(play.index, last)
  const playing = play.playing && last > 0
  const frame = frames[safeIndex]

  // One scale for the whole film, so bars visibly grow instead of rescaling every month.
  const scale = useMemo(() => {
    let m = 0
    for (const f of frames) for (const r of f.rows) m = Math.max(m, clean(r.value))
    return m
  }, [frames])

  const ranked = useMemo(
    () =>
      (frame?.rows ?? [])
        .filter((r) => Number.isFinite(r.value) && r.value >= 0)
        .slice()
        .sort((a, b) => b.value - a.value || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        .slice(0, Math.max(1, top)),
    [frame, top],
  )

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      setPlay((p) => (p.index >= last ? { index: p.index, playing: false } : { index: p.index + 1, playing: true }))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [playing, last])

  if (frames.length === 0 || !frame) {
    return (
      <div className="race">
        <p className="muted">No monthly data yet.</p>
      </div>
    )
  }

  const toggle = () => {
    if (last === 0) return
    setPlay((p) => (p.playing ? { index: p.index, playing: false } : { index: p.index >= last ? 0 : p.index, playing: true }))
  }

  const transition: string = reduced ? 'none' : TRANSITION

  return (
    <section className="race stack" aria-label="Storage time machine" style={{ gap: 12 }}>
      <div className="row between">
        <div className="row" style={{ gap: 14 }}>
          <button type="button" className="btn sm primary" onClick={toggle}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <span className="mono-num" aria-hidden="true" style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            {frame.month}
          </span>
        </div>
        <span className="muted mono-num" style={{ fontSize: '0.85rem' }}>
          Cumulative bytes · month {safeIndex + 1} of {frames.length}
        </span>
      </div>

      <label className="stack" style={{ gap: 4 }}>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          Month
        </span>
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={safeIndex}
          aria-valuetext={frame.month}
          onChange={(e) => setPlay({ index: Number(e.target.value), playing: false })}
        />
      </label>

      <div
        aria-hidden="true"
        style={{ position: 'relative', height: Math.max(1, ranked.length) * ROW_H, width: '100%' }}
      >
        {ranked.map((r, rank) => {
          const pct = scale > 0 ? Math.min(100, (clean(r.value) / scale) * 100) : 0
          const rowStyle: CSSProperties = {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: ROW_H - 4,
            transform: `translateY(${rank * ROW_H}px)`,
            transition,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 30%) minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: 10,
          }
          return (
            <div key={r.key} style={rowStyle}>
              <span
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.88rem' }}
                title={r.label}
              >
                <span className="mono-num muted" style={{ marginRight: 6 }}>
                  {rank + 1}
                </span>
                {r.label}
              </span>
              <span style={{ position: 'relative', height: '100%', background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${pct.toFixed(2)}%`,
                    background: seriesColor(hashIndex(r.key)),
                    borderRadius: 6,
                    transition,
                  }}
                />
              </span>
              <span className="mono-num" style={{ fontSize: '0.88rem', minWidth: 84, textAlign: 'right' }}>
                {formatBytes(clean(r.value))}
              </span>
            </div>
          )
        })}
      </div>

      <ol className="sr-only" aria-label={`Ranked by cumulative size at ${frame.month}`}>
        {ranked.map((r) => (
          <li key={r.key}>
            {r.label}: {formatBytes(clean(r.value))}
          </li>
        ))}
      </ol>
    </section>
  )
}
