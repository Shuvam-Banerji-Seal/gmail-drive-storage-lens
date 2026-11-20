// SPDX-License-Identifier: AGPL-3.0-or-later
// Live scan status: progress ring, API call rate (from the real network log) and controls.
import { useMemo } from 'react'
import { cancelScan, refreshChanges, scanAll } from '../state/session'
import { useApp } from '../state/store'
import { formatBytes, formatCount } from '../util/format'
import { Icon } from './Icon'
import { Info } from './Info'
import { Ring, Sparkline } from './Mini'

export function ScanBar() {
  const mode = useApp((s) => s.mode)
  const g = useApp((s) => s.gmailScan)
  const d = useApp((s) => s.driveScan)
  const depth = useApp((s) => s.settings.scanDepth)
  const setSettings = useApp((s) => s.setSettings)
  const historyId = useApp((s) => s.historyId)
  const netlog = useApp((s) => s.netlog)

  // Requests per 2-second bucket over the minute up to the latest request: the API's real activity.
  const rate = useMemo(() => {
    const now = netlog.length ? netlog[netlog.length - 1]!.at : 0
    const buckets = new Array(30).fill(0) as number[]
    for (const e of netlog) {
      const i = 29 - Math.floor((now - e.at) / 2000)
      if (i >= 0 && i < 30) buckets[i]! += 1
    }
    return buckets
  }, [netlog])

  if (mode !== 'live') return null
  const busy = ['listing', 'fetching'].includes(g.phase) || ['listing', 'fetching'].includes(d.phase)
  const pct = g.total ? g.done / g.total : g.phase === 'done' ? 1 : 0
  const title = busy
    ? d.phase !== 'done'
      ? 'Reading Drive'
      : g.phase === 'listing'
        ? 'Finding large emails'
        : 'Reading headers'
    : g.phase === 'done'
      ? 'Scan complete'
      : g.phase === 'error'
        ? 'Scan stopped'
        : g.phase === 'cancelled'
          ? 'Paused'
          : 'Ready'
  const sub = busy
    ? d.phase !== 'done'
      ? `${formatCount(d.done)} files`
      : `${formatCount(g.done)} / ${formatCount(g.total)} · ${formatBytes(g.bytesSeen)}`
    : g.phase === 'done'
      ? `${formatCount(g.total)} emails · ${formatBytes(g.bytesSeen)}`
      : (g.message ?? '')

  return (
    <section className="scanbar" aria-label="Scan">
      <div className="status">
        {busy ? <Ring value={pct} size={34} label={`${Math.round(pct * 100)}% scanned`} /> : <span className={`pulse-dot ${g.phase === 'error' ? 'err' : g.phase === 'done' ? '' : 'idle'}`} />}
        <div style={{ minWidth: 0 }}>
          <b>{title}</b>
          <small className="truncate">{sub}</small>
        </div>
      </div>
      <div style={{ width: 120 }} data-tip="Google API requests in the last minute">
        <Sparkline values={rate} color="var(--info)" height={28} label="API requests per 2 seconds" />
      </div>
      <select value={depth} disabled={busy} onChange={(e) => setSettings({ scanDepth: e.target.value as typeof depth })} aria-label="Scan depth">
        <option value="quick">≥ 5 MB</option>
        <option value="standard">≥ 1 MB</option>
        <option value="deep">All mail</option>
      </select>
      <Info label="About scan depth">
        Largest emails are read first, so answers arrive in seconds. Only headers and sizes are fetched; Gmail allows about 50 emails per
        second, so “All mail” on a big mailbox can take several minutes.
      </Info>
      {busy ? (
        <button className="btn sm" onClick={cancelScan}>
          <Icon name="pause" size={16} /> Pause
        </button>
      ) : (
        <>
          <button className="btn sm primary" onClick={() => void scanAll()}>
            <Icon name="refresh" size={16} /> {g.phase === 'idle' ? 'Start scan' : 'Rescan'}
          </button>
          {historyId && g.phase === 'done' && (
            <button className="btn sm" onClick={() => void refreshChanges()} data-tip="Fetch only what changed since the last scan">
              Sync changes
            </button>
          )}
        </>
      )}
    </section>
  )
}
