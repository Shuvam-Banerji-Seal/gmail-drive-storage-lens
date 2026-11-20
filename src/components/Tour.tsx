// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useId, useRef, useState } from 'react'
import { t, type MessageKey } from '../i18n'
import { go, type Route } from '../router'
import { useApp } from '../state/store'

interface Step {
  route: Route
  title: MessageKey
  body: MessageKey
}

const STEPS: Step[] = [
  { route: 'overview', title: 'tour.overview.title', body: 'tour.overview.body' },
  { route: 'gmail', title: 'tour.gmail.title', body: 'tour.gmail.body' },
  { route: 'planner', title: 'tour.planner.title', body: 'tour.planner.body' },
  { route: 'cleanup', title: 'tour.airlock.title', body: 'tour.airlock.body' },
  { route: 'verify', title: 'tour.verify.title', body: 'tour.verify.body' },
]

/** Clears the first-run flag so the guided tour shows again on the next view. */
// oxlint-disable-next-line react/only-export-components -- the restart helper lives beside the tour it controls.
export function restartTour(): void {
  useApp.getState().setSettings({ tourDone: false })
}

/**
 * First-run guided tour: a small non-modal card that walks through the main views. It appears only in
 * demo or connected mode and only until the user finishes or skips it. Next and Back move between views.
 */
export function Tour() {
  const mode = useApp((s) => s.mode)
  const done = useApp((s) => s.settings.tourDone)
  const setSettings = useApp((s) => s.setSettings)
  const [step, setStep] = useState(0)
  const cardRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const active = (mode === 'demo' || mode === 'live') && !done

  const finish = () => {
    setStep(0)
    setSettings({ tourDone: true })
  }

  useEffect(() => {
    if (!active) return
    cardRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // finish is stable in behaviour (reads setSettings from the store), so only `active` matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  if (!active) return null
  const current = STEPS[step] ?? STEPS[0]!
  const last = step === STEPS.length - 1

  const move = (to: number) => {
    const target = STEPS[to]
    if (!target) return
    setStep(to)
    go(target.route)
  }

  return (
    <section ref={cardRef} className="tour card" role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1}>
      <p className="tour-eyebrow muted mono">
        {t('tour.label')} · {t('tour.step', { current: step + 1, total: STEPS.length })}
      </p>
      <h2 id={titleId}>{t(current.title)}</h2>
      <p>{t(current.body)}</p>
      <div className="row between tour-actions">
        <button type="button" className="btn sm ghost" onClick={finish}>
          {t('common.skip')}
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn sm" onClick={() => move(step - 1)} disabled={step === 0}>
            {t('common.back')}
          </button>
          {last ? (
            <button type="button" className="btn sm primary" onClick={finish}>
              {t('common.finish')}
            </button>
          ) : (
            <button type="button" className="btn sm primary" onClick={() => move(step + 1)}>
              {t('common.next')}
            </button>
          )}
        </div>
      </div>
      <p className="muted tour-esc">{t('tour.escHint')}</p>
    </section>
  )
}
