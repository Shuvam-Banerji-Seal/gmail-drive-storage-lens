// SPDX-License-Identifier: AGPL-3.0-or-later
// Guided "bring your own OAuth client" wizard. The project ships no client ID of its own.
import { useEffect, useState } from 'react'
import { extractClientId, isValidClientId } from '../auth/gis'
import { go, useRoute } from '../router'
import { connect, preloadSignIn, scanAll, type ConnectCheck } from '../state/session'
import { useApp } from '../state/store'

const LINKS = {
  project: 'https://console.cloud.google.com/projectcreate',
  enable: 'https://console.cloud.google.com/flows/enableapi?apiid=gmail.googleapis.com,drive.googleapis.com',
  gmailApi: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
  driveApi: 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
  branding: 'https://console.cloud.google.com/auth/branding',
  audience: 'https://console.cloud.google.com/auth/audience',
  clients: 'https://console.cloud.google.com/auth/clients/create',
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} ↗
    </a>
  )
}

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
        {ok ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function Step({ i, title, done, onToggle, children }: { i: number; title: string; done: boolean; onToggle: (i: number) => void; children: React.ReactNode }) {
  return (
    <li className={done ? 'done' : ''}>
      <div className="row between">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <label className="row muted" style={{ gap: 6 }}>
          <input type="checkbox" checked={done} onChange={() => onToggle(i)} /> done
        </label>
      </div>
      <div className="stack" style={{ marginTop: 8 }}>
        {children}
      </div>
    </li>
  )
}

export function Setup() {
  const { tab } = useRoute()
  const saved = useApp((s) => s.settings.clientId)
  const setSettings = useApp((s) => s.setSettings)
  const [done, setDone] = useState<Record<number, boolean>>({})
  const [input, setInput] = useState(saved || (tab && isValidClientId(tab) ? tab : ''))
  const [check, setCheck] = useState<ConnectCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost:5173'
  const id = extractClientId(input) ?? input.trim()
  const valid = isValidClientId(id)
  const looksSecret = /GOCSPX-|client_secret/i.test(input)

  useEffect(() => {
    preloadSignIn()
  }, [])

  const toggle = (i: number) => setDone((d) => ({ ...d, [i]: !d[i] }))

  const test = async () => {
    setBusy(true)
    setCheck(null)
    const r = await connect(id)
    setCheck(r)
    setBusy(false)
    if (!r.error) setSettings({ clientId: id })
  }

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 900 }}>
      <header>
        <h1>Connect your own Google app</h1>
        <p className="muted">
          You create a free Google Cloud OAuth client that belongs only to you, then paste its Client ID here. Your browser signs in to
          Google with it directly. This project never receives your tokens, and there is no server to send them to. Takes about five
          minutes, once.
        </p>
        <p>
          Prefer to look around first?{' '}
          <button className="btn sm" onClick={() => go('home')}>
            Use the demo instead
          </button>
        </p>
      </header>

      <ol className="steps card">
        <Step i={1} done={!!done[1]} onToggle={toggle} title="Create a Google Cloud project">
          <p>
            Open <Ext href={LINKS.project}>Create project</Ext>, name it anything (for example <code>my-storage-lens</code>) and press
            Create. Make sure the new project is selected in the top bar afterwards.
          </p>
        </Step>
        <Step i={2} done={!!done[2]} onToggle={toggle} title="Enable the Gmail API and the Google Drive API">
          <p>
            One click: <Ext href={LINKS.enable}>enable both APIs</Ext>. Or individually: <Ext href={LINKS.gmailApi}>Gmail API</Ext> and{' '}
            <Ext href={LINKS.driveApi}>Google Drive API</Ext>, then press <strong>Enable</strong>.
          </p>
        </Step>
        <Step i={3} done={!!done[3]} onToggle={toggle} title="Configure the consent screen (Google Auth Platform)">
          <p>
            In <Ext href={LINKS.branding}>Branding</Ext> set an app name (e.g. <em>My Storage Lens</em>) and your email as support and
            developer contact. In <Ext href={LINKS.audience}>Audience</Ext> choose <strong>External</strong>, keep the status{' '}
            <strong>Testing</strong>, and under <strong>Test users</strong> add the Google account you want to analyse.
          </p>
          <p className="muted">
            Testing status is fine forever for personal use: no Google review is needed because you are the only user. You will see a
            "Google hasn't verified this app" screen when signing in; that is your own app, so choose Continue.
          </p>
        </Step>
        <Step i={4} done={!!done[4]} onToggle={toggle} title="Create a Web client ID">
          <p>
            Open <Ext href={LINKS.clients}>Create client</Ext>, choose application type <strong>Web application</strong>, and add this
            exact value under <strong>Authorized JavaScript origins</strong>:
          </p>
          <Copy text={origin} label="Authorized JavaScript origin" />
          <p className="muted">
            No redirect URI is needed. Press Create and copy the <strong>Client ID</strong> (it ends in{' '}
            <code>.apps.googleusercontent.com</code>). You never need the client secret: if anything asks you for it, stop.
          </p>
        </Step>
        <Step i={5} done={!!done[5]} onToggle={toggle} title="Paste your Client ID">
          <label className="stack" style={{ gap: 6 }}>
            <span className="muted">Client ID, or paste the whole downloaded JSON and we will pick the ID out of it</span>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="1234567890-abc123….apps.googleusercontent.com" spellCheck={false} autoComplete="off" />
          </label>
          {input && !valid && <span className="chip bad">That does not look like a Client ID yet.</span>}
          {valid && <span className="chip ok">Looks like a valid Client ID</span>}
          {looksSecret && (
            <span className="chip warn">
              Your paste seems to include a client secret. Nothing is stored except the Client ID, but avoid sharing secrets anywhere.
            </span>
          )}
          <p className="muted">The Client ID is not a secret; it is saved in this browser so you only do this once.</p>
        </Step>
        <Step i={6} done={!!done[6]} onToggle={toggle} title="Test the connection">
          <p>
            A Google window asks for <strong>read-only</strong> access to email headers and Drive file metadata. Deleting anything
            later asks for a separate, explicit permission.
          </p>
          <div className="row">
            <button className="btn primary" disabled={!valid || busy} onClick={() => void test()}>
              {busy ? 'Waiting for Google…' : 'Sign in and test'}
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
            <div className="card flat" role="alert">
              <strong>{check.error.title}</strong>
              <p className="muted" style={{ margin: 0 }}>
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
                Start the scan →
              </button>
              <span className="muted">Biggest emails are read first; you can pause at any time.</span>
            </div>
          )}
        </Step>
      </ol>

      {valid && (
        <section className="card flat">
          <h3>Use it on another device</h3>
          <p className="muted">This link pre-fills your Client ID (it contains no secret). Add that device's origin too if it differs.</p>
          <Copy text={`${origin}${location.pathname}#/setup/${id}`} label="Pre-filled setup link" />
        </section>
      )}

      <section className="card flat">
        <h3>Troubleshooting</h3>
        <ul>
          <li>
            <strong>Popup blocked or closes instantly:</strong> allow popups for this site.
          </li>
          <li>
            <strong>"Error 400: origin_mismatch" or "redirect_uri_mismatch":</strong> the origin above is missing from your client, or has a
            trailing slash. Changes can take a few minutes to apply.
          </li>
          <li>
            <strong>"access_denied" / "has not completed the Google verification process":</strong> add your account as a Test user.
          </li>
          <li>
            <strong>"Gmail API has not been used in project … or it is disabled":</strong> enable the API (step 2) and retry after a minute.
          </li>
          <li>
            <strong>Work or school account blocked:</strong> your admin may restrict unverified apps. Try a personal account or ask them.
          </li>
        </ul>
        <p>
          Full guide with screenshots: <a href="./guides/create-google-oauth-client-id.html">How to create a Google OAuth Client ID</a>.
        </p>
      </section>
    </div>
  )
}
