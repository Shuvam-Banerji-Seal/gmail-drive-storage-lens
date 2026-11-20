// SPDX-License-Identifier: AGPL-3.0-or-later
import { useApp } from '../state/store'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
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
          <button className="btn sm ghost" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
