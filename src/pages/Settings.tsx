// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { restartTour } from '../components/Tour'
import { Icon } from '../components/Icon'
import { PageHeader, SectionHead } from '../components/PageHeader'
import { go } from '../router'
import { loadScanCache, saveScanCache, scanAll, signOut, switchAccount } from '../state/session'
import { clearSettings, type Theme } from '../state/settings'
import { useApp } from '../state/store'
import { wipeAll } from '../util/cache'
import { formatBytes } from '../util/format'

const GiB = 2 ** 30
/** Static previews so each swatch shows its own colours regardless of the active theme. */
const SWATCHES: Array<{ id: Theme; name: string; bg: string; card: string; a: string; b: string; c: string }> = [
  { id: 'auto', name: 'Auto (system)', bg: 'linear-gradient(90deg, #0a0e19 50%, #f3eee3 50%)', card: 'transparent', a: '#e8b552', b: '#96600f', c: '#7cb4ff' },
  { id: 'dark', name: 'Atlas', bg: '#0a0e19', card: '#131a2e', a: '#e8b552', b: '#7cb4ff', c: '#5fd6b0' },
  { id: 'graphite', name: 'Graphite', bg: '#111213', card: '#1e2022', a: '#3fd0b5', b: '#6aa8ff', c: '#f0c05a' },
  { id: 'light', name: 'Paper', bg: '#f3eee3', card: '#fffdf7', a: '#96600f', b: '#2f6fbf', c: '#1d8a66' },
  { id: 'contrast', name: 'High contrast', bg: '#000', card: '#141414', a: '#ffd400', b: '#7fd1ff', c: '#3dffb5' },
]

export default function Settings() {
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const granted = useApp((s) => s.granted)
  const mode = useApp((s) => s.mode)
  const toast = useApp((s) => s.toast)
  const [pass, setPass] = useState('')
  const [wipe, setWipe] = useState('')

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageHeader eyebrow="Settings" title="Settings" />

      <section className="card stack">
        <SectionHead title="Theme" info="Every theme meets WCAG AA contrast. Auto follows your system's light or dark preference." />
        <div className="swatches" role="group" aria-label="Theme">
          {SWATCHES.map((t) => (
            <button key={t.id} type="button" className="swatch" aria-pressed={settings.theme === t.id} onClick={() => setSettings({ theme: t.id })}>
              <span className="preview" style={{ background: t.bg }} aria-hidden="true">
                <i style={{ background: t.a }} />
                <i style={{ background: t.b }} />
                <i style={{ background: t.c }} />
              </span>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid cols-2">
        <section className="card stack">
          <SectionHead title="Storage cap" info="Set this if your work or school account has a personal cap smaller than the pooled limit Google reports.">
            <span className="chip">{settings.capBytes ? formatBytes(settings.capBytes) : 'From Google'}</span>
          </SectionHead>
          <div className="tabs" role="group" aria-label="Cap presets">
            {[15, 20, 30, 100, 200].map((g) => (
              <button key={g} type="button" aria-selected={settings.capBytes === g * GiB} onClick={() => setSettings({ capBytes: g * GiB })}>
                {g} GB
              </button>
            ))}
            <button type="button" aria-selected={!settings.capBytes} onClick={() => setSettings({ capBytes: null })}>
              Auto
            </button>
          </div>
        </section>

        <section className="card stack">
          <SectionHead title="Guided tour" info="A five-step walk through the main views." />
          <div>
            <button className="btn sm" onClick={() => restartTour()}>
              <Icon name="play" size={14} /> Restart tour
            </button>
          </div>
        </section>
      </div>

      <section className="card stack">
        <SectionHead title="Your Google client" info="The Client ID is public by design. Sign-out revokes the access token; you can also remove the app at myaccount.google.com/connections." />
        <code className="card inset" style={{ wordBreak: 'break-all', padding: 12 }}>
          {settings.clientId || 'Not set'}
        </code>
        <div className="row">
          <button className="btn sm" onClick={() => go('setup')}>
            <Icon name="key" size={14} /> Change
          </button>
          {mode === 'live' && (
            <button
              className="btn sm"
              onClick={() => {
                void switchAccount().then((ok) => {
                  if (ok) {
                    go('overview')
                    void scanAll()
                  }
                })
              }}
            >
              <Icon name="user" size={14} /> Switch Google account
            </button>
          )}
          {settings.clientId && (
            <button className="btn sm ghost" onClick={() => setSettings({ clientId: '' })}>
              Forget Client ID
            </button>
          )}
        </div>
        {granted.length > 0 && (
          <div className="row" style={{ gap: 6 }}>
            {granted.map((g) => (
              <span key={g} className="chip" style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem' }}>
                {g.replace('https://www.googleapis.com/auth/', '').replace('https://', '')}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="card stack">
        <SectionHead title="Encrypted scan cache" info="Large mailboxes take minutes to scan. Save the metadata on this device, encrypted with a passphrase only you know (AES-GCM, PBKDF2 310,000 rounds), then reload it and sync only the changes." />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passphrase (8+ characters)" autoComplete="new-password" aria-label="Passphrase" style={{ maxWidth: 320 }} />
          <button className="btn sm" disabled={pass.length < 8 || mode === 'landing'} onClick={() => void saveScanCache(pass).catch((e: Error) => toast(e.message, 'bad'))}>
            <Icon name="lock" size={14} /> Save scan
          </button>
          <button className="btn sm" disabled={pass.length < 8 || mode === 'landing'} onClick={() => void loadScanCache(pass).catch((e: Error) => toast(e.message, 'bad'))}>
            <Icon name="download" size={14} /> Load scan
          </button>
        </div>
      </section>

      <section className="card stack airlock">
        <SectionHead title="Wipe this device" info="Signs out, revokes the token, deletes saved scans and forgets your Client ID and preferences." />
        <div className="row">
          <input type="text" value={wipe} onChange={(e) => setWipe(e.target.value)} placeholder="Type WIPE" style={{ maxWidth: 180 }} aria-label="Type WIPE to confirm" />
          <button
            className="btn danger"
            disabled={wipe !== 'WIPE'}
            onClick={() => {
              void (async () => {
                await signOut()
                await wipeAll()
                clearSettings()
                setSettings({ clientId: '', capBytes: null })
                setWipe('')
                toast('All local data removed.')
                go('home')
              })()
            }}
          >
            <Icon name="trash" size={15} /> Wipe
          </button>
        </div>
      </section>
    </div>
  )
}
