// SPDX-License-Identifier: AGPL-3.0-or-later
// Hash routing: works on GitHub Pages without server rewrites.
import { useSyncExternalStore } from 'react'

export type Route = 'home' | 'setup' | 'overview' | 'gmail' | 'drive' | 'planner' | 'cleanup' | 'verify' | 'settings'
const ROUTES: Route[] = ['home', 'setup', 'overview', 'gmail', 'drive', 'planner', 'cleanup', 'verify', 'settings']

export function parseHash(hash: string): { route: Route; tab?: string } {
  const [r, tab] = hash.replace(/^#\/?/, '').split('/')
  const route = (ROUTES as string[]).includes(r ?? '') ? (r as Route) : 'home'
  return { route, tab: tab || undefined }
}
const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '')
  return parseHash(hash)
}
export function go(route: Route, tab?: string) {
  window.location.hash = `#/${route === 'home' ? '' : route}${tab ? `/${tab}` : ''}`
}
