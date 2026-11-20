// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react'
import { mergeSenders } from '../analytics/cluster'
import { coldFiles, findDuplicates, revisionBloat, trashedBytes } from '../analytics/drive'
import { recommend, topOffenders, type Recommendation } from '../analytics/recommend'
import { anomalies, linearForecast, monthlyByCluster } from '../analytics/series'
import { BarList, QuotaOrbit } from '../charts'
import { Icon } from '../components/Icon'
import { Info } from '../components/Info'
import { Ring, Sparkline, StackBar } from '../components/Mini'
import { PageHeader, SectionHead } from '../components/PageHeader'
import { go } from '../router'
import { toGmailItems, useCap, useClusters, useMsgIndex, useNoise, useSafetyMap } from '../state/derived'
import { useApp } from '../state/store'
import type { BasketItem } from '../types'
import { formatBytes, formatCount, formatPct } from '../util/format'

const GiB = 2 ** 30
const NOW = Date.now()
const CATEGORIES: Array<[string, string]> = [
  ['CATEGORY_FORUMS', 'Forums'],
  ['CATEGORY_UPDATES', 'Updates'],
  ['CATEGORY_PROMOTIONS', 'Promotions'],
  ['CATEGORY_SOCIAL', 'Social'],
  ['CATEGORY_PERSONAL', 'Primary'],
]

export default function Overview() {
  const quota = useApp((s) => s.quota)
  const gmail = useApp((s) => s.gmail)
  const drive = useApp((s) => s.drive)
  const labelCounts = useApp((s) => s.labelCounts)
  const mode = useApp((s) => s.mode)
  const setSettings = useApp((s) => s.setSettings)
  const addToBasket = useApp((s) => s.addToBasket)
  const toast = useApp((s) => s.toast)
  const { cap, pooled } = useCap()
  const clusters = useClusters()
  const noise = useNoise()
  const safetyMap = useSafetyMap()
  const byId = useMsgIndex()
  const [capInput, setCapInput] = useState('')

  const usage = quota?.usage ?? 0
  const inDrive = quota?.usageInDrive ?? 0
  const inTrash = quota?.usageInTrash ?? 0
  const gmailPlusPhotos = Math.max(0, usage - inDrive)

  const m = useMemo(() => {
    const scanned = gmail.reduce((s, x) => s + x.size, 0)
    const lists = gmail.filter((x) => x.listId || x.listUnsub).reduce((s, x) => s + x.size, 0)
    const unread = gmail.filter((x) => x.labels.includes('UNREAD')).reduce((s, x) => s + x.size, 0)
    const dups = findDuplicates(drive).reduce((s, g) => s + g.wasted, 0)
    const ghosts = revisionBloat(drive).reduce((s, g) => s + g.extra, 0)
    const cold = coldFiles(drive, NOW).reduce((s, f) => s + (f.quota || f.size), 0)
    return { scanned, lists, unread, dups, ghosts, cold, trash: trashedBytes(drive) }
  }, [gmail, drive])

  const monthly = useMemo(() => monthlyByCluster(gmail, clusters, 1), [gmail, clusters])
  const totals = useMemo(() => monthly.months.map((_, i) => monthly.series.reduce((s, x) => s + (x.values[i] ?? 0), 0)), [monthly])
  const forecast = cap ? linearForecast(totals, usage, cap) : null
  const spikes = useMemo(() => new Set(anomalies(totals)), [totals])
  const recs = useMemo(() => recommend({ gmail, drive, safety: safetyMap, now: NOW }), [gmail, drive, safetyMap])
  const offenders = useMemo(() => topOffenders(clusters, drive, 8), [clusters, drive])

  if (!quota) return <div className="empty">Connect or open the demo to see your storage.</div>

  const over = cap ? usage > cap : false
  const addRec = (r: Recommendation) => {
    let items: BasketItem[]
    if (r.target.kind === 'gmail') {
      items = toGmailItems(r.target.ids.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x), safetyMap)
    } else {
      const ids = new Set(r.target.ids)
      items = drive.filter((f) => ids.has(f.id)).map((f) => ({ kind: 'drive' as const, id: f.id, bytes: f.quota || f.size, label: f.name }))
    }
    addToBasket(items)
    toast(`Added ${formatCount(items.length)} items · ${formatBytes(items.reduce((s, i) => s + i.bytes, 0))}`)
  }

  const kpis: Array<{ k: string; v: number; tip: string; spark?: number[]; color?: string }> = [
    { k: 'Mailing lists', v: m.lists, tip: 'Bytes in scanned emails that carry a List-Id or unsubscribe header.', spark: totals.slice(-18), color: 'var(--series-1)' },
    { k: 'Never opened', v: m.unread, tip: 'Bytes in scanned emails still marked unread.', color: 'var(--series-2)' },
    { k: 'Drive duplicates', v: m.dups, tip: 'Extra copies of identical files (same checksum). One copy of each is kept.', color: 'var(--series-3)' },
    { k: 'Old versions', v: m.ghosts, tip: 'Hidden file versions pinned with "keep forever". They count toward quota.', color: 'var(--series-4)' },
    { k: 'Cold files', v: m.cold, tip: 'Large Drive files not opened for 2+ years.', color: 'var(--series-5)' },
    { k: 'Drive trash', v: m.trash, tip: 'Trashed files still count until Trash is emptied.', color: 'var(--series-6)' },
  ]
  const catMax = Math.max(1, ...CATEGORIES.map(([id]) => labelCounts.find((l) => l.id === id)?.messagesTotal ?? 0))
  const inbox = labelCounts.find((l) => l.id === 'INBOX')
  const unreadAll = labelCounts.find((l) => l.id === 'UNREAD')?.messagesTotal ?? 0

  return (
    <div className="page">
      <PageHeader
        eyebrow={`01 · Overview${mode === 'demo' ? ' · demo data' : ''}`}
        title="Your storage orbit"
        info="Quota comes from the Drive API. Gmail and Photos are reported together by Google; Photos cannot be measured separately by any third-party app."
        actions={
          <>
            <button className="btn" onClick={() => go('planner')}>
              <Icon name="planner" size={18} /> Plan
            </button>
            <button className="btn primary" onClick={() => go('gmail')}>
              Explore Gmail <Icon name="arrow" size={18} />
            </button>
          </>
        }
      />

      <div className="grid span">
        <section className="card hero-card stack quota-card" aria-label="Quota">
          <SectionHead title="Quota" info="Rings: share of your cap used by each service. The dashed line on the bar marks your cap.">
            <span className={`chip ${over ? 'bad' : 'ok'}`}>{cap ? (over ? `Over by ${formatBytes(usage - cap)}` : `${formatBytes(cap - usage)} free`) : 'No cap'}</span>
          </SectionHead>
          <QuotaOrbit
            total={cap ?? usage}
            centerLabel={formatBytes(usage)}
            centerSub={cap ? `of ${formatBytes(cap)} · ${formatPct(usage / cap)}` : 'used'}
            rings={[
              { label: 'Gmail + Photos', value: gmailPlusPhotos, color: 'var(--series-1)' },
              { label: 'Drive', value: Math.max(0, inDrive - inTrash), color: 'var(--series-2)' },
              { label: 'Drive Trash', value: inTrash, color: 'var(--series-8)' },
            ]}
          />
          <StackBar
            cap={cap ?? undefined}
            segs={[
              { label: 'Gmail + Photos', value: gmailPlusPhotos, color: 'var(--series-1)' },
              { label: 'Drive', value: Math.max(0, inDrive - inTrash), color: 'var(--series-2)' },
              { label: 'Trash', value: inTrash, color: 'var(--series-8)' },
            ]}
          />
          {(pooled || !cap) && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault()
                const v = Number(capInput)
                if (v > 0) setSettings({ capBytes: v * GiB })
              }}
            >
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {pooled ? 'Shared pool detected.' : 'No limit reported.'} Your cap:
              </span>
              <input type="number" min="1" placeholder="20" value={capInput} onChange={(e) => setCapInput(e.target.value)} style={{ width: 90 }} aria-label="Personal storage cap in GB" />
              <span className="muted">GB</span>
              <button className="btn sm" type="submit">
                Set
              </button>
              <Info>Work and school accounts often report the whole organisation's pool. Use the number shown at drive.google.com/settings/storage.</Info>
            </form>
          )}
        </section>

        <section className="stack" aria-label="Key numbers">
          <div className="grid kpi-grid">
            <div className="kpi">
              <div className="top">
                Used <Info>Total quota used across Gmail, Drive and Photos, reported by Google.</Info>
              </div>
              <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'space-between' }}>
                <span className="v">{formatBytes(usage)}</span>
                {cap && <Ring value={usage / cap} color={over ? 'var(--danger)' : 'var(--accent)'} size={40} />}
              </div>
            </div>
            <div className="kpi">
              <div className="top">
                Scanned mail <Info>Emails read during the scan (headers and sizes only) and their total size.</Info>
              </div>
              <span className="v">
                {formatBytes(m.scanned)}
                <small>{formatCount(gmail.length)}</small>
              </span>
            </div>
            {kpis.map((k) => (
              <div key={k.k} className="kpi">
                <div className="top">
                  {k.k} <Info>{k.tip}</Info>
                </div>
                <span className="v" style={{ color: k.v > 0 ? undefined : 'var(--muted)' }}>
                  {formatBytes(k.v)}
                </span>
                {k.spark && k.spark.length > 1 && <Sparkline values={k.spark} color={k.color} label="Large mail per month" />}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid cols-2">
        <section className="card stack" aria-label="Growth">
          <SectionHead title="Monthly intake" info="Bytes of scanned (large) mail received each month. Highlighted bars are unusual spikes.">
            {forecast?.monthsToCap != null && !over && <span className="chip warn">Full in ~{forecast.monthsToCap.toFixed(0)} mo</span>}
            {over && <span className="chip bad">Over cap</span>}
          </SectionHead>
          <MonthBars months={monthly.months} values={totals} spikes={spikes} />
        </section>
        <section className="card stack" aria-label="Mailbox from Gmail">
          <SectionHead title="Mailbox" info="Message counts straight from the Gmail API labels: total per inbox category, with the unread part highlighted.">
            {inbox && <span className="chip">{formatCount(inbox.messagesTotal)} in inbox</span>}
          </SectionHead>
          {labelCounts.length === 0 ? (
            <div className="empty">No label data yet.</div>
          ) : (
            <div className="row" style={{ alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
                <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`${formatCount(unreadAll)} unread`}>
                  <circle cx="60" cy="60" r="48" fill="none" stroke="var(--surface-3)" strokeWidth="12" />
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 48 * Math.min(1, unreadAll / Math.max(1, inbox?.messagesTotal ?? unreadAll))} 999`}
                    transform="rotate(-90 60 60)"
                  />
                  <text x="60" y="58" textAnchor="middle" style={{ font: '500 18px var(--mono)', fill: 'var(--text)' }}>
                    {formatPct(unreadAll / Math.max(1, inbox?.messagesTotal ?? unreadAll))}
                  </text>
                  <text x="60" y="76" textAnchor="middle" style={{ font: '500 9px var(--mono)', fill: 'var(--muted)', letterSpacing: '0.12em' }}>
                    UNREAD
                  </text>
                </svg>
              </div>
              <div className="stack" style={{ flex: 1, minWidth: 220, gap: 10 }}>
                {CATEGORIES.map(([id, name], i) => {
                  const l = labelCounts.find((x) => x.id === id)
                  const tot = l?.messagesTotal ?? 0
                  const un = l?.messagesUnread ?? 0
                  return (
                    <div key={id} style={{ display: 'grid', gridTemplateColumns: '88px 1fr 64px', gap: 10, alignItems: 'center', fontSize: '0.85rem' }}>
                      <span className="muted">{name}</span>
                      <svg viewBox="0 0 100 10" preserveAspectRatio="none" style={{ width: '100%', height: 10 }} aria-hidden="true">
                        <rect width="100" height="10" rx="5" fill="var(--surface-3)" />
                        <rect width={(tot / catMax) * 100} height="10" rx="5" fill={`var(--series-${i + 1})`} opacity="0.4" />
                        <rect width={(un / catMax) * 100} height="10" rx="5" fill={`var(--series-${i + 1})`} />
                      </svg>
                      <span className="mono-num" style={{ textAlign: 'right' }}>
                        {formatCount(tot)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="stack" aria-labelledby="rec-h">
        <div className="section-head">
          <div className="title">
            <h2 id="rec-h">Recommendations</h2>
            <Info>Explainable rules. Hover a card's “i” for the exact rule. Protected mail (starred, sent, drafts, people you write to) is never included.</Info>
          </div>
          {recs.length > 0 && <span className="chip ok">{formatBytes(recs.reduce((s, r) => s + r.bytes, 0))} possible</span>}
        </div>
        {recs.length === 0 ? (
          <div className="card empty">Nothing to suggest yet. Run a scan.</div>
        ) : (
          <div className="grid cols-3">
            {recs.slice(0, 9).map((r) => (
              <article key={r.id} className="card stack" style={{ gap: 10 }}>
                <div className="row between" style={{ flexWrap: 'nowrap' }}>
                  <span className="row" style={{ gap: 8, minWidth: 0, flexWrap: 'nowrap' }}>
                    <Icon name={r.target.kind === 'gmail' ? 'mail' : 'drive'} size={18} />
                    <h3 className="clamp-2">{r.title}</h3>
                  </span>
                  <Info label={`Why: ${r.title}`}>{r.why}</Info>
                </div>
                <div className="row between">
                  <span className="mono-num" style={{ fontSize: '1.35rem' }}>
                    {formatBytes(r.bytes)}
                  </span>
                  <span className={`chip ${r.risk === 'low' ? 'ok' : r.risk === 'medium' ? 'warn' : 'bad'}`}>{r.risk} risk</span>
                </div>
                <button className="btn sm" onClick={() => addRec(r)} aria-label={`Add to Airlock: ${r.title}`}>
                  <Icon name="airlock" size={16} /> Add to Airlock
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid cols-2">
        <section className="card stack">
          <SectionHead title="Biggest wins" info="Senders ranked by noise: bytes × how rarely you open them × how often they send. Click a bar to add that sender's mail (protected mail is skipped).">
            <button className="btn sm ghost" onClick={() => go('gmail', 'senders')}>
              All senders
            </button>
          </SectionHead>
          <BarList
            max={7}
            rows={noise.slice(0, 7).map((n) => ({
              id: n.key,
              label: n.label,
              value: n.bytes,
              sub: `${formatCount(n.count)} emails · ${formatPct(n.readRate)} opened`,
              badge: n.readRate < 0.1 ? 'never read' : undefined,
            }))}
            onClick={(key) => {
              const canon = mergeSenders(gmail)
              const items = toGmailItems(
                gmail.filter((x) => (canon.get(x.fromEmail) ?? x.fromEmail) === key),
                safetyMap,
              )
              addToBasket(items)
              toast(`Added ${formatCount(items.length)} emails · ${formatBytes(items.reduce((s, i) => s + i.bytes, 0))}`)
            }}
          />
        </section>
        <section className="card stack">
          <SectionHead title="Top offenders" info="The largest Gmail clusters and Drive files side by side." />
          <div className="table-wrap">
            <table className="data" aria-label="Top offenders across Gmail and Drive">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Size
                  </th>
                </tr>
              </thead>
              <tbody>
                {offenders.map((o, i) => (
                  <tr key={`${o.kind}-${i}`}>
                    <td>
                      <span className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
                        <Icon name={o.kind === 'gmail' ? 'mail' : 'drive'} size={16} style={{ flex: 'none', color: 'var(--muted)' }} />
                        <span className="truncate" title={o.detail}>
                          {o.label}
                        </span>
                      </span>
                    </td>
                    <td className="mono-num nowrap" style={{ textAlign: 'right' }}>
                      {formatBytes(o.bytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

/** Column chart of monthly bytes with hover values; spikes are drawn in the accent colour. */
function MonthBars({ months, values, spikes }: { months: string[]; values: number[]; spikes: Set<number> }) {
  const [hover, setHover] = useState<number | null>(null)
  const n = Math.min(36, values.length)
  const vs = values.slice(-n)
  const ms = months.slice(-n)
  const off = values.length - n
  if (n === 0) return <div className="empty">No monthly data yet.</div>
  const max = Math.max(...vs, 1)
  const W = 600
  const H = 180
  const bw = W / n
  const h = hover ?? n - 1
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between">
        <span className="mono-num" style={{ fontSize: '1.3rem' }}>
          {formatBytes(vs[h] ?? 0)}
        </span>
        <span className="muted mono" style={{ fontSize: '0.78rem' }}>
          {ms[h]}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Monthly intake for ${n} months, peak ${formatBytes(max)}`} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1="0" x2={W} y1={H - t * H} y2={H - t * H} stroke="var(--border)" strokeDasharray="2 4" />
        ))}
        {vs.map((v, i) => {
          const bh = Math.max(1.5, (v / max) * (H - 6))
          const spike = spikes.has(i + off)
          return (
            <g key={ms[i]} onMouseEnter={() => setHover(i)}>
              <rect x={i * bw} y="0" width={bw} height={H} fill="transparent" />
              <rect
                x={i * bw + bw * 0.18}
                y={H - bh}
                width={bw * 0.64}
                height={bh}
                rx={Math.min(3, bw * 0.2)}
                fill={spike ? 'var(--accent)' : i === h ? 'var(--series-2)' : 'var(--surface-3)'}
                stroke={i === h ? 'var(--series-2)' : 'none'}
              />
            </g>
          )
        })}
        {ms.map((mo, i) =>
          i % Math.ceil(n / 6) === 0 ? (
            <text key={mo} x={i * bw + bw / 2} y={H + 14} textAnchor="middle" style={{ font: '500 10px var(--mono)', fill: 'var(--muted)' }}>
              {mo}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  )
}
