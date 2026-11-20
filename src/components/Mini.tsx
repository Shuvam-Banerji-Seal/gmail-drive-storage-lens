// SPDX-License-Identifier: AGPL-3.0-or-later
// Small, dependency-free SVG primitives used across pages: sparkline, progress ring, stacked bar, gauge.
import { formatBytes } from '../util/format'

export function Sparkline({ values, color = 'var(--accent)', height = 34, label }: { values: number[]; color?: string; height?: number; label?: string }) {
  const w = 120
  const n = values.length
  if (n < 2) return <svg className="spark" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label ?? 'Not enough data'} />
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => [(i / (n - 1)) * w, height - 3 - (v / max) * (height - 8)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
  const gid = `sg-${Math.round(max)}-${n}`
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={label ?? 'Trend'}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${w},${height}L0,${height}Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function Ring({ value, size = 36, stroke = 4, color = 'var(--accent)', label }: { value: number; size?: number; stroke?: number; color?: string; label?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(v * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.5s' }}
      />
    </svg>
  )
}

export interface Seg {
  label: string
  value: number
  color: string
}
/** Horizontal stacked bar with an optional capacity marker. */
export function StackBar({ segs, total, cap, height = 14 }: { segs: Seg[]; total?: number; cap?: number; height?: number }) {
  const sum = segs.reduce((s, x) => s + Math.max(0, x.value), 0)
  const scale = Math.max(total ?? sum, cap ?? 0, sum, 1)
  const widths = segs.map((s) => (Math.max(0, s.value) / scale) * 1000)
  const starts = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0))
  return (
    <div className="stack" style={{ gap: 8 }}>
      <svg viewBox={`0 0 1000 ${height + 10}`} preserveAspectRatio="none" style={{ width: '100%', height: height + 10 }} role="img" aria-label={segs.map((s) => `${s.label} ${formatBytes(s.value)}`).join(', ')}>
        <rect x="0" y="5" width="1000" height={height} rx={height / 2} fill="var(--surface-3)" />
        <clipPath id="sb-clip">
          <rect x="0" y="5" width="1000" height={height} rx={height / 2} />
        </clipPath>
        <g clipPath="url(#sb-clip)">
          {segs.map((s, i) => (
            <rect key={s.label} x={starts[i]} y="5" width={Math.max(0, (widths[i] ?? 0) - 2)} height={height} fill={s.color} />
          ))}
        </g>
        {cap && cap < scale && <line x1={(cap / scale) * 1000} x2={(cap / scale) * 1000} y1="0" y2={height + 10} stroke="var(--text)" strokeWidth="3" strokeDasharray="3 3" />}
      </svg>
      <div className="legend">
        {segs.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label} <span className="mono-num">{formatBytes(s.value)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Semicircle gauge (0..1, values above 1 render in the danger colour). */
export function Gauge({ value, label, sub, size = 220 }: { value: number; label: string; sub?: string; size?: number }) {
  const r = 80
  const v = Math.max(0, Math.min(1.2, value))
  const arc = (t: number) => {
    const a = Math.PI * (1 - Math.min(1, t))
    return [100 + r * Math.cos(a), 100 - r * Math.sin(a)] as const
  }
  const [ex, ey] = arc(v)
  const over = value > 1
  return (
    <svg viewBox="0 0 200 118" width={size} role="img" aria-label={`${label}${sub ? `, ${sub}` : ''}`} style={{ maxWidth: '100%', height: 'auto' }}>
      <path d={`M20,100 A${r},${r} 0 0 1 180,100`} fill="none" stroke="var(--surface-3)" strokeWidth="14" strokeLinecap="round" />
      <path d={`M20,100 A${r},${r} 0 0 1 ${ex.toFixed(2)},${ey.toFixed(2)}`} fill="none" stroke={over ? 'var(--danger)' : 'var(--accent)'} strokeWidth="14" strokeLinecap="round" />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const a = Math.PI * (1 - t)
        return <line key={t} x1={100 + 96 * Math.cos(a)} y1={100 - 96 * Math.sin(a)} x2={100 + 102 * Math.cos(a)} y2={100 - 102 * Math.sin(a)} stroke="var(--border-2)" strokeWidth="1.5" />
      })}
      <text x="100" y="88" textAnchor="middle" style={{ font: '500 22px var(--mono)', fill: 'var(--text)' }}>
        {label}
      </text>
      {sub && (
        <text x="100" y="108" textAnchor="middle" style={{ font: '500 9px var(--mono)', fill: 'var(--muted)', letterSpacing: '0.1em' }}>
          {sub}
        </text>
      )}
    </svg>
  )
}
