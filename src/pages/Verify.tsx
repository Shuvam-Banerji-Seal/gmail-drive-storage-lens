// SPDX-License-Identifier: AGPL-3.0-or-later
// "Don't trust, verify": shows the live CSP, the build commit and every request this session made.
import { useState } from 'react'
import { isAllowedHost } from '../config/allowlist'
import { COMMIT, REPO_URL, SOURCE_URL } from '../config/site'
import { useApp } from '../state/store'

export default function Verify() {
  const netlog = useApp((s) => s.netlog)
  const [csp] = useState<string | null>(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? null)
  const [probe, setProbe] = useState<'idle' | 'blocked' | 'allowed' | 'running'>('idle')

  const hosts = new Map<string, number>()
  for (const e of netlog) hosts.set(e.host, (hosts.get(e.host) ?? 0) + 1)

  const runProbe = async () => {
    setProbe('running')
    let violated = false
    const onViolation = () => {
      violated = true
    }
    document.addEventListener('securitypolicyviolation', onViolation)
    try {
      await fetch('https://example.com/storage-lens-probe', { mode: 'no-cors' })
      setProbe(violated ? 'blocked' : 'allowed')
    } catch {
      setProbe('blocked')
    } finally {
      setTimeout(() => document.removeEventListener('securitypolicyviolation', onViolation), 100)
    }
  }

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 1000 }}>
      <header>
        <h1>Verify it yourself</h1>
        <p className="muted">
          The app claims it sends nothing anywhere except to Google's own APIs, using a client you created. Here is how to check that
          claim instead of trusting it.
        </p>
      </header>

      <section className="card stack">
        <h2>1. The browser enforces a network allowlist</h2>
        <p>
          A Content-Security-Policy tells your browser to refuse connections to every host except Google's API and sign-in servers.
          Try to break it:
        </p>
        <div className="row">
          <button className="btn" onClick={() => void runProbe()} disabled={probe === 'running'}>
            Try to contact example.com
          </button>
          {probe === 'blocked' && <span className="chip ok">Blocked by your browser. The allowlist works.</span>}
          {probe === 'allowed' && (
            <span className="chip warn">
              Not blocked. You are probably running a development build, which has no CSP; the published site does.
            </span>
          )}
        </div>
        {csp ? (
          <ul className="mono" style={{ fontSize: '0.85rem' }}>
            {csp.split(';').map((d) => (
              <li key={d}>{d.trim()}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No CSP meta tag found: this is a development build. Production builds inject it automatically.</p>
        )}
      </section>

      <section className="card stack">
        <h2>2. Every request this session</h2>
        {netlog.length === 0 ? (
          <p className="muted">No requests yet. Demo mode never touches the network.</p>
        ) : (
          <>
            <div className="row">
              {[...hosts].map(([h, n]) => (
                <span key={h} className={`chip ${isAllowedHost(h) ? 'ok' : 'bad'}`}>
                  {h} · {n}
                </span>
              ))}
            </div>
            <div style={{ maxHeight: 360, overflow: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Method</th>
                    <th scope="col">Host</th>
                    <th scope="col">Path</th>
                    <th scope="col">Status</th>
                    <th scope="col">ms</th>
                  </tr>
                </thead>
                <tbody>
                  {[...netlog].reverse().slice(0, 300).map((e, i) => (
                    <tr key={i}>
                      <td className="mono-num">{new Date(e.at).toLocaleTimeString()}</td>
                      <td>{e.method}</td>
                      <td>{e.host}</td>
                      <td className="mono">{e.path}</td>
                      <td className="mono-num">{e.status}</td>
                      <td className="mono-num">{e.ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="muted">
          This log covers API calls made by the app. For the full picture, open your browser's DevTools → Network tab: you will only
          see this site's own files and Google domains.
        </p>
      </section>

      <section className="card stack">
        <h2>3. The code you are running is public</h2>
        <p>
          Build: <code>{COMMIT}</code> ·{' '}
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
            browse this exact source
          </a>
        </p>
        <p>
          The site is built and deployed only by GitHub Actions, which publishes a signed build-provenance attestation. With the GitHub
          CLI you can check that the files you downloaded were produced from that commit:
        </p>
        <pre className="card flat mono" style={{ overflowX: 'auto' }}>
          {`curl -sO https://shuvam-banerji-seal.github.io/gmail-drive-storage-lens/index.html
gh attestation verify index.html --repo Shuvam-Banerji-Seal/gmail-drive-storage-lens`}
        </pre>
        <p className="muted">
          Licensed under AGPL-3.0-or-later: anyone who runs a modified copy for others must publish their changes. Only trust the official
          site or a copy you built yourself from <a href={REPO_URL}>the repository</a>.
        </p>
      </section>

      <section className="card stack">
        <h2>4. What is stored on this device</h2>
        <ul>
          <li>
            <code>localStorage</code>: your Client ID (public, not a secret), theme and preferences.
          </li>
          <li>
            Access tokens: in memory only, gone when you close the tab, revoked when you sign out.
          </li>
          <li>
            IndexedDB: only if you choose "Save scan" in Settings, encrypted with your passphrase (AES-GCM, PBKDF2 310,000 rounds).
          </li>
        </ul>
      </section>
    </div>
  )
}
