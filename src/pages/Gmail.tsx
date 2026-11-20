// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { mergeSenders, senderKey, subjectClusters } from '../analytics/cluster'
import { embed2d } from '../analytics/embed'
import { correspondentGraph, louvainCommunities, pageRank, repeatedAttachmentGroups, senderGraph } from '../analytics/graphs'
import { normalizeSubject } from '../analytics/parse'
import { anomalies, dailyBytes, monthlyByCluster, sankeyData } from '../analytics/series'
import { unsubscribeRadar } from '../analytics/unsub'
import { BarList, CalendarHeatmap, ForceGraph, Sankey, Scatter, Stream, type BarRow, type ScatterPoint } from '../charts'
import { go } from '../router'
import { toGmailItems, useClusters, useMsgIndex, useSafetyMap } from '../state/derived'
import { useApp } from '../state/store'
import type { BasketItem, GmailMsg, GraphData, Risk, SafetyResult } from '../types'
import { formatBytes, formatDate, formatPct } from '../util/format'
import type { EmbedRequest, EmbedResponse } from '../workers/embed.worker'

const SEED = 42
const NEBULA_MAX = 1200
const CONSTELLATION_MAX = 150
const TOP_GROUPS = 8

const TABS = [
  { id: 'senders', label: 'Senders', title: 'Senders by weight' },
  { id: 'constellation', label: 'Constellation', title: 'Constellation of senders' },
  { id: 'rivers', label: 'Rivers', title: 'Rivers: where the bytes flow' },
  { id: 'tides', label: 'Tides', title: 'Tides: storage over time' },
  { id: 'mailfall', label: 'Mailfall', title: 'Mailfall: bytes per day' },
  { id: 'nebula', label: 'Nebula', title: 'Nebula: similar subjects' },
  { id: 'repeats', label: 'Repeats', title: 'Repeated attachments' },
  { id: 'unsubscribe', label: 'Unsubscribe', title: 'Unsubscribe radar' },
] as const
type TabId = (typeof TABS)[number]['id']

const LEVEL_LABEL: Record<Risk, string> = { blocked: 'Protected', high: 'High risk', medium: 'Review', low: 'Safe' }
const LEVEL_TONE: Record<Risk, string> = { blocked: 'chip', high: 'chip bad', medium: 'chip warn', low: 'chip ok' }
/** Recommendation shown in Rivers: blocked and high-risk mail is kept, medium is reviewed, low is safe to clean. */
const RECOMMEND: Record<Risk, string> = { blocked: 'Keep', high: 'Keep', medium: 'Review', low: 'Safe to clean' }
const RECOMMENDATIONS = ['Keep', 'Review', 'Safe to clean'] as const

const isMsg = (m: GmailMsg | undefined): m is GmailMsg => m !== undefined
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const sumBytes = (xs: Array<{ size: number }>) => xs.reduce((s, x) => s + x.size, 0)

export default function Gmail({ tab }: { tab?: string }) {
  const focus = useApp((s) => s.focus)
  const setFocus = useApp((s) => s.setFocus)
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]
  const Body = BODIES[active.id]
  return (
    <div className="stack" style={{ gap: 20 }}>
      <header>
        <h1>Gmail explorer</h1>
        <p className="muted" style={{ margin: 0 }}>
          Only metadata is read: sizes, senders, dates and labels. Message bodies are never fetched.
        </p>
      </header>
      {focus && (
        <div className="row">
          <span className="chip ok">Focused: {focus}</span>
          <button type="button" className="btn sm ghost" onClick={() => setFocus(null)}>
            clear
          </button>
        </div>
      )}
      <div className="tabs" role="tablist" aria-label="Gmail views">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === active.id} onClick={() => go('gmail', t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <Body />
      </div>
    </div>
  )
}

const BODIES: Record<TabId, () => ReactElement> = {
  senders: SendersTab,
  constellation: ConstellationTab,
  rivers: RiversTab,
  tides: TidesTab,
  mailfall: MailfallTab,
  nebula: NebulaTab,
  repeats: RepeatsTab,
  unsubscribe: UnsubscribeTab,
}

function titleOf(id: TabId): string {
  return TABS.find((t) => t.id === id)?.title ?? ''
}

function Panel({ id, blurb, children }: { id: TabId; blurb: string; children: ReactNode }) {
  return (
    <section className="stack" style={{ gap: 14 }}>
      <div>
        <h2>{titleOf(id)}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {blurb}
        </p>
      </div>
      {children}
    </section>
  )
}

function NoMail() {
  return <div className="empty">No Gmail data yet. Connect Gmail or open the demo, then run a scan.</div>
}

/** Adds items to the basket and confirms with a toast. Callers pass only items toGmailItems or the like produced. */
function useAirlock() {
  const addToBasket = useApp((s) => s.addToBasket)
  const toast = useApp((s) => s.toast)
  return (items: BasketItem[], noun: string) => {
    if (items.length === 0) {
      toast('Nothing added: starred, sent and high-risk mail is never added automatically.', 'warn')
      return
    }
    addToBasket(items)
    toast(
      `Added ${items.length} ${plural(items.length, noun.replace(/s$/, ''), noun)} to the Airlock. Nothing is deleted until you confirm there.`,
    )
  }
}

function SafetyChip({ r }: { r: SafetyResult | undefined }) {
  if (!r) return <span className="chip">Unknown</span>
  return (
    <span className={LEVEL_TONE[r.level]} title={r.reasons.join('\n') || 'No rules fired'}>
      {LEVEL_LABEL[r.level]}
    </span>
  )
}

// ---------------------------------------------------------------- Senders

function SendersTab() {
  const gmail = useApp((s) => s.gmail)
  const focus = useApp((s) => s.focus)
  const clusters = useClusters()
  const safetyMap = useSafetyMap()
  const byId = useMsgIndex()
  const addAirlock = useAirlock()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const detailRef = useRef<HTMLElement>(null)

  const focusCluster = useMemo(() => {
    if (!focus) return null
    return clusters.find((c) => c.id === focus || c.id === `sender:${focus}` || c.id === `list:${focus}`) ?? null
  }, [clusters, focus])
  const selectedId = picked ?? focusCluster?.id ?? null

  useEffect(() => {
    if (focusCluster) detailRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [focusCluster])

  const rows = useMemo<BarRow[]>(() => {
    const q = query.trim().toLowerCase()
    return clusters
      .filter((c) => !q || c.label.toLowerCase().includes(q))
      .slice(0, 40)
      .map((c) => ({
        id: c.id,
        label: c.label,
        value: c.bytes,
        sub: `${c.messageIds.length} ${plural(c.messageIds.length, 'email', 'emails')}${c.kind === 'list' ? ' · mailing list' : ''}`,
      }))
  }, [clusters, query])

  const selected = useMemo(() => clusters.find((c) => c.id === selectedId) ?? null, [clusters, selectedId])
  const members = useMemo(() => (selected ? selected.messageIds.map((id) => byId.get(id)).filter(isMsg) : []), [selected, byId])
  const largest = useMemo(() => [...members].sort((a, b) => b.size - a.size || (a.id < b.id ? -1 : 1)).slice(0, 50), [members])
  const addable = useMemo(() => toGmailItems(members, safetyMap), [members, safetyMap])

  if (gmail.length === 0) {
    return (
      <Panel id="senders" blurb="Every sender and mailing list, ranked by the storage their mail takes.">
        <NoMail />
      </Panel>
    )
  }

  return (
    <Panel
      id="senders"
      blurb="Every sender and mailing list, ranked by the storage their mail takes. Pick one to see its biggest messages."
    >
      <div className="grid cols-2">
        <section className="card stack" aria-label="Sender ranking">
          <label className="stack" style={{ gap: 4 }}>
            <span>Filter by name</span>
            <input type="search" value={query} placeholder="e.g. newsletter" onChange={(e) => setQuery(e.target.value)} />
          </label>
          {rows.length === 0 ? (
            <div className="empty">No sender matches “{query}”.</div>
          ) : (
            <BarList rows={rows} onClick={(id) => setPicked(id)} />
          )}
        </section>

        <section className="card stack" ref={detailRef} aria-live="polite" aria-label="Selected sender">
          {selected ? (
            <>
              <h3 style={{ margin: 0 }}>{selected.label}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {selected.messageIds.length} {plural(selected.messageIds.length, 'email', 'emails')} · {formatBytes(selected.bytes)} ·{' '}
                {selected.kind === 'list' ? 'mailing list' : 'sender'}
              </p>
              <div className="row">
                <button type="button" className="btn primary" disabled={addable.length === 0} onClick={() => addAirlock(addable, 'emails')}>
                  Add {addable.length} {plural(addable.length, 'email', 'emails')} to Airlock
                </button>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                Starred, sent and draft mail is never added. High-risk mail is skipped. Review everything in the Airlock first.
              </p>
              <table className="data">
                <caption className="sr-only">Largest messages from {selected.label}</caption>
                <thead>
                  <tr>
                    <th scope="col">Subject</th>
                    <th scope="col">Date</th>
                    <th scope="col">Size</th>
                    <th scope="col">Safety</th>
                  </tr>
                </thead>
                <tbody>
                  {largest.map((m) => (
                    <tr key={m.id}>
                      <td>{m.subject || '(no subject)'}</td>
                      <td className="mono-num">{formatDate(m.ts)}</td>
                      <td className="mono-num">{formatBytes(m.size)}</td>
                      <td>
                        <SafetyChip r={safetyMap.get(m.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="empty">Choose a sender to see its largest messages.</div>
          )}
        </section>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------- Constellation

/** Keeps the `n` heaviest nodes and the links between them. */
function capGraph(g: GraphData, n: number): GraphData {
  if (g.nodes.length <= n) return g
  const keep = new Set(
    [...g.nodes]
      .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1))
      .slice(0, n)
      .map((x) => x.id),
  )
  return { nodes: g.nodes.filter((x) => keep.has(x.id)), links: g.links.filter((l) => keep.has(l.source) && keep.has(l.target)) }
}

function uniqueById(ms: GmailMsg[]): GmailMsg[] {
  const seen = new Map<string, GmailMsg>()
  for (const m of ms) if (!seen.has(m.id)) seen.set(m.id, m)
  return [...seen.values()]
}

function ConstellationTab() {
  const gmail = useApp((s) => s.gmail)
  const sent = useApp((s) => s.sent)
  const me = useApp((s) => s.me)
  const focus = useApp((s) => s.focus)
  const setFocus = useApp((s) => s.setFocus)
  const safetyMap = useSafetyMap()
  const addAirlock = useAirlock()
  const [view, setView] = useState<'senders' | 'people'>('senders')

  const everyone = useMemo(() => uniqueById([...sent, ...gmail]), [sent, gmail])
  const graph = useMemo(
    () =>
      capGraph(
        view === 'senders' ? senderGraph(gmail, { maxNodes: CONSTELLATION_MAX }) : correspondentGraph(everyone, me),
        CONSTELLATION_MAX,
      ),
    [view, gmail, everyone, me],
  )
  const groups = useMemo(() => louvainCommunities(graph), [graph])
  const ranks = useMemo(() => pageRank(graph), [graph])
  const canon = useMemo(() => mergeSenders(gmail), [gmail])
  const top = useMemo(
    () => [...graph.nodes].sort((a, b) => (ranks.get(b.id) ?? 0) - (ranks.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1)).slice(0, 10),
    [graph, ranks],
  )

  const node = graph.nodes.find((n) => n.id === focus) ?? null
  const nodeId = node?.id ?? null
  const nodeMsgs = useMemo(() => {
    if (nodeId === null) return []
    const pool = view === 'people' ? everyone : gmail
    return pool.filter((m) =>
      view === 'people'
        ? m.fromEmail === nodeId || m.recipients.includes(nodeId)
        : senderKey(m) === nodeId || (canon.get(m.fromEmail) ?? m.fromEmail) === nodeId,
    )
  }, [nodeId, view, everyone, gmail, canon])
  const addable = useMemo(() => toGmailItems(nodeMsgs, safetyMap), [nodeMsgs, safetyMap])

  return (
    <Panel
      id="constellation"
      blurb="Each star is a sender, or a person you write with. Lines join those that share threads or domains, and colours mark communities."
    >
      <div className="tabs" role="tablist" aria-label="Constellation type">
        <button type="button" role="tab" aria-selected={view === 'senders'} onClick={() => setView('senders')}>
          Senders
        </button>
        <button type="button" role="tab" aria-selected={view === 'people'} onClick={() => setView('people')}>
          People you write with
        </button>
      </div>
      {graph.nodes.length === 0 ? (
        <div className="empty">
          {view === 'people' ? 'No conversations found. Sent mail is needed for this view.' : 'No senders to draw yet. Run a scan first.'}
        </div>
      ) : (
        <>
          <div className="grid cols-2">
            <div className="card flat">
              <ForceGraph data={graph} groups={groups} selectedId={focus} onSelect={setFocus} />
            </div>
            <section className="card stack" aria-live="polite" aria-label="Selected node">
              {node ? (
                <>
                  <h3 style={{ margin: 0 }}>{node.label}</h3>
                  <p className="muted" style={{ margin: 0 }}>
                    {nodeMsgs.length} {plural(nodeMsgs.length, 'email', 'emails')} · {formatBytes(sumBytes(nodeMsgs))}
                  </p>
                  <div className="row">
                    <button
                      type="button"
                      className="btn primary"
                      disabled={addable.length === 0}
                      onClick={() => addAirlock(addable, 'emails')}
                    >
                      Add {addable.length} {plural(addable.length, 'email', 'emails')} to Airlock
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setFocus(null)}>
                      Clear focus
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty">Select a star to see its mail and add it to the Airlock.</div>
              )}
            </section>
          </div>
          <section className="card">
            <h3>Top 10 by PageRank</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              PageRank counts how central a node is in the graph. The table is the text version of the constellation.
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Name</th>
                  <th scope="col">PageRank</th>
                  <th scope="col">Emails</th>
                  <th scope="col">Community</th>
                </tr>
              </thead>
              <tbody>
                {top.map((n, i) => (
                  <tr key={n.id}>
                    <td className="mono-num">{i + 1}</td>
                    <td>{n.label}</td>
                    <td className="mono-num">{(ranks.get(n.id) ?? 0).toFixed(3)}</td>
                    <td className="mono-num">{n.value}</td>
                    <td className="mono-num">{groups.get(n.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- Rivers

function recFor(m: GmailMsg, safetyMap: Map<string, SafetyResult>): string {
  return RECOMMEND[safetyMap.get(m.id)?.level ?? 'medium']
}

function RiversTab() {
  const gmail = useApp((s) => s.gmail)
  const safetyMap = useSafetyMap()
  const data = useMemo(() => sankeyData(gmail, (m) => recFor(m, safetyMap)), [gmail, safetyMap])
  const totals = useMemo(() => {
    const acc = new Map<string, { emails: number; bytes: number }>()
    for (const m of gmail) {
      const rec = recFor(m, safetyMap)
      const e = acc.get(rec) ?? { emails: 0, bytes: 0 }
      e.emails += 1
      e.bytes += m.size
      acc.set(rec, e)
    }
    return RECOMMENDATIONS.map((rec) => ({ rec, ...(acc.get(rec) ?? { emails: 0, bytes: 0 }) }))
  }, [gmail, safetyMap])

  if (gmail.length === 0) {
    return (
      <Panel id="rivers" blurb="Bytes flow from sender domain to category, read state and a recommendation.">
        <NoMail />
      </Panel>
    )
  }

  return (
    <Panel
      id="rivers"
      blurb="Bytes flow from sender domain, through category and read state, to a recommendation. Wider rivers hold more storage."
    >
      <section className="card flat">
        <Sankey data={data} />
      </section>
      <section className="card">
        <table className="data">
          <caption className="sr-only">Totals per recommendation, the text version of the river chart</caption>
          <thead>
            <tr>
              <th scope="col">Recommendation</th>
              <th scope="col">Emails</th>
              <th scope="col">Size</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.rec}>
                <td>{t.rec}</td>
                <td className="mono-num">{t.emails}</td>
                <td className="mono-num">{formatBytes(t.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Panel>
  )
}

// ---------------------------------------------------------------- Tides

function TidesTab() {
  const gmail = useApp((s) => s.gmail)
  const clusters = useClusters()
  const series = useMemo(() => monthlyByCluster(gmail, clusters, 8), [gmail, clusters])
  const totals = useMemo(() => series.months.map((_, i) => series.series.reduce((s, x) => s + (x.values[i] ?? 0), 0)), [series])
  const spikes = useMemo(() => anomalies(totals).map((i) => ({ month: series.months[i] ?? '', bytes: totals[i] ?? 0 })), [series, totals])
  const heaviest = useMemo(
    () =>
      series.months
        .map((month, i) => ({ month, bytes: totals[i] ?? 0 }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 10),
    [series, totals],
  )

  if (gmail.length === 0 || series.months.length === 0) {
    return (
      <Panel id="tides" blurb="Bytes per month for each of the largest senders. Thick bands are months with lots of storage.">
        <NoMail />
      </Panel>
    )
  }

  return (
    <Panel
      id="tides"
      blurb="Bytes per month for the eight largest senders, with the rest folded into Other. Thick bands are months with lots of storage."
    >
      <section className="card flat">
        <Stream months={series.months} series={series.series} />
      </section>
      <div className="grid cols-2">
        <section className="card stack">
          <h3 style={{ margin: 0 }}>Spike months</h3>
          <p className="muted" style={{ margin: 0 }}>
            Months whose total is far above the usual level (robust z-score above 3.5).
          </p>
          {spikes.length === 0 ? (
            <div className="empty">No unusual months found.</div>
          ) : (
            <div className="row">
              {spikes.map((s) => (
                <span key={s.month} className="chip warn">
                  spike: {s.month} · {formatBytes(s.bytes)}
                </span>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Heaviest months</h3>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Size</th>
              </tr>
            </thead>
            <tbody>
              {heaviest.map((m) => (
                <tr key={m.month}>
                  <td className="mono-num">{m.month}</td>
                  <td className="mono-num">{formatBytes(m.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------- Mailfall

function MailfallTab() {
  const gmail = useApp((s) => s.gmail)
  const days = useMemo(() => dailyBytes(gmail), [gmail])
  const heaviest = useMemo(() => [...days.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5), [days])

  if (gmail.length === 0) {
    return (
      <Panel id="mailfall" blurb="Each square is a day. Darker squares are days with more mail storage arriving.">
        <NoMail />
      </Panel>
    )
  }

  return (
    <Panel id="mailfall" blurb="Each square is a day, darker means more storage arrived that day. The list below is the text version.">
      <section className="card">
        <CalendarHeatmap days={days} weeks={53} />
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Top 5 heaviest days</h3>
        {heaviest.length === 0 ? (
          <div className="empty">No dated mail to chart.</div>
        ) : (
          <ol className="stack" style={{ gap: 6, paddingLeft: 20, margin: 0 }}>
            {heaviest.map(([day, bytes]) => (
              <li key={day}>
                <span className="mono-num">{day}</span> · {formatBytes(bytes)}
              </li>
            ))}
          </ol>
        )}
      </section>
    </Panel>
  )
}

// ---------------------------------------------------------------- Nebula

/** Computes the 2-D subject layout in a module worker, falling back to the main thread when workers are unavailable. */
function useEmbedding(texts: string[]): Array<[number, number]> | null {
  // The layout is tagged with the texts it was computed from, so a stale layout is never shown.
  const [state, setState] = useState<{ src: string[]; pts: Array<[number, number]> } | null>(null)
  useEffect(() => {
    let live = true
    let timer: number | undefined
    let worker: Worker | null = null
    const finish = (pts: Array<[number, number]>) => {
      if (live) setState({ src: texts, pts })
    }
    const inline = () => {
      timer = window.setTimeout(() => finish(embed2d(texts, SEED)), 0)
    }
    if (typeof Worker === 'undefined') {
      inline()
    } else {
      try {
        worker = new Worker(new URL('../workers/embed.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (e: MessageEvent<EmbedResponse>) => finish(e.data.points)
        worker.onerror = () => {
          worker?.terminate()
          worker = null
          if (live) inline()
        }
        worker.postMessage({ texts, seed: SEED } satisfies EmbedRequest)
      } catch {
        worker = null
        inline()
      }
    }
    return () => {
      live = false
      window.clearTimeout(timer)
      worker?.terminate()
    }
  }, [texts])
  return state && state.src === texts ? state.pts : null
}

function NebulaTab() {
  const gmail = useApp((s) => s.gmail)
  const safetyMap = useSafetyMap()
  const addAirlock = useAirlock()
  const [picked, setPicked] = useState<Set<string>>(() => new Set())

  const sample = useMemo(() => [...gmail].sort((a, b) => b.size - a.size || (a.id < b.id ? -1 : 1)).slice(0, NEBULA_MAX), [gmail])
  const texts = useMemo(() => sample.map((m) => normalizeSubject(m.subject)), [sample])
  const clusterOf = useMemo(() => {
    const out = new Map<string, number>()
    subjectClusters(sample).forEach((c, i) => {
      for (const id of c.messageIds) out.set(id, i < TOP_GROUPS ? i : TOP_GROUPS)
    })
    return out
  }, [sample])
  const layout = useEmbedding(texts)

  const points = useMemo<ScatterPoint[]>(() => {
    if (!layout || layout.length !== sample.length) return []
    // Identical subjects collapse onto one spot; a deterministic golden-angle spiral per message spreads
    // each cloud into a visible nebula without changing which cloud a message belongs to.
    const seen = new Map<string, number>()
    return sample.map((m, i) => {
      const bx = layout[i]?.[0] ?? 0.5
      const by = layout[i]?.[1] ?? 0.5
      const cell = `${Math.round(bx * 200)}:${Math.round(by * 200)}`
      const k = seen.get(cell) ?? 0
      seen.set(cell, k + 1)
      const r = 0.006 * Math.sqrt(k)
      const a = k * 2.399963
      return {
        id: m.id,
        x: Math.min(1, Math.max(0, bx + r * Math.cos(a))),
        y: Math.min(1, Math.max(0, by + r * Math.sin(a))),
        group: clusterOf.get(m.id) ?? TOP_GROUPS,
        label: m.subject || '(no subject)',
      }
    })
  }, [layout, sample, clusterOf])

  const chosen = useMemo(() => sample.filter((m) => picked.has(m.id)), [sample, picked])
  const chosenBig = useMemo(() => [...chosen].sort((a, b) => b.size - a.size || (a.id < b.id ? -1 : 1)).slice(0, 10), [chosen])
  const addable = useMemo(() => toGmailItems(chosen, safetyMap), [chosen, safetyMap])

  if (gmail.length === 0) {
    return (
      <Panel id="nebula" blurb="Messages placed by how similar their subjects are. Close stars share a topic.">
        <NoMail />
      </Panel>
    )
  }

  return (
    <Panel
      id="nebula"
      blurb={`Messages placed by how similar their subjects are; close stars share wording. Shows the ${sample.length} largest messages. Drag a lasso across the map to select.`}
    >
      <section className="card flat">
        {points.length === 0 ? (
          <p className="muted" role="status" style={{ textAlign: 'center', padding: '48px 0' }}>
            Mapping…
          </p>
        ) : (
          <Scatter points={points} selected={picked} onLasso={(ids) => setPicked(new Set(ids))} />
        )}
      </section>
      <section className="card stack" aria-live="polite">
        <div className="row between">
          <span>
            <strong className="mono-num">{chosen.length}</strong> selected · {formatBytes(sumBytes(chosen))}
          </span>
          <div className="row">
            <button type="button" className="btn ghost sm" disabled={chosen.length === 0} onClick={() => setPicked(new Set())}>
              Clear selection
            </button>
            <button type="button" className="btn primary" disabled={addable.length === 0} onClick={() => addAirlock(addable, 'emails')}>
              Add selection to Airlock
            </button>
          </div>
        </div>
        {chosenBig.length > 0 && (
          <table className="data">
            <caption className="sr-only">Largest selected messages, the text version of the selection</caption>
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col">Date</th>
                <th scope="col">Size</th>
              </tr>
            </thead>
            <tbody>
              {chosenBig.map((m) => (
                <tr key={m.id}>
                  <td>{m.subject || '(no subject)'}</td>
                  <td className="mono-num">{formatDate(m.ts)}</td>
                  <td className="mono-num">{formatBytes(m.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Panel>
  )
}

// ---------------------------------------------------------------- Repeats

function RepeatsTab() {
  const gmail = useApp((s) => s.gmail)
  const byId = useMsgIndex()
  const safetyMap = useSafetyMap()
  const addAirlock = useAirlock()

  const rows = useMemo(
    () =>
      repeatedAttachmentGroups(gmail)
        .slice(0, 100)
        .map((g) => {
          const msgs = g.ids.map((id) => byId.get(id)).filter(isMsg)
          const newest = [...msgs].sort((a, b) => b.ts - a.ts || (a.id < b.id ? -1 : 1))[0]
          const older = msgs.filter((m) => m.id !== newest?.id)
          return {
            key: g.key,
            subject: msgs[0]?.subject || '(no subject)',
            copies: msgs.length,
            bytes: g.bytes,
            older: toGmailItems(older, safetyMap),
          }
        }),
    [gmail, byId, safetyMap],
  )

  if (gmail.length === 0) {
    return (
      <Panel id="repeats" blurb="Reply chains that store the same attachment again and again.">
        <NoMail />
      </Panel>
    )
  }

  return (
    <Panel
      id="repeats"
      blurb="Reply chains often re-attach the same file to every message, so storage grows with each reply. The newest copy in each group is kept; the older copies can go."
    >
      {rows.length === 0 ? (
        <div className="empty">No repeated attachments found. A group needs at least three messages of the same size and subject.</div>
      ) : (
        <section className="card">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Example subject</th>
                <th scope="col">Copies</th>
                <th scope="col">Total size</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.subject}</td>
                  <td className="mono-num">{r.copies}</td>
                  <td className="mono-num">{formatBytes(r.bytes)}</td>
                  <td>
                    <button type="button" className="btn sm" disabled={r.older.length === 0} onClick={() => addAirlock(r.older, 'emails')}>
                      Add {r.older.length} older {plural(r.older.length, 'copy', 'copies')} to Airlock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- Unsubscribe

const CONTROL_LINKS = 3

function UnsubscribeTab() {
  const gmail = useApp((s) => s.gmail)
  const safetyMap = useSafetyMap()
  const addAirlock = useAirlock()
  const rows = useMemo(() => unsubscribeRadar(gmail), [gmail])
  const byKey = useMemo(() => {
    const out = new Map<string, GmailMsg[]>()
    for (const m of gmail) {
      const k = senderKey(m)
      const arr = out.get(k)
      if (arr) arr.push(m)
      else out.set(k, [m])
    }
    return out
  }, [gmail])

  if (gmail.length === 0) {
    return (
      <Panel id="unsubscribe" blurb="Senders that publish an unsubscribe link, with how much of their mail you open.">
        <NoMail />
      </Panel>
    )
  }

  return (
    <Panel
      id="unsubscribe"
      blurb="Senders that publish a List-Unsubscribe header. % opened is the share of their mail you have read. Links open in your browser or mail app; this app sends nothing."
    >
      {rows.length === 0 ? (
        <div className="empty">No senders with an unsubscribe header were found.</div>
      ) : (
        <section className="card">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Sender</th>
                <th scope="col">Size</th>
                <th scope="col">Emails</th>
                <th scope="col">% opened</th>
                <th scope="col">Unsubscribe</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const items = toGmailItems(byKey.get(r.key) ?? [], safetyMap)
                return (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td className="mono-num">{formatBytes(r.bytes)}</td>
                    <td className="mono-num">{r.count}</td>
                    <td className="mono-num">{formatPct(r.readRate)}</td>
                    <td>
                      <div className="stack" style={{ gap: 4 }}>
                        {r.http.slice(0, CONTROL_LINKS).map((u) => (
                          <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow" title={u}>
                            Unsubscribe page
                          </a>
                        ))}
                        {r.mailto.slice(0, CONTROL_LINKS).map((u) => (
                          <a key={u} href={u} title="Opens your mail app. Nothing is sent by this app.">
                            Email unsubscribe
                          </a>
                        ))}
                      </div>
                    </td>
                    <td>
                      <button type="button" className="btn sm" disabled={items.length === 0} onClick={() => addAirlock(items, 'emails')}>
                        Add this sender&apos;s mail to Airlock
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </Panel>
  )
}
