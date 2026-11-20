// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Palette helpers. SVG and HTML use CSS variable references so every theme works.
 * Canvas cannot read var(), so it resolves concrete colours at draw time via readPalette().
 */

export const SERIES_COUNT = 8

/** Categorical colour as a CSS variable reference. Wraps after 8; negative or non-finite gives the "other" colour. */
export function seriesColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) return 'var(--series-other)'
  return `var(--series-${(Math.floor(index) % SERIES_COUNT) + 1})`
}

/** Stable palette index for a string key (FNV-1a), for colouring by name rather than position. */
export function hashIndex(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) % SERIES_COUNT
}

/** Reads a CSS custom property now; falls back when there is no document (tests, SSR). */
export function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** Concrete colours for canvas drawing, resolved from the active theme. */
export interface CanvasPalette {
  text: string
  muted: string
  bg: string
  surface: string
  accent: string
  danger: string
  /** Eight categorical colours; index 8 is the "other" colour. */
  series: string[]
}

const FALLBACK_SERIES = ['#e8b552', '#7cb4ff', '#5fd6b0', '#ff8a73', '#54c6e0', '#f290bd', '#a9d46f', '#d9c294']

export function readPalette(): CanvasPalette {
  const series = FALLBACK_SERIES.map((fallback, i) => readCssVar(`--series-${i + 1}`, fallback))
  series.push(readCssVar('--series-other', '#5b6285'))
  return {
    text: readCssVar('--text', '#e9ecfb'),
    muted: readCssVar('--muted', '#98a0c4'),
    bg: readCssVar('--bg', '#080a14'),
    surface: readCssVar('--surface-2', 'rgb(255 255 255 / 0.08)'),
    accent: readCssVar('--accent', '#5ef2c1'),
    danger: readCssVar('--danger', '#ff5d73'),
    series,
  }
}

/** Resolved categorical colour for canvas use. */
export function paletteColor(palette: CanvasPalette, index: number): string {
  const other = palette.series[SERIES_COUNT] ?? '#5b6285'
  if (!Number.isFinite(index) || index < 0) return other
  return palette.series[Math.floor(index) % SERIES_COUNT] ?? other
}
