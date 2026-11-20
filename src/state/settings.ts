// SPDX-License-Identifier: AGPL-3.0-or-later
// Tiny, non-sensitive preferences in localStorage. The client ID is public by design (not a secret).

export type Theme = 'auto' | 'dark' | 'light' | 'graphite' | 'contrast'
export const THEMES: Theme[] = ['auto', 'dark', 'graphite', 'light', 'contrast']
export interface Settings {
  clientId: string
  theme: Theme
  capBytes: number | null
  scanDepth: 'quick' | 'standard' | 'deep'
  tourDone: boolean
}
const KEY = 'gsl.settings.v1'
export const DEFAULTS: Settings = { clientId: '', theme: 'auto', capBytes: null, scanDepth: 'standard', tourDone: false }

export function loadSettings(storage: Storage | undefined = globalThis.localStorage): Settings {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const v = JSON.parse(raw) as Partial<Settings>
    return {
      clientId: typeof v.clientId === 'string' ? v.clientId : '',
      theme: THEMES.includes(v.theme as Theme) ? (v.theme as Theme) : 'auto',
      capBytes: typeof v.capBytes === 'number' && v.capBytes > 0 ? v.capBytes : null,
      scanDepth: v.scanDepth === 'quick' || v.scanDepth === 'deep' ? v.scanDepth : 'standard',
      tourDone: v.tourDone === true,
    }
  } catch {
    return { ...DEFAULTS }
  }
}
export function saveSettings(s: Settings, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode: preferences simply aren't remembered */
  }
}
export function clearSettings(storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Gmail search tiers per scan depth: biggest first so the largest wins appear within seconds. */
export const SCAN_TIERS: Record<Settings['scanDepth'], string[]> = {
  quick: ['larger:25M', 'larger:10M', 'larger:5M'],
  standard: ['larger:25M', 'larger:10M', 'larger:5M', 'larger:2M', 'larger:1M'],
  deep: ['larger:25M', 'larger:10M', 'larger:5M', 'larger:2M', 'larger:1M', ''],
}
