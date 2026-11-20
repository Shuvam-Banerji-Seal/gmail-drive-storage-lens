// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/**
 * Tracks an element's content width. Uses ResizeObserver when present, a window resize listener otherwise,
 * and keeps `fallback` when the element reports no width (jsdom, hidden containers).
 */
export function useElementWidth<T extends HTMLElement>(fallback: number): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = (w: number) => {
      if (Number.isFinite(w) && w > 0) setWidth(Math.floor(w))
    }
    apply(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => apply(el.clientWidth)
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }
    const ro = new ResizeObserver((entries) => apply(entries[0]?.contentRect.width ?? 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** Bumps whenever the theme attribute or the OS colour scheme changes, so canvas painters can repaint. */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return
    const bump = () => setVersion((v) => v + 1)
    const observer = new MutationObserver(bump)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })
    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null
    mq?.addEventListener?.('change', bump)
    return () => {
      observer.disconnect()
      mq?.removeEventListener?.('change', bump)
    }
  }, [])
  return version
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])
  return reduced
}

/** requestAnimationFrame with a timer fallback for environments that lack it. */
export function requestFrame(cb: () => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(() => cb())
  return setTimeout(cb, 16) as unknown as number
}

export function cancelFrame(id: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id)
  else clearTimeout(id)
}

export interface TipState {
  x: number
  y: number
  content: ReactNode
}

/**
 * Shared hover-tooltip state. Call show(clientX, clientY, content) from pointer handlers and render
 * <Tooltip tip={tip} /> once per chart.
 */
export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null)
  const show = useCallback((x: number, y: number, content: ReactNode) => setTip({ x, y, content }), [])
  const hide = useCallback(() => setTip(null), [])
  return { tip, show, hide }
}
