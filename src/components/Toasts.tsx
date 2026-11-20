// SPDX-License-Identifier: AGPL-3.0-or-later
import { useApp } from '../state/store'
import { Icon } from './Icon'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <span className="ico" aria-hidden="true">
            <Icon name={t.tone === 'ok' ? 'check' : 'warn'} size={14} strokeWidth={2.4} />
          </span>
          <span>{t.text}</span>
          {t.undo && (
            <button
              className="btn sm"
              onClick={() => {
                t.undo?.()
                dismiss(t.id)
              }}
            >
              Undo
            </button>
          )}
          <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
