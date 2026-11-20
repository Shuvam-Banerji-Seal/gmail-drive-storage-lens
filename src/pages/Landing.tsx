// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect } from 'react'
import { Logo } from '../components/Logo'
import { APP_NAME, REPO_URL } from '../config/site'
import { go } from '../router'
import { preloadSignIn, startDemo } from '../state/session'
import { useApp } from '../state/store'

export function Landing() {
  const clientId = useApp((s) => s.settings.clientId)
  const mode = useApp((s) => s.mode)
  useEffect(() => {
    if (clientId) preloadSignIn()
  }, [clientId])

  return (
    <div className="stack" style={{ gap: 40 }}>
      <header className="row between">
        <a className="row" href="#/" style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 700 }}>
          <Logo size={34} /> {APP_NAME}
        </a>
        <nav className="row" aria-label="Top">
          <a href="./guides/free-up-gmail-storage.html">Guides</a>
          <a href="#/verify">Privacy</a>
          <a href={REPO_URL} rel="noopener noreferrer" target="_blank">
            Source
          </a>
        </nav>
      </header>

      <section className="hero">
        <div className="stack rise">
          <span className="kicker">Gmail · Google Drive · open source</span>
          <h1>
            Find what is <span className="glow">filling your Google storage</span>, then clear it safely.
          </h1>
          <p className="muted" style={{ fontSize: '1.12rem', maxWidth: 620 }}>
            {APP_NAME} maps your mailbox and Drive as a night sky: senders become constellations, folders become continents, years of
            newsletters become tides. It runs entirely in your browser with <strong>your own</strong> Google client. There is no server
            and nothing to trust but code you can read.
          </p>
          <div className="row">
            {mode !== 'landing' ? (
              <button className="btn primary" onClick={() => go('overview')}>
                Back to your scan →
              </button>
            ) : (
              <button className="btn primary" onClick={() => go('setup')}>
                {clientId ? 'Connect my Google account' : 'Set up in 5 minutes'}
              </button>
            )}
            <button
              className="btn"
              onClick={() => {
                startDemo()
                go('overview')
              }}
            >
              Explore the demo (no sign-in)
            </button>
          </div>
          <div className="trust">
            <div className="card flat">
              <strong>Your client, your token</strong>
              <div className="muted">You create the OAuth client. This project never sees a token.</div>
            </div>
            <div className="card flat">
              <strong>Headers only</strong>
              <div className="muted">Sizes, senders, subjects, labels, file names. Never email bodies.</div>
            </div>
            <div className="card flat">
              <strong>Locked by CSP</strong>
              <div className="muted">The browser blocks every host except Google's APIs.</div>
            </div>
            <div className="card flat">
              <strong>Trash first</strong>
              <div className="muted">Permanent delete needs a typed confirmation and a separate consent.</div>
            </div>
          </div>
        </div>
        <HeroOrbit />
      </section>

      <section className="grid cols-3" aria-label="What you can do">
        {[
          ['Constellations', 'A live graph of who fills your inbox, clustered into communities.'],
          ['Rivers', 'A Sankey of where the gigabytes flow: domain → category → read/unread → action.'],
          ['Tides & mailfall', 'Bytes per month and per day, with spikes and a "full in N months" forecast.'],
          ['Nebula', 'Subject lines mapped by similarity. Lasso a cloud of look-alike mail.'],
          ['Twins & ghosts', 'Duplicate Drive files and hidden old versions that still use quota.'],
          ['Airlock', 'Dry-run, CSV export, Trash with undo, filters so it never fills again.'],
        ].map(([t, d]) => (
          <div key={t} className="card rise">
            <h3>{t}</h3>
            <p className="muted">{d}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>How it works</h2>
        <ol className="steps">
          <li>
            <strong>Create your own Google OAuth client</strong> (free, about 5 minutes). The wizard gives you every link and value to paste.
          </li>
          <li>
            <strong>Scan, read-only.</strong> The biggest emails are found first, so useful answers arrive in seconds.
          </li>
          <li>
            <strong>Explore and pick.</strong> Every chart is clickable; selections collect in the Airlock.
          </li>
          <li>
            <strong>Clean safely.</strong> Trash with undo, or permanent deletion behind a typed confirmation.
          </li>
        </ol>
      </section>
    </div>
  )
}

function HeroOrbit() {
  return (
    <svg viewBox="0 0 400 400" role="img" aria-label="Decorative orbit illustration" className="hero-orbit rise">
      <defs>
        <radialGradient id="core" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--accent-2)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="70" fill="url(#core)" />
      {[110, 145, 180].map((r, i) => (
        <g key={r} className={`orbit o${i}`}>
          <circle cx="200" cy="200" r={r} fill="none" stroke="var(--border)" strokeDasharray="2 6" />
          <circle cx={200 + r} cy="200" r={6 - i} fill={`var(--series-${i + 2})`} />
        </g>
      ))}
    </svg>
  )
}
