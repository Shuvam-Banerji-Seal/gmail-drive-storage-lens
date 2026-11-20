// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from 'd3-hierarchy'
import type { TreeNode } from '../types'
import { formatBytes, formatPct } from '../util/format'
import { seriesColor } from './colors'
import { useElementWidth, useTooltip } from './hooks'
import { resolveTrail, shareOf, truncateLabel } from './tree'
import { Tooltip } from './Tooltip'
import './charts.css'

export interface TreemapProps {
  root: TreeNode
  onSelect?: (n: TreeNode) => void
  height?: number
}

const LABEL_MIN_W = 70
const LABEL_MIN_H = 26
const SIZE_MIN_H = 44

/**
 * Squarified layout of the direct children of `node`, sized by their leaf totals.
 * `total` is the computed sum of all leaves below `node`, the denominator for shares.
 */
function layoutTiles(
  node: TreeNode,
  width: number,
  height: number,
): { tiles: Array<HierarchyRectangularNode<TreeNode>>; total: number } {
  const h = hierarchy<TreeNode>(node)
    .sum((d) => (d.children?.length ? 0 : Math.max(0, Number.isFinite(d.value) ? d.value : 0)))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const total = h.value ?? 0
  const laid = treemap<TreeNode>().tile(treemapSquarify).size([width, height]).paddingInner(2).round(true)(h)
  const tiles = (laid.children ?? []).filter((t) => t.x1 - t.x0 > 0 && t.y1 - t.y0 > 0 && (t.value ?? 0) > 0)
  return { tiles, total }
}

/**
 * Zoomable treemap ("continents"). Click or press Enter on a folder to drill in;
 * the breadcrumb climbs back out. Tiles are coloured by top-level branch.
 */
export function Treemap({ root, onSelect, height = 360 }: TreemapProps) {
  const [trail, setTrail] = useState<string[]>([])
  const [ref, width] = useElementWidth<HTMLDivElement>(720)
  const tip = useTooltip()

  const chain = resolveTrail(root, trail)
  const current = chain[chain.length - 1] ?? root
  const { tiles, total } = layoutTiles(current, width, height)
  const siblings = current.children ?? []

  const activate = (n: TreeNode) => {
    onSelect?.(n)
    if (n.children?.length) setTrail((t) => [...t, n.id])
  }

  return (
    <div className="tm" ref={ref}>
      <nav className="tm-crumbs" aria-label="Folder path">
        {chain.map((n, i) =>
          i === chain.length - 1 ? (
            <span key={`${n.id}-${i}`} className="tm-crumb is-current" aria-current="location">
              {n.name}
            </span>
          ) : (
            <span key={`${n.id}-${i}`} className="tm-crumb-wrap">
              <button
                type="button"
                className="tm-crumb"
                onClick={() => setTrail(chain.slice(1, i + 1).map((c) => c.id))}
              >
                {n.name}
              </button>
              <span aria-hidden="true" className="tm-sep">
                /
              </span>
            </span>
          ),
        )}
        <span className="muted tm-total">{formatBytes(total)}</span>
      </nav>

      {tiles.length === 0 ? (
        <p className="muted tm-empty">Nothing to show in this folder.</p>
      ) : (
        <svg
          className="tm-svg"
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="group"
          aria-label={`Treemap of ${current.name}`}
        >
          {tiles.map((t) => {
            const data = t.data
            const value = t.value ?? 0
            const w = t.x1 - t.x0
            const h = t.y1 - t.y0
            const idx = Math.max(0, siblings.indexOf(data))
            const share = shareOf(value, total)
            const drillable = !!data.children?.length
            const label = `${data.name}, ${formatBytes(value)}, ${formatPct(share)} of ${current.name}${drillable ? ', folder' : ''}`
            const tipContent = (
              <>
                <strong>{data.name}</strong>
                <br />
                {formatBytes(value)} · {formatPct(share, 1)} of {current.name}
                {drillable ? <div className="muted">Click to open</div> : null}
              </>
            )
            const showLabel = w > LABEL_MIN_W && h > LABEL_MIN_H
            const maxChars = Math.floor((w - 14) / 7)
            return (
              <g
                key={data.id}
                className={`tm-tile${drillable ? ' is-drillable' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={label}
                onClick={() => activate(data)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    activate(data)
                  }
                }}
                onPointerMove={(e) => tip.show(e.clientX, e.clientY, tipContent)}
                onPointerLeave={tip.hide}
                onFocus={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  tip.show(r.left + r.width / 2, r.top + r.height / 2, tipContent)
                }}
                onBlur={tip.hide}
              >
                <rect
                  className="tm-rect"
                  x={t.x0 + 1}
                  y={t.y0 + 1}
                  width={Math.max(0, w - 2)}
                  height={Math.max(0, h - 2)}
                  rx={6}
                  style={{ fill: seriesColor(idx) }}
                />
                {showLabel && (
                  <text className="tm-label" x={t.x0 + 8} y={t.y0 + 18} aria-hidden="true">
                    {truncateLabel(data.name, maxChars)}
                  </text>
                )}
                {showLabel && h > SIZE_MIN_H && (
                  <text className="tm-size" x={t.x0 + 8} y={t.y0 + 34} aria-hidden="true">
                    {formatBytes(value)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}

      <ul className="sr-only">
        {tiles.map((t) => (
          <li key={t.data.id}>
            {t.data.name}: {formatBytes(t.value ?? 0)}
          </li>
        ))}
      </ul>
      <Tooltip tip={tip.tip} />
    </div>
  )
}
