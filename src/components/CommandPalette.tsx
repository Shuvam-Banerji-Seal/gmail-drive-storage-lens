// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useRef, useState } from 'react'
import { go, type Route } from '../router'
import { useApp } from '../state/store'
import { restartTour } from './Tour'

interface Cmd {
  id: string
  label: string
  hint?: string
  run: () => void
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const setSettings = useApp((s) => s.setSettings)
  const theme = useApp((s) => s.settings.theme)

  const cmds = useMemo<Cmd[]>(() => {
    const nav = (r: Route, label: string, tab?: string): Cmd => ({ id: `${r}/${tab ?? ''}`, label, hint: 'Go', run: () => go(r, tab) })
    return [
      nav('overview', 'Overview: storage orbit'),
      nav('gmail', 'Gmail: top senders', 'senders'),
      nav('gmail', 'Gmail: constellation graph', 'constellation'),
      nav('gmail', 'Gmail: rivers (Sankey)', 'rivers'),
      nav('gmail', 'Gmail: tides over time', 'tides'),
      nav('gmail', 'Gmail: mailfall calendar', 'mailfall'),
      nav('gmail', 'Gmail: subject nebula', 'nebula'),
      nav('gmail', 'Gmail: repeated attachments', 'repeats'),
      nav('gmail', 'Gmail: attachments (deep scan)', 'attachments'),
      nav('gmail', 'Gmail: time machine', 'tides'),
      nav('gmail', 'Gmail: unsubscribe radar', 'unsubscribe'),
      nav('drive', 'Drive: folder continents', 'continents'),
      nav('drive', 'Drive: twins (duplicates)', 'twins'),
      nav('drive', 'Drive: ghost weight (old versions)', 'ghosts'),
      nav('drive', 'Drive: cold files', 'cold'),
      nav('drive', 'Drive: public links audit', 'public'),
      nav('drive', 'Drive: sharing graph', 'sharing'),
      nav('planner', 'Budget planner'),
      nav('insights', 'Insights: domain chords'),
      nav('cleanup', 'Airlock: review & clean'),
      nav('verify', 'Verify privacy: network log & CSP'),
      nav('settings', 'Settings'),
      {
        id: 'tour',
        label: 'Restart the guided tour',
        run: () => {
          restartTour()
          go('overview')
        },
      },
      nav('setup', 'Connect your own Google client'),
      {
        id: 'theme',
        label: `Theme: switch (now ${theme})`,
        run: () => setSettings({ theme: theme === 'dark' ? 'light' : theme === 'light' ? 'contrast' : 'dark' }),
      },
    ]
  }, [theme, setSettings])

  const list = cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setQ('')
        setIdx(0)
      } else if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  if (!open) return null
  const run = (c?: Cmd) => {
    if (!c) return
    c.run()
    setOpen(false)
  }
  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette card" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          type="search"
          placeholder="Jump to a view or action…"
          value={q}
          aria-label="Search commands"
          onChange={(e) => {
            setQ(e.target.value)
            setIdx(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIdx((i) => Math.min(list.length - 1, i + 1))
            else if (e.key === 'ArrowUp') setIdx((i) => Math.max(0, i - 1))
            else if (e.key === 'Enter') run(list[idx])
          }}
        />
        <ul role="listbox" aria-label="Commands">
          {list.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === idx}
              className={i === idx ? 'active' : ''}
              onMouseEnter={() => setIdx(i)}
              onClick={() => run(c)}
            >
              <span>{c.label}</span>
              {c.hint && <kbd>{c.hint}</kbd>}
            </li>
          ))}
          {list.length === 0 && <li className="muted">No matches</li>}
        </ul>
      </div>
    </div>
  )
}
