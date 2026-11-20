// SPDX-License-Identifier: AGPL-3.0-or-later
// READ-ONLY smoke test of the real API clients against a real account.
// Usage: ACCESS_TOKEN=<token with gmail.readonly + drive.metadata.readonly> npm run live-check
//   (or separate tokens: GMAIL_TOKEN=... DRIVE_TOKEN=... npm run live-check)
// It never calls any modifying endpoint and prints aggregates only (no subjects, senders or file names).
import { GoogleHttp, Scheduler } from '../src/api/http'
import { GmailApi } from '../src/api/gmail'
import { DriveApi } from '../src/api/drive'
import { clusterMessages } from '../src/analytics/cluster'
import { findDuplicates } from '../src/analytics/drive'
import { formatBytes } from '../src/util/format'

const gmailToken = process.env.GMAIL_TOKEN ?? process.env.ACCESS_TOKEN
const driveToken = process.env.DRIVE_TOKEN ?? process.env.ACCESS_TOKEN
if (!gmailToken || !driveToken) {
  console.error('Set ACCESS_TOKEN (read-only scopes) first.')
  process.exit(2)
}
const urls: string[] = []
const scheduler = new Scheduler({ concurrency: 8, unitsPerSecond: 200 })
const mk = (token: string) => new GoogleHttp({
  getToken: () => token,
  scheduler,
  fetchImpl: (input, init) => {
    const u = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method !== 'GET') throw new Error(`live-check refuses non-GET request: ${method} ${u}`)
    urls.push(u)
    return fetch(input, init)
  },
})
const gmail = new GmailApi(mk(gmailToken))
const drive = new DriveApi(mk(driveToken))

const t0 = Date.now()
const quota = await drive.about()
console.log(`quota: usage ${formatBytes(quota.usage)}, drive ${formatBytes(quota.usageInDrive)}, limit ${quota.limit ? formatBytes(quota.limit) : 'none'}`)
const profile = await gmail.profile()
console.log(`gmail profile: ${profile.messagesTotal} messages, historyId present: ${!!profile.historyId}`)
const labels = await gmail.labelCounts(['INBOX', 'UNREAD', 'CATEGORY_FORUMS'])
console.log('label counts:', labels.map((l) => `${l.id}=${l.messagesTotal}`).join(' '))
const files = await drive.listFiles()
console.log(`drive: ${files.length} items, ${findDuplicates(files).length} duplicate groups`)
const msgs = await gmail.scan(['larger:20M'], { concurrency: 8 })
const total = msgs.reduce((s, m) => s + m.size, 0)
console.log(`gmail larger:20M → ${msgs.length} messages, ${formatBytes(total)}, ${clusterMessages(msgs).length} clusters`)
const bad = urls.filter((u) => /format=(full|raw)/.test(u))
console.log(`requests: ${urls.length}, body requests: ${bad.length}, hosts: ${[...new Set(urls.map((u) => new URL(u).host))].join(', ')}`)
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
if (bad.length) process.exit(1)
