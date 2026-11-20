// SPDX-License-Identifier: AGPL-3.0-or-later
/** The only hosts the app may contact. Mirrors connect-src in the CSP (vite.config.ts) and is checked in CI. */
export const ALLOWED_HOSTS = ['www.googleapis.com', 'gmail.googleapis.com', 'accounts.google.com', 'oauth2.googleapis.com'] as const
export const isAllowedHost = (host: string) => (ALLOWED_HOSTS as readonly string[]).includes(host)
