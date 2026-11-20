// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react'
import { arc } from 'd3-shape'
import { hierarchy, partition, type HierarchyRectangularNode } from 'd3-hierarchy'
import type { TreeNode } from '../types'
import { formatBytes, formatPct } from '../util/format'
import { seriesColor } from './colors'
import { resolveTrail, shareOf, truncateLabel } from './tree'
import { useTooltip } from './hooks'
import { Tooltip } from './Tooltip'
import './charts.css'

export interface SunburstProps {
  root: TreeNode
  size?: number
}

const MAX_DEPTH = 4

interface Arc {
  id: string
  name: string
  value: number
  share: number
  path: string
  fill: string
  label: string | null
  labelX: number
  labelY: number
  labelRot: number
  labelFlip: boolean
  trail: string[]
  drillable: boolean
  depth: number
}

/** Partition the tree, then re-angle it so `focus` fills the full circle and its descendants form the rings. */
function buildArcs(root: TreeNode, focus: TreeNode, size: number): Arc[] {
  const h = hierarchy<TreeNode>(root).sum((d) =>
    d.children?.length ? 0 : Math.max(0, Number.isFinite(d.value) ? d.value : 0),
  )
  const part = partition<TreeNode>().size([2 * Math.PI, 1])(h)
  const focusNode = part.descendants().find((d) => d.data === focus)
  if (!focusNode) return []
  const span = focusNode.x1 - focusNode.x0
  if (!(span > 0)) return []

  const R = size / 2 - 4
  const centre = R * 0.24
  const visible = part
    .descendants()
    .filter(
      (d) =>
        d.depth > focusNode.depth &&
        d.depth - focusNode.depth <= MAX_DEPTH &&
        d.x1 > focusNode.x0 &&
        d.x0 < focusNode.x1,
    )
  const levels = Math.max(1, ...visible.map((d) => d.depth - focusNode.depth))
  const band = (R - centre) / levels
  const focusChildren = focusNode.children ?? []
  const toAngle = (x: number) => ((x - focusNode.x0) / span) * 2 * Math.PI

  const arcGen = arc()
  const arcs: Arc[] = []
  for (const d of visible) {
    const a0 = Math.max(0, toAngle(d.x0))
    const a1 = Math.min(2 * Math.PI, toAngle(d.x1))
    if (!(a1 > a0)) continue
    const ring = d.depth - focusNode.depth
    const inner = centre + (ring - 1) * band
    const outer = centre + ring * band - 1.5
    const branch = branchOf(d, focusNode.depth + 1, focusChildren)
    const path =
      arcGen({
        innerRadius: inner,
        outerRadius: outer,
        startAngle: a0,
        endAngle: a1,
        padAngle: 0.003,
      }) ?? ''
    const mid = (a0 + a1) / 2
    const midR = (inner + outer) / 2
    const arcLen = (a1 - a0) * midR
    const labelOk = arcLen > 46 && band > 16
    const value = d.value ?? 0
    const trail = d
      .ancestors()
      .map((a) => a.data.id)
      .reverse()
      .slice(1)
    arcs.push({
      id: d.data.id,
      name: d.data.name,
      value,
      share: shareOf(value, focusNode.value ?? 0),
      path,
      fill: seriesColor(branch),
      label: labelOk ? truncateLabel(d.data.name, Math.floor(arcLen / 7)) : null,
      labelX: Math.sin(mid) * midR,
      labelY: -Math.cos(mid) * midR,
      labelRot: (mid * 180) / Math.PI - 90,
      labelFlip: mid > Math.PI,
      trail,
      drillable: !!d.data.children?.length,
      depth: ring,
    })
  }
  return arcs
}

/** Index of the focus-level ancestor of `d` among `children`, used to colour by branch. */
function branchOf(
  d: HierarchyRectangularNode<TreeNode>,
  level: number,
  children: Array<HierarchyRectangularNode<TreeNode>>,
): number {
  const anc = d.ancestors().find((a) => a.depth === level)
  if (!anc) return 0
  const i = children.indexOf(anc)
  return Math.max(0, i)
}

/**
 * Sunburst view of the same folder tree. Click an arc to zoom into it; click the centre to zoom back out.
 */
export function Sunburst({ root, size = 360 }: SunburstProps) {
  const [trail, setTrail] = useState<string[]>([])
  const tip = useTooltip()
  const chain = resolveTrail(root, trail)
  const focus = chain[chain.length - 1] ?? root
  const arcs = useMemo(() => buildArcs(root, focus, size), [root, focus, size])
  const R = size / 2 - 4
  const centre = R * 0.24
  const parentTrail = trail.slice(0, -1)

  const zoomTo = (ids: string[]) => setTrail(ids)

  return (
    <div className="sb" style={{ width: size, maxWidth: '100%' }}>
      <div className="sb-stage" style={{ width: size, height: size }}>
        <svg
          className="sb-svg"
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          role="group"
          aria-label={`Sunburst of ${focus.name}`}
        >
          <g transform={`translate(${size / 2} ${size / 2})`}>
            {arcs.map((a) => (
              <g key={`${a.id}-${a.depth}`}>
                <path
                  className={`sb-arc${a.drillable ? ' is-drillable' : ''}`}
                  d={a.path}
                  role="button"
                  tabIndex={0}
                  aria-label={`${a.name}, ${formatBytes(a.value)}, ${formatPct(a.share)} of ${focus.name}${a.drillable ? ', folder' : ''}`}
                  style={{
                    fill: a.fill,
                    fillOpacity: Math.max(0.42, 1 - (a.depth - 1) * 0.16),
                  }}
                  onClick={() => (a.drillable ? zoomTo(a.trail) : undefined)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && a.drillable) {
                      e.preventDefault()
                      zoomTo(a.trail)
                    }
                  }}
                  onPointerMove={(e) =>
                    tip.show(
                      e.clientX,
                      e.clientY,
                      <>
                        <strong>{a.name}</strong>
                        <br />
                        {formatBytes(a.value)} · {formatPct(a.share, 1)} of {focus.name}
                      </>,
                    )
                  }
                  onPointerLeave={tip.hide}
                  onFocus={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    tip.show(r.left + r.width / 2, r.top + r.height / 2, `${a.name}: ${formatBytes(a.value)}`)
                  }}
                  onBlur={tip.hide}
                />
                {a.label && (
                  <text
                    className="sb-label"
                    aria-hidden="true"
                    transform={`translate(${a.labelX.toFixed(2)} ${a.labelY.toFixed(2)}) rotate(${(a.labelFlip ? a.labelRot + 180 : a.labelRot).toFixed(2)})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {a.label}
                  </text>
                )}
              </g>
            ))}
          </g>
        </svg>
        <button
          type="button"
          className="sb-centre"
          style={{ width: centre * 2, height: centre * 2 }}
          onClick={() => zoomTo(parentTrail)}
          disabled={trail.length === 0}
          aria-label={
            trail.length === 0
              ? `Centre: ${focus.name}, ${formatBytes(focus.value)}`
              : `Zoom out from ${focus.name} to ${chain[chain.length - 2]?.name ?? root.name}`
          }
        >
          <span className="sb-centre-name">{truncateLabel(focus.name, 18)}</span>
          <span className="mono-num sb-centre-value">{formatBytes(focus.value)}</span>
        </button>
      </div>
      <p className="muted sb-hint">{trail.length ? 'Centre returns one level up.' : 'Select an arc to zoom in.'}</p>
      <ul className="sr-only">
        {arcs.map((a) => (
          <li key={`${a.id}-${a.depth}`}>
            {a.name}: {formatBytes(a.value)}
          </li>
        ))}
      </ul>
      <Tooltip tip={tip.tip} />
    </div>
  )
}
