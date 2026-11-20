// SPDX-License-Identifier: AGPL-3.0-or-later
// Guided "bring your own OAuth client" wizard. The project ships no client ID of its own.
import { useEffect, useState } from 'react'
import { extractClientId, isRegistrableOrigin, isValidClientId } from '../auth/gis'
import { Icon, type IconName } from '../components/Icon'
import { Info } from '../components/Info'
import { PageHeader } from '../components/PageHeader'
import { SITE_URL } from '../config/site'
import { go, useRoute } from '../router'
import { connect, preloadSignIn, scanAll, type ConnectCheck } from '../state/session'
import { useApp } from '../state/store'

const LINKS = {
  project: 'https://console.cloud.google.com/projectcreate',
  enable: 'https://console.cloud.google.com/flows/enableapi?apiid=gmail.googleapis.com,drive.googleapis.com',
  branding: 'https://console.cloud.google.com/auth/branding',
  audience: 'https://console.cloud.google.com/auth/audience',
  clients: 'https://console.cloud.google.com/auth/clients/create',
}

const STEPS: Array<{ title: string; icon: IconName }> = [
  { title: 'Project', icon: 'cloud' },
  { title: 'APIs', icon: 'layers' },
  { title: 'Consent', icon: 'user' },
  { title: 'Web client', icon: 'key' },
  { title: 'Client ID', icon: 'label' },
  { title: 'Test', icon: 'check' },
]

function Copy({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="copy">
      <code aria-label={label}>{text}</code>
      <button
        className="btn sm"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setOk(true)
            setTimeout(() => setOk(false), 1500)
          })
        }}
      >
        <Icon name={ok ? 'check' : 'layers'} size={15} /> {ok ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function Open({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="btn primary" href={href} target="_blank" rel="noopener noreferrer">
      {children} <Icon name="external" size={16} />
    </a>
  )
}

export function Setup() {
  const { tab } = useRoute()
  const saved = useApp((s) => s.settings.clientId)
  const setSettings = useApp((s) => s.setSettings)
  const [input, setInput] = useState(saved || (tab && isValidClientId(tab) ? tab : ''))
  const [step, setStep] = useState(saved || (tab && isValidClientId(tab)) ? 4 : 0)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [check, setCheck] = useState<ConnectCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost:5173'
  // Google only accepts https origins or localhost; LAN IPs over http can never be registered.
  const secureOrigin = isRegistrableOrigin(origin)
  const id = extractClientId(input) ?? input.trim()
  const valid = isValidClientId(id)
  const looksSecret = /GOCSPX-|client_secret/i.test(input)

  useEffect(() => {
    preloadSignIn()
  }, [])

  const next = () => {
    setDone((d) => new Set(d).add(step))
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }
  const test = async () => {
    setBusy(true)
    setCheck(null)
    const r = await connect(id)
    setCheck(r)
    setBusy(false)
    if (!r.error) {
      setSettings({ clientId: id })
      setDone((d) => new Set(d).add(5))
    }
  }

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageHeader
        eyebrow="Setup · about 5 minutes"
        title="Connect your Google account"
        info="You create a free Google Cloud OAuth client that belongs only to you. Your browser signs in to Google with it directly; this project never receives a token and has no server."
        actions={
          <button className="btn ghost" onClick={() => go('home')}>
            Use the demo instead
          </button>
        }
      />

      <section className="card" aria-label="How it connects">
        <SetupDiagram step={step} />
      </section>

      <nav className="stepper" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <button key={s.title} type="button" className={done.has(i) ? 'done' : ''} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)} aria-label={`Step ${i + 1}: ${s.title}`}>
            <span className="n">{done.has(i) ? <Icon name="check" size={14} strokeWidth={2.4} /> : i + 1}</span>
            <span className="t">{s.title}</span>
          </button>
        ))}
      </nav>

      <section className="card stack rise" key={step} aria-live="polite" style={{ gap: 16 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="avatar" aria-hidden="true">
            <Icon name={STEPS[step]!.icon} size={18} />
          </span>
          <h2>{['Create a Google Cloud project', 'Enable Gmail and Drive APIs', 'Set up the consent screen', 'Create a Web client', 'Paste your Client ID', 'Sign in and test'][step]}</h2>
        </div>

        {step === 0 && (
          <>
            <p className="muted">Any name works, e.g. my-storage-lens. Select it in the top bar afterwards.</p>
            <div className="row">
              <Open href={LINKS.project}>Create project</Open>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <p className="muted">One page enables both APIs. Press Next, then Enable.</p>
            <div className="row">
              <Open href={LINKS.enable}>Enable both APIs</Open>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="grid cols-2">
              <div className="kpi">
                <div className="top">
                  Branding <Info>App name (anything, e.g. My Storage Lens) and your email as the support and developer contact.</Info>
                </div>
                <a className="btn sm" href={LINKS.branding} target="_blank" rel="noopener noreferrer">
                  Open Branding <Icon name="external" size={14} />
                </a>
              </div>
              <div className="kpi">
                <div className="top">
                  Audience <Info>Choose External, keep status Testing, and add the Google account you want to analyse under Test users. No Google review is needed because you are the only user.</Info>
                </div>
                <a className="btn sm" href={LINKS.audience} target="_blank" rel="noopener noreferrer">
                  Open Audience <Icon name="external" size={14} />
                </a>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="chip">External</span>
              <span className="chip">Testing</span>
              <span className="chip ok">Add yourself as test user</span>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            {secureOrigin ? (
              <>
                <div className="row" style={{ gap: 8 }}>
                  <span className="chip ok">Application type: Web application</span>
                  <span className="chip bad">Not “Desktop app”</span>
                  <Info>Desktop, Android and iOS clients have no JavaScript origins, so browser sign-in always fails with “invalid_client: no registered origin”. If you already made a Desktop client, create a new Web application client in the same project.</Info>
                </div>
                <p className="muted" style={{ margin: 0 }}>Paste this under Authorized JavaScript origins (not redirect URIs):</p>
                <Copy text={origin} label="Authorized JavaScript origin" />
              </>
            ) : (
              <OriginWarning origin={origin} />
            )}
            <div className="row">
              <Open href={LINKS.clients}>Create client</Open>
              <Info>No redirect URI and no client secret are needed. If anything asks you for the secret, stop.</Info>
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <label className="field">
              <span className="row" style={{ gap: 6 }}>
                Client ID or the downloaded JSON <Info>The Client ID is public, not a secret. It is saved only in this browser so you do this once.</Info>
              </span>
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="1234567890-abc123….apps.googleusercontent.com" spellCheck={false} autoComplete="off" />
            </label>
            <div className="row">
              {input && !valid && <span className="chip bad">That does not look like a Client ID yet.</span>}
              {valid && <span className="chip ok">Looks like a valid Client ID</span>}
              {looksSecret && <span className="chip warn">Contains a secret: only the ID is kept</span>}
            </div>
          </>
        )}
        {step === 5 && (
          <>
            <div className="row" style={{ gap: 8 }}>
              <span className="chip ok">
                <Icon name="lock" size={13} /> Read-only
              </span>
              <span className="muted">Deleting later asks for a separate permission.</span>
            </div>
            {!valid && (
              <button className="btn sm" onClick={() => setStep(4)}>
                Paste your Client ID first
              </button>
            )}
          </>
        )}

        {(step === 4 || step === 5) && !secureOrigin && <OriginWarning origin={origin} />}
        {(step === 4 || step === 5) && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="row">
              <button className="btn primary" disabled={!valid || busy} onClick={() => void test()}>
                <Icon name="key" size={16} /> {busy ? 'Waiting for Google…' : 'Sign in and test'}
              </button>
            </div>
            {check && (
              <ul className="check-list" aria-live="polite">
                <li className={check.signIn ? 'ok' : 'bad'}>Signed in with your client</li>
                <li className={check.drive ? 'ok' : check.signIn ? 'bad' : ''}>Google Drive API reachable</li>
                <li className={check.gmail ? 'ok' : check.drive ? 'bad' : ''}>Gmail API reachable{check.email ? ` · ${check.email}` : ''}</li>
              </ul>
            )}
            {check?.error && (
              <div className="card inset" role="alert">
                <strong>{check.error.title}</strong>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  {check.error.fix}
                </p>
              </div>
            )}
            {check && !check.error && (
              <div className="row">
                <button
                  className="btn primary"
                  onClick={() => {
                    go('overview')
                    void scanAll()
                  }}
                >
                  Start the scan <Icon name="arrow" size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {step < 4 && (
          <div className="row between">
            <button className="btn ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Back
            </button>
            <button className="btn" onClick={next}>
              Done, next <Icon name="arrow" size={16} />
            </button>
          </div>
        )}
      </section>

      <div className="grid cols-2">
        {valid && (
          <section className="card stack">
            <div className="section-head">
              <div className="title">
                <h3>Another device</h3>
                <Info>This link pre-fills your Client ID (no secret inside). Add that device's origin to the client too if it differs.</Info>
              </div>
            </div>
            <Copy text={`${origin}${location.pathname}#/setup/${id}`} label="Pre-filled setup link" />
          </section>
        )}
        <section className="card stack">
          <div className="section-head">
            <div className="title">
              <h3>Troubleshooting</h3>
            </div>
            <a className="btn sm ghost" href="./guides/create-google-oauth-client-id.html">
              Full guide
            </a>
          </div>
          <ul className="check-list" style={{ fontSize: '0.88rem' }}>
            {[
              ['Popup blocked', 'Allow popups for this site and try again.'],
              ['invalid_client: no registered origin', 'Most often the client was created as “Desktop app”: create a new client of type Web application. Otherwise add this page’s address under Authorized JavaScript origins exactly (no path, no trailing slash) and retry after a few minutes.'],
              ['origin_mismatch', 'The origin above is missing from your client, or has a trailing slash. Changes take a few minutes.'],
              ['access_denied', 'Add your account as a Test user on the Audience page.'],
              ['API disabled', 'Enable both APIs (step 2) and retry after a minute.'],
              ['Work or school account', 'Your admin may block unverified apps. Try a personal account.'],
            ].map(([k, v]) => (
              <li key={k} className="row" style={{ gap: 6 }}>
                <span>{k}</span>
                <Info label={`Fix for ${k}`}>{v}</Info>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

/** The whole setup as one picture; the current step lights up. */
function SetupDiagram({ step }: { step: number }) {
  const nodes = [
    { x: 70, label: 'PROJECT', icon: 'cloud' as const },
    { x: 210, label: 'APIS', icon: 'layers' as const },
    { x: 350, label: 'CONSENT', icon: 'user' as const },
    { x: 490, label: 'WEB CLIENT', icon: 'key' as const },
    { x: 630, label: 'CLIENT ID', icon: 'label' as const },
    { x: 770, label: 'SIGNED IN', icon: 'check' as const },
  ]
  return (
    <svg viewBox="0 0 840 130" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`Setup progress: step ${step + 1} of 6`}>
      <text x="70" y="18" style={{ font: '500 10px var(--mono)', fill: 'var(--muted)', letterSpacing: '0.14em' }}>
        GOOGLE CLOUD CONSOLE
      </text>
      <rect x="20" y="28" width="540" height="92" rx="16" fill="none" stroke="var(--border)" strokeDasharray="4 5" />
      <text x="610" y="18" style={{ font: '500 10px var(--mono)', fill: 'var(--muted)', letterSpacing: '0.14em' }}>
        THIS BROWSER
      </text>
      <rect x="580" y="28" width="240" height="92" rx="16" fill="none" stroke="var(--border)" strokeDasharray="4 5" />
      {nodes.slice(0, -1).map((n, i) => (
        <line key={n.label} x1={n.x + 24} x2={nodes[i + 1]!.x - 24} y1="66" y2="66" stroke={i < step ? 'var(--accent)' : 'var(--border-2)'} strokeWidth="2" className={i === step - 1 ? 'flowing' : undefined} />
      ))}
      {nodes.map((n, i) => {
        const on = i === step
        const past = i < step
        return (
          <g key={n.label} transform={`translate(${n.x} 66)`}>
            <circle r="22" fill={on ? 'var(--accent)' : past ? 'var(--accent-soft)' : 'var(--bg-2)'} stroke={on || past ? 'var(--accent)' : 'var(--border-2)'} />
            <g transform="translate(-10 -10)" style={{ color: on ? 'var(--accent-ink)' : past ? 'var(--accent)' : 'var(--muted)' }}>
              <Icon name={n.icon} size={20} />
            </g>
            <text y="42" textAnchor="middle" style={{ font: '500 9.5px var(--mono)', fill: on ? 'var(--text)' : 'var(--muted)', letterSpacing: '0.1em' }}>
              {n.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function OriginWarning({ origin }: { origin: string }) {
  const site = new URL(SITE_URL).origin
  return (
    <div className="card inset stack" role="alert" style={{ gap: 8 }}>
      <span className="row" style={{ gap: 8 }}>
        <Icon name="warn" size={18} style={{ color: 'var(--warn)' }} />
        <strong>Google sign-in cannot work on this address</strong>
      </span>
      <p className="muted" style={{ margin: 0 }}>
        <code>{origin}</code> is plain http on a network address. Google only accepts https or localhost, so it shows “no registered origin”.
      </p>
      <div className="row">
        <a className="btn sm primary" href={SITE_URL}>
          Open the https site <Icon name="arrow" size={14} />
        </a>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          and register <code>{site}</code>
        </span>
      </div>
    </div>
  )
}
