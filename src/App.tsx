// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense, useEffect } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { Logo } from './components/Logo'
import { ScanBar } from './components/ScanBar'
import { Starfield } from './components/Starfield'
import { Toasts } from './components/Toasts'
import { Tour } from './components/Tour'
import { APP_NAME, COMMIT, SOURCE_URL } from './config/site'
import { t } from './i18n'
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
const Insights = lazy(() => import('./pages/Insights'))
const Cleanup = lazy(() => import('./pages/Cleanup'))
const Verify = lazy(() => import('./pages/Verify'))
const Settings = lazy(() => import('./pages/Settings'))

/** Navigation in display order. Labels are looked up at render time so a locale switch takes effect. */
function navItems(): Array<{ route: Route; label: string; icon: string }> {
  return [
    { route: 'overview', label: t('nav.overview'), icon: '◎' },
    { route: 'gmail', label: t('nav.gmail'), icon: '✉' },
    { route: 'drive', label: t('nav.drive'), icon: '▦' },
    { route: 'planner', label: t('nav.planner'), icon: '◔' },
    { route: 'insights', label: t('nav.insights'), icon: '✦' },
    { route: 'cleanup', label: t('nav.airlock'), icon: '⎋' },
    { route: 'verify', label: t('nav.verify'), icon: '⛨' },
    { route: 'settings', label: t('nav.settings'), icon: '⚙' },
  ]
}

export function App() {
  const { route, tab } = useRoute()
  const mode = useApp((s) => s.mode)
  const theme = useApp((s) => s.settings.theme)
  const basket = useApp((s) => s.basket)
  const me = useApp((s) => s.me)
  const totals = basketTotals(basket)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const titles: Record<Route, string> = {
    home: t('title.home', { app: APP_NAME, page: t('page.home') }),
    setup: t('title.app', { app: APP_NAME, page: t('page.setup') }),
    overview: t('title.app', { app: APP_NAME, page: t('page.overview') }),
    gmail: t('title.app', { app: APP_NAME, page: t('page.gmail') }),
    drive: t('title.app', { app: APP_NAME, page: t('page.drive') }),
    planner: t('title.app', { app: APP_NAME, page: t('page.planner') }),
    insights: t('title.app', { app: APP_NAME, page: t('page.insights') }),
    cleanup: t('title.app', { app: APP_NAME, page: t('page.airlock') }),
    verify: t('title.app', { app: APP_NAME, page: t('page.verify') }),
    settings: t('title.app', { app: APP_NAME, page: t('page.settings') }),
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
          {navItems().map((n) => (
            <a
              key={n.route}
              className={`nav ${n.route === 'cleanup' ? 'basket-link' : ''}`}
              href={`#/${n.route}`}
              aria-current={route === n.route ? 'page' : undefined}
            >
              <span aria-hidden="true">{n.icon}</span> {n.label}
              {n.route === 'cleanup' && totals.count > 0 && <span className="count">{totals.count}</span>}
            </a>
          ))}
          <div className="spacer" />
          <div className="card flat" style={{ padding: 12, fontSize: '0.85rem' }}>
            <div className="mode-pill muted">{mode === 'demo' ? 'Demo data' : mode === 'live' ? 'Connected' : 'Not connected'}</div>
            {me && (
              <div className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {me}
              </div>
            )}
            {totals.count > 0 && (
              <div className="muted">
                Selected {totals.count} · {formatBytes(totals.bytes)}
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
            {route === 'insights' && <Insights />}
            {route === 'cleanup' && <Cleanup />}
            {route === 'verify' && <Verify />}
            {route === 'settings' && <Settings />}
          </Suspense>
          <Footer />
        </main>
        <Tour />
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
