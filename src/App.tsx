// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense, useEffect } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { Logo } from './components/Logo'
import { ScanBar } from './components/ScanBar'
import { Starfield } from './components/Starfield'
import { Toasts } from './components/Toasts'
import { APP_NAME, COMMIT, SOURCE_URL } from './config/site'
import { go, useRoute, type Route } from './router'
import { signOut } from './state/session'
import { basketTotals, useApp } from './state/store'
import { formatBytes } from './util/format'
import { Landing } from './pages/Landing'
import { Setup } from './pages/Setup'

const Overview = lazy(() => import('./pages/Overview'))
const Gmail = lazy(() => import('./pages/Gmail'))
const Drive = lazy(() => import('./pages/Drive'))
const Planner = lazy(() => import('./pages/Planner'))
const Cleanup = lazy(() => import('./pages/Cleanup'))
const Verify = lazy(() => import('./pages/Verify'))
const Settings = lazy(() => import('./pages/Settings'))

const NAV: Array<{ route: Route; label: string; icon: string }> = [
  { route: 'overview', label: 'Overview', icon: '◎' },
  { route: 'gmail', label: 'Gmail', icon: '✉' },
  { route: 'drive', label: 'Drive', icon: '▦' },
  { route: 'planner', label: 'Planner', icon: '◔' },
  { route: 'cleanup', label: 'Airlock', icon: '⎋' },
  { route: 'verify', label: 'Verify privacy', icon: '⛨' },
  { route: 'settings', label: 'Settings', icon: '⚙' },
]

export function App() {
  const { route, tab } = useRoute()
  const mode = useApp((s) => s.mode)
  const theme = useApp((s) => s.settings.theme)
  const basket = useApp((s) => s.basket)
  const me = useApp((s) => s.me)
  const t = basketTotals(basket)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const titles: Record<Route, string> = {
    home: `${APP_NAME} — see what fills your Gmail & Google Drive storage`,
    setup: `Connect your own Google client · ${APP_NAME}`,
    overview: `Overview · ${APP_NAME}`,
    gmail: `Gmail explorer · ${APP_NAME}`,
    drive: `Drive explorer · ${APP_NAME}`,
    planner: `Budget planner · ${APP_NAME}`,
    cleanup: `Airlock · ${APP_NAME}`,
    verify: `Verify privacy · ${APP_NAME}`,
    settings: `Settings · ${APP_NAME}`,
  }
  useEffect(() => {
    document.title = titles[route]
    window.scrollTo?.(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  const needsData = !['home', 'setup', 'verify', 'settings'].includes(route)
  if (route === 'home' || (needsData && mode === 'landing')) {
    return (
      <>
        <Starfield />
        <main id="main" className="main solo">
          <Landing />
          <Footer />
        </main>
        <Toasts />
        <CommandPalette />
      </>
    )
  }

  return (
    <>
      <Starfield />
      <a className="sr-only" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <nav className="rail" aria-label="Main">
          <a className="brand" href="#/" aria-label={`${APP_NAME} home`}>
            <Logo /> <span>Storage Lens</span>
          </a>
          {NAV.map((n) => (
            <a key={n.route} className={`nav ${n.route === 'cleanup' ? 'basket-link' : ''}`} href={`#/${n.route}`} aria-current={route === n.route ? 'page' : undefined}>
              <span aria-hidden="true">{n.icon}</span> {n.label}
              {n.route === 'cleanup' && t.count > 0 && <span className="count">{t.count}</span>}
            </a>
          ))}
          <div className="spacer" />
          <div className="card flat" style={{ padding: 12, fontSize: '0.85rem' }}>
            <div className="mode-pill muted">{mode === 'demo' ? 'Demo data' : mode === 'live' ? 'Connected' : 'Not connected'}</div>
            {me && <div className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{me}</div>}
            {t.count > 0 && (
              <div className="muted">
                Selected {t.count} · {formatBytes(t.bytes)}
              </div>
            )}
            {mode !== 'landing' && (
              <button
                className="btn sm ghost"
                style={{ marginTop: 8 }}
                onClick={() => {
                  void signOut().then(() => go('home'))
                }}
              >
                {mode === 'demo' ? 'Leave demo' : 'Sign out'}
              </button>
            )}
          </div>
          <div className="muted" style={{ fontSize: '0.78rem', padding: '8px 4px' }}>
            <kbd>Ctrl</kbd> <kbd>K</kbd> to jump anywhere
          </div>
        </nav>
        <main id="main" className="main">
          <ScanBar />
          <Suspense fallback={<div className="empty">Loading view…</div>}>
            {route === 'setup' && <Setup />}
            {route === 'overview' && <Overview />}
            {route === 'gmail' && <Gmail tab={tab} />}
            {route === 'drive' && <Drive tab={tab} />}
            {route === 'planner' && <Planner />}
            {route === 'cleanup' && <Cleanup />}
            {route === 'verify' && <Verify />}
            {route === 'settings' && <Settings />}
          </Suspense>
          <Footer />
        </main>
      </div>
      <Toasts />
      <CommandPalette />
    </>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <span>
        {APP_NAME} is free software under the{' '}
        <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noopener noreferrer" target="_blank">
          GNU AGPL v3 or later
        </a>
        .
      </span>
      <a href={SOURCE_URL} rel="noopener noreferrer" target="_blank">
        Source code ({COMMIT === 'dev' ? 'development build' : COMMIT.slice(0, 7)})
      </a>
      <a href="#/verify">Verify privacy</a>
      <span>Not affiliated with Google. Gmail and Google Drive are trademarks of Google LLC.</span>
    </footer>
  )
}
