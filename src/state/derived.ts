// SPDX-License-Identifier: AGPL-3.0-or-later
// Memoised, derived views over the store, shared by every page so views stay consistent.
import { useMemo } from 'react'
import { clusterMessages } from '../analytics/cluster'
import { buildVip, noiseScores, repliedThreads, safety, type SafetyCtx } from '../analytics/scores'
import type { BasketItem, Cluster, GmailMsg, SafetyResult } from '../types'
import { useApp } from './store'

/** Fixed "now" per page load so scores don't drift while you look at them. */
const NOW = Date.now()
const SYSTEM = /^(INBOX|SENT|DRAFT|SPAM|TRASH|UNREAD|STARRED|IMPORTANT|CHAT|CATEGORY_.*|YELLOW_STAR)$/

export function useSafetyCtx(): SafetyCtx {
  const sent = useApp((s) => s.sent)
  const gmail = useApp((s) => s.gmail)
  const me = useApp((s) => s.me)
  return useMemo(() => {
    const userLabels = new Set<string>()
    for (const m of gmail) for (const l of m.labels) if (!SYSTEM.test(l)) userLabels.add(l)
    return { vip: buildVip(sent, me), me, now: NOW, userLabels, repliedThreads: repliedThreads(sent) }
  }, [sent, gmail, me])
}

export function useSafetyMap(): Map<string, SafetyResult> {
  const gmail = useApp((s) => s.gmail)
  const ctx = useSafetyCtx()
  return useMemo(() => new Map(gmail.map((m) => [m.id, safety(m, ctx)])), [gmail, ctx])
}

export function useClusters(): Cluster[] {
  const gmail = useApp((s) => s.gmail)
  return useMemo(() => clusterMessages(gmail), [gmail])
}

export function useNoise() {
  const gmail = useApp((s) => s.gmail)
  return useMemo(() => noiseScores(gmail), [gmail])
}

export function useMsgIndex(): Map<string, GmailMsg> {
  const gmail = useApp((s) => s.gmail)
  return useMemo(() => new Map(gmail.map((m) => [m.id, m])), [gmail])
}

/** Effective per-user cap: what the user typed (e.g. 20 GB) wins over a pooled organisation quota. */
export function useCap(): { cap: number | null; pooled: boolean } {
  const quota = useApp((s) => s.quota)
  const capBytes = useApp((s) => s.settings.capBytes)
  const limit = quota?.limit ?? null
  const pooled = !!limit && limit > 2 * 2 ** 40 && !!quota && quota.usage > 0.5 * 2 ** 40
  return { cap: capBytes ?? limit, pooled }
}

/** Convert messages to basket items, never including blocked ones and skipping high risk unless asked. */
export function toGmailItems(msgs: GmailMsg[], safetyMap: Map<string, SafetyResult>, includeHigh = false): BasketItem[] {
  return msgs
    .filter((m) => {
      const lvl = safetyMap.get(m.id)?.level
      return lvl !== 'blocked' && (includeHigh || lvl !== 'high')
    })
    .map((m) => ({ kind: 'gmail' as const, id: m.id, bytes: m.size, label: `${m.fromName || m.fromEmail} — ${m.subject || '(no subject)'}` }))
}
