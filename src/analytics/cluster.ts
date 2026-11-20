// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Cluster, GmailMsg } from '../types'
import { normalizeSubject } from './parse'

const TOKEN_RE = /[\p{L}\p{N}]+/gu
const JACCARD_MERGE = 0.6

function tokens(s: string): string[] {
  return s.toLowerCase().match(TOKEN_RE) ?? []
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function byBytesDesc(a: Cluster, b: Cluster): number {
  return b.bytes - a.bytes || cmpStr(a.id, b.id)
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1)
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

/** Most common non-empty display name in the group (ties: alphabetical), else the fallback. */
function labelOf(ms: GmailMsg[], fallback: string): string {
  const counts = new Map<string, number>()
  for (const m of ms) {
    const n = m.fromName.trim()
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  let best = ''
  let bestN = 0
  for (const [n, c] of counts) {
    if (c > bestN || (c === bestN && cmpStr(n, best) < 0)) {
      best = n
      bestN = c
    }
  }
  return best || fallback
}

function makeCluster(kind: Cluster['kind'], id: string, label: string, ms: GmailMsg[]): Cluster {
  return {
    id,
    label,
    kind,
    messageIds: ms.map((m) => m.id),
    bytes: ms.reduce((s, m) => s + m.size, 0),
  }
}

/** listId if present, else the sender's lower-cased address. */
export function senderKey(m: GmailMsg): string {
  return m.listId ? m.listId : m.fromEmail
}

/**
 * Same domain and display-name token Jaccard >= 0.6 merges two addresses.
 * Merging is transitive (union-find). Each address maps to its group's smallest address.
 */
export function mergeSenders(msgs: GmailMsg[]): Map<string, string> {
  const names = new Map<string, Set<string>>()
  for (const m of msgs) {
    let set = names.get(m.fromEmail)
    if (!set) {
      set = new Set<string>()
      names.set(m.fromEmail, set)
    }
    for (const t of tokens(m.fromName)) set.add(t)
  }
  const emails = [...names.keys()].sort(cmpStr)
  const parent = new Map<string, string>(emails.map((e) => [e, e]))
  const find = (x: string): string => {
    let r = x
    let p = parent.get(r)
    while (p !== undefined && p !== r) {
      r = p
      p = parent.get(r)
    }
    return r
  }

  const byDomain = new Map<string, string[]>()
  for (const e of emails) {
    const d = domainOf(e)
    const list = byDomain.get(d)
    if (list) list.push(e)
    else byDomain.set(d, [e])
  }
  for (const list of byDomain.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!
        const b = list[j]!
        if (jaccard(names.get(a)!, names.get(b)!) < JACCARD_MERGE) continue
        const ra = find(a)
        const rb = find(b)
        if (ra === rb) continue
        // Attach the larger root under the smaller, so each root is its group's minimum.
        if (ra < rb) parent.set(rb, ra)
        else parent.set(ra, rb)
      }
    }
  }

  const out = new Map<string, string>()
  for (const e of emails) out.set(e, find(e))
  return out
}

/** Mailing-list messages cluster by listId ('list'); the rest cluster by merged sender ('sender'). Bytes desc. */
export function clusterMessages(msgs: GmailMsg[]): Cluster[] {
  const lists = new Map<string, GmailMsg[]>()
  const senders = new Map<string, GmailMsg[]>()
  const canon = mergeSenders(msgs)
  for (const m of msgs) {
    if (m.listId) {
      const arr = lists.get(m.listId)
      if (arr) arr.push(m)
      else lists.set(m.listId, [m])
    } else {
      const key = canon.get(m.fromEmail) ?? m.fromEmail
      const arr = senders.get(key)
      if (arr) arr.push(m)
      else senders.set(key, [m])
    }
  }
  const out: Cluster[] = []
  for (const [listId, ms] of lists) {
    out.push(makeCluster('list', `list:${listId}`, labelOf(ms, listId), ms))
  }
  for (const [key, ms] of senders) {
    out.push(makeCluster('sender', `sender:${key}`, labelOf(ms, key), ms))
  }
  return out.sort(byBytesDesc)
}

/**
 * TF-IDF over lower-cased letter/number tokens (smoothed idf, raw term counts).
 * Vectors are L2-normalised; empty texts give empty vectors. Vocabulary is sorted.
 */
export function tfidf(texts: string[]): { vectors: Array<Map<number, number>>; vocab: string[] } {
  const docs = texts.map((t) => tokens(t))
  const df = new Map<string, number>()
  for (const d of docs) {
    for (const term of new Set(d)) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const vocab = [...df.keys()].sort(cmpStr)
  const index = new Map<string, number>(vocab.map((t, i) => [t, i]))
  const n = texts.length
  const idf = vocab.map((t) => Math.log((1 + n) / (1 + (df.get(t) ?? 0))) + 1)

  const vectors = docs.map((d) => {
    const counts = new Map<number, number>()
    for (const term of d) {
      const i = index.get(term)
      if (i === undefined) continue
      counts.set(i, (counts.get(i) ?? 0) + 1)
    }
    const v = new Map<number, number>()
    let sq = 0
    for (const [i, c] of counts) {
      const w = c * idf[i]!
      v.set(i, w)
      sq += w * w
    }
    const norm = Math.sqrt(sq)
    if (norm > 0) for (const [i, w] of v) v.set(i, w / norm)
    return v
  })
  return { vectors, vocab }
}

/** Cosine similarity in [0, 1] for non-negative vectors; 0 if either is empty. */
export function cosine(a: Map<number, number>, b: Map<number, number>): number {
  let small = a
  let big = b
  if (small.size > big.size) [small, big] = [big, small]
  let dot = 0
  for (const [k, v] of small) {
    const w = big.get(k)
    if (w !== undefined) dot += v * w
  }
  let na = 0
  for (const v of a.values()) na += v * v
  let nb = 0
  for (const v of b.values()) nb += v * v
  if (na === 0 || nb === 0) return 0
  return Math.min(1, dot / (Math.sqrt(na) * Math.sqrt(nb)))
}

function stripReplyPrefixes(s: string): string {
  let t = s.trim()
  for (;;) {
    const n = t.replace(/^(re|fwd?|fw)\s*:\s*/i, '')
    if (n === t) break
    t = n.trim()
  }
  return t
}

/**
 * Leader-follower grouping of subjects after normalizeSubject. Messages are visited oldest first.
 * A message joins the most similar existing leader whose similarity is >= threshold (identical
 * normalised subjects always match), otherwise it starts a new group.
 */
export function subjectClusters(msgs: GmailMsg[], threshold = 0.55): Cluster[] {
  const order = [...msgs].sort((a, b) => a.ts - b.ts || cmpStr(a.id, b.id))
  const norm = order.map((m) => normalizeSubject(m.subject))
  const { vectors } = tfidf(norm)

  const leaders: number[] = [] // index into order of each group's leader
  const members: number[][] = []
  const byNorm = new Map<string, number>() // normalised subject of a leader -> group index

  order.forEach((_, i) => {
    const key = norm[i]!
    const exact = byNorm.get(key)
    if (exact !== undefined) {
      members[exact]!.push(i)
      return
    }
    let best = -1
    let bestSim = -Infinity
    for (let g = 0; g < leaders.length; g++) {
      const li = leaders[g]!
      const sim = cosine(vectors[i]!, vectors[li]!)
      if (sim >= threshold && sim > bestSim) {
        best = g
        bestSim = sim
      }
    }
    if (best >= 0) {
      members[best]!.push(i)
      return
    }
    leaders.push(i)
    members.push([i])
    byNorm.set(key, leaders.length - 1)
  })

  const out: Cluster[] = leaders.map((li, g) => {
    const leader = order[li]!
    const ms = members[g]!.map((i) => order[i]!)
    const label = stripReplyPrefixes(leader.subject) || '(no subject)'
    return makeCluster('subject', `subject:${norm[li]!}`, label, ms)
  })
  return out.sort(byBytesDesc)
}
