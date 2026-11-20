// SPDX-License-Identifier: AGPL-3.0-or-later
import { UMAP } from 'umap-js'

/** Small deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a 32-bit hash of a string. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const TOKEN = /[\p{L}\p{N}]+/gu

/**
 * Hashed tf-idf bag of words. Each token falls into one of `dims` buckets; bucket weights
 * use sublinear tf and smoothed idf computed over the input texts, then each row is L2-normalised.
 * Rows with no tokens are all zeros.
 */
export function hashVectors(texts: string[], dims = 128): number[][] {
  const n = texts.length
  const tfs: Array<Map<number, number>> = texts.map((t) => {
    const tf = new Map<number, number>()
    for (const tok of t.toLowerCase().match(TOKEN) ?? []) {
      const b = fnv1a(tok) % dims
      tf.set(b, (tf.get(b) ?? 0) + 1)
    }
    return tf
  })
  const df = new Array<number>(dims).fill(0)
  for (const tf of tfs) for (const b of tf.keys()) df[b]! += 1

  return tfs.map((tf) => {
    const row = new Array<number>(dims).fill(0)
    let norm = 0
    for (const [b, c] of tf) {
      const w = (1 + Math.log(c)) * (Math.log((1 + n) / (1 + df[b]!)) + 1)
      row[b] = w
      norm += w * w
    }
    if (norm > 0) {
      const inv = 1 / Math.sqrt(norm)
      for (let i = 0; i < dims; i++) row[i]! *= inv
    }
    return row
  })
}

/**
 * 2-D layout of texts, each axis scaled to [0, 1]. Fewer than 8 texts are placed on a circle
 * (UMAP needs a neighbourhood); otherwise UMAP runs on hashVectors with a seeded PRNG, so the
 * same input and seed always give the same layout.
 */
export function embed2d(texts: string[], seed = 42): Array<[number, number]> {
  const n = texts.length
  if (n === 0) return []
  if (n === 1) return [[0.5, 0.5]]
  if (n < 8) {
    return texts.map((_, i) => {
      const a = (2 * Math.PI * i) / n
      return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]
    })
  }

  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(15, n - 1),
    minDist: 0.1,
    random: mulberry32(seed),
  })
  const raw = umap.fit(hashVectors(texts))

  const lo = [Infinity, Infinity]
  const hi = [-Infinity, -Infinity]
  for (const p of raw) {
    for (let k = 0; k < 2; k++) {
      const v = p[k]
      if (v !== undefined && Number.isFinite(v)) {
        lo[k] = Math.min(lo[k]!, v)
        hi[k] = Math.max(hi[k]!, v)
      }
    }
  }
  const scale = (v: number | undefined, k: number): number => {
    const span = hi[k]! - lo[k]!
    if (v === undefined || !Number.isFinite(v) || !Number.isFinite(span) || span <= 0) return 0.5
    return (v - lo[k]!) / span
  }
  return raw.map((p) => [scale(p[0], 0), scale(p[1], 1)] as [number, number])
}
