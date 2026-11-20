// SPDX-License-Identifier: AGPL-3.0-or-later
import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import type { GmailMsg, GraphData, GraphLink, GraphNode } from '../types'
import { mergeSenders, senderKey } from './cluster'
import { mulberry32 } from './embed'
import { normalizeSubject } from './parse'

const LOUVAIN_SEED = 42
/** Threads with more participants than this are broadcasts, not conversations; they add no links. */
const MAX_THREAD_PEOPLE = 50
const DOMAIN_WEIGHT = 0.2

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)
const fromPairKey = (k: string): [string, string] => {
  const i = k.indexOf('\u0000')
  return [k.slice(0, i), k.slice(i + 1)]
}

/** Keep the larger weight for each undirected pair. */
function addPair(pairs: Map<string, number>, a: string, b: string, w: number): void {
  if (a === b) return
  const k = pairKey(a, b)
  if ((pairs.get(k) ?? 0) < w) pairs.set(k, w)
}

function sortedLinks(pairs: Map<string, number>): GraphLink[] {
  return [...pairs.entries()]
    .map(([k, weight]) => {
      const [source, target] = fromPairKey(k)
      return { source, target, weight }
    })
    .sort((x, y) => (x.source < y.source ? -1 : x.source > y.source ? 1 : x.target < y.target ? -1 : x.target > y.target ? 1 : 0))
}

/** Add `w` for every pair drawn from a set of group ids. */
function linkAll(pairs: Map<string, number>, members: Set<string>, w: number): void {
  const ids = [...members]
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) addPair(pairs, ids[i]!, ids[j]!, w)
}

/**
 * Sender graph. Nodes are sender groups (mergeSenders), valued by bytes; the largest
 * maxNodes groups above minBytes are kept. Links join groups that share a thread or a
 * List-Id (weight 1) or a domain (weight 0.2).
 */
export function senderGraph(msgs: GmailMsg[], opts?: { minBytes?: number; maxNodes?: number }): GraphData {
  const minBytes = opts?.minBytes ?? 0
  const maxNodes = opts?.maxNodes ?? 150
  const canon = mergeSenders(msgs)

  const groups = new Map<string, { label: string; bytes: number; topBytes: number; msgs: GmailMsg[] }>()
  for (const m of msgs) {
    const id = canon.get(m.fromEmail) ?? m.fromEmail
    let g = groups.get(id)
    if (!g) {
      g = { label: m.fromName || id, bytes: 0, topBytes: -1, msgs: [] }
      groups.set(id, g)
    }
    g.bytes += m.size
    g.msgs.push(m)
    if (m.size > g.topBytes) {
      g.topBytes = m.size
      g.label = m.fromName || id
    }
  }

  const kept = [...groups.entries()]
    .filter(([, g]) => g.bytes >= minBytes)
    .sort((a, b) => b[1].bytes - a[1].bytes || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, Math.max(0, maxNodes))
  const keep = new Set(kept.map(([id]) => id))

  const nodes: GraphNode[] = kept.map(([id, g]) => ({ id, label: g.label, value: g.bytes }))

  const byThread = new Map<string, Set<string>>()
  const byList = new Map<string, Set<string>>()
  const byDomain = new Map<string, Set<string>>()
  const add = (map: Map<string, Set<string>>, k: string, id: string) => {
    let s = map.get(k)
    if (!s) {
      s = new Set()
      map.set(k, s)
    }
    s.add(id)
  }
  for (const [id, g] of kept) {
    for (const m of g.msgs) {
      add(byThread, m.threadId, id)
      if (m.listId) add(byList, senderKey(m), id)
      if (m.domain) add(byDomain, m.domain, id)
    }
  }

  const pairs = new Map<string, number>()
  for (const s of byThread.values()) linkAll(pairs, s, 1)
  for (const s of byList.values()) linkAll(pairs, s, 1)
  for (const s of byDomain.values()) linkAll(pairs, s, DOMAIN_WEIGHT)

  const links = sortedLinks(pairs).filter((l) => keep.has(l.source) && keep.has(l.target))
  return { nodes, links }
}

/**
 * Louvain modularity communities on the graph (edge weight from link.weight), seeded so
 * the same graph always gives the same partition. Returns node id -> community index.
 */
export function louvainCommunities(g: GraphData): Map<string, number> {
  const graph = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false })
  for (const n of g.nodes) if (!graph.hasNode(n.id)) graph.addNode(n.id)
  if (graph.order === 0) return new Map()
  for (const l of g.links) {
    if (l.source === l.target || !graph.hasNode(l.source) || !graph.hasNode(l.target)) continue
    if (!(l.weight > 0) || graph.hasEdge(l.source, l.target)) continue
    graph.addUndirectedEdge(l.source, l.target, { weight: l.weight })
  }
  const assignment = louvain(graph, { getEdgeWeight: 'weight', rng: mulberry32(LOUVAIN_SEED) })
  return new Map(Object.entries(assignment))
}

/**
 * PageRank by power iteration over the undirected, weighted graph. Dangling nodes spread
 * their mass uniformly. The result sums to 1.
 */
export function pageRank(g: GraphData, damping = 0.85, iters = 100): Map<string, number> {
  const N = g.nodes.length
  if (N === 0) return new Map()
  const ids = g.nodes.map((n) => n.id)
  const index = new Map(ids.map((id, i) => [id, i]))
  const adj: Array<Array<[number, number]>> = ids.map(() => [])
  const out = new Float64Array(N)
  for (const l of g.links) {
    const a = index.get(l.source)
    const b = index.get(l.target)
    if (a === undefined || b === undefined || a === b || !(l.weight > 0)) continue
    adj[a]!.push([b, l.weight])
    adj[b]!.push([a, l.weight])
    out[a]! += l.weight
    out[b]! += l.weight
  }

  let rank = new Float64Array(N).fill(1 / N)
  for (let it = 0; it < iters; it++) {
    let dangling = 0
    for (let i = 0; i < N; i++) if (out[i] === 0) dangling += rank[i]!
    const next = new Float64Array(N).fill((1 - damping) / N + (damping * dangling) / N)
    for (let i = 0; i < N; i++) {
      if (out[i] === 0) continue
      const share = (damping * rank[i]!) / out[i]!
      for (const [j, w] of adj[i]!) next[j]! += share * w
    }
    let total = 0
    for (let i = 0; i < N; i++) total += next[i]!
    let diff = 0
    for (let i = 0; i < N; i++) {
      next[i]! /= total
      diff += Math.abs(next[i]! - rank[i]!)
    }
    rank = next
    if (diff < 1e-12) break
  }
  return new Map(ids.map((id, i) => [id, rank[i]!]))
}

/**
 * Correspondent graph. Nodes are the people (addresses) met in the mail other than `me`,
 * valued by how many messages involve them. Two people are linked with weight equal to
 * the number of threads they share. Threads with more than MAX_THREAD_PEOPLE people add no links.
 */
export function correspondentGraph(msgs: GmailMsg[], me: string): GraphData {
  const self = me.trim().toLowerCase()
  const count = new Map<string, number>()
  const nameOf = new Map<string, string>()
  const threads = new Map<string, Set<string>>()

  for (const m of msgs) {
    const people = new Set([m.fromEmail, ...m.recipients].filter((e) => e && e !== self))
    for (const p of people) count.set(p, (count.get(p) ?? 0) + 1)
    if (m.fromEmail && m.fromEmail !== self && m.fromName && m.fromName !== m.fromEmail && !nameOf.has(m.fromEmail)) {
      nameOf.set(m.fromEmail, m.fromName)
    }
    let t = threads.get(m.threadId)
    if (!t) {
      t = new Set()
      threads.set(m.threadId, t)
    }
    people.forEach((p) => t.add(p))
  }

  const pairs = new Map<string, number>()
  for (const people of threads.values()) {
    if (people.size < 2 || people.size > MAX_THREAD_PEOPLE) continue
    const ids = [...people]
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const k = pairKey(ids[i]!, ids[j]!)
        pairs.set(k, (pairs.get(k) ?? 0) + 1)
      }
    }
  }

  const nodes: GraphNode[] = [...count.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id, n]) => ({ id, label: nameOf.get(id) ?? id, value: n }))
  return { nodes, links: sortedLinks(pairs) }
}

/**
 * Attachments that recur: messages with the same normalised subject and sizes within 2%
 * of the group's smallest member. Groups need at least 3 messages. Sorted by total bytes desc.
 */
export function repeatedAttachmentGroups(msgs: GmailMsg[]): Array<{ key: string; ids: string[]; bytes: number }> {
  const bySubject = new Map<string, GmailMsg[]>()
  for (const m of msgs) {
    if (!(m.size > 0)) continue
    const subj = normalizeSubject(m.subject)
    if (!subj) continue
    let list = bySubject.get(subj)
    if (!list) {
      list = []
      bySubject.set(subj, list)
    }
    list.push(m)
  }

  const out: Array<{ key: string; ids: string[]; bytes: number }> = []
  for (const [subj, list] of bySubject) {
    list.sort((a, b) => a.size - b.size || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    let i = 0
    while (i < list.length) {
      const anchor = list[i]!.size
      const members: GmailMsg[] = []
      let j = i
      while (j < list.length && list[j]!.size <= anchor * 1.02) members.push(list[j++]!)
      if (members.length >= 3) {
        out.push({
          key: `${subj}|${anchor}`,
          ids: members.map((m) => m.id),
          bytes: members.reduce((s, m) => s + m.size, 0),
        })
      }
      i = j
    }
  }
  return out.sort((a, b) => b.bytes - a.bytes || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
