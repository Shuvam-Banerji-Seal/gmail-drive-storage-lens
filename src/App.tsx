// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense, useEffect, useState } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { Icon, type IconName } from './components/Icon'
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

interface NavItem {
  route: Route
  label: string
  icon: IconName
  tip: string
}
const NAV: NavItem[] = [
  { route: 'overview', label: t('nav.overview'), icon: 'overview', tip: 'Quota, trends and the biggest wins' },
  { route: 'gmail', label: t('nav.gmail'), icon: 'mail', tip: 'Senders, graphs, time and attachments' },
  { route: 'drive', label: t('nav.drive'), icon: 'drive', tip: 'Folders, duplicates, old versions, sharing' },
  { route: 'planner', label: t('nav.planner'), icon: 'planner', tip: 'Pick a target, get the safest plan' },
  { route: 'insights', label: t('nav.insights'), icon: 'insights', tip: 'Cross-service relationships' },
  { route: 'cleanup', label: t('nav.airlock'), icon: 'airlock', tip: 'Review and clean what you selected' },
  { route: 'verify', label: t('nav.verify'), icon: 'verify', tip: 'Live proof that data only goes to Google' },
  { route: 'settings', label: t('nav.settings'), icon: 'settings', tip: 'Themes, client ID, encrypted cache' },
]
const MOBILE_TABS: Route[] = ['overview', 'gmail', 'drive', 'cleanup']

const TITLES: Record<Route, string> = {
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

function useResolvedTheme(): void {
  const theme = useApp((s) => s.settings.theme)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'auto' ? (mq?.matches ? 'light' : 'dark') : theme
    }
    apply()
    mq?.addEventListener?.('change', apply)
    return () => mq?.removeEventListener?.('change', apply)
  }, [theme])
}

export function App() {
  const { route, tab } = useRoute()
  const mode = useApp((s) => s.mode)
  const basket = useApp((s) => s.basket)
  const me = useApp((s) => s.me)
  const [sheet, setSheet] = useState(false)
  const count = basketTotals(basket).count
  useResolvedTheme()

  useEffect(() => {
    document.title = TITLES[route]
    window.scrollTo?.(0, 0)
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

  const leave = () => void signOut().then(() => go('home'))
  return (
    <>
      <Starfield />
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="appbar">
        <a className="brand" href="#/" aria-label={`${APP_NAME} home`} style={{ padding: 0 }}>
          <Logo size={26} /> <b style={{ display: 'inline' }}>Storage Lens</b>
        </a>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" aria-label="Search views (Ctrl K)" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>
            <Icon name="search" />
          </button>
          <span className="avatar" aria-hidden="true">
            {(me || (mode === 'demo' ? 'demo' : '?')).slice(0, 1).toUpperCase()}
          </span>
        </div>
      </header>

      <div className="shell">
        <nav className="rail" aria-label={t('nav.main')}>
          <a className="brand" href="#/" aria-label={`${APP_NAME} home`}>
            <Logo size={30} /> <b>Storage Lens</b>
          </a>
          {NAV.map((n) => (
            <a key={n.route} className="nav" href={`#/${n.route}`} aria-current={route === n.route ? 'page' : undefined} data-tip={n.tip} aria-label={n.label}>
              <Icon name={n.icon} />
              <span className="label">{n.label}</span>
              {n.route === 'cleanup' && count > 0 && <span className="count">{count}</span>}
            </a>
          ))}
          <div className="spacer" />
          <div className="account">
            <span className="avatar" aria-hidden="true">
              {(me || (mode === 'demo' ? 'demo' : '?')).slice(0, 1).toUpperCase()}
            </span>
            <div className="who">
              <span>{mode === 'demo' ? 'Demo data' : mode === 'live' ? 'Connected' : 'Offline'}</span>
              <span className="truncate mono">{me || '—'}</span>
            </div>
            <button className="icon-btn" aria-label={mode === 'demo' ? 'Leave demo' : 'Sign out'} data-tip={mode === 'demo' ? 'Leave demo' : 'Sign out and revoke'} onClick={leave}>
              <Icon name="external" size={18} />
            </button>
          </div>
          <div className="hint muted" style={{ fontSize: '0.74rem', padding: '10px 6px 0' }}>
            <kbd>Ctrl</kbd> <kbd>K</kbd> jump anywhere
          </div>
        </nav>

        <main id="main" className="main">
          <ScanBar />
          <Suspense fallback={<div className="empty">Loading…</div>}>
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
      </div>

      <nav className="tabbar" aria-label="Primary">
        {MOBILE_TABS.map((r) => {
          const n = NAV.find((x) => x.route === r)!
          return (
            <a key={r} href={`#/${r}`} aria-current={route === r ? 'page' : undefined}>
              <Icon name={n.icon} size={22} />
              {n.label}
              {r === 'cleanup' && count > 0 && <span className="count">{count}</span>}
            </a>
          )
        })}
        <button type="button" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)}>
          <Icon name="more" size={22} />
          More
        </button>
      </nav>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="More views" onClick={(e) => e.stopPropagation()}>
            <div className="grabber" />
            <div className="sheet-grid">
              {NAV.filter((n) => !MOBILE_TABS.includes(n.route)).map((n) => (
                <a key={n.route} href={`#/${n.route}`} onClick={() => setSheet(false)}>
                  <Icon name={n.icon} /> {n.label}
                </a>
              ))}
              <a
                href="#/"
                onClick={(e) => {
                  e.preventDefault()
                  setSheet(false)
                  leave()
                }}
              >
                <Icon name="external" /> {mode === 'demo' ? 'Leave demo' : 'Sign out'}
              </a>
            </div>
          </div>
        </div>
      )}

      {count > 0 && route !== 'cleanup' && (
        <span className="sr-only" aria-live="polite">
          {count} items selected, {formatBytes(Object.values(basket).reduce((s, i) => s + i.bytes, 0))}
        </span>
      )}
      <Tour />
      <Toasts />
      <CommandPalette />
    </>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <span>
        Free software ·{' '}
        <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noopener noreferrer" target="_blank">
          AGPL-3.0-or-later
        </a>
      </span>
      <a href={SOURCE_URL} rel="noopener noreferrer" target="_blank">
        Source {COMMIT === 'dev' ? '(dev)' : COMMIT.slice(0, 7)}
      </a>
      <a href="#/verify">Verify privacy</a>
      <span>Not affiliated with Google. Gmail and Google Drive are trademarks of Google LLC.</span>
    </footer>
  )
}
