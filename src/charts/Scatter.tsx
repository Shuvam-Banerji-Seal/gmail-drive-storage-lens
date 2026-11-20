// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { paletteColor, readPalette, type CanvasPalette } from './colors'
import { pointInPolygon, type Point2 } from './geometry'
import { cancelFrame, requestFrame, useElementWidth, useThemeVersion, useTooltip } from './hooks'
import { Tooltip } from './Tooltip'
import './charts.css'

export interface ScatterPoint {
  id: string
  /** Normalised to [0, 1]. */
  x: number
  /** Normalised to [0, 1]; 1 is the top. */
  y: number
  group?: number
  label?: string
}

export interface ScatterProps {
  points: ScatterPoint[]
  selected?: Set<string>
  onLasso?: (ids: string[]) => void
  height?: number
}

interface Placed {
  p: ScatterPoint
  px: number
  py: number
}

interface Plot {
  w: number
  h: number
  dpr: number
  pts: Placed[]
  selected: Set<string>
  hover: string | null
  cursor: string | null
  lasso: Point2[] | null
  frame: number
}

interface Star {
  x: number
  y: number
  r: number
  a: number
}

const PAD = 18
const SPRITE_PX = 48
const EMPTY = new Set<string>()

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

/** Deterministic background stars, so the nebula looks the same on every repaint. */
function makeStars(count: number, seed = 7): Star[] {
  let s = seed >>> 0
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return Array.from({ length: count }, () => ({
    x: rnd(),
    y: rnd(),
    r: 0.4 + rnd() * 0.9,
    a: 0.15 + rnd() * 0.45,
  }))
}
const STARS = makeStars(110)

const spriteCache = new Map<string, HTMLCanvasElement | null>()

/** Soft radial glow for one colour, cached per colour. Null when the 2D context is unavailable. */
function glowSprite(color: string): HTMLCanvasElement | null {
  const cached = spriteCache.get(color)
  if (cached !== undefined) return cached
  let out: HTMLCanvasElement | null = null
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = SPRITE_PX
    c.height = SPRITE_PX
    const g = c.getContext?.('2d')
    if (g) {
      const mid = SPRITE_PX / 2
      const grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid)
      grad.addColorStop(0, color)
      grad.addColorStop(0.22, color)
      grad.addColorStop(0.5, color)
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      g.fillStyle = grad
      g.fillRect(0, 0, SPRITE_PX, SPRITE_PX)
      out = c
    }
  }
  spriteCache.set(color, out)
  return out
}

function paint(canvas: HTMLCanvasElement, plot: Plot, pal: CanvasPalette): void {
  const ctx = canvas.getContext?.('2d')
  if (!ctx) return
  const { w, h, dpr } = plot
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  ctx.fillStyle = pal.text
  for (const st of STARS) {
    ctx.globalAlpha = st.a
    ctx.beginPath()
    ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2)
    ctx.fill()
  }

  const dimming = plot.selected.size > 0
  for (const { p, px, py } of plot.pts) {
    const color = paletteColor(pal, p.group ?? 0)
    const isSel = plot.selected.has(p.id)
    const size = isSel ? 24 : 13
    const faded = dimming && !isSel
    const sp = glowSprite(color)
    ctx.globalAlpha = faded ? 0.18 : 0.9
    if (sp) {
      ctx.drawImage(sp, px - size / 2, py - size / 2, size, size)
    } else {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(px, py, size / 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = faded ? 0.25 : 1
    ctx.fillStyle = pal.text
    ctx.beginPath()
    ctx.arc(px, py, isSel ? 2 : 1.2, 0, Math.PI * 2)
    ctx.fill()
    if (isSel) {
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = pal.accent
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py, size / 2 + 1, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  ctx.globalAlpha = 1
  ctx.font = '12px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  for (const id of [plot.hover, plot.cursor]) {
    const hit = id ? plot.pts.find((pt) => pt.p.id === id) : undefined
    if (!hit) continue
    ctx.strokeStyle = pal.text
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(hit.px, hit.py, 8, 0, Math.PI * 2)
    ctx.stroke()
    const text = hit.p.label ?? hit.p.id
    ctx.fillStyle = pal.text
    ctx.textAlign = hit.px > w - 160 ? 'right' : 'left'
    ctx.fillText(text, hit.px + (hit.px > w - 160 ? -12 : 12), hit.py)
  }

  const lasso = plot.lasso
  if (lasso && lasso.length > 1) {
    ctx.beginPath()
    lasso.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.closePath()
    ctx.globalAlpha = 0.1
    ctx.fillStyle = pal.accent
    ctx.fill()
    ctx.globalAlpha = 0.85
    ctx.strokeStyle = pal.accent
    ctx.lineWidth = 1.2
    ctx.setLineDash([5, 4])
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.globalAlpha = 1
}

function nearest(plot: Plot, x: number, y: number): Placed | null {
  let best: Placed | null = null
  let bestD = 11 * 11
  for (const pt of plot.pts) {
    const d = (pt.px - x) ** 2 + (pt.py - y) ** 2
    if (d < bestD) {
      best = pt
      bestD = d
    }
  }
  return best
}

/**
 * Subject "nebula": points on canvas as soft glowing sprites, coloured by group.
 * Drag to lasso-select; Enter toggles the keyboard cursor point, Escape clears.
 */
export function Scatter({ points, selected, onLasso, height = 420 }: ScatterProps) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(720)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const plotRef = useRef<Plot>({
    w: 0,
    h: 0,
    dpr: 1,
    pts: [],
    selected: EMPTY,
    hover: null,
    cursor: null,
    lasso: null,
    frame: 0,
  })
  const lassoRef = useRef<{ pts: Point2[]; moved: boolean } | null>(null)
  const [cursorId, setCursorId] = useState<string | null>(null)
  const themeV = useThemeVersion()
  const tip = useTooltip()
  const descId = useId()
  const sel = selected ?? EMPTY

  const order = useMemo(() => [...points].sort((a, b) => a.x - b.x || a.y - b.y), [points])
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points])

  const schedule = useCallback(() => {
    const plot = plotRef.current
    if (plot.frame) return
    plot.frame = requestFrame(() => {
      plot.frame = 0
      const canvas = canvasRef.current
      if (canvas) paint(canvas, plot, readPalette())
    })
  }, [])

  // Size and placement. Runs first so the first paint already has coordinates.
  useEffect(() => {
    const plot = plotRef.current
    const canvas = canvasRef.current
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
    plot.w = width
    plot.h = height
    plot.dpr = dpr
    if (canvas) {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    plot.pts = points.map((p) => ({
      p,
      px: PAD + clamp01(p.x) * (width - 2 * PAD),
      py: PAD + (1 - clamp01(p.y)) * (height - 2 * PAD),
    }))
    schedule()
  }, [points, width, height, schedule])

  useEffect(() => {
    plotRef.current.selected = sel
    schedule()
  }, [sel, themeV, schedule])

  useEffect(() => {
    plotRef.current.cursor = cursorId
    schedule()
  }, [cursorId, schedule])

  useEffect(() => {
    const plot = plotRef.current
    return () => {
      cancelFrame(plot.frame)
      plot.frame = 0
    }
  }, [])

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    }
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const p = local(e)
    try {
      canvasRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    lassoRef.current = { pts: [[p.x, p.y]], moved: false }
    plotRef.current.lasso = [[p.x, p.y]]
    schedule()
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const plot = plotRef.current
    const p = local(e)
    const lasso = lassoRef.current
    if (lasso) {
      const start = lasso.pts[0]
      if (start && Math.hypot(p.x - start[0], p.y - start[1]) > 4) lasso.moved = true
      const last = lasso.pts[lasso.pts.length - 1]
      if (!last || Math.hypot(p.x - last[0], p.y - last[1]) > 2) lasso.pts.push([p.x, p.y])
      plot.lasso = lasso.pts
      schedule()
      return
    }
    const hit = nearest(plot, p.x, p.y)
    const hid = hit?.p.id ?? null
    if (hid !== plot.hover) {
      plot.hover = hid
      schedule()
    }
    if (canvasRef.current) canvasRef.current.style.cursor = hit ? 'pointer' : 'crosshair'
    if (hit) {
      tip.show(
        e.clientX,
        e.clientY,
        <>
          <strong>{hit.p.label ?? hit.p.id}</strong>
          {hit.p.group !== undefined ? <div className="muted">Group {hit.p.group + 1}</div> : null}
        </>,
      )
    } else {
      tip.hide()
    }
  }

  const finishLasso = (e: PointerEvent<HTMLCanvasElement>) => {
    const plot = plotRef.current
    const lasso = lassoRef.current
    lassoRef.current = null
    plot.lasso = null
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (!lasso) return
    if (!lasso.moved) {
      if (sel.size > 0) onLasso?.([])
    } else {
      const poly = lasso.pts
      const ids = plot.pts.filter(({ px, py }) => pointInPolygon(px, py, poly)).map(({ p }) => p.id)
      onLasso?.(ids)
    }
    schedule()
  }

  const onPointerLeave = () => {
    plotRef.current.hover = null
    tip.hide()
    schedule()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const len = order.length
    if (len === 0) return
    const idx = cursorId ? order.findIndex((p) => p.id === cursorId) : -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setCursorId(order[(idx + 1) % len]?.id ?? null)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      setCursorId(order[idx < 0 ? len - 1 : (idx - 1 + len) % len]?.id ?? null)
    } else if ((e.key === 'Enter' || e.key === ' ') && cursorId) {
      e.preventDefault()
      const next = new Set(sel)
      if (next.has(cursorId)) next.delete(cursorId)
      else next.add(cursorId)
      onLasso?.([...next])
    } else if (e.key === 'Escape' && sel.size > 0) {
      onLasso?.([])
    }
  }

  const cursorPoint = cursorId ? byId.get(cursorId) : undefined
  const selectedLabels = [...sel]
    .map((id) => byId.get(id))
    .filter((p): p is ScatterPoint => p !== undefined)
    .slice(0, 50)

  return (
    <div className="scatter" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="scatter-canvas"
        role="application"
        tabIndex={0}
        aria-label={`Subject nebula with ${points.length} points, ${sel.size} selected. Drag to lasso. Arrow keys move, Enter toggles, Escape clears.`}
        aria-describedby={descId}
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishLasso}
        onPointerCancel={finishLasso}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        onBlur={() => setCursorId(null)}
      />
      <p id={descId} className="muted scatter-meta">
        {points.length} subjects · {sel.size} selected · drag to lasso, Esc clears
      </p>
      <p className="sr-only" aria-live="polite">
        {cursorPoint ? `${cursorPoint.label ?? cursorPoint.id}${sel.has(cursorPoint.id) ? ', selected' : ''}` : ''}
      </p>
      {selectedLabels.length > 0 && (
        <ul className="sr-only">
          {selectedLabels.map((p) => (
            <li key={p.id}>{p.label ?? p.id}</li>
          ))}
        </ul>
      )}
      <Tooltip tip={tip.tip} />
    </div>
  )
}
