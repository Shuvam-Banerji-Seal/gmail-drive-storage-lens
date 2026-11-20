// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TreeNode } from '../types'

/**
 * Walks `trail` (child ids below `root`) and returns the chain [root, ..., deepest valid node].
 * Stops at the first unknown id, so a stale trail after the data changes degrades gracefully.
 */
export function resolveTrail(root: TreeNode, trail: readonly string[]): TreeNode[] {
  const chain: TreeNode[] = [root]
  let cur = root
  for (const id of trail) {
    const next = cur.children?.find((c) => c.id === id)
    if (!next) break
    chain.push(next)
    cur = next
  }
  return chain
}

/** Share of `whole` that `part` represents, 0 when whole is empty. */
export function shareOf(part: number, whole: number): number {
  return whole > 0 && Number.isFinite(part) ? Math.min(1, Math.max(0, part / whole)) : 0
}

/** Shortens text to roughly `maxChars` characters with an ellipsis. */
export function truncateLabel(text: string, maxChars: number): string {
  if (maxChars <= 0) return ''
  if (text.length <= maxChars) return text
  if (maxChars <= 1) return text.slice(0, maxChars)
  return `${text.slice(0, maxChars - 1)}…`
}
