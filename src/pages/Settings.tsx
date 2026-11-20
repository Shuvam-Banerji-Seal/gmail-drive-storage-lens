// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { go } from '../router'
import { loadScanCache, saveScanCache, scanAll, signOut, switchAccount } from '../state/session'
import { restartTour } from '../components/Tour'
import { clearSettings, type Theme } from '../state/settings'
import { useApp } from '../state/store'
import { wipeAll } from '../util/cache'
import { formatBytes } from '../util/format'

const GiB = 2 ** 30

export default function Settings() {
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const granted = useApp((s) => s.granted)
  const mode = useApp((s) => s.mode)
  const toast = useApp((s) => s.toast)
  const [pass, setPass] = useState('')
  const [wipe, setWipe] = useState('')

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 900 }}>
      <h1>Settings</h1>
      <section className="card stack">
        <h2>Appearance</h2>
        <div className="tabs" role="tablist" aria-label="Theme">
          {(['dark', 'light', 'contrast'] as Theme[]).map((t) => (
            <button key={t} role="tab" aria-selected={settings.theme === t} onClick={() => setSettings({ theme: t })}>
              {t === 'dark' ? 'Observatory (dark)' : t === 'light' ? 'Paper (light)' : 'High contrast'}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Guided tour</h2>
        <p className="muted">A five-step walk through the main views.</p>
        <div>
          <button className="btn sm" onClick={() => restartTour()}>
            Restart the tour
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>Storage cap</h2>
        <p className="muted">
          Current: {settings.capBytes ? formatBytes(settings.capBytes) : 'use the limit Google reports'}. Set this if your work or school
          account has a personal cap smaller than the pooled limit.
        </p>
        <div className="row">
          {[15, 20, 30, 100, 200].map((g) => (
            <button key={g} className="btn sm" onClick={() => setSettings({ capBytes: g * GiB })}>
              {g} GB
            </button>
          ))}
          <button className="btn sm ghost" onClick={() => setSettings({ capBytes: null })}>
            Reset
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>Your Google client</h2>
        <p className="mono" style={{ wordBreak: 'break-all' }}>
          {settings.clientId || 'Not set'}
        </p>
        <div className="row">
          <button className="btn sm" onClick={() => go('setup')}>
            Change
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
              Switch Google account
            </button>
          )}
          {settings.clientId && (
            <button className="btn sm ghost" onClick={() => setSettings({ clientId: '' })}>
              Forget Client ID
            </button>
          )}
        </div>
        {granted.length > 0 && (
          <>
            <h3>Permissions granted this session</h3>
            <ul className="mono" style={{ fontSize: '0.85rem' }}>
              {granted.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            <p className="muted">
              Sign out revokes the token. You can also remove the app at{' '}
              <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">
                myaccount.google.com/connections
              </a>
              .
            </p>
          </>
        )}
      </section>

      <section className="card stack">
        <h2>Remember scans on this device (encrypted)</h2>
        <p className="muted">
          Large mailboxes take minutes to scan. Save the metadata encrypted with a passphrase only you know, then reload it next time and
          press "Refresh changes" to fetch only what changed.
        </p>
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passphrase (at least 8 characters)" autoComplete="new-password" aria-label="Passphrase" />
        <div className="row">
          <button
            className="btn sm"
            disabled={pass.length < 8 || mode === 'landing'}
            onClick={() => void saveScanCache(pass).catch((e: Error) => toast(e.message, 'bad'))}
          >
            Save current scan
          </button>
          <button
            className="btn sm"
            disabled={pass.length < 8 || mode === 'landing'}
            onClick={() => void loadScanCache(pass).catch((e: Error) => toast(e.message, 'bad'))}
          >
            Load saved scan
          </button>
        </div>
      </section>

      <section className="card stack airlock">
        <h2>Wipe everything</h2>
        <p>Signs out, revokes the token, deletes saved scans and forgets your Client ID and preferences on this device.</p>
        <div className="row">
          <input type="text" value={wipe} onChange={(e) => setWipe(e.target.value)} placeholder="WIPE" style={{ maxWidth: 160 }} aria-label="Type WIPE to confirm" />
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
            Wipe this device
          </button>
        </div>
      </section>
    </div>
  )
}
