// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo } from 'react'
import { bridgeRows, domainCooccurrence, peopleBridge } from '../analytics/cross'
import { ForceGraph } from '../charts'
import { Chord } from '../charts/Chord'
import { useApp } from '../state/store'
import { formatBytes, formatCount } from '../util/format'

export default function Insights() {
  const gmail = useApp((s) => s.gmail)
  const drive = useApp((s) => s.drive)
  const me = useApp((s) => s.me)

  const chords = useMemo(() => domainCooccurrence(gmail, me, 12), [gmail, me])
  const bridge = useMemo(() => peopleBridge(gmail, drive, me), [gmail, drive, me])
  const rows = useMemo(() => bridgeRows(gmail, drive, me), [gmail, drive, me])

  return (
    <div className="stack" style={{ gap: 28 }}>
      <header>
        <h1>Insights</h1>
        <p className="muted" style={{ margin: 0 }}>
          Views that join Gmail and Drive metadata. Only names, sizes and addresses are read. No file contents, no message bodies.
        </p>
      </header>

      <section className="card stack" aria-labelledby="insights-chords">
        <div>
          <h2 id="insights-chords">Domain chords</h2>
          <p className="muted" style={{ margin: 0 }}>
            Which organisations mail you together. Each message links every pair of domains among its sender and recipients, weighted by the
            message&apos;s bytes. Your own address is left out, so your domain only counts when a colleague on it appears too.
          </p>
        </div>
        {chords.domains.length === 0 ? (
          <div className="empty">No mail with more than one organisation yet. Scan Gmail to see how domains connect.</div>
        ) : (
          <Chord names={chords.domains} matrix={chords.matrix} />
        )}
      </section>

      <section className="card stack" aria-labelledby="insights-people">
        <div>
          <h2 id="insights-people">People in both places</h2>
          <p className="muted" style={{ margin: 0 }}>
            People who both email you and own Drive files you can see. The constellation links each of them to Mail and to Drive, sized by
            the bytes on each side.
          </p>
        </div>
        {bridge.nodes.length === 0 ? (
          <div className="empty">No one both emails you and shares Drive files with you yet. Scan Gmail and Drive to find out.</div>
        ) : (
          <>
            <ForceGraph data={bridge} />
            <div style={{ overflowX: 'auto' }}>
              <table className="data">
                <caption className="sr-only">People who both email you and own Drive files you can see</caption>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Mail bytes</th>
                    <th scope="col">Messages</th>
                    <th scope="col">Drive bytes</th>
                    <th scope="col">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.email}>
                      <td>
                        {r.name}
                        {r.name !== r.email && (
                          <div className="mono muted" style={{ fontSize: '0.78rem' }}>
                            {r.email}
                          </div>
                        )}
                      </td>
                      <td className="mono-num">{formatBytes(r.mailBytes)}</td>
                      <td className="mono-num">{formatCount(r.messages)}</td>
                      <td className="mono-num">{formatBytes(r.fileBytes)}</td>
                      <td className="mono-num">{formatCount(r.files)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
