// SPDX-License-Identifier: AGPL-3.0-or-later
// "Don't trust, verify": a live map of every request, the enforced CSP, and build provenance.
import { useMemo, useState } from 'react'
import { ALLOWED_HOSTS, isAllowedHost } from '../config/allowlist'
import { COMMIT, REPO_URL, SOURCE_URL } from '../config/site'
import { Icon } from '../components/Icon'
import { Info } from '../components/Info'
import { PageHeader, SectionHead } from '../components/PageHeader'
import { useApp } from '../state/store'
import { formatCount } from '../util/format'

type Probe = 'idle' | 'blocked' | 'allowed' | 'running'

export default function Verify() {
  const netlog = useApp((s) => s.netlog)
  const [csp] = useState<string | null>(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? null)
  const [probe, setProbe] = useState<Probe>('idle')

  const hosts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of netlog) m.set(e.host, (m.get(e.host) ?? 0) + 1)
    return m
  }, [netlog])

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

  const directives = (csp ?? '')
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const [k, ...v] = d.split(/\s+/)
      return { k: k ?? '', v }
    })

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <PageHeader
        eyebrow="Privacy · live"
        title="Verify it yourself"
        info="The app claims it sends nothing anywhere except Google's own APIs, using a client you created. This page lets you check that claim instead of trusting it."
      />

      <section className="card stack">
        <SectionHead title="Network map" info="Every request this tab made, by destination. Line width is the number of requests. The probe tries to reach a non-Google host; the browser's Content-Security-Policy should cut it.">
          <button className="btn sm" onClick={() => void runProbe()} disabled={probe === 'running'}>
            <Icon name="warn" size={15} /> Try to contact example.com
          </button>
        </SectionHead>
        <NetworkMap hosts={hosts} probe={probe} />
        <div className="row" aria-live="polite">
          {probe === 'blocked' && <span className="chip ok">Blocked by your browser. The allowlist works.</span>}
          {probe === 'allowed' && <span className="chip warn">Not blocked: development build without CSP. The published site enforces it.</span>}
          {netlog.length === 0 && <span className="muted" style={{ fontSize: '0.85rem' }}>Demo mode makes no requests at all.</span>}
        </div>
      </section>

      <div className="grid cols-2">
        <section className="card stack">
          <SectionHead title="Enforced policy" info="The Content-Security-Policy the browser is enforcing right now. connect-src is the network allowlist." />
          {csp ? (
            <div className="stack" style={{ gap: 8 }}>
              {directives.map((d) => (
                <div key={d.k} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 10 }}>
                  <code className="nowrap" style={{ color: d.k === 'connect-src' ? 'var(--accent)' : 'var(--muted)', minWidth: 120 }}>
                    {d.k}
                  </code>
                  <span className="row" style={{ gap: 4 }}>
                    {d.v.map((x) => (
                      <span key={x} className="chip" style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem' }}>
                        {x.replace(/^https:\/\//, '')}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Development build: no CSP. Production builds inject it.</div>
          )}
        </section>

        <section className="card stack">
          <SectionHead title="Build provenance" info="GitHub Actions builds and deploys the site and publishes a signed attestation, so you can check the files you received came from this commit." />
          <div className="row">
            <span className="chip">
              <Icon name="layers" size={13} /> {COMMIT === 'dev' ? 'development' : COMMIT.slice(0, 12)}
            </span>
            <a className="btn sm" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              Browse source <Icon name="external" size={14} />
            </a>
          </div>
          <pre className="card inset mono" style={{ overflowX: 'auto', margin: 0, fontSize: '0.78rem' }}>
            {`curl -sO https://shuvam-banerji-seal.github.io/gmail-drive-storage-lens/index.html
gh attestation verify index.html \\
  --repo Shuvam-Banerji-Seal/gmail-drive-storage-lens`}
          </pre>
          <div className="row muted" style={{ fontSize: '0.82rem', gap: 6 }}>
            AGPL-3.0-or-later <Info>Anyone who runs a modified copy for others must publish their changes. Only trust the official site or a build you made from the repository.</Info>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              Repository
            </a>
          </div>
        </section>
      </div>

      <section className="card stack">
        <SectionHead title="On this device" />
        <div className="grid cols-3">
          {[
            { icon: 'settings' as const, k: 'localStorage', v: 'Client ID and preferences', tip: 'The Client ID is public by design; it is not a secret.' },
            { icon: 'key' as const, k: 'Memory', v: 'Access token', tip: 'Gone when the tab closes and revoked on sign-out. Never written to disk.' },
            { icon: 'lock' as const, k: 'IndexedDB', v: 'Encrypted scan (optional)', tip: 'Only if you choose “Save scan”: AES-GCM with a key from your passphrase (PBKDF2, 310,000 rounds).' },
          ].map((x) => (
            <div key={x.k} className="kpi">
              <div className="top">
                <span className="row" style={{ gap: 6 }}>
                  <Icon name={x.icon} size={14} /> {x.k}
                </span>
                <Info>{x.tip}</Info>
              </div>
              <span style={{ fontWeight: 500 }}>{x.v}</span>
            </div>
          ))}
        </div>
      </section>

      {netlog.length > 0 && (
        <details className="card">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>All {formatCount(netlog.length)} requests</summary>
          <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto', marginTop: 12 }}>
            <table className="data" aria-label="Requests this session">
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
                {[...netlog]
                  .reverse()
                  .slice(0, 300)
                  .map((e, i) => (
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
        </details>
      )}
    </div>
  )
}

/** Browser in the centre; allowed Google hosts on the right; the probe target crossed out on the left. */
function NetworkMap({ hosts, probe }: { hosts: Map<string, number>; probe: Probe }) {
  const list = [...new Set([...ALLOWED_HOSTS, ...hosts.keys()])]
  const max = Math.max(1, ...hosts.values())
  const H = Math.max(220, list.length * 56 + 40)
  const bx = 330
  const by = H / 2
  return (
    <svg viewBox={`0 0 900 ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Requests by host: ${[...hosts].map(([h, n]) => `${h} ${n}`).join(', ') || 'none yet'}`}>
      {list.map((h, i) => {
        const y = 40 + i * ((H - 80) / Math.max(1, list.length - 1))
        const n = hosts.get(h) ?? 0
        const ok = isAllowedHost(h)
        const w = n ? 1.5 + (n / max) * 9 : 1
        return (
          <g key={h}>
            <path d={`M${bx + 70},${by} C${bx + 200},${by} ${600 - 130},${y} 600,${y}`} fill="none" stroke={ok ? (n ? 'var(--accent)' : 'var(--border-2)') : 'var(--danger)'} strokeWidth={w} strokeOpacity={n ? 0.85 : 1} strokeDasharray={n ? undefined : '3 5'} className={n ? 'flowing' : undefined} />
            <rect x="600" y={y - 18} width="280" height="36" rx="10" fill="var(--bg-2)" stroke={ok ? 'var(--border-2)' : 'var(--danger)'} />
            <circle cx="618" cy={y} r="4" fill={ok ? 'var(--ok)' : 'var(--danger)'} />
            <text x="632" y={y + 4} style={{ font: '500 12px var(--mono)', fill: 'var(--text)' }}>
              {h}
            </text>
            <text x="866" y={y + 4} textAnchor="end" style={{ font: '500 12px var(--mono)', fill: 'var(--muted)' }}>
              {n}
            </text>
          </g>
        )
      })}
      <path d={`M${bx - 70},${by} L170,${by}`} stroke={probe === 'blocked' ? 'var(--danger)' : 'var(--border-2)'} strokeWidth="2" strokeDasharray="4 5" />
      <g transform={`translate(215 ${by})`}>
        {probe === 'blocked' && (
          <>
            <circle r="13" fill="var(--danger)" />
            <path d="M-5,-5 L5,5 M5,-5 L-5,5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          </>
        )}
      </g>
      <rect x="20" y={by - 18} width="150" height="36" rx="10" fill="var(--bg-2)" stroke={probe === 'blocked' ? 'var(--danger)' : 'var(--border-2)'} strokeDasharray="4 4" />
      <text x="95" y={by + 4} textAnchor="middle" style={{ font: '500 12px var(--mono)', fill: 'var(--muted)' }}>
        example.com
      </text>
      <circle cx={bx} cy={by} r="70" fill="var(--accent-soft)" stroke="var(--accent)" />
      <text x={bx} y={by - 4} textAnchor="middle" style={{ font: '600 15px var(--font)', fill: 'var(--text)' }}>
        Your browser
      </text>
      <text x={bx} y={by + 16} textAnchor="middle" style={{ font: '500 10px var(--mono)', fill: 'var(--muted)', letterSpacing: '0.1em' }}>
        THIS TAB
      </text>
    </svg>
  )
}
