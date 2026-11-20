// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPortal } from 'react-dom'
import type { TipState } from './hooks'
import './charts.css'

/** Portalled to <body> so card blur or transforms cannot clip the tip. */
export function Tooltip({ tip }: { tip: TipState | null }) {
  if (!tip || typeof document === 'undefined') return null
  const flipX = tip.x > window.innerWidth - 300
  const flipY = tip.y > window.innerHeight - 120
  const transform = [flipX ? 'translateX(-100%)' : '', flipY ? 'translateY(-100%)' : ''].join(' ').trim() || undefined
  return createPortal(
    <div
      className="chart-tip"
      role="tooltip"
      style={{
        left: flipX ? tip.x - 14 : tip.x + 14,
        top: flipY ? tip.y - 14 : tip.y + 14,
        transform,
      }}
    >
      {tip.content}
    </div>,
    document.body,
  )
}
