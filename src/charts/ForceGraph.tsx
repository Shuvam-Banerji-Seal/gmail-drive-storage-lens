// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import type { GraphData } from '../types'
import { formatBytes } from '../util/format'
import { paletteColor, readPalette, type CanvasPalette } from './colors'
import {
  cancelFrame,
  requestFrame,
  useElementWidth,
  usePrefersReducedMotion,
  useThemeVersion,
  useTooltip,
} from './hooks'
import { Tooltip } from './Tooltip'
import './charts.css'

export interface ForceGraphProps {
  data: GraphData
  /** Community id per node id. Falls back to node.group, then 0. */
  groups?: Map<string, number>
  onSelect?: (id: string | null) => void
  /** Controlled selection. Omit to let the chart keep its own. */
  selectedId?: string | null
  height?: number
}

interface SimNode extends SimulationNodeDatum {
  id: string
  label: string
  value: number
  group: number
  r: number
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  weight: number
}

type Drag =
  | {
      kind: 'node'
      node: SimNode
      moved: boolean
      startX: number
      startY: number
    }
  | {
      kind: 'pan'
      moved: boolean
      startX: number
      startY: number
      tx: number
      ty: number
    }

/** Mutable render state. Kept in a ref so pointer handlers and the rAF painter never trigger React renders. */
interface GraphState {
  nodes: SimNode[]
  links: SimLink[]
  adj: Map<string, Set<string>>
  labelIds: Set<string>
  sim: Simulation<SimNode, SimLink> | null
  animated: boolean
  w: number
  h: number
  dpr: number
  t: { x: number; y: number; k: number }
  /** True once the user zoomed or panned: automatic fitting stops. */
  userView: boolean
  hover: string | null
  selected: string | null
  drag: Drag | null
  frame: number
}

const MAX_LABELS = 9

/** Zoom/pan so every node fits inside the canvas with some padding. */
function fitView(s: GraphState): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of s.nodes) {
    if (n.x === undefined || n.y === undefined) continue
    x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r)
  }
  if (!Number.isFinite(x0) || s.w <= 0 || s.h <= 0) return
  const pad = 48
  const k = Math.max(0.2, Math.min(2.5, Math.min((s.w - pad * 2) / Math.max(1, x1 - x0), (s.h - pad * 2) / Math.max(1, y1 - y0))))
  s.t = { k, x: s.w / 2 - ((x0 + x1) / 2) * k, y: s.h / 2 - ((y0 + y1) / 2) * k }
}
const K_MIN = 0.35
const K_MAX = 5

function emptyState(): GraphState {
  return {
    nodes: [],
    links: [],
    adj: new Map(),
    labelIds: new Set(),
    sim: null,
    animated: true,
    w: 0,
    h: 0,
    dpr: 1,
    t: { x: 0, y: 0, k: 1 },
    userView: false,
    hover: null,
    selected: null,
    drag: null,
    frame: 0,
  }
}

const nodeColor = (pal: CanvasPalette, n: SimNode) => paletteColor(pal, n.group)

function paint(canvas: HTMLCanvasElement, s: GraphState, pal: CanvasPalette): void {
  const ctx = canvas.getContext?.('2d')
  if (!ctx) return
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
  ctx.clearRect(0, 0, s.w, s.h)
  if (s.nodes.length === 0) {
    ctx.fillStyle = pal.muted
    ctx.font = '14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('No constellation to draw yet', s.w / 2, s.h / 2)
    return
  }
  const { x: tx, y: ty, k } = s.t
  const focus = s.hover ?? s.selected
  const near = focus ? s.adj.get(focus) : undefined

  ctx.save()
  ctx.translate(tx, ty)
  ctx.scale(k, k)

  ctx.lineCap = 'round'
  for (const l of s.links) {
    const a = l.source as SimNode
    const b = l.target as SimNode
    if (a.x === undefined || a.y === undefined || b.x === undefined || b.y === undefined) continue
    const on = !focus || a.id === focus || b.id === focus
    ctx.globalAlpha = on ? Math.min(0.75, 0.18 + l.weight * 0.4) : 0.04
    ctx.strokeStyle = on ? pal.accent : pal.muted
    ctx.lineWidth = (on ? 1.2 : 0.8) / k
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  for (const n of s.nodes) {
    if (n.x === undefined || n.y === undefined) continue
    const lit = !focus || n.id === focus || (near?.has(n.id) ?? false)
    const color = nodeColor(pal, n)
    ctx.globalAlpha = lit ? 1 : 0.1
    ctx.shadowColor = color
    ctx.shadowBlur = lit && n.id === focus ? 16 : 6
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    if (n.id === s.selected) {
      ctx.strokeStyle = pal.text
      ctx.lineWidth = 2 / k
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r + 3 / k, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  ctx.font = `${12 / k}px system-ui, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (const n of s.nodes) {
    if (n.x === undefined || n.y === undefined) continue
    if (!(s.labelIds.has(n.id) || n.id === focus)) continue
    const lit = !focus || n.id === focus || (near?.has(n.id) ?? false)
    ctx.globalAlpha = lit ? 0.95 : 0.15
    ctx.lineWidth = 4 / k
    ctx.lineJoin = 'round'
    ctx.strokeStyle = pal.bg
    ctx.strokeText(n.label, n.x + n.r + 4 / k, n.y)
    ctx.fillStyle = pal.text
    ctx.fillText(n.label, n.x + n.r + 4 / k, n.y)
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

/** Topmost node under a screen point (node radius plus a small hit margin). */
function pick(s: GraphState, sx: number, sy: number): SimNode | null {
  const gx = (sx - s.t.x) / s.t.k
  const gy = (sy - s.t.y) / s.t.k
  let best: SimNode | null = null
  let bestD = Infinity
  for (const n of s.nodes) {
    if (n.x === undefined || n.y === undefined) continue
    const dx = n.x - gx
    const dy = n.y - gy
    const d = dx * dx + dy * dy
    const reach = n.r + 5 / s.t.k
    if (d <= reach * reach && d < bestD) {
      best = n
      bestD = d
    }
  }
  return best
}

/**
 * Sender constellation drawn on canvas with d3-force. Node area scales with value (sqrt),
 * colour is the community. Drag nodes, wheel to zoom, drag the background to pan.
 * Keyboard: arrows cycle senders, Enter/Space selects, Escape clears. A list below mirrors every node.
 */
export function ForceGraph({ data, groups, onSelect, selectedId, height = 460 }: ForceGraphProps) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(720)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<GraphState>(emptyState())
  const onSelectRef = useRef(onSelect)
  const [innerSel, setInnerSel] = useState<string | null>(null)
  const selected = selectedId !== undefined ? selectedId : innerSel
  const reduced = usePrefersReducedMotion()
  const themeV = useThemeVersion()
  const tip = useTooltip()
  const descId = useId()

  const nodeById = useMemo(() => {
    const m = new Map<string, { id: string; label: string; value: number; group: number }>()
    for (const n of data.nodes) {
      if (m.has(n.id)) continue
      m.set(n.id, {
        id: n.id,
        label: n.label || n.id,
        value: finiteOr0(n.value),
        group: groups?.get(n.id) ?? n.group ?? 0,
      })
    }
    return m
  }, [data, groups])

  const order = useMemo(() => [...nodeById.values()].sort((a, b) => b.value - a.value), [nodeById])
  const communities = useMemo(() => new Set([...nodeById.values()].map((n) => n.group)).size, [nodeById])

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  const schedule = useCallback(() => {
    const s = stateRef.current
    if (s.frame) return
    s.frame = requestFrame(() => {
      s.frame = 0
      const canvas = canvasRef.current
      if (canvas) paint(canvas, s, readPalette())
    })
  }, [])

  const select = useCallback(
    (id: string | null) => {
      if (selectedId === undefined) setInnerSel(id)
      onSelectRef.current?.(id)
    },
    [selectedId, setInnerSel],
  )

  // Canvas size and DPR. Runs before the data effect so the simulation centres correctly on first mount.
  useEffect(() => {
    const s = stateRef.current
    const canvas = canvasRef.current
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
    s.w = width
    s.h = height
    s.dpr = dpr
    if (canvas) {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    if (s.sim) {
      s.sim.force('center', forceCenter(width / 2, height / 2))
      if (s.animated) s.sim.alpha(0.2).restart()
    }
    schedule()
  }, [width, height, schedule])

  // Build the simulation whenever the graph changes. Cleanup stops it so nothing outlives the data.
  useEffect(() => {
    const s = stateRef.current
    const nodes: SimNode[] = [...nodeById.values()].map((n) => ({
      id: n.id,
      label: n.label,
      value: n.value,
      group: n.group,
      r: 3,
    }))
    const maxV = nodes.reduce((m, n) => Math.max(m, n.value), 0)
    for (const n of nodes) n.r = maxV > 0 ? 3 + 13 * Math.sqrt(n.value / maxV) : 4

    const byId = new Set(nodes.map((n) => n.id))
    const links: SimLink[] = data.links
      .filter((l) => byId.has(l.source) && byId.has(l.target) && l.source !== l.target)
      .map((l) => ({
        source: l.source,
        target: l.target,
        weight: finiteOr0(l.weight) || 0.5,
      }))

    const adj = new Map<string, Set<string>>()
    for (const l of links) {
      const a = String(l.source)
      const b = String(l.target)
      if (!adj.has(a)) adj.set(a, new Set())
      if (!adj.has(b)) adj.set(b, new Set())
      adj.get(a)?.add(b)
      adj.get(b)?.add(a)
    }
    const labelIds = new Set(
      [...nodes]
        .sort((a, b) => b.value - a.value)
        .slice(0, MAX_LABELS)
        .map((n) => n.id),
    )

    s.nodes = nodes
    s.links = links
    s.adj = adj
    s.labelIds = labelIds
    s.hover = null
    s.drag = null
    s.animated = !reduced

    if (nodes.length === 0) {
      s.sim = null
      schedule()
      return
    }

    const sim = forceSimulation<SimNode>(nodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => 70 + 90 / (1 + l.weight))
          .strength((l) => Math.min(0.5, 0.08 + l.weight * 0.2)),
      )
      .force('charge', forceManyBody<SimNode>().strength((d) => -160 - d.r * 6).distanceMax(700))
      .force('collide', forceCollide<SimNode>((d) => d.r + 10).strength(1))
      .force('x', forceX<SimNode>(s.w / 2).strength(0.04))
      .force('y', forceY<SimNode>(s.h / 2).strength(0.06))
      .force('center', forceCenter(s.w / 2, s.h / 2))
    s.sim = sim

    // Pre-settle synchronously so the first frame is already a readable layout, then fit it to the view.
    sim.stop()
    sim.tick(reduced ? 300 : 160)
    s.userView = false
    fitView(s)
    if (!reduced) {
      sim.alpha(0.15).restart()
      sim.on('tick', schedule)
      sim.on('end', () => {
        if (!s.drag && !s.userView) fitView(s)
        schedule()
      })
    }
    schedule()

    return () => {
      sim.stop()
      if (s.sim === sim) s.sim = null
    }
  }, [nodeById, data.links, reduced, schedule])

  // Selection and theme changes only need a repaint.
  useEffect(() => {
    stateRef.current.selected = selected
    schedule()
  }, [selected, themeV, schedule])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = stateRef.current
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const k2 = Math.min(K_MAX, Math.max(K_MIN, s.t.k * Math.exp(-e.deltaY * 0.0015)))
      const ratio = k2 / s.t.k
      s.t.x = px - (px - s.t.x) * ratio
      s.t.y = py - (py - s.t.y) * ratio
      s.t.k = k2
      s.userView = true
      schedule()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [schedule])

  useEffect(() => {
    const s = stateRef.current
    return () => {
      cancelFrame(s.frame)
      s.frame = 0
      s.sim?.stop()
      s.sim = null
    }
  }, [])

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    }
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = stateRef.current
    const p = localPoint(e)
    const hit = pick(s, p.x, p.y)
    try {
      canvasRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* not supported in some test environments */
    }
    if (hit) {
      hit.fx = hit.x
      hit.fy = hit.y
      s.drag = {
        kind: 'node',
        node: hit,
        moved: false,
        startX: p.x,
        startY: p.y,
      }
      s.sim?.alphaTarget(0.3).restart()
    } else {
      s.drag = {
        kind: 'pan',
        moved: false,
        startX: p.x,
        startY: p.y,
        tx: s.t.x,
        ty: s.t.y,
      }
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = stateRef.current
    const p = localPoint(e)
    const d = s.drag
    if (d) {
      if (Math.hypot(p.x - d.startX, p.y - d.startY) > 3) d.moved = true
      if (d.kind === 'node') {
        d.node.fx = (p.x - s.t.x) / s.t.k
        d.node.fy = (p.y - s.t.y) / s.t.k
      } else {
        s.t.x = d.tx + (p.x - d.startX)
        s.t.y = d.ty + (p.y - d.startY)
        s.userView = true
      }
      schedule()
      return
    }
    const hit = pick(s, p.x, p.y)
    const id = hit?.id ?? null
    if (id !== s.hover) {
      s.hover = id
      schedule()
    }
    if (canvasRef.current) canvasRef.current.style.cursor = hit ? 'pointer' : 'grab'
    if (hit) {
      tip.show(
        e.clientX,
        e.clientY,
        <>
          <strong>{hit.label}</strong>
          <br />
          {formatBytes(hit.value)} · community {hit.group + 1}
        </>,
      )
    } else {
      tip.hide()
    }
  }

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = stateRef.current
    const d = s.drag
    s.drag = null
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (!d) return
    if (d.kind === 'node') {
      d.node.fx = null
      d.node.fy = null
      s.sim?.alphaTarget(0)
      if (!d.moved) select(d.node.id)
    } else if (!d.moved) {
      select(null)
    }
  }

  const onPointerLeave = () => {
    const s = stateRef.current
    s.hover = null
    tip.hide()
    schedule()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const len = order.length
    if (len === 0) return
    const idx = selected ? order.findIndex((n) => n.id === selected) : -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      select(order[(idx + 1) % len]?.id ?? null)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      select(order[idx < 0 ? len - 1 : (idx - 1 + len) % len]?.id ?? null)
    } else if (e.key === 'Escape') {
      select(null)
    }
  }

  const selectedNode = selected ? nodeById.get(selected) : undefined
  const n = nodeById.size
  const m = data.links.length

  return (
    <div className="force" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="force-canvas"
        role="application"
        tabIndex={0}
        aria-label={`Sender constellation: ${n} senders, ${m} links. Arrow keys move between senders, Enter selects, Escape clears.`}
        aria-describedby={descId}
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
      />
      <p id={descId} className="muted force-meta">
        {n} senders · {m} links · {communities} communities
        {selectedNode ? ` · selected: ${selectedNode.label}` : ''}
      </p>
      <details className="force-list">
        <summary>Browse senders as a list</summary>
        <ul>
          {order.map((node) => (
            <li key={node.id}>
              <button type="button" aria-pressed={selected === node.id} onClick={() => select(node.id)}>
                {node.label} <span className="mono-num muted">{formatBytes(node.value)}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
      <Tooltip tip={tip.tip} />
    </div>
  )
}

function finiteOr0(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}
