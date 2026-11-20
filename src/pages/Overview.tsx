// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react'
import { findDuplicates, revisionBloat, trashedBytes } from '../analytics/drive'
import { anomalies, linearForecast, monthlyByCluster } from '../analytics/series'
import { mergeSenders } from '../analytics/cluster'
import { BarList, QuotaOrbit } from '../charts'
import { go } from '../router'
import { toGmailItems, useCap, useClusters, useNoise, useSafetyMap } from '../state/derived'
import { useApp } from '../state/store'
import { formatBytes, formatCount, formatPct } from '../util/format'

const GiB = 2 ** 30

export default function Overview() {
  const quota = useApp((s) => s.quota)
  const gmail = useApp((s) => s.gmail)
  const drive = useApp((s) => s.drive)
  const labelCounts = useApp((s) => s.labelCounts)
  const mode = useApp((s) => s.mode)
  const setSettings = useApp((s) => s.setSettings)
  const addToBasket = useApp((s) => s.addToBasket)
  const { cap, pooled } = useCap()
  const clusters = useClusters()
  const noise = useNoise()
  const safetyMap = useSafetyMap()
  const [capInput, setCapInput] = useState('')

  const usage = quota?.usage ?? 0
  const inDrive = quota?.usageInDrive ?? 0
  const inTrash = quota?.usageInTrash ?? 0
  const gmailPlusPhotos = Math.max(0, usage - inDrive)
  const scannedGmail = useMemo(() => gmail.reduce((s, m) => s + m.size, 0), [gmail])
  const dups = useMemo(() => findDuplicates(drive), [drive])
  const ghosts = useMemo(() => revisionBloat(drive), [drive])
  const dupWaste = dups.reduce((s, g) => s + g.wasted, 0)
  const ghostWaste = ghosts.reduce((s, g) => s + g.extra, 0)
  const driveTrash = trashedBytes(drive)
  const listBytes = useMemo(() => gmail.filter((m) => m.listId || m.listUnsub).reduce((s, m) => s + m.size, 0), [gmail])
  const unreadBytes = useMemo(() => gmail.filter((m) => m.labels.includes('UNREAD')).reduce((s, m) => s + m.size, 0), [gmail])

  const monthly = useMemo(() => monthlyByCluster(gmail, clusters, 1), [gmail, clusters])
  const monthTotals = useMemo(() => monthly.months.map((_, i) => monthly.series.reduce((s, x) => s + (x.values[i] ?? 0), 0)), [monthly])
  const forecast = cap ? linearForecast(monthTotals, usage, cap) : null
  const spikes = anomalies(monthTotals).map((i) => ({ month: monthly.months[i], bytes: monthTotals[i] ?? 0 }))
  const largest = useMemo(() => gmail.reduce<(typeof gmail)[number] | null>((a, m) => (!a || m.size > a.size ? m : a), null), [gmail])

  if (!quota) return <div className="empty">Connect or open the demo to see your storage.</div>

  const over = cap ? usage > cap : false
  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="topbar">
        <div>
          <h1>Your storage orbit</h1>
          <p className="muted" style={{ margin: 0 }}>
            {mode === 'demo' ? 'Synthetic demo data. Nothing here is real.' : 'Read-only so far. Nothing has been changed.'}
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => go('planner')}>
            Plan a cleanup
          </button>
          <button className="btn primary" onClick={() => go('gmail')}>
            Explore Gmail →
          </button>
        </div>
      </header>

      <div className="grid cols-2">
        <section className="card" aria-labelledby="orbit-h">
          <h2 id="orbit-h">Quota</h2>
          <QuotaOrbit
            total={cap ?? usage}
            centerLabel={formatBytes(usage)}
            centerSub={cap ? `of ${formatBytes(cap)} · ${formatPct(usage / cap)}` : 'used'}
            rings={[
              { label: 'Gmail + Photos', value: gmailPlusPhotos, color: 'var(--series-3)' },
              { label: 'Drive', value: inDrive - inTrash, color: 'var(--series-5)' },
              { label: 'Drive Trash', value: inTrash, color: 'var(--series-4)' },
            ]}
          />
          {over && <p className="chip bad">Over capacity: new email may bounce and uploads fail until you free space.</p>}
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Google's API reports Drive separately but not Gmail vs Photos, so they are shown together. Photos cannot be measured by any
            third-party app since Google removed that API access in 2025.
          </p>
        </section>

        <section className="card stack">
          <h2>At a glance</h2>
          <div className="grid cols-3">
            <div className="stat">
              <span className="v">{formatBytes(scannedGmail)}</span>
              <span className="k">in {formatCount(gmail.length)} scanned emails</span>
            </div>
            <div className="stat">
              <span className="v">{formatBytes(listBytes)}</span>
              <span className="k">from mailing lists</span>
            </div>
            <div className="stat">
              <span className="v">{formatBytes(unreadBytes)}</span>
              <span className="k">never opened</span>
            </div>
            <div className="stat">
              <span className="v">{formatBytes(dupWaste)}</span>
              <span className="k">Drive duplicates</span>
            </div>
            <div className="stat">
              <span className="v">{formatBytes(ghostWaste)}</span>
              <span className="k">hidden old versions</span>
            </div>
            <div className="stat">
              <span className="v">{formatBytes(driveTrash)}</span>
              <span className="k">sitting in Drive Trash</span>
            </div>
          </div>
          {(pooled || !cap) && (
            <div className="card flat">
              <strong>{pooled ? 'This looks like a shared organisation pool' : 'No storage limit reported'}</strong>
              <p className="muted" style={{ margin: '4px 0 8px' }}>
                Google reported {quota.limit ? formatBytes(quota.limit) : 'no limit'}. Work and school accounts often have a smaller
                personal cap. Enter the number shown at drive.google.com/settings/storage:
              </p>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault()
                  const v = Number(capInput)
                  if (v > 0) setSettings({ capBytes: v * GiB })
                }}
              >
                <input type="number" min="1" step="1" placeholder="e.g. 20" value={capInput} onChange={(e) => setCapInput(e.target.value)} style={{ width: 120 }} aria-label="Personal storage cap in GB" />
                <span className="muted">GB</span>
                <button className="btn sm" type="submit">
                  Use this cap
                </button>
              </form>
            </div>
          )}
          {forecast && forecast.monthsToCap !== null && (
            <p className="funfact">
              At the pace of the last 12 months, you {over ? 'are already over' : <>reach your cap in about <b>{forecast.monthsToCap.toFixed(1)} months</b></>}.
            </p>
          )}
        </section>
      </div>

      <section className="card">
        <div className="row between">
          <h2>Biggest wins</h2>
          <span className="muted">Senders ranked by noise: bytes × how rarely you open them × how often they send</span>
        </div>
        <BarList
          max={8}
          rows={noise.slice(0, 8).map((n) => ({
            id: n.key,
            label: n.label,
            value: n.bytes,
            sub: `${formatCount(n.count)} emails · ${formatPct(n.readRate)} opened`,
            badge: n.readRate < 0.1 ? 'never read' : undefined,
          }))}
          onClick={(key) => {
            const canon = mergeSenders(gmail)
            const msgs = gmail.filter((m) => (canon.get(m.fromEmail) ?? m.fromEmail) === key)
            const items = toGmailItems(msgs, safetyMap)
            addToBasket(items)
            useApp.getState().toast(`Added ${items.length} emails to the Airlock (protected ones skipped).`)
          }}
        />
        <p className="muted" style={{ marginTop: 8 }}>
          Click a bar to add that sender's emails to the Airlock. Starred, sent, and important-person mail is always skipped.
        </p>
      </section>

      <div className="grid cols-3">
        {largest && (
          <div className="card funfact">
            Your largest email is <b>{formatBytes(largest.size)}</b>, from {largest.fromName || largest.fromEmail}.
          </div>
        )}
        {listBytes > 0 && (
          <div className="card funfact">
            Mailing lists weigh <b>{formatBytes(listBytes)}</b>, about <b>{formatCount(Math.round(listBytes / (3 * 2 ** 20)))}</b> phone photos.
          </div>
        )}
        {spikes.length > 0 && (
          <div className="card funfact">
            Spike alert: <b>{spikes[0]!.month}</b> brought {formatBytes(spikes[0]!.bytes)} of large mail, far above your usual month.
          </div>
        )}
        {labelCounts.length > 0 && (
          <div className="card funfact">
            <b>{formatCount(labelCounts.find((l) => l.id === 'UNREAD')?.messagesTotal ?? 0)}</b> unread emails, and{' '}
            <b>{formatCount(labelCounts.find((l) => l.id === 'CATEGORY_FORUMS')?.messagesTotal ?? 0)}</b> in Forums.
          </div>
        )}
      </div>
    </div>
  )
}
