// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect } from 'react'
import { Icon } from '../components/Icon'
import { Info } from '../components/Info'
import { Logo } from '../components/Logo'
import { APP_NAME, REPO_URL } from '../config/site'
import { go } from '../router'
import { preloadSignIn, startDemo } from '../state/session'
import { useApp } from '../state/store'

const BASE = import.meta.env.BASE_URL

export function Landing() {
  const clientId = useApp((s) => s.settings.clientId)
  const mode = useApp((s) => s.mode)
  const theme = useApp((s) => s.settings.theme)
  const setSettings = useApp((s) => s.setSettings)
  useEffect(() => {
    if (clientId) preloadSignIn()
  }, [clientId])
  const demo = () => {
    startDemo()
    go('overview')
  }

  return (
    <div className="page" style={{ gap: 'clamp(40px, 7vw, 96px)' }}>
      <header className="landing-nav">
        <a className="brand" href="#/" style={{ padding: 0 }}>
          <Logo size={32} /> <b style={{ display: 'inline' }}>{APP_NAME}</b>
        </a>
        <nav aria-label="Site">
          <a className="btn ghost sm" href="./guides/free-up-gmail-storage.html">
            Guides
          </a>
          <a className="btn ghost sm" href="#/verify">
            Privacy
          </a>
          <a className="btn ghost sm" href={REPO_URL} rel="noopener noreferrer" target="_blank">
            Source
          </a>
          <button
            className="icon-btn"
            aria-label="Switch light or dark theme"
            data-tip="Theme"
            onClick={() => setSettings({ theme: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' })}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} />
          </button>
        </nav>
      </header>

      <section className="hero" style={{ paddingTop: 0 }}>
        <div>
          <div className="kicker rise">Gmail · Google Drive · Open source</div>
          <h1 className="rise d1">
            See what’s <em>filling your Google storage</em>, then clear it safely.
          </h1>
          <p className="lede rise d2">An instrument for your mailbox and Drive. It runs in your browser, with your own Google client.</p>
          <div className="row rise d3">
            {mode !== 'landing' ? (
              <button className="btn primary lg" onClick={() => go('overview')}>
                Back to your scan <Icon name="arrow" size={18} />
              </button>
            ) : (
              <button className="btn primary lg" onClick={demo}>
                Explore the demo <Icon name="arrow" size={18} />
              </button>
            )}
            <button className="btn lg" onClick={() => go('setup')}>
              <Icon name="key" size={18} /> {clientId ? 'Connect account' : 'Connect your account'}
            </button>
          </div>
          <div className="proof rise d4">
            <span className="chip ok" data-tip="Static site on GitHub Pages: there is nothing to send data to">
              No server
            </span>
            <span className="chip ok" data-tip="You create the OAuth client; this project never sees a token">
              Your own client
            </span>
            <span className="chip ok" data-tip="Sizes, senders, subjects, labels. Never email bodies.">
              Headers only
            </span>
            <span className="chip ok" data-tip="The browser blocks every host except Google's">
              Locked by CSP
            </span>
          </div>
        </div>
        <HeroChart />
      </section>

      <section aria-labelledby="film-h" className="stack" style={{ gap: 14 }}>
        <div className="section-head">
          <div className="title">
            <h2 id="film-h">The film</h2>
            <Info label="About the film">
              A 58-second teaser: narrated, with an original score generated in code. The voice is synthetic. Illustrative data only.
            </Info>
          </div>
        </div>
        <video
          className="film"
          controls
          playsInline
          preload="none"
          poster={`${BASE}media/teaser-poster.jpg`}
          aria-label="Gmail Storage Lens teaser film, 58 seconds, with narration"
        >
          <source src={`${BASE}media/gmail-storage-lens-teaser.mp4`} type="video/mp4" />
          <a href={`${BASE}media/gmail-storage-lens-teaser.mp4`}>Download the film (MP4, 7 MB)</a>
        </video>
      </section>

      <section aria-labelledby="flow-h" className="card hero-card">
        <div className="section-head">
          <div className="title">
            <h2 id="flow-h">Where your data goes</h2>
            <Info label="About the data flow">
              Your browser signs in to Google with a client you own, calls Gmail and Drive directly, and keeps results in memory. There is no
              project server, so there is nothing to collect. Open Verify privacy to watch it live.
            </Info>
          </div>
          <a className="btn sm" href="#/verify">
            <Icon name="verify" size={16} /> Verify live
          </a>
        </div>
        <FlowDiagram />
      </section>

      <section aria-labelledby="feat-h" className="stack" style={{ gap: 18 }}>
        <div className="section-head">
          <h2 id="feat-h">Instruments</h2>
          <button className="btn sm" onClick={demo}>
            Try them on demo data <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="plate-grid">
          {PLATES.map((p, i) => (
            <article key={p.title} className={`card plate rise d${(i % 4) + 1}`}>
              {p.art}
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="steps-h" className="card">
        <h2 id="steps-h" style={{ marginBottom: 18 }}>
          Three steps
        </h2>
        <div className="grid cols-3">
          {[
            { icon: 'key' as const, t: 'Create your client', s: 'Free, about 5 minutes, guided.' },
            { icon: 'search' as const, t: 'Scan, read-only', s: 'Biggest emails first.' },
            { icon: 'airlock' as const, t: 'Clean safely', s: 'Dry run, Trash, undo.' },
          ].map((s, i) => (
            <div key={s.t} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 14 }}>
              <span className="avatar" style={{ width: 40, height: 40 }} aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className="row" style={{ gap: 6 }}>
                  <Icon name={s.icon} size={18} /> {s.t}
                </h3>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  {s.s}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/** Hero: a star chart. Rings are services, stars are senders, lines are relationships. */
function HeroChart() {
  const C = 260
  // Positions are relative to the centre and kept inside the innermost ring so labels never collide with it.
  const stars: Array<[number, number, number, string, string?]> = (
    [
      [-95, -80, 9, 'var(--series-1)', 'Newsletters'],
      [-40, -122, 6, 'var(--series-1)'],
      [-122, -10, 7, 'var(--series-2)', 'Club lists'],
      [-70, 55, 5, 'var(--series-2)'],
      [40, -95, 8, 'var(--series-3)', 'Receipts'],
      [78, -30, 5, 'var(--series-3)'],
      [20, 88, 11, 'var(--series-4)', 'Photos'],
      [-10, -40, 4, 'var(--series-5)'],
      [62, 40, 6, 'var(--series-5)', 'Drive'],
    ] as Array<[number, number, number, string, string?]>
  ).map(([x, y, r, c, l]) => [C + x, C + y, r, c, l])
  const links: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [2, 3],
    [0, 7],
    [7, 4],
    [4, 5],
    [5, 8],
    [8, 6],
    [6, 3],
    [7, 6],
  ]
  const ring = (r: number, frac: number, color: string, w: number) => {
    const c = 2 * Math.PI * r
    return <circle cx={C} cy={C} r={r} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${C} ${C})`} />
  }
  return (
    <svg className="hero-art rise d2" viewBox="0 0 520 520" role="img" aria-label="Star chart: storage rings for Gmail, Drive and Photos, with senders as connected stars">
      <defs>
        <radialGradient id="hc-core">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r="250" fill="url(#hc-core)" />
      {Array.from({ length: 72 }, (_, i) => {
        const a = (i / 72) * Math.PI * 2
        const long = i % 6 === 0
        return (
          <line
            key={i}
            x1={C + 246 * Math.cos(a)}
            y1={C + 246 * Math.sin(a)}
            x2={C + (long ? 232 : 240) * Math.cos(a)}
            y2={C + (long ? 232 : 240) * Math.sin(a)}
            stroke="var(--border-2)"
            strokeWidth={long ? 1.4 : 1}
          />
        )
      })}
      <circle cx={C} cy={C} r="226" fill="none" stroke="var(--border)" />
      <g className="spin-slow">
        <circle cx={C} cy={C} r="212" fill="none" stroke="var(--border-2)" strokeDasharray="2 7" />
      </g>
      {ring(196, 0.62, 'var(--series-4)', 7)}
      {ring(182, 0.2, 'var(--series-2)', 7)}
      {ring(168, 0.08, 'var(--series-3)', 7)}
      {links.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={stars[a]![0]} y1={stars[a]![1]} x2={stars[b]![0]} y2={stars[b]![1]} stroke="var(--text)" strokeOpacity="0.22" strokeWidth="1" />
      ))}
      {stars.map(([x, y, r, col, label], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r * 2.2} fill={col} opacity="0.12" />
          <circle cx={x} cy={y} r={r} fill={col} />
          {label && (
            <text x={x + r + 7} y={y + 4} style={{ font: '500 11px var(--mono)', fill: 'var(--text-2)', letterSpacing: '0.04em', paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 4 }}>
              {label}
            </text>
          )}
        </g>
      ))}
      <text x={C} y="44" textAnchor="middle" style={{ font: '500 10px var(--mono)', fill: 'var(--muted)', letterSpacing: '0.2em' }}>
        GMAIL · DRIVE · PHOTOS
      </text>
    </svg>
  )
}

function FlowDiagram() {
  const box = (x: number, y: number, w: number, label: string, sub: string, strong = false) => (
    <g>
      <rect x={x} y={y} width={w} height="76" rx="14" fill="var(--bg-2)" stroke={strong ? 'var(--accent)' : 'var(--border-2)'} />
      <text x={x + 20} y={y + 33} style={{ font: '600 16px var(--font)', fill: 'var(--text)' }}>
        {label}
      </text>
      <text x={x + 20} y={y + 55} className="lbl">
        {sub}
      </text>
    </g>
  )
  return (
    <svg className="flow" viewBox="0 0 960 230" role="img" aria-label="Your browser exchanges data only with Google's APIs. The project has no server.">
      <defs>
        <marker id="fl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
        </marker>
      </defs>
      {box(20, 20, 250, 'Your browser', 'RUNS THE APP · MEMORY ONLY', true)}
      {box(690, 20, 250, 'Google APIs', 'GMAIL · DRIVE · SIGN-IN')}
      {box(355, 134, 250, 'Your OAuth client', 'CREATED BY YOU · NO SECRET')}
      <path d="M270,46 C420,30 540,30 690,46" fill="none" stroke="var(--accent)" strokeWidth="2" className="flowing" markerEnd="url(#fl-arrow)" />
      <path d="M690,76 C540,92 420,92 270,76" fill="none" stroke="var(--accent)" strokeWidth="2" className="flowing" markerEnd="url(#fl-arrow)" />
      <text x="480" y="28" textAnchor="middle" className="lbl">
        Headers &amp; sizes
      </text>
      <path d="M145,96 C145,150 250,172 355,172" fill="none" stroke="var(--border-2)" strokeDasharray="3 5" />
      <path d="M605,172 C710,172 815,150 815,96" fill="none" stroke="var(--border-2)" strokeDasharray="3 5" />
      <g transform="translate(410 124)">
        <rect x="-4" y="-16" width="148" height="24" rx="12" fill="var(--danger-soft)" stroke="var(--danger)" strokeOpacity="0.5" />
        <text x="70" y="0" textAnchor="middle" style={{ font: '500 11px var(--mono)', fill: 'var(--danger)' }}>
          ✕ NO PROJECT SERVER
        </text>
      </g>
    </svg>
  )
}

const art = (children: React.ReactNode, label: string) => (
  <svg className="art" viewBox="0 0 240 120" role="img" aria-label={label}>
    {children}
  </svg>
)

const PLATES: Array<{ title: string; text: string; art: React.ReactNode }> = [
  {
    title: 'Constellation',
    text: 'Who fills your inbox, clustered into communities.',
    art: art(
      <>
        {[
          [40, 60, 30, 30],
          [40, 60, 70, 95],
          [30, 30, 110, 40],
          [110, 40, 150, 70],
          [150, 70, 200, 40],
          [150, 70, 190, 100],
          [110, 40, 70, 95],
        ].map(([a, b, c, d], i) => (
          <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="var(--text)" strokeOpacity="0.25" />
        ))}
        {[
          [40, 60, 9, 1],
          [30, 30, 5, 1],
          [70, 95, 6, 1],
          [110, 40, 7, 2],
          [150, 70, 10, 2],
          [200, 40, 6, 3],
          [190, 100, 5, 3],
        ].map(([x, y, r, g], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={`var(--series-${g})`} />
        ))}
      </>,
      'Network graph of senders',
    ),
  },
  {
    title: 'Rivers',
    text: 'Where the gigabytes flow, from sender to action.',
    art: art(
      <>
        <rect x="10" y="10" width="8" height="100" rx="3" fill="var(--series-1)" />
        <rect x="116" y="10" width="8" height="55" rx="3" fill="var(--series-2)" />
        <rect x="116" y="72" width="8" height="38" rx="3" fill="var(--series-3)" />
        <rect x="222" y="10" width="8" height="100" rx="3" fill="var(--series-4)" />
        <path d="M18,10 C70,10 64,10 116,10 L116,65 C64,65 70,62 18,62Z" fill="var(--series-1)" opacity="0.3" />
        <path d="M18,62 C70,62 64,72 116,72 L116,110 C64,110 70,110 18,110Z" fill="var(--series-1)" opacity="0.2" />
        <path d="M124,10 C176,10 170,10 222,10 L222,110 C170,110 176,110 124,110Z" fill="var(--series-2)" opacity="0.18" />
      </>,
      'Sankey diagram',
    ),
  },
  {
    title: 'Tides',
    text: 'Bytes per month, spikes, and when you hit the cap.',
    art: art(
      <>
        <path d="M0,90 C30,80 50,60 80,70 C110,80 130,40 160,45 C190,50 210,30 240,20 L240,120 L0,120Z" fill="var(--series-2)" opacity="0.28" />
        <path d="M0,100 C30,95 50,85 80,92 C110,100 130,80 160,82 C190,85 210,70 240,66 L240,120 L0,120Z" fill="var(--series-1)" opacity="0.45" />
        <line x1="0" y1="18" x2="240" y2="18" stroke="var(--danger)" strokeDasharray="4 4" />
      </>,
      'Stream graph over time',
    ),
  },
  {
    title: 'Nebula',
    text: 'Look-alike subjects as clouds. Lasso to select.',
    art: art(
      <>
        {Array.from({ length: 46 }, (_, i) => {
          const cx = [60, 150, 190][i % 3]!
          const cy = [60, 40, 85][i % 3]!
          const a = i * 2.399
          const r = 3 + (i % 7) * 3
          return <circle key={i} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r="2.6" fill={`var(--series-${(i % 3) + 1})`} opacity="0.85" />
        })}
        <path d="M30,40 C40,10 100,20 95,60 C90,95 35,95 30,40Z" fill="none" stroke="var(--accent)" strokeDasharray="4 4" />
      </>,
      'Scatter plot with lasso',
    ),
  },
  {
    title: 'Twins & ghosts',
    text: 'Duplicate Drive files and hidden old versions.',
    art: art(
      <>
        {[20, 90, 160].map((x, i) => (
          <g key={x}>
            <rect x={x} y="25" width="56" height="70" rx="6" fill="var(--bg-2)" stroke={i === 0 ? 'var(--series-3)' : 'var(--border-2)'} strokeDasharray={i === 0 ? undefined : '4 3'} />
            <path d={`M${x + 12},45h32M${x + 12},57h24M${x + 12},69h28`} stroke="var(--muted)" />
          </g>
        ))}
        <text x="118" y="112" textAnchor="middle" style={{ font: '500 10px var(--mono)', fill: 'var(--muted)' }}>
          SAME CHECKSUM
        </text>
      </>,
      'Duplicate files',
    ),
  },
  {
    title: 'Airlock',
    text: 'Dry run, archive, Trash with undo, typed delete.',
    art: art(
      <>
        {['Select', 'Review', 'Trash', 'Delete'].map((s, i) => (
          <g key={s}>
            <circle cx={30 + i * 60} cy="55" r="16" fill={i === 3 ? 'var(--danger-soft)' : 'var(--accent-soft)'} stroke={i === 3 ? 'var(--danger)' : 'var(--accent)'} />
            <text x={30 + i * 60} y="92" textAnchor="middle" style={{ font: '500 10px var(--mono)', fill: 'var(--muted)' }}>
              {s.toUpperCase()}
            </text>
            {i < 3 && <path d={`M${48 + i * 60},55h24`} stroke="var(--border-2)" />}
          </g>
        ))}
      </>,
      'Cleanup pipeline',
    ),
  },
]
