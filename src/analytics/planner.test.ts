// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { planBudget, whatIf, type PlanGroup } from './planner'

// Priorities: C = 200, A = 100, B = 300 / (1 + 2) = 100 (ties with A, so id order puts A first).
// D is blocked, E (risk 80) is over the default risk cap of 60.
const groups: PlanGroup[] = [
  { id: 'A', label: 'Alpha', bytes: 100, risk: 0 },
  { id: 'B', label: 'Beta', bytes: 300, risk: 50 },
  { id: 'C', label: 'Gamma', bytes: 200, risk: 0 },
  { id: 'D', label: 'Delta', bytes: 1000, risk: 0, blocked: true },
  { id: 'E', label: 'Epsilon', bytes: 500, risk: 80 },
]

describe('planBudget', () => {
  it('meets the target greedily and stops as soon as it is reached', () => {
    expect(planBudget(groups, 250)).toEqual({ selected: ['C', 'A'], bytes: 300, met: true })
  })
  it('adds more groups when the first ones do not reach the target', () => {
    expect(planBudget(groups, 350)).toEqual({ selected: ['C', 'A', 'B'], bytes: 600, met: true })
  })
  it('reports not met and selects every eligible group when the target is unreachable', () => {
    expect(planBudget(groups, 10_000)).toEqual({ selected: ['C', 'A', 'B'], bytes: 600, met: false })
  })
  it('excludes groups above maxRisk', () => {
    expect(planBudget(groups, 10_000, 40)).toEqual({ selected: ['C', 'A'], bytes: 300, met: false })
  })
  it('never selects blocked groups', () => {
    expect(planBudget(groups, 10_000).selected).not.toContain('D')
  })
  it('is met immediately for a zero target', () => {
    expect(planBudget(groups, 0)).toEqual({ selected: [], bytes: 0, met: true })
  })
  it('handles an empty group list', () => {
    expect(planBudget([], 1)).toEqual({ selected: [], bytes: 0, met: false })
  })
  it('breaks priority ties by id', () => {
    const tie: PlanGroup[] = [
      { id: 'z', label: 'z', bytes: 100, risk: 0 },
      { id: 'a', label: 'a', bytes: 100, risk: 0 },
    ]
    expect(planBudget(tie, 100).selected).toEqual(['a'])
  })
})

describe('whatIf', () => {
  it('computes storage after freeing space', () => {
    const r = whatIf(800, 1000, 300)
    expect(r.after).toBe(500)
    expect(r.pct).toBeCloseTo(0.5, 10)
    expect(r.over).toBe(false)
  })
  it('reports over when usage still exceeds the limit', () => {
    expect(whatIf(1200, 1000, 100)).toEqual({ after: 1100, pct: 1.1, over: true })
  })
  it('clamps after at zero when freeing more than is used', () => {
    expect(whatIf(100, 1000, 500)).toEqual({ after: 0, pct: 0, over: false })
  })
  it('does not divide by a non-positive limit', () => {
    expect(whatIf(50, 0, 0)).toEqual({ after: 50, pct: 0, over: true })
  })
})
