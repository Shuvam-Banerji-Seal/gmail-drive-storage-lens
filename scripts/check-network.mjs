// SPDX-License-Identifier: AGPL-3.0-or-later
// CI guard: fails if (1) the built CSP is missing or loosened, or (2) any source file references a network
// host outside the allowlist in a place the app could fetch from. Run after `npm run build`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ALLOWED_CONNECT = ['https://www.googleapis.com', 'https://gmail.googleapis.com', 'https://accounts.google.com', 'https://oauth2.googleapis.com']
const errors = []

// 1) CSP in the production HTML
let html = ''
try {
  html = readFileSync('dist/index.html', 'utf8')
} catch {
  errors.push('dist/index.html not found: run `npm run build` first')
}
const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)
if (!m) errors.push('CSP meta tag missing from dist/index.html')
else {
  const d = Object.fromEntries(
    m[1].split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
      const [k, ...v] = s.split(/\s+/)
      return [k, v]
    }),
  )
  const want = (k, cond, msg) => {
    if (!cond(d[k] ?? [])) errors.push(`CSP ${k}: ${msg} (got: ${(d[k] ?? []).join(' ') || 'missing'})`)
  }
  want('default-src', (v) => v.length === 1 && v[0] === "'none'", "must be 'none'")
  want('connect-src', (v) => v.every((x) => x === "'self'" || ALLOWED_CONNECT.includes(x)), 'contains a host outside the allowlist')
  want('script-src', (v) => v.every((x) => x === "'self'" || x === 'https://accounts.google.com/gsi/client'), 'only self and Google sign-in allowed')
  want('script-src', (v) => !v.some((x) => /unsafe-(inline|eval)/.test(x)), 'unsafe-inline/eval forbidden')
  want('form-action', (v) => v[0] === "'none'", "must be 'none'")
  want('object-src', (v) => v[0] === "'none'", "must be 'none'")
}

// 2) No unexpected hosts in fetchable source code
const ALLOWED_TEXT_HOSTS = new Set([
  'www.googleapis.com', 'gmail.googleapis.com', 'accounts.google.com', 'oauth2.googleapis.com',
  // Plain links the user may click (navigation, never fetched by the app):
  'console.cloud.google.com', 'myaccount.google.com', 'drive.google.com', 'mail.google.com', 'github.com',
  'shuvam-banerji-seal.github.io', 'www.gnu.org', 'example.com', 'example.org', 'example.edu', 'localhost',
])
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
for (const file of walk('src')) {
  if (!/\.(ts|tsx)$/.test(file) || /\.test\.tsx?$/.test(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const u of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    if (!ALLOWED_TEXT_HOSTS.has(u[1].toLowerCase())) errors.push(`${file}: unexpected host ${u[1]}`)
  }
  if (/\bfetch\(\s*['"`]https?:\/\/(?!(www|gmail|oauth2)\.googleapis\.com|accounts\.google\.com|example\.com\/storage-lens-probe)/.test(text))
    errors.push(`${file}: fetch() to a non-Google host`)
  // Bodies may only be requested by the two audited, opt-in methods in src/api/gmail.ts.
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (!/format=(full|raw)|['"]format['"]\s*,\s*['"](full|raw)['"]/.test(line)) return
    const okArchive = file.endsWith('src/api/gmail.ts') && /OPT-IN-ARCHIVE/.test(line)
    const okParts = file.endsWith('src/api/gmail.ts') && /structure-only/.test(line) && /body\/size/.test(lines[i + 1] ?? '') && !/body\/data/.test(lines[i + 1] ?? '')
    if (!okArchive && !okParts) errors.push(`${file}:${i + 1}: requests message bodies (format=full/raw) outside the audited opt-in methods`)
  })
}

if (errors.length) {
  console.error('Network/CSP check FAILED:\n- ' + errors.join('\n- '))
  process.exit(1)
}
console.log('Network/CSP check passed: CSP is strict and no unexpected hosts are referenced.')
