// SPDX-License-Identifier: AGPL-3.0-or-later
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

/** Strict Content-Security-Policy, injected only into production builds.
 *  The ONLY third-party script is Google's own sign-in library. */
export const CSP = [
  "default-src 'none'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' https://accounts.google.com/gsi/style",
  'style-src-attr \'unsafe-inline\'',
  "img-src 'self' data: blob:",
  "font-src 'self'",
  'connect-src \'self\' https://www.googleapis.com https://gmail.googleapis.com https://accounts.google.com https://oauth2.googleapis.com',
  "frame-src https://accounts.google.com/gsi/",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
    },
  }
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), cspPlugin()],
  build: { sourcemap: true, target: 'es2023' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8', include: ['src/analytics/**', 'src/api/**', 'src/util/**'], reporter: ['text', 'lcov'] },
  },
})
