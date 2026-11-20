// SPDX-License-Identifier: AGPL-3.0-or-later
// Decorative, slow-drifting starfield. Hidden for reduced-motion users (see global.css).
import { useEffect, useRef } from 'react'

export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext?.('2d')
    if (!c || !ctx) return
    let raf = 0
    let w = 0
    let h = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let seed = 1337
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const stars = Array.from({ length: 160 }, () => ({ x: rnd(), y: rnd(), r: rnd() * 1.2 + 0.2, t: rnd() * Math.PI * 2, s: 0.2 + rnd() * 0.8 }))
    const resize = () => {
      w = c.width = window.innerWidth * dpr
      h = c.height = window.innerHeight * dpr
    }
    resize()
    window.addEventListener('resize', resize)
    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h)
      const col = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#fff'
      ctx.fillStyle = col
      for (const s of stars) {
        const a = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(s.t + time * 0.0006 * s.s))
        ctx.globalAlpha = a
        ctx.beginPath()
        ctx.arc(((s.x + time * 0.000004 * s.s) % 1) * w, s.y * h, s.r * dpr, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])
  return <canvas ref={ref} className="starfield" aria-hidden="true" />
}
