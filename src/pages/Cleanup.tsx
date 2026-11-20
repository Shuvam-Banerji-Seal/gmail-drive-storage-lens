// SPDX-License-Identifier: AGPL-3.0-or-later
// The Airlock: everything destructive happens here, behind a dry run and explicit confirmations.
import { useMemo, useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { Info } from '../components/Info'
import { PageHeader } from '../components/PageHeader'
import { planToCsv } from '../analytics/csv'
import { renderShareCard } from '../components/ShareCard'
import {
  archiveToMbox,
  createGmailFilter,
  deleteForever,
  emptyDriveTrash,
  emptyGmailBin,
  labelForReview,
  trashItems,
} from '../state/session'
import { toGmailItems, useMsgIndex, useNoise, useSafetyMap } from '../state/derived'
import { basketKey, basketTotals, useApp } from '../state/store'
import type { BasketItem } from '../types'
import { formatBytes, formatCount } from '../util/format'
import { downloadBlob, downloadText } from '../util/download'
import { trashedBytes } from '../analytics/drive'
import { applyRule, describeRule, hasCriteria, retentionChecklist, ruleToGmailQuery, type SelectionRule } from '../analytics/rules'

interface RuleForm {
  sender: string
  label: string
  minMb: string
  olderMonths: string
  unread: boolean
  lists: boolean
}
const EMPTY_FORM: RuleForm = { sender: '', label: '', minMb: '', olderMonths: '', unread: false, lists: false }

/** Form strings to a rule. A blank field means that criterion is not in use. */
function toRule(f: RuleForm): SelectionRule {
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s))
  return {
    senderContains: f.sender.trim() || undefined,
    label: f.label.trim() || undefined,
    minSizeMB: num(f.minMb),
    olderThanMonths: num(f.olderMonths),
    unreadOnly: f.unread || undefined,
    listsOnly: f.lists || undefined,
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

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
  const [ruleForm, setRuleForm] = useState<RuleForm>(EMPTY_FORM)
  const [now] = useState(() => Date.now())
  const [archiveText, setArchiveText] = useState('')
  const [archiving, setArchiving] = useState(false)
  const [binConfirm, setBinConfirm] = useState({ trash: '', spam: '' })
  const gmail = useApp((s) => s.gmail)
  const labelCounts = useApp((s) => s.labelCounts)
  const addToBasket = useApp((s) => s.addToBasket)
  const toast = useApp((s) => s.toast)
  const noise = useNoise()

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
  const freed = receipts.filter(
    (r) => r.action === 'trash' || r.action === 'delete' || r.action === 'revisions' || r.action === 'emptyTrash',
  )

  const rule = useMemo(() => toRule(ruleForm), [ruleForm])
  const ruleMatches = useMemo(() => (hasCriteria(rule) ? applyRule(gmail, rule, now) : []), [gmail, rule, now])
  const ruleItems = useMemo(() => toGmailItems(ruleMatches, safetyMap), [ruleMatches, safetyMap])
  const ruleSkipped = ruleMatches.length - ruleItems.length
  const ruleBytes = ruleItems.reduce((s, i) => s + i.bytes, 0)
  const ruleQuery = ruleToGmailQuery(rule)
  const trashCount = labelCounts.find((l) => l.id === 'TRASH')?.messagesTotal ?? 0
  const spamCount = labelCounts.find((l) => l.id === 'SPAM')?.messagesTotal ?? 0

  const runArchive = async () => {
    setArchiving(true)
    setArchiveText(`Reading 0 of ${formatCount(t.gmail)}…`)
    try {
      const n = await archiveToMbox(items, (done, total) => setArchiveText(`Reading ${formatCount(done)} of ${formatCount(total)}…`))
      setArchiveText(n ? `Saved ${formatCount(n)} emails to your device.` : 'Nothing was saved.')
    } finally {
      setArchiving(false)
    }
  }

  const emptyBin = async (which: 'trash' | 'spam') => {
    setBusy(true)
    try {
      if (await emptyGmailBin(which, binConfirm[which])) setBinConfirm((c) => ({ ...c, [which]: '' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="06 · Airlock"
        title="Airlock"
        info={
          <>
            Review exactly what will change. Trash is recoverable for 30 days. Permanent deletion asks Google for a separate permission and
            needs you to type a confirmation. {mode === 'demo' && ' You are in demo mode: actions only change the synthetic data.'}
          </>
        }
      />
      <Pipeline items={items} protectedCount={protectedItems.length} />

      <section className="card stack" aria-labelledby="rule-h">
        <div className="row between">
          <div className="title row" style={{ gap: 8 }}>
            <h2 id="rule-h">Select by rule</h2>
            <Info>
              Describe the mail you mean. Matches go to the Airlock through the same safety checks: starred, sent, draft and high-risk mail
              is always skipped.
            </Info>
          </div>
          <button className="btn sm ghost" disabled={!hasCriteria(rule)} onClick={() => setRuleForm(EMPTY_FORM)}>
            Reset rule
          </button>
        </div>
        <div className="grid cols-3">
          <label className="stack" style={{ gap: 4 }}>
            <span>Sender contains</span>
            <input
              type="text"
              value={ruleForm.sender}
              onChange={(e) => setRuleForm((f) => ({ ...f, sender: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span>Gmail label</span>
            <input
              type="text"
              placeholder="e.g. CATEGORY_PROMOTIONS"
              value={ruleForm.label}
              onChange={(e) => setRuleForm((f) => ({ ...f, label: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span>Larger than (MB)</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={ruleForm.minMb}
              onChange={(e) => setRuleForm((f) => ({ ...f, minMb: e.target.value }))}
              aria-label="Rule minimum size in MB"
            />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span>Older than (months)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={ruleForm.olderMonths}
              onChange={(e) => setRuleForm((f) => ({ ...f, olderMonths: e.target.value }))}
              aria-label="Rule age in months"
            />
          </label>
        </div>
        <div className="row">
          <label className="row">
            <input type="checkbox" checked={ruleForm.unread} onChange={(e) => setRuleForm((f) => ({ ...f, unread: e.target.checked }))} />
            Unread only
          </label>
          <label className="row">
            <input type="checkbox" checked={ruleForm.lists} onChange={(e) => setRuleForm((f) => ({ ...f, lists: e.target.checked }))} />
            Mailing lists only
          </label>
        </div>
        <div className="card flat stack">
          <p role="status" aria-live="polite" style={{ margin: 0 }}>
            <strong className="mono-num">
              {formatCount(ruleItems.length)} emails · {formatBytes(ruleBytes)}
            </strong>
            {!hasCriteria(rule) && <span className="muted"> (set at least one criterion)</span>}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {describeRule(rule)}
          </p>
          {ruleSkipped > 0 && <p className="chip warn">{formatCount(ruleSkipped)} matches skipped: starred, sent, drafts or high risk.</p>}
          <div className="copy">
            <code>{ruleQuery || 'No Gmail search for an empty rule'}</code>
            <button
              className="btn sm"
              disabled={!ruleQuery}
              onClick={() =>
                void copyText(ruleQuery).then((ok) =>
                  toast(ok ? 'Gmail search copied.' : 'Copy failed: select the text and copy it.', ok ? 'ok' : 'warn'),
                )
              }
            >
              Copy Gmail search
            </button>
          </div>
          {ruleForm.lists && (
            <p className="muted" style={{ margin: 0 }}>
              Gmail search cannot filter mailing lists, so the search above is broader than the rule.
            </p>
          )}
        </div>
        <div>
          <button
            className="btn primary"
            disabled={!ruleItems.length}
            onClick={() => {
              addToBasket(ruleItems)
              toast(
                `Added ${formatCount(ruleItems.length)} emails to the Airlock${ruleSkipped ? `; ${formatCount(ruleSkipped)} skipped` : ''}.`,
              )
            }}
          >
            Add matches to Airlock
          </button>
        </div>
      </section>

      <section id="stage-dry" className="card stack">
        <div className="row between">
          <h2>Dry run</h2>
          <div className="row">
            <button
              className="btn sm"
              disabled={!items.length}
              onClick={() => downloadText(planToCsv(items), `storage-lens-plan-${new Date().toISOString().slice(0, 10)}.csv`)}
            >
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
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <Icon name="archive" size={18} />
            <h3>Archive first (optional)</h3>
            <Info>
              Saves the full content of the selected emails as one .mbox file straight to this device. Message content is read only when you
              press this button, and nothing is uploaded anywhere.
            </Info>
          </div>
          <div className="row">
            <button className="btn sm" disabled={archiving || !t.gmail} onClick={() => void runArchive()}>
              Download archive (.mbox)
            </button>
            {archiveText && (
              <span className="muted" role="status">
                {archiveText}
              </span>
            )}
          </div>
        </div>
        {protectedItems.length > 0 && (
          <p className="chip warn">
            {protectedItems.length} protected emails (starred, sent or drafts) were removed from the plan and will not be touched.
          </p>
        )}
        {items.length === 0 ? (
          <div className="empty">Nothing selected yet. Add items from Overview, Gmail, Drive or the Planner.</div>
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
                          <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                            <Icon name={i.kind === 'drive' ? 'drive' : 'mail'} size={16} style={{ color: 'var(--muted)', flex: 'none' }} />
                            <span className="truncate">{i.label}</span>
                          </span>
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
            {items.length > 400 && (
              <p className="muted">Showing the 400 largest of {formatCount(items.length)}. The CSV has all of them.</p>
            )}
          </div>
        )}
      </section>

      <div className="grid cols-2">
        <section className="card stack">
          <div className="section-head">
            <div className="title">
              <h2>1. Stage it in Gmail (optional)</h2>
              <Info>Adds a "Storage Lens/Review" label to the selected emails so you can look through them in Gmail first.</Info>
            </div>
          </div>
          <button className="btn" disabled={busy || !t.gmail} onClick={() => void run(() => labelForReview(items))}>
            Label {formatCount(t.gmail)} emails for review
          </button>
        </section>
        <section id="stage-trash" className="card stack">
          <div className="section-head">
            <div className="title">
              <h2>2. Move to Trash</h2>
              <Info>Recoverable for 30 days, with an Undo button right here. Space is freed when Trash is emptied.</Info>
            </div>
          </div>
          <button className="btn primary" disabled={busy || !items.length} onClick={() => void run(() => trashItems(items))}>
            Move {formatCount(t.count)} items to Trash
          </button>
        </section>
      </div>

      <section id="stage-delete" className="card stack airlock" aria-labelledby="airlock-h">
        <div className="section-head">
          <div className="title">
            <h2 id="airlock-h">3. Delete permanently</h2>
            <span className="chip bad">Skips Trash · cannot be undone</span>
            <Info>
              This skips Trash and <strong>cannot be undone</strong>. Google will ask you for full mailbox access the first time. Export the
              CSV above first if you want a record.
            </Info>
          </div>
        </div>
        <label className="stack" style={{ gap: 4, maxWidth: 420 }}>
          <span>
            Type <code>DELETE {items.length}</code> to confirm
          </span>
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Confirmation text"
          />
        </label>
        <div>
          <button
            className="btn danger"
            disabled={busy || !items.length || confirm !== `DELETE ${items.length}`}
            onClick={() => void run(() => deleteForever(items, confirm))}
          >
            Permanently delete {formatCount(items.length)} items ({formatBytes(t.bytes)})
          </button>
        </div>
      </section>

      {driveTrash > 0 && (
        <section className="card stack airlock">
          <div className="section-head">
            <div className="title">
              <h2>Empty Drive Trash</h2>
              <Info>
                {formatBytes(driveTrash)} of files you own are in Drive Trash and still count against your quota. Emptying is permanent.
              </Info>
            </div>
          </div>
          <div className="row">
            <input
              type="text"
              value={trashConfirm}
              onChange={(e) => setTrashConfirm(e.target.value)}
              placeholder="EMPTY TRASH"
              style={{ maxWidth: 220 }}
              aria-label="Type EMPTY TRASH"
            />
            <button
              className="btn danger"
              disabled={busy || trashConfirm !== 'EMPTY TRASH'}
              onClick={() => void run(() => emptyDriveTrash(trashConfirm))}
            >
              Empty Drive Trash
            </button>
          </div>
        </section>
      )}

      <section className="card stack airlock" aria-labelledby="bins-h">
        <div className="section-head">
          <div className="title">
            <h2 id="bins-h">{'Gmail Trash & Spam'}</h2>
            <Info>
              Mail in Gmail Trash and Spam still counts toward your storage until it is emptied. Google deletes it automatically after 30
              days, but you can empty either folder now. This is permanent.
            </Info>
          </div>
        </div>
        <div className="grid cols-2">
          {(
            [
              { which: 'trash', name: 'Trash', count: trashCount, phrase: 'EMPTY GMAIL TRASH' },
              { which: 'spam', name: 'Spam', count: spamCount, phrase: 'EMPTY SPAM' },
            ] as const
          ).map((b) => (
            <div key={b.which} className="stack">
              <div className="stat">
                <span className="v">{formatCount(b.count)}</span>
                <span className="k">in Gmail {b.name}</span>
              </div>
              <label className="stack" style={{ gap: 4 }}>
                <span>
                  Type <code>{b.phrase}</code> to confirm
                </span>
                <input
                  type="text"
                  value={binConfirm[b.which]}
                  onChange={(e) => setBinConfirm((c) => ({ ...c, [b.which]: e.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={`Type ${b.phrase}`}
                />
              </label>
              <div>
                <button className="btn danger" disabled={busy || binConfirm[b.which] !== b.phrase} onClick={() => void emptyBin(b.which)}>
                  Empty Gmail {b.name}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {senders.length > 0 && (
        <section className="card stack">
          <div className="section-head">
            <div className="title">
              <h2>Keep it from filling up again</h2>
              <Info>
                Create a Gmail filter that sends future large emails from these senders straight to Trash. You can delete the filter any
                time in Gmail → Settings → Filters.
              </Info>
            </div>
          </div>
          <label className="row">
            Only emails larger than
            <input
              type="number"
              min="0"
              step="1"
              value={filterSize}
              onChange={(e) => setFilterSize(Number(e.target.value))}
              style={{ width: 90 }}
              aria-label="Minimum size in MB"
            />
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
                        void run(() =>
                          createGmailFilter({
                            from: s.from,
                            minSizeBytes: filterSize > 0 ? filterSize * 2 ** 20 : undefined,
                            action: 'trash',
                          }),
                        )
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

      <section className="card stack">
        <div className="section-head">
          <div className="title">
            <h2>Retention checklist</h2>
            <Info>
              A Markdown checklist with a suggested keep period for each sender, based on how often you open their mail. It is a plain file
              for your notes; nothing in your mailbox changes.
            </Info>
          </div>
        </div>
        <div>
          <button className="btn" onClick={() => downloadText(retentionChecklist(noise), 'storage-lens-retention.md', 'text/markdown')}>
            Download retention checklist
          </button>
        </div>
      </section>

      {receipts.length > 0 && (
        <section className="card stack">
          <div className="row between">
            <h2>Boarding passes</h2>
            {freed.length > 0 && (
              <button
                className="btn sm"
                onClick={() => {
                  void renderShareCard({
                    bytes: freed.reduce((s, r) => s + r.bytes, 0),
                    items: freed.reduce((s, r) => s + r.count, 0),
                    actions: freed.length,
                  }).then((b) => {
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
              {r.top.length > 0 && (
                <div className="muted">
                  Largest:{' '}
                  {r.top
                    .map((x) => x.label)
                    .slice(0, 3)
                    .join(' · ')}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

/** The cleanup path as a diagram, with live counts. Click a stage to jump to it. */
function Pipeline({ items, protectedCount }: { items: BasketItem[]; protectedCount: number }) {
  const bytes = items.reduce((a, i) => a + i.bytes, 0)
  const stages: Array<{ id: string; icon: IconName; t: string; s: string; danger?: boolean }> = [
    { id: 'dry', icon: 'layers', t: 'Selected', s: `${formatCount(items.length)} · ${formatBytes(bytes)}` },
    { id: 'dry', icon: 'lock', t: 'Protected', s: `${formatCount(protectedCount)} skipped` },
    { id: 'dry', icon: 'archive', t: 'Archive', s: 'optional .mbox' },
    { id: 'trash', icon: 'trash', t: 'Trash', s: '30-day undo' },
    { id: 'delete', icon: 'warn', t: 'Delete', s: 'typed confirm', danger: true },
  ]
  return (
    <nav className="pipeline" aria-label="Cleanup stages">
      {stages.map((st) => (
        <button
          key={st.t}
          type="button"
          className={`stage${st.danger ? ' danger' : ''}`}
          onClick={() => document.getElementById(`stage-${st.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <Icon name={st.icon} size={22} />
          <b>{st.t}</b>
          <small>{st.s}</small>
        </button>
      ))}
    </nav>
  )
}
