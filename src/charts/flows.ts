// SPDX-License-Identifier: AGPL-3.0-or-later
/** Input sanitiser for flow diagrams: drops invalid links, merges duplicates and breaks cycles so layout cannot fail. */

export interface FlowNode {
  id: string
  label: string
}

export interface FlowLink {
  source: string
  target: string
  value: number
}

export function sanitizeFlows(
  nodes: ReadonlyArray<FlowNode>,
  links: ReadonlyArray<FlowLink>,
): { nodes: FlowNode[]; links: FlowLink[] } {
  const labels = new Map<string, string>()
  for (const n of nodes) {
    if (n && typeof n.id === 'string' && n.id && !labels.has(n.id)) labels.set(n.id, n.label || n.id)
  }

  const merged = new Map<string, FlowLink>()
  for (const l of links) {
    if (!l || !labels.has(l.source) || !labels.has(l.target) || l.source === l.target) continue
    if (!Number.isFinite(l.value) || l.value <= 0) continue
    const key = `${l.source}\u0000${l.target}`
    const prev = merged.get(key)
    if (prev) prev.value += l.value
    else merged.set(key, { source: l.source, target: l.target, value: l.value })
  }

  const acyclic = dropBackEdges([...merged.values()])
  const used = new Set<string>()
  for (const l of acyclic) {
    used.add(l.source)
    used.add(l.target)
  }
  return {
    nodes: [...labels].filter(([id]) => used.has(id)).map(([id, label]) => ({ id, label })),
    links: acyclic,
  }
}

/** Removes the edges that close a cycle in a depth-first walk, leaving a DAG. */
export function dropBackEdges(links: FlowLink[]): FlowLink[] {
  const out = new Map<string, FlowLink[]>()
  const all = new Set<string>()
  for (const l of links) {
    all.add(l.source)
    all.add(l.target)
    const list = out.get(l.source)
    if (list) list.push(l)
    else out.set(l.source, [l])
  }
  const state = new Map<string, 'open' | 'done'>()
  const back = new Set<FlowLink>()
  for (const root of all) {
    if (state.has(root)) continue
    state.set(root, 'open')
    const stack: Array<{ id: string; i: number }> = [{ id: root, i: 0 }]
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (!top) break
      const edges = out.get(top.id) ?? []
      if (top.i >= edges.length) {
        state.set(top.id, 'done')
        stack.pop()
        continue
      }
      const edge = edges[top.i]
      top.i++
      if (!edge) continue
      const st = state.get(edge.target)
      if (st === 'open') back.add(edge)
      else if (st === undefined) {
        state.set(edge.target, 'open')
        stack.push({ id: edge.target, i: 0 })
      }
    }
  }
  return links.filter((l) => !back.has(l))
}
