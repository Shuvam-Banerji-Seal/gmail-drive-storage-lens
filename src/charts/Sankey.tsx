// SPDX-License-Identifier: AGPL-3.0-or-later
import { useId, useMemo, useState } from 'react'
import {
  sankey as makeSankey,
  sankeyLinkHorizontal,
  type SankeyGraph,
  type SankeyLink,
  type SankeyNode,
} from 'd3-sankey'
import { formatBytes } from '../util/format'
import { seriesColor } from './colors'
import { sanitizeFlows } from './flows'
import { useElementWidth, useTooltip } from './hooks'
import { Tooltip } from './Tooltip'
import './charts.css'

export interface SankeyProps {
  data: {
    nodes: Array<{ id: string; label: string }>
    links: Array<{ source: string; target: string; value: number }>
  }
  height?: number
}

type SNode = { id: string; label: string }
type SLink = { key: string }
type LaidNode = SankeyNode<SNode, SLink>
type LaidLink = SankeyLink<SNode, SLink>

type Hover = { kind: 'node'; id: string } | { kind: 'link'; index: number } | null

/** Visits every node reachable from `start` upstream ('up') or downstream ('down'), collecting nodes and links. */
function walk(start: LaidNode, dir: 'up' | 'down', nodes: Set<LaidNode>, links: Set<LaidLink>): void {
  const stack: LaidNode[] = [start]
  const seen = new Set<LaidNode>([start])
  while (stack.length > 0) {
    const n = stack.pop()
    if (!n) break
    nodes.add(n)
    const edges = (dir === 'down' ? n.sourceLinks : n.targetLinks) ?? []
    for (const l of edges) {
      links.add(l)
      const next = (dir === 'down' ? l.target : l.source) as LaidNode
      if (!seen.has(next)) {
        seen.add(next)
        stack.push(next)
      }
    }
  }
}

/**
 * Sankey "rivers": bytes flowing origin -> category -> state -> action.
 * Hover (or focus) a node or ribbon to light up its full upstream and downstream path.
 */
export function Sankey({ data, height = 420 }: SankeyProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(760)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [hover, setHover] = useState<Hover>(null)
  const tip = useTooltip()

  const clean = useMemo(() => sanitizeFlows(data.nodes, data.links), [data])
  const labels = useMemo(() => new Map(clean.nodes.map((n) => [n.id, n.label])), [clean])

  const graph = useMemo<SankeyGraph<SNode, SLink> | null>(() => {
    if (clean.links.length === 0) return null
    try {
      return makeSankey<SNode, SLink>()
        .nodeId((d) => d.id)
        .nodeWidth(12)
        .nodePadding(14)
        .extent([
          [4, 8],
          [Math.max(40, width - 4), Math.max(40, height - 8)],
        ])({
        nodes: clean.nodes.map((n) => ({ id: n.id, label: n.label })),
        links: clean.links.map((l) => ({
          source: l.source,
          target: l.target,
          value: l.value,
          key: `${l.source}>${l.target}`,
        })),
      })
    } catch {
      return null
    }
  }, [clean, width, height])

  const linkPath = useMemo(() => sankeyLinkHorizontal<SNode, SLink>(), [])
  const nodes: LaidNode[] = graph?.nodes ?? []
  const links: LaidLink[] = graph?.links ?? []

  const active = useMemo(() => {
    const laidNodes: LaidNode[] = graph?.nodes ?? []
    const laidLinks: LaidLink[] = graph?.links ?? []
    const aNodes = new Set<LaidNode>()
    const aLinks = new Set<LaidLink>()
    if (hover?.kind === 'node') {
      const start = laidNodes.find((n) => n.id === hover.id)
      if (start) {
        aNodes.add(start)
        walk(start, 'up', aNodes, aLinks)
        walk(start, 'down', aNodes, aLinks)
      }
    } else if (hover?.kind === 'link') {
      const l = laidLinks[hover.index]
      if (l) {
        aLinks.add(l)
        walk(l.source as LaidNode, 'up', aNodes, aLinks)
        walk(l.target as LaidNode, 'down', aNodes, aLinks)
      }
    }
    return { nodes: aNodes, links: aLinks, any: hover !== null }
  }, [hover, graph])

  const uidGrad = (i: number) => `${uid}-g${i}`

  if (!graph || links.length === 0) {
    return (
      <div className="sk" ref={ref}>
        <p className="muted">No flows to draw yet.</p>
      </div>
    )
  }

  const dimLink = (l: LaidLink) => active.any && !active.links.has(l)
  const dimNode = (n: LaidNode) => active.any && !active.nodes.has(n)
  const nameOf = (n: LaidNode) => labels.get(n.id) ?? n.id

  return (
    <div className="sk" ref={ref}>
      <svg
        className="sk-svg"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="group"
        aria-label="Flow diagram. The table below lists every flow."
        onPointerLeave={() => {
          setHover(null)
          tip.hide()
        }}
      >
        <defs>
          {links.map((l, i) => {
            const a = l.source as LaidNode
            const b = l.target as LaidNode
            return (
              <linearGradient
                key={uidGrad(i)}
                id={uidGrad(i)}
                gradientUnits="userSpaceOnUse"
                x1={a.x1}
                y1={0}
                x2={b.x0}
                y2={0}
              >
                <stop offset="0" style={{ stopColor: seriesColor(a.index ?? 0) }} />
                <stop offset="1" style={{ stopColor: seriesColor(b.index ?? 0) }} />
              </linearGradient>
            )
          })}
        </defs>
        <g className="sk-links">
          {links.map((l, i) => {
            const d = linkPath(l) ?? ''
            if (!d) return null
            const a = l.source as LaidNode
            const b = l.target as LaidNode
            const dim = dimLink(l)
            return (
              <path
                key={`${a.id}>${b.id}`}
                className={`sk-link${dim ? ' is-dim' : ''}`}
                d={d}
                style={{ fill: `url(#${uidGrad(i)})` }}
                onPointerEnter={() => setHover({ kind: 'link', index: i })}
                onPointerMove={(e) =>
                  tip.show(
                    e.clientX,
                    e.clientY,
                    <>
                      {nameOf(a)} → {nameOf(b)}
                      <br />
                      <strong>{formatBytes(l.value)}</strong>
                    </>,
                  )
                }
                onPointerLeave={() => {
                  setHover(null)
                  tip.hide()
                }}
              />
            )
          })}
        </g>
        <g className="sk-nodes">
          {nodes.map((n) => {
            const x0 = n.x0 ?? 0
            const x1 = n.x1 ?? 0
            const y0 = n.y0 ?? 0
            const y1 = n.y1 ?? 0
            const onRight = x0 < width / 2
            const text = `${nameOf(n)} · ${formatBytes(n.value ?? 0)}`
            const label = (
              <text
                className={`sk-label${dimNode(n) ? ' is-dim' : ''}`}
                x={onRight ? x1 + 6 : x0 - 6}
                y={(y0 + y1) / 2}
                dy="0.35em"
                textAnchor={onRight ? 'start' : 'end'}
                aria-hidden="true"
              >
                {text}
              </text>
            )
            return (
              <g key={n.id}>
                <rect
                  className={`sk-node${dimNode(n) ? ' is-dim' : ''}`}
                  x={x0}
                  y={y0}
                  width={Math.max(1, x1 - x0)}
                  height={Math.max(1, y1 - y0)}
                  rx={3}
                  tabIndex={0}
                  role="button"
                  aria-label={text}
                  style={{ fill: seriesColor(n.index ?? 0) }}
                  onPointerEnter={() => setHover({ kind: 'node', id: n.id })}
                  onPointerMove={(e) => tip.show(e.clientX, e.clientY, <>{text}</>)}
                  onPointerLeave={() => {
                    setHover(null)
                    tip.hide()
                  }}
                  onFocus={() => setHover({ kind: 'node', id: n.id })}
                  onBlur={() => setHover(null)}
                />
                {label}
              </g>
            )
          })}
        </g>
      </svg>
      <p className="muted sk-hint">Hover a river or node to trace its path.</p>
      <table className="sr-only">
        <caption>Bytes flowing between stages</caption>
        <thead>
          <tr>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">Bytes</th>
          </tr>
        </thead>
        <tbody>
          {links.map((l) => {
            const a = l.source as LaidNode
            const b = l.target as LaidNode
            return (
              <tr key={`${a.id}>${b.id}`}>
                <td>{nameOf(a)}</td>
                <td>{nameOf(b)}</td>
                <td>{formatBytes(l.value)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Tooltip tip={tip.tip} />
    </div>
  )
}
