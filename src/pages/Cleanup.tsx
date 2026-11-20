// SPDX-License-Identifier: AGPL-3.0-or-later
// The Airlock: everything destructive happens here, behind a dry run and explicit confirmations.
import { useMemo, useState } from 'react'
import { planToCsv } from '../analytics/csv'
import { renderShareCard } from '../components/ShareCard'
import { createGmailFilter, deleteForever, emptyDriveTrash, labelForReview, trashItems } from '../state/session'
import { useMsgIndex, useSafetyMap } from '../state/derived'
import { basketKey, basketTotals, useApp } from '../state/store'
import type { BasketItem } from '../types'
import { formatBytes, formatCount } from '../util/format'
import { downloadBlob, downloadText } from '../util/download'
import { trashedBytes } from '../analytics/drive'

export default function Cleanup() {
  const basket = useApp((s) => s.basket)
  const mode = useApp((s) => s.mode)
  const receipts = useApp((s) => s.receipts)
  const drive = useApp((s) => s.drive)
  const remove = useApp((s) => s.removeFromBasket)
  const clear = useApp((s) => s.clearBasket)
  const safetyMap = useSafetyMap()
  const byId = useMsgIndex()
  const [confirm, setConfirm] = useState('')
  const [trashConfirm, setTrashConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [filterSize, setFilterSize] = useState(2)

  const all = useMemo(() => Object.values(basket), [basket])
  const protectedItems = useMemo(() => all.filter((i) => i.kind === 'gmail' && safetyMap.get(i.id)?.level === 'blocked'), [all, safetyMap])
  const items = useMemo(() => all.filter((i) => !protectedItems.includes(i)), [all, protectedItems])
  const t = basketTotals(Object.fromEntries(items.map((i) => [basketKey(i), i])))
  const driveTrash = trashedBytes(drive)

  const senders = useMemo(() => {
    const m = new Map<string, { label: string; from: string; listId?: string; bytes: number; count: number }>()
    for (const i of items) {
      if (i.kind !== 'gmail') continue
      const msg = byId.get(i.id)
      if (!msg) continue
      const key = msg.listId || msg.fromEmail
      const e = m.get(key) ?? { label: msg.fromName || msg.fromEmail, from: msg.fromEmail, listId: msg.listId, bytes: 0, count: 0 }
      e.bytes += i.bytes
      e.count++
      m.set(key, e)
    }
    return [...m.values()].sort((a, b) => b.bytes - a.bytes)
  }, [items, byId])

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true)
    try {
      if (await fn()) setConfirm('')
    } finally {
      setBusy(false)
    }
  }
  const risk = (i: BasketItem) => (i.kind === 'gmail' ? safetyMap.get(i.id) : undefined)
  const freed = receipts.filter((r) => r.action === 'trash' || r.action === 'delete' || r.action === 'revisions' || r.action === 'emptyTrash')

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header>
        <h1>Airlock</h1>
        <p className="muted">
          Review exactly what will change. Trash is recoverable for 30 days. Permanent deletion asks Google for a separate permission
          and needs you to type a confirmation.
          {mode === 'demo' && ' You are in demo mode: actions only change the synthetic data.'}
        </p>
      </header>

      <section className="card stack">
        <div className="row between">
          <h2>Dry run</h2>
          <div className="row">
            <button className="btn sm" disabled={!items.length} onClick={() => downloadText(planToCsv(items), `storage-lens-plan-${new Date().toISOString().slice(0, 10)}.csv`)}>
              Export plan as CSV
            </button>
            <button className="btn sm ghost" disabled={!all.length} onClick={clear}>
              Clear selection
            </button>
          </div>
        </div>
        <div className="grid cols-3">
          <div className="stat">
            <span className="v">{formatBytes(t.bytes)}</span>
            <span className="k">would be freed</span>
          </div>
          <div className="stat">
            <span className="v">{formatCount(t.gmail)}</span>
            <span className="k">emails</span>
          </div>
          <div className="stat">
            <span className="v">{formatCount(t.drive)}</span>
            <span className="k">Drive files</span>
          </div>
        </div>
        {protectedItems.length > 0 && (
          <p className="chip warn">
            {protectedItems.length} protected emails (starred, sent or drafts) were removed from the plan and will not be touched.
          </p>
        )}
        {items.length === 0 ? (
          <div className="empty">
            Nothing selected yet. Add items from Overview, Gmail, Drive or the Planner.
          </div>
        ) : (
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Size</th>
                  <th scope="col">Safety</th>
                  <th scope="col">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...items]
                  .sort((a, b) => b.bytes - a.bytes)
                  .slice(0, 400)
                  .map((i) => {
                    const r = risk(i)
                    return (
                      <tr key={basketKey(i)}>
                        <td>
                          {i.kind === 'gmail' ? '✉ ' : '▦ '}
                          {i.label}
                        </td>
                        <td className="mono-num">{formatBytes(i.bytes)}</td>
                        <td className={r ? `risk-${r.level}` : ''} title={r?.reasons.join('\n')}>
                          {r ? `${r.level} (${r.score})` : 'file'}
                        </td>
                        <td>
                          <button className="btn sm ghost" aria-label={`Remove ${i.label}`} onClick={() => remove([basketKey(i)])}>
                            ×
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
            {items.length > 400 && <p className="muted">Showing the 400 largest of {formatCount(items.length)}. The CSV has all of them.</p>}
          </div>
        )}
      </section>

      <div className="grid cols-2">
        <section className="card stack">
          <h2>1. Stage it in Gmail (optional)</h2>
          <p className="muted">Adds a "Storage Lens/Review" label to the selected emails so you can look through them in Gmail first.</p>
          <button className="btn" disabled={busy || !t.gmail} onClick={() => void run(() => labelForReview(items))}>
            Label {formatCount(t.gmail)} emails for review
          </button>
        </section>
        <section className="card stack">
          <h2>2. Move to Trash</h2>
          <p className="muted">Recoverable for 30 days, with an Undo button right here. Space is freed when Trash is emptied.</p>
          <button className="btn primary" disabled={busy || !items.length} onClick={() => void run(() => trashItems(items))}>
            Move {formatCount(t.count)} items to Trash
          </button>
        </section>
      </div>

      <section className="card stack airlock" aria-labelledby="airlock-h">
        <h2 id="airlock-h">3. Delete permanently</h2>
        <p>
          This skips Trash and <strong>cannot be undone</strong>. Google will ask you for full mailbox access the first time. Export the CSV
          above first if you want a record.
        </p>
        <label className="stack" style={{ gap: 4, maxWidth: 420 }}>
          <span>
            Type <code>DELETE {items.length}</code> to confirm
          </span>
          <input type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Confirmation text" />
        </label>
        <div>
          <button className="btn danger" disabled={busy || !items.length || confirm !== `DELETE ${items.length}`} onClick={() => void run(() => deleteForever(items, confirm))}>
            Permanently delete {formatCount(items.length)} items ({formatBytes(t.bytes)})
          </button>
        </div>
      </section>

      {driveTrash > 0 && (
        <section className="card stack airlock">
          <h2>Empty Drive Trash</h2>
          <p>
            {formatBytes(driveTrash)} of files you own are in Drive Trash and still count against your quota. Emptying is permanent.
          </p>
          <div className="row">
            <input type="text" value={trashConfirm} onChange={(e) => setTrashConfirm(e.target.value)} placeholder="EMPTY TRASH" style={{ maxWidth: 220 }} aria-label="Type EMPTY TRASH" />
            <button className="btn danger" disabled={busy || trashConfirm !== 'EMPTY TRASH'} onClick={() => void run(() => emptyDriveTrash(trashConfirm))}>
              Empty Drive Trash
            </button>
          </div>
        </section>
      )}

      {senders.length > 0 && (
        <section className="card stack">
          <h2>Keep it from filling up again</h2>
          <p className="muted">
            Create a Gmail filter that sends future large emails from these senders straight to Trash. You can delete the filter any
            time in Gmail → Settings → Filters.
          </p>
          <label className="row">
            Only emails larger than
            <input type="number" min="0" step="1" value={filterSize} onChange={(e) => setFilterSize(Number(e.target.value))} style={{ width: 90 }} aria-label="Minimum size in MB" />
            MB
          </label>
          <table className="data">
            <tbody>
              {senders.slice(0, 8).map((s) => (
                <tr key={s.listId ?? s.from}>
                  <td>{s.label}</td>
                  <td className="mono-num">{formatBytes(s.bytes)}</td>
                  <td>
                    <button
                      className="btn sm"
                      disabled={busy}
                      onClick={() =>
                        void run(() => createGmailFilter({ from: s.from, minSizeBytes: filterSize > 0 ? filterSize * 2 ** 20 : undefined, action: 'trash' }))
                      }
                    >
                      Auto-trash future mail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {receipts.length > 0 && (
        <section className="card stack">
          <div className="row between">
            <h2>Boarding passes</h2>
            {freed.length > 0 && (
              <button
                className="btn sm"
                onClick={() => {
                  void renderShareCard({ bytes: freed.reduce((s, r) => s + r.bytes, 0), items: freed.reduce((s, r) => s + r.count, 0), actions: freed.length }).then((b) => {
                    if (b) downloadBlob(b, 'storage-lens-result.png')
                  })
                }}
              >
                Download a redacted share card
              </button>
            )}
          </div>
          {receipts.map((r) => (
            <div key={r.at + r.action} className="receipt">
              <div className="row between">
                <strong>
                  {r.demo ? 'DEMO · ' : ''}
                  {r.action.toUpperCase()} · {r.kind.toUpperCase()}
                </strong>
                <span>{new Date(r.at).toLocaleString()}</span>
              </div>
              <div>
                {formatCount(r.count)} items · {formatBytes(r.bytes)}
              </div>
              {r.top.length > 0 && <div className="muted">Largest: {r.top.map((x) => x.label).slice(0, 3).join(' · ')}</div>}
            </div>
          ))}
          <p className="muted">Google's storage page can take minutes to hours to reflect changes.</p>
        </section>
      )}
    </div>
  )
}
