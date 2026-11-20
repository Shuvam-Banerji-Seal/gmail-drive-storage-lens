// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import {
  buildDriveTree,
  coldFiles,
  findDuplicates,
  keepRule,
  publicLinks,
  revisionBloat,
  shareGraph,
  trashedBytes,
} from '../analytics/drive'
import { ForceGraph, Sunburst, Treemap } from '../charts'
import { go } from '../router'
import { PageHeader, SectionHead } from '../components/PageHeader'
import { pruneRevisions } from '../state/session'
import { useApp } from '../state/store'
import type { BasketItem, DriveFile, TreeNode } from '../types'
import { formatBytes, formatCount, formatDate } from '../util/format'

const TABS = [
  { id: 'continents', label: 'Continents', title: 'Continents: where the bytes live' },
  { id: 'twins', label: 'Twins', title: 'Twins: duplicate copies' },
  { id: 'ghosts', label: 'Ghosts', title: 'Ghost weight: hidden old versions' },
  { id: 'cold', label: 'Cold', title: 'Cold files: large and untouched' },
  { id: 'public', label: 'Public', title: 'Public links' },
  { id: 'sharing', label: 'Sharing', title: 'Shared with you' },
] as const
type TabId = (typeof TABS)[number]['id']

const BODIES: Record<TabId, () => ReactElement> = {
  continents: ContinentsTab,
  twins: TwinsTab,
  ghosts: GhostsTab,
  cold: ColdTab,
  public: PublicTab,
  sharing: SharingTab,
}

const KEEP_RULES: Array<{ id: 'newest' | 'oldest' | 'shortestName'; label: string }> = [
  { id: 'newest', label: 'Keep the newest copy' },
  { id: 'oldest', label: 'Keep the oldest copy' },
  { id: 'shortestName', label: 'Keep the shortest name' },
]

/** Bytes a file occupies in Drive: its quota when reported, otherwise the head blob size. */
const bytesOf = (f: DriveFile) => (f.quota > 0 ? f.quota : f.size)
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
/** Fixed "now" per page load, so cold-file ages don't drift while you look at them. */
const NOW = Date.now()
const toItem = (f: DriveFile): BasketItem => ({ kind: 'drive', id: f.id, bytes: bytesOf(f), label: f.name })

export default function Drive({ tab }: { tab?: string }) {
  const drive = useApp((s) => s.drive)
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]
  const Body = BODIES[active.id]

  const scanned = drive.length
  const ownedQuota = useMemo(() => drive.reduce((s, f) => (f.owned ? s + f.quota : s), 0), [drive])
  const trashed = useMemo(() => trashedBytes(drive), [drive])

  return (
    <div className="page">
      <PageHeader
        eyebrow="03 · Drive"
        title="Drive explorer"
        info="Metadata only: names, sizes, checksums and sharing settings. File contents are never downloaded."
      />

      <div className="grid cols-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        <div className="kpi" data-tip="Files and folders listed by the Drive API">
          <div className="top">Items</div>
          <span className="v">{formatCount(scanned)}</span>
        </div>
        <div className="kpi" data-tip="Quota used by files you own, including pinned old versions">
          <div className="top">Your files</div>
          <span className="v">{formatBytes(ownedQuota)}</span>
        </div>
        <div className="kpi" data-tip="Trashed files still count until Trash is emptied">
          <div className="top">In Trash</div>
          <span className="v">{formatBytes(trashed)}</span>
        </div>
        <div className="kpi" data-tip="Files shared with you: they use the owner's quota, not yours">
          <div className="top">Shared with you</div>
          <span className="v">{formatCount(drive.filter((f) => !f.owned).length)}</span>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Drive views">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === active.id} onClick={() => go('drive', t.id)}>
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

function Panel({ title, blurb, children }: { title: string; blurb: string; children: ReactNode }) {
  return (
    <section className="stack" style={{ gap: 14 }}>
      <SectionHead title={title} info={blurb} />
      {children}
    </section>
  )
}

function NoFiles() {
  return <div className="empty">No Drive data yet. Connect Drive or open the demo, then run a scan.</div>
}

function titleOf(id: TabId): string {
  return TABS.find((t) => t.id === id)?.title ?? ''
}

/** Adds items to the basket. Toasts only after the basket actually changed. */
function useAirlock() {
  const addToBasket = useApp((s) => s.addToBasket)
  const toast = useApp((s) => s.toast)
  return (items: BasketItem[]) => {
    if (items.length === 0) {
      toast('Nothing to add.', 'warn')
      return
    }
    addToBasket(items)
    toast(`Added ${items.length} ${plural(items.length, 'file', 'files')} to the Airlock. Nothing is deleted until you confirm there.`)
  }
}

// ---------------------------------------------------------------- Continents

function ContinentsTab() {
  const drive = useApp((s) => s.drive)
  const [view, setView] = useState<'treemap' | 'sunburst'>('treemap')
  const [selected, setSelected] = useState<TreeNode | null>(null)
  const root = useMemo(() => buildDriveTree(drive), [drive])
  const top = useMemo(() => (root.children ?? []).slice(0, 10), [root])

  if (!root.children?.length) {
    return (
      <Panel title={titleOf('continents')} blurb="Your Drive as land: each block is a folder or file, sized by its storage.">
        <NoFiles />
      </Panel>
    )
  }

  return (
    <Panel
      title={titleOf('continents')}
      blurb="Your Drive as land: each block is a folder or file, sized by its storage. Click a block to read its name and size."
    >
      <div className="row">
        <div className="tabs" role="tablist" aria-label="Chart style">
          <button type="button" role="tab" aria-selected={view === 'treemap'} onClick={() => setView('treemap')}>
            Treemap
          </button>
          <button type="button" role="tab" aria-selected={view === 'sunburst'} onClick={() => setView('sunburst')}>
            Sunburst
          </button>
        </div>
        {selected && (
          <span className="chip ok" aria-live="polite">
            {selected.name}: {formatBytes(selected.value)}
          </span>
        )}
      </div>
      <section className="card flat">
        {view === 'treemap' ? <Treemap root={root} onSelect={setSelected} /> : <Sunburst root={root} />}
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Largest top-level items</h3>
        <table className="data">
          <caption className="sr-only">Largest top-level items, the text version of the map</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Size</th>
            </tr>
          </thead>
          <tbody>
            {top.map((n) => (
              <tr key={n.id}>
                <td>{n.name}</td>
                <td className="mono-num">{formatBytes(n.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Panel>
  )
}

// ---------------------------------------------------------------- Twins

function isKeepRule(v: string): v is 'newest' | 'oldest' | 'shortestName' {
  return v === 'newest' || v === 'oldest' || v === 'shortestName'
}

function TwinsTab() {
  const drive = useApp((s) => s.drive)
  const addAirlock = useAirlock()
  const [rule, setRule] = useState<'newest' | 'oldest' | 'shortestName'>('newest')
  const groups = useMemo(() => findDuplicates(drive), [drive])
  const plans = useMemo(
    () =>
      groups.map((g) => {
        const { keep, remove } = keepRule(g, rule)
        return { key: g.hash, keep, remove, items: remove.map(toItem), wasted: remove.reduce((s, f) => s + bytesOf(f), 0) }
      }),
    [groups, rule],
  )
  const allItems = useMemo(() => plans.flatMap((p) => p.items), [plans])
  const totalWasted = useMemo(() => plans.reduce((s, p) => s + p.wasted, 0), [plans])

  if (drive.length === 0) {
    return (
      <Panel title={titleOf('twins')} blurb="Files with identical contents. Only one copy is needed.">
        <NoFiles />
      </Panel>
    )
  }

  return (
    <Panel
      title={titleOf('twins')}
      blurb="Files with identical contents, found by checksum. Choose which copy to keep; the rest can go to the Airlock."
    >
      <div className="row between">
        <label className="row" style={{ gap: 8 }}>
          <span>Rule</span>
          <select value={rule} onChange={(e) => isKeepRule(e.target.value) && setRule(e.target.value)} aria-label="Which copy to keep">
            {KEEP_RULES.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn primary" disabled={allItems.length === 0} onClick={() => addAirlock(allItems)}>
          Add {allItems.length} extra {plural(allItems.length, 'copy', 'copies')} ({formatBytes(totalWasted)}) to Airlock
        </button>
      </div>
      {plans.length === 0 ? (
        <div className="empty">No duplicate files found among the files you own.</div>
      ) : (
        <section className="card">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Copies</th>
                <th scope="col">Kept copy (modified)</th>
                <th scope="col">Wasted</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {plans.slice(0, 100).map((p) => (
                <tr key={p.key}>
                  <td>{p.keep.name}</td>
                  <td className="mono-num">{p.items.length + 1}</td>
                  <td className="mono-num" title={p.keep.name}>
                    {formatDate(p.keep.modified)}
                  </td>
                  <td className="mono-num">{formatBytes(p.wasted)}</td>
                  <td>
                    <button type="button" className="btn sm" disabled={p.items.length === 0} onClick={() => addAirlock(p.items)}>
                      Add {p.items.length} extra {plural(p.items.length, 'copy', 'copies')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {plans.length > 100 && (
            <p className="muted">Showing the first 100 of {plans.length} groups. The total button covers all of them.</p>
          )}
        </section>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- Ghosts

function GhostsTab() {
  const drive = useApp((s) => s.drive)
  const rows = useMemo(() => revisionBloat(drive), [drive])
  const [armed, setArmed] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const confirm = async (file: DriveFile) => {
    setBusy(file.id)
    try {
      await pruneRevisions(file)
    } finally {
      setBusy(null)
      setArmed(null)
    }
  }

  if (drive.length === 0) {
    return (
      <Panel title={titleOf('ghosts')} blurb="Old versions you pinned with Keep forever still take space, even though you cannot see them.">
        <NoFiles />
      </Panel>
    )
  }

  return (
    <Panel
      title={titleOf('ghosts')}
      blurb="Old versions you pinned with Keep forever still count against your quota. Removing them never touches the current version of a file."
    >
      {rows.length === 0 ? (
        <div className="empty">No file carries at least 1 MiB of pinned old versions.</div>
      ) : (
        <section className="card">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Current size</th>
                <th scope="col">Quota used</th>
                <th scope="col">Hidden old versions</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ file, extra }) => (
                <tr key={file.id}>
                  <td>{file.name}</td>
                  <td className="mono-num">{formatBytes(file.size)}</td>
                  <td className="mono-num">{formatBytes(file.quota)}</td>
                  <td className="mono-num">{formatBytes(extra)}</td>
                  <td>
                    <button
                      type="button"
                      className={armed === file.id ? 'btn danger sm' : 'btn sm'}
                      disabled={busy !== null}
                      onClick={() => (armed === file.id ? void confirm(file) : setArmed(file.id))}
                    >
                      {busy === file.id ? 'Removing…' : armed === file.id ? 'Confirm: remove pinned old versions' : 'Remove old versions'}
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

// ---------------------------------------------------------------- Cold

function ColdTab() {
  const drive = useApp((s) => s.drive)
  const addAirlock = useAirlock()
  const rows = useMemo(() => coldFiles(drive, NOW), [drive])
  const [picked, setPicked] = useState<Set<string>>(() => new Set())

  const chosen = useMemo(() => rows.filter((f) => picked.has(f.id)), [rows, picked])
  const toggle = (id: string) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  if (drive.length === 0) {
    return (
      <Panel title={titleOf('cold')} blurb="Large files nobody has opened for two years.">
        <NoFiles />
      </Panel>
    )
  }

  return (
    <Panel
      title={titleOf('cold')}
      blurb="Files of 10 MiB or more that nobody has opened, or changed, for two years. Tick the ones you no longer need."
    >
      <div className="row between">
        <span className="muted">
          {rows.length} {plural(rows.length, 'file', 'files')} · {formatBytes(rows.reduce((s, f) => s + bytesOf(f), 0))}
        </span>
        <div className="row">
          <button type="button" className="btn sm ghost" disabled={chosen.length === 0} onClick={() => addAirlock(chosen.map(toItem))}>
            Add selected ({chosen.length}) to Airlock
          </button>
          <button type="button" className="btn primary sm" disabled={rows.length === 0} onClick={() => addAirlock(rows.map(toItem))}>
            Add all {rows.length} to Airlock
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty">Nothing cold. Every large file has been touched in the last two years.</div>
      ) : (
        <section className="card">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Select</th>
                <th scope="col">Name</th>
                <th scope="col">Size</th>
                <th scope="col">Last viewed or changed</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((f) => (
                <tr key={f.id}>
                  <td>
                    <input type="checkbox" checked={picked.has(f.id)} onChange={() => toggle(f.id)} aria-label={`Select ${f.name}`} />
                  </td>
                  <td>{f.name}</td>
                  <td className="mono-num">{formatBytes(f.size)}</td>
                  <td className="mono-num">
                    {formatDate(f.viewed ?? f.modified)}
                    {f.viewed === undefined && <span className="muted"> (changed)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 200 && <p className="muted">Showing the 200 largest of {rows.length}. Add all covers every file.</p>}
        </section>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- Public

function PublicTab() {
  const drive = useApp((s) => s.drive)
  const rows = useMemo(() => publicLinks(drive), [drive])

  if (drive.length === 0) {
    return (
      <Panel title={titleOf('public')} blurb="Files you have shared with anyone who has the link.">
        <NoFiles />
      </Panel>
    )
  }

  return (
    <Panel
      title={titleOf('public')}
      blurb="Anyone with the link can open these files, signed in to Google or not. If you no longer need them public, change the sharing setting in Drive."
    >
      {rows.length === 0 ? (
        <div className="empty">No file you own is shared with anyone who has the link.</div>
      ) : (
        <section className="card">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Size</th>
                <th scope="col">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td className="mono-num">{formatBytes(f.size)}</td>
                  <td>
                    <a href={`https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`} target="_blank" rel="noopener noreferrer">
                      Open in Drive
                    </a>
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

// ---------------------------------------------------------------- Sharing

function SharingTab() {
  const drive = useApp((s) => s.drive)
  const me = useApp((s) => s.me)
  const graph = useMemo(() => shareGraph(drive, me), [drive, me])
  const rows = useMemo(() => [...graph.links].sort((a, b) => b.weight - a.weight || (a.target < b.target ? -1 : 1)), [graph])

  if (drive.length === 0) {
    return (
      <Panel title={titleOf('sharing')} blurb="Who has shared files with you, and how much.">
        <NoFiles />
      </Panel>
    )
  }

  return (
    <Panel title={titleOf('sharing')} blurb="Each outer node is someone who shared files with you. Thicker links mean more bytes shared.">
      {rows.length === 0 ? (
        <div className="empty">Nobody has shared a file with you yet.</div>
      ) : (
        <>
          <section className="card flat">
            <ForceGraph data={graph} />
          </section>
          <section className="card">
            <table className="data">
              <caption className="sr-only">Owners who share files with you, the text version of the graph</caption>
              <thead>
                <tr>
                  <th scope="col">Owner</th>
                  <th scope="col">Bytes shared with you</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.target}>
                    <td>{r.target}</td>
                    <td className="mono-num">{formatBytes(r.weight)}</td>
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
