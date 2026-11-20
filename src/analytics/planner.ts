// SPDX-License-Identifier: AGPL-3.0-or-later

export interface PlanGroup {
  id: string
  label: string
  bytes: number
  /** 0..100 */
  risk: number
  blocked?: boolean
}

const priority = (g: PlanGroup): number => g.bytes / (1 + g.risk / 25)

/**
 * Greedy cleanup plan. Candidates are unblocked groups with risk <= maxRisk and positive bytes,
 * taken in priority order (bytes / (1 + risk/25) desc, then id). Stops once the target is reached.
 */
export function planBudget(
  groups: PlanGroup[],
  targetBytes: number,
  maxRisk = 60,
): { selected: string[]; bytes: number; met: boolean } {
  const ranked = groups
    .filter((g) => !g.blocked && g.risk <= maxRisk && g.bytes > 0)
    .sort((a, b) => priority(b) - priority(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const selected: string[] = []
  let bytes = 0
  for (const g of ranked) {
    if (bytes >= targetBytes) break
    selected.push(g.id)
    bytes += g.bytes
  }
  return { selected, bytes, met: bytes >= targetBytes }
}

/**
 * Storage after freeing bytes. pct is after / limit as a fraction (0 when limit is not positive).
 * over is true when after exceeds limit.
 */
export function whatIf(usage: number, limit: number, freeing: number): { after: number; pct: number; over: boolean } {
  const after = Math.max(0, usage - freeing)
  const pct = limit > 0 ? after / limit : 0
  return { after, pct, over: after > limit }
}
