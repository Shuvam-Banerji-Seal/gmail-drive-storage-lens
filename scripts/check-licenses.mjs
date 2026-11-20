// SPDX-License-Identifier: AGPL-3.0-or-later
// CI guard: every production dependency must use an AGPL-3.0-compatible licence.
import { execFileSync } from 'node:child_process'

const ALLOWED = ['OFL-1.1', 'MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'MPL-2.0', 'BlueOak-1.0.0', 'CC0-1.0', 'Unlicense', 'Python-2.0', 'AGPL-3.0-or-later', 'GPL-3.0-or-later', 'LGPL-3.0-or-later']
const out = execFileSync('npx', ['license-checker-rseidelsohn', '--production', '--json', '--excludePrivatePackages'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const pkgs = JSON.parse(out)
const bad = []
for (const [name, info] of Object.entries(pkgs)) {
  if (name.startsWith('gmail-drive-storage-lens@')) continue
  const lic = String(info.licenses ?? 'UNKNOWN').replace(/[()*]/g, '')
  const parts = lic.split(/\s+OR\s+/)
  if (!parts.some((p) => p.split(/\s+AND\s+/).every((x) => ALLOWED.includes(x.trim())))) bad.push(`${name}: ${info.licenses}`)
}
if (bad.length) {
  console.error('Incompatible or unknown licences:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log(`Licence check passed for ${Object.keys(pkgs).length} production packages.`)
