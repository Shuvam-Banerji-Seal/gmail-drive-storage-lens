// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { embed2d, hashVectors, mulberry32 } from './embed'

const texts = Array.from({ length: 20 }, (_, i) =>
  i % 2 === 0 ? `weekly newsletter issue ${i} from club news` : `invoice ${i} payment receipt for account ${i}`,
)

describe('hashVectors', () => {
  it('is deterministic with the requested dimensions', () => {
    const a = hashVectors(['alpha beta', 'beta gamma'], 16)
    expect(a).toEqual(hashVectors(['alpha beta', 'beta gamma'], 16))
    expect(a.every((r) => r.length === 16)).toBe(true)
  })
  it('L2-normalises non-empty rows and leaves empty rows zero', () => {
    const [v, empty] = hashVectors(['hello world hello', '!!! ???'], 64)
    const norm = Math.sqrt(v!.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 10)
    expect(empty!.every((x) => x === 0)).toBe(true)
  })
  it('matches tokens case-insensitively', () => {
    expect(hashVectors(['Invoice'], 32)).toEqual(hashVectors(['invoice'], 32))
  })
})

describe('mulberry32', () => {
  it('is deterministic and in [0,1)', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    const xs = Array.from({ length: 100 }, () => a())
    expect(xs).toEqual(Array.from({ length: 100 }, () => b()))
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
  })
})

describe('embed2d', () => {
  it('returns an empty array for no texts', () => {
    expect(embed2d([])).toEqual([])
  })
  it('places fewer than 8 texts on a circle inside [0,1]', () => {
    const pts = embed2d(['a', 'b', 'c'])
    expect(pts).toHaveLength(3)
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
    expect(embed2d(['solo'])).toEqual([[0.5, 0.5]])
  })
  it('is deterministic for the same seed', () => {
    expect(embed2d(texts, 42)).toEqual(embed2d(texts, 42))
  })
  it('keeps every coordinate within [0,1] for UMAP layouts', () => {
    const pts = embed2d(texts, 42)
    expect(pts).toHaveLength(texts.length)
    for (const [x, y] of pts) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
  })
})
