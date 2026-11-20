// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react'
import { findDuplicates, keepRule } from '../analytics/drive'
import { planBudget, whatIf, type PlanGroup } from '../analytics/planner'
import { go } from '../router'
import { toGmailItems, useCap, useClusters, useMsgIndex, useSafetyMap } from '../state/derived'
import { useApp } from '../state/store'
import type { BasketItem } from '../types'
import { formatBytes, formatPct } from '../util/format'

const GiB = 2 ** 30

interface Candidate extends PlanGroup {
  items: BasketItem[]
  kind: 'gmail' | 'drive'
}

export default function Planner() {
  const quota = useApp((s) => s.quota)
  const drive = useApp((s) => s.drive)
  const addToBasket = useApp((s) => s.addToBasket)
  const { cap } = useCap()
  const clusters = useClusters()
  const safetyMap = useSafetyMap()
  const byId = useMsgIndex()
  const usage = quota?.usage ?? 0
  const suggested = cap ? Math.max(0.5, Math.ceil(((usage - cap * 0.85) / GiB) * 10) / 10) : 2
  const [targetGb, setTargetGb] = useState(suggested)
  const [maxRisk, setMaxRisk] = useState(40)
  const [picked, setPicked] = useState<Set<string> | null>(null)

  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = []
    for (const c of clusters) {
      const msgs = c.messageIds.map((i) => byId.get(i)).filter((m): m is NonNullable<typeof m> => !!m)
      const items = toGmailItems(msgs, safetyMap)
      if (!items.length) continue
      const scores = items.map((i) => safetyMap.get(i.id)?.score ?? 50)
      const risk = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      out.push({ id: `g:${c.id}`, label: c.label, bytes: items.reduce((s, i) => s + i.bytes, 0), risk, items, kind: 'gmail' })
    }
    const dupItems: BasketItem[] = []
    for (const g of findDuplicates(drive)) for (const f of keepRule(g, 'newest').remove) dupItems.push({ kind: 'drive', id: f.id, bytes: f.quota || f.size, label: f.name })
    if (dupItems.length)
      out.push({ id: 'd:dups', label: 'Drive duplicate copies (keeping the newest of each)', bytes: dupItems.reduce((s, i) => s + i.bytes, 0), risk: 15, items: dupItems, kind: 'drive' })
    return out.sort((a, b) => b.bytes - a.bytes)
  }, [clusters, byId, safetyMap, drive])

  const plan = useMemo(() => planBudget(candidates, targetGb * GiB, maxRisk), [candidates, targetGb, maxRisk])
  const selected = picked ?? new Set(plan.selected)
  const freeing = candidates.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.bytes, 0)
  const limit = cap ?? usage
  const wi = whatIf(usage, limit, freeing)

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header>
        <h1>Budget planner</h1>
        <p className="muted">
          Tell it how much space you need. It picks the lowest-risk clusters first (mailing lists you never open, duplicate files) and
          never includes starred, sent, or important-person mail.
        </p>
      </header>
      <div className="grid cols-2">
        <section className="card stack">
          <label className="stack" style={{ gap: 4 }}>
            <span>
              Free at least <strong className="mono-num">{targetGb.toFixed(1)} GB</strong>
            </span>
            <input type="range" min="0.5" max={Math.max(10, Math.ceil(usage / GiB))} step="0.5" value={targetGb} onChange={(e) => {
              setTargetGb(Number(e.target.value))
              setPicked(null)
            }} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span>
              Risk tolerance <strong className="mono-num">{maxRisk}</strong> / 100 <span className="muted">(lower = only very safe groups)</span>
            </span>
            <input type="range" min="10" max="80" step="5" value={maxRisk} onChange={(e) => {
              setMaxRisk(Number(e.target.value))
              setPicked(null)
            }} />
          </label>
          <span className={`chip ${plan.met ? 'ok' : 'warn'}`}>
            {plan.met ? `Plan reaches ${formatBytes(plan.bytes)}` : `Only ${formatBytes(plan.bytes)} available under this risk level`}
          </span>
        </section>
        <section className="card stack" aria-live="polite">
          <h2>What if</h2>
          <div className="stat">
            <span className="v">{formatBytes(wi.after)}</span>
            <span className="k">
              after freeing {formatBytes(freeing)} · {formatPct(wi.pct)} of {formatBytes(limit)}
            </span>
          </div>
          <div className={`meter ${wi.over ? 'over' : ''}`}>
            <i style={{ width: `${Math.min(100, wi.pct * 100)}%` }} />
          </div>
          <div className="meter" title="Before">
            <i style={{ width: `${Math.min(100, (usage / (limit || 1)) * 100)}%`, opacity: 0.4 }} />
          </div>
          <p className="muted" style={{ margin: 0 }}>Top bar: after the plan. Faded bar: today.</p>
          <button
            className="btn primary"
            disabled={selected.size === 0}
            onClick={() => {
              const items = candidates.filter((c) => selected.has(c.id)).flatMap((c) => c.items)
              addToBasket(items)
              go('cleanup')
            }}
          >
            Send {selected.size} groups to the Airlock →
          </button>
        </section>
      </div>
      <section className="card">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Use</th>
              <th scope="col">Group</th>
              <th scope="col">Size</th>
              <th scope="col">Items</th>
              <th scope="col">Risk</th>
            </tr>
          </thead>
          <tbody>
            {candidates.slice(0, 60).map((c) => (
              <tr key={c.id}>
                <td>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Include ${c.label}`} />
                </td>
                <td>
                  {c.kind === 'drive' ? '▦ ' : '✉ '}
                  {c.label}
                </td>
                <td className="mono-num">{formatBytes(c.bytes)}</td>
                <td className="mono-num">{c.items.length}</td>
                <td className={c.risk >= 60 ? 'risk-high' : c.risk >= 30 ? 'risk-medium' : 'risk-low'}>{c.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {candidates.length === 0 && <div className="empty">Run a scan first; groups appear here.</div>}
      </section>
    </div>
  )
}
