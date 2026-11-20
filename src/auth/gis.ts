// SPDX-License-Identifier: AGPL-3.0-or-later
// Google Identity Services (token model). The user's OWN OAuth Web client ID is used;
// access tokens live in memory only (never localStorage) and expire after ~1 hour.

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const CLIENT_ID_RE = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/

export interface TokenResponseLite {
  access_token?: string
  expires_in?: number | string
  scope?: string
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken(o?: { scope?: string; prompt?: string; include_granted_scopes?: boolean; login_hint?: string }): void
}
interface GoogleOAuth2 {
  initTokenClient(cfg: {
    client_id: string
    scope: string
    callback: (r: TokenResponseLite) => void
    error_callback?: (e: { type: string; message?: string }) => void
    include_granted_scopes?: boolean
    enable_granular_consent?: boolean
    prompt?: string
  }): TokenClient
  revoke(token: string, done: () => void): void
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

export function isValidClientId(id: string): boolean {
  return CLIENT_ID_RE.test(id.trim())
}

/** Pulls a client ID out of things people paste: the bare ID, a JSON download, or a sentence. */
export function extractClientId(text: string): string | null {
  const m = text.match(/[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com/)
  return m ? m[0] : null
}

let loading: Promise<GoogleOAuth2> | null = null
export function loadGis(doc: Document = document): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2)
  if (loading) return loading
  loading = new Promise<GoogleOAuth2>((resolve, reject) => {
    const s = doc.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.onload = () => {
      const o = window.google?.accounts?.oauth2
      if (o) resolve(o)
      else reject(new Error('Google sign-in library loaded but is unavailable'))
    }
    s.onerror = () => {
      loading = null
      reject(new Error('Could not load Google sign-in. Check your connection or content blockers.'))
    }
    doc.head.appendChild(s)
  })
  return loading
}

export interface Grant {
  token: string
  expiresAt: number
  scopes: Set<string>
}

export class AuthError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

/** Human-friendly explanation + fix for the errors people actually hit during setup. */
export function explainAuthError(code: string): { title: string; fix: string } {
  const c = code.toLowerCase()
  if (c.includes('popup_failed') || c.includes('popup_blocked'))
    return { title: 'The sign-in popup was blocked', fix: 'Allow popups for this site in your browser, then try again.' }
  if (c.includes('popup_closed')) return { title: 'The sign-in window was closed', fix: 'Try again and finish the Google consent screen.' }
  if (c.includes('access_denied'))
    return {
      title: 'Access was denied',
      fix: 'Either you pressed Cancel, or your Google account is not listed as a Test user on the OAuth consent screen (Audience → Test users).',
    }
  if (c.includes('origin') || c.includes('redirect_uri'))
    return {
      title: 'This site is not an authorised origin for your client',
      fix: `Add exactly ${typeof location !== 'undefined' ? location.origin : 'this origin'} under "Authorized JavaScript origins" of your OAuth Web client, wait a minute, and retry.`,
    }
  if (c.includes('admin_policy') || c.includes('org_internal'))
    return { title: 'Blocked by your organisation', fix: 'Your Workspace admin restricts third-party apps. Use a personal account or ask the admin.' }
  if (c.includes('invalid_client'))
    return { title: 'Client ID not recognised', fix: 'Copy the Client ID again from Google Cloud Console → Clients. It ends with .apps.googleusercontent.com.' }
  if (c.includes('accessnotconfigured') || c.includes('service_disabled') || c.includes('has not been used'))
    return { title: 'An API is not enabled', fix: 'Enable the Gmail API and the Google Drive API for your Cloud project, wait a minute, retry.' }
  if (c.includes('scope'))
    return { title: 'Some permissions were not granted', fix: 'Sign in again and tick every checkbox on the consent screen for the features you want.' }
  return { title: 'Sign-in failed', fix: 'Check your Client ID and the setup guide, then try again.' }
}

export class GoogleAuth {
  private readonly clientId: string
  private grant: Grant | null = null
  private readonly now: () => number

  constructor(clientId: string, now: () => number = () => Date.now()) {
    if (!isValidClientId(clientId)) throw new AuthError('invalid_client', 'Invalid OAuth client ID')
    this.clientId = clientId.trim()
    this.now = now
  }

  get current(): Grant | null {
    return this.grant && this.grant.expiresAt > this.now() + 30_000 ? this.grant : null
  }

  has(scopes: string[]): boolean {
    const g = this.current
    return !!g && scopes.every((s) => g.scopes.has(s))
  }

  /** Request (or extend) access. Opens Google's popup; must be called from a user gesture. */
  async request(scopes: string[], opts: { prompt?: '' | 'consent' | 'select_account'; hint?: string } = {}): Promise<Grant> {
    const oauth2 = await loadGis()
    const wanted = [...new Set([...(this.grant?.scopes ?? []), ...scopes])]
    return new Promise<Grant>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: wanted.join(' '),
        include_granted_scopes: true,
        enable_granular_consent: true,
        callback: (r) => {
          if (r.error || !r.access_token) {
            reject(new AuthError(r.error ?? 'unknown', r.error_description ?? r.error ?? 'No access token returned'))
            return
          }
          const granted = new Set((r.scope ?? '').split(/\s+/).filter(Boolean))
          const missing = scopes.filter((s) => !granted.has(s))
          this.grant = { token: r.access_token, expiresAt: this.now() + Number(r.expires_in ?? 3599) * 1000, scopes: granted }
          if (missing.length) {
            reject(new AuthError('scope_missing', `Not granted: ${missing.join(', ')}`))
            return
          }
          resolve(this.grant)
        },
        error_callback: (e) => reject(new AuthError(e.type ?? 'unknown', e.message ?? e.type ?? 'Sign-in error')),
      })
      client.requestAccessToken({ prompt: opts.prompt ?? '', login_hint: opts.hint })
    })
  }

  token(): string {
    const g = this.current
    if (!g) throw new AuthError('expired', 'Session expired. Please sign in again.')
    return g.token
  }

  async signOut(): Promise<void> {
    const g = this.grant
    this.grant = null
    if (!g) return
    const oauth2 = window.google?.accounts?.oauth2
    if (oauth2) await new Promise<void>((r) => oauth2.revoke(g.token, () => r()))
  }
}
