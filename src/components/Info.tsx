// SPDX-License-Identifier: AGPL-3.0-or-later
// Small "i" button: details appear on hover, keyboard focus or tap, so pages stay short.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

export function Info({ children, label = 'More information' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const above = r.top > 180
    const left = Math.min(Math.max(12, r.left + r.width / 2 - 160), window.innerWidth - 332)
    setPos({ left: Math.max(12, left), top: above ? r.top - 10 : r.bottom + 10, above })
  }, [])

  const show = () => {
    place()
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="info"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
      >
        <Icon name="info" size={16} />
      </button>
      {open && pos && (
        <div id={id} role="tooltip" className="pop" style={{ left: pos.left, top: pos.top, transform: pos.above ? 'translateY(-100%)' : undefined }}>
          {children}
        </div>
      )}
    </>
  )
}
