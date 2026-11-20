// SPDX-License-Identifier: AGPL-3.0-or-later
import { cancelScan, refreshChanges, scanAll } from '../state/session'
import { useApp } from '../state/store'
import { formatBytes, formatCount } from '../util/format'

/** Live scan progress with cancel; also the entry point for (re)scans in live mode. */
export function ScanBar() {
  const mode = useApp((s) => s.mode)
  const g = useApp((s) => s.gmailScan)
  const d = useApp((s) => s.driveScan)
  const depth = useApp((s) => s.settings.scanDepth)
  const setSettings = useApp((s) => s.setSettings)
  const historyId = useApp((s) => s.historyId)
  if (mode !== 'live') return null
  const busy = ['listing', 'fetching'].includes(g.phase) || ['listing', 'fetching'].includes(d.phase)
  const pct = g.total ? g.done / g.total : 0
  return (
    <div className="card flat scanbar">
      <div className="row between">
        <div className="stack" style={{ gap: 4, flex: 1, minWidth: 240 }}>
          <strong>
            {busy
              ? d.phase !== 'done'
                ? `Reading Drive metadata… ${formatCount(d.done)} files`
                : g.phase === 'listing'
                  ? 'Finding your largest emails…'
                  : `Reading email headers ${formatCount(g.done)} / ${formatCount(g.total)} · ${formatBytes(g.bytesSeen)} found`
              : g.phase === 'done'
                ? `Scan complete · ${formatCount(g.total)} large emails · ${formatBytes(g.bytesSeen)}`
                : g.phase === 'error'
                  ? 'Scan stopped with an error'
                  : g.phase === 'cancelled'
                    ? `Scan paused · ${formatCount(g.done)} emails so far`
                    : 'Ready to scan'}
          </strong>
          {busy && (
            <div className="meter" aria-label="Scan progress">
              <i style={{ width: `${Math.round(pct * 100)}%` }} />
            </div>
          )}
          {g.message && <span className="muted">{g.message}</span>}
        </div>
        <div className="row">
          <label className="row" style={{ gap: 6 }}>
            <span className="muted">Depth</span>
            <select value={depth} disabled={busy} onChange={(e) => setSettings({ scanDepth: e.target.value as typeof depth })} style={{ width: 'auto' }}>
              <option value="quick">Quick (≥ 5 MB)</option>
              <option value="standard">Standard (≥ 1 MB)</option>
              <option value="deep">Deep (every email)</option>
            </select>
          </label>
          {busy ? (
            <button className="btn" onClick={cancelScan}>
              Pause
            </button>
          ) : (
            <>
              <button className="btn primary" onClick={() => void scanAll()}>
                {g.phase === 'idle' ? 'Start scan' : 'Rescan'}
              </button>
              {historyId && g.phase === 'done' && (
                <button className="btn" onClick={() => void refreshChanges()}>
                  Refresh changes
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
