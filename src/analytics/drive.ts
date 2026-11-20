// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DriveFile, GraphData, TreeNode } from '../types'

const MIB = 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000
const ROOT_ID = 'root'

/** Bytes a file occupies in Drive: quota when reported, otherwise the head blob size. */
function bytesOf(f: DriveFile): number {
  return f.quota > 0 ? f.quota : f.size
}

export interface DupGroup {
  hash: string
  size: number
  files: DriveFile[]
  /** size * (files.length - 1) */
  wasted: number
}

/** Owned, not trashed, not a folder, non-empty, with a content hash. */
function dedupable(f: DriveFile): boolean {
  return f.owned && !f.trashed && !f.isFolder && f.size > 0
}

/** Groups files by sha256 (falling back to md5). Only groups with at least two members. */
export function findDuplicates(files: DriveFile[]): DupGroup[] {
  const groups = new Map<string, { hash: string; files: DriveFile[] }>()
  for (const f of files) {
    if (!dedupable(f)) continue
    let key: string
    let hash: string
    if (f.sha256) {
      key = `sha256:${f.sha256}`
      hash = f.sha256
    } else if (f.md5) {
      key = `md5:${f.md5}`
      hash = f.md5
    } else {
      continue
    }
    const g = groups.get(key)
    if (g) g.files.push(f)
    else groups.set(key, { hash, files: [f] })
  }
  const out: DupGroup[] = []
  for (const g of groups.values()) {
    if (g.files.length < 2) continue
    const size = g.files[0]!.size
    out.push({ hash: g.hash, size, files: g.files, wasted: size * (g.files.length - 1) })
  }
  return out.sort((a, b) => b.wasted - a.wasted || a.hash.localeCompare(b.hash))
}

export type KeepRule = 'newest' | 'oldest' | 'shortestName' | { folderId: string }

/** Returns the candidate that sorts first under `cmp`, ties broken by id. */
function best(list: DriveFile[], cmp: (a: DriveFile, b: DriveFile) => number): DriveFile {
  let winner = list[0]!
  for (const f of list.slice(1)) {
    const c = cmp(f, winner)
    if (c < 0 || (c === 0 && f.id < winner.id)) winner = f
  }
  return winner
}

const newestFirst = (a: DriveFile, b: DriveFile) => b.modified - a.modified
const oldestFirst = (a: DriveFile, b: DriveFile) => a.modified - b.modified
const shortestNameFirst = (a: DriveFile, b: DriveFile) =>
  a.name.length - b.name.length || a.name.localeCompare(b.name)

/**
 * Picks the copy to keep and lists the rest for removal.
 * For `{ folderId }` the newest copy inside that folder is kept; if no copy lives there,
 * the newest copy overall is kept so the caller never loses every version.
 */
export function keepRule(g: DupGroup, rule: KeepRule): { keep: DriveFile; remove: DriveFile[] } {
  if (g.files.length === 0) throw new RangeError('keepRule: empty duplicate group')
  let keep: DriveFile
  if (rule === 'newest') keep = best(g.files, newestFirst)
  else if (rule === 'oldest') keep = best(g.files, oldestFirst)
  else if (rule === 'shortestName') keep = best(g.files, shortestNameFirst)
  else {
    const inFolder = g.files.filter((f) => f.parents.includes(rule.folderId))
    keep = inFolder.length > 0 ? best(inFolder, newestFirst) : best(g.files, newestFirst)
  }
  return { keep, remove: g.files.filter((f) => f.id !== keep.id) }
}

/** Owned files whose kept revisions exceed the head blob by at least `minExtra` bytes, largest first. */
export function revisionBloat(
  files: DriveFile[],
  minExtra = MIB,
): Array<{ file: DriveFile; extra: number }> {
  const out: Array<{ file: DriveFile; extra: number }> = []
  for (const file of files) {
    if (!file.owned) continue
    const extra = file.quota - file.size
    if (extra > 0 && extra >= minExtra) out.push({ file, extra })
  }
  return out.sort((a, b) => b.extra - a.extra || a.file.id.localeCompare(b.file.id))
}

/** Owned, not trashed files at least `minSize` bytes whose last view (or modification) is older than `years`. */
export function coldFiles(
  files: DriveFile[],
  now: number,
  years = 2,
  minSize = 10 * MIB,
): DriveFile[] {
  const cutoff = now - years * 365.25 * DAY_MS
  return files
    .filter((f) => f.owned && !f.trashed && f.size >= minSize && (f.viewed ?? f.modified) < cutoff)
    .sort((a, b) => b.size - a.size || a.id.localeCompare(b.id))
}

/** Owned, not trashed files that are shared with "anyone". */
export function publicLinks(files: DriveFile[]): DriveFile[] {
  return files.filter((f) => f.owned && !f.trashed && f.publicLink)
}

/**
 * Treemap-ready hierarchy of the owned, not-trashed Drive contents.
 * Leaf value is the quota (or size when quota is unknown); folder value is the sum of its children.
 * A folder keeps its `maxChildren` largest children and folds the rest into one `other` node.
 * Files and folders whose parent is not visible become children of the root.
 */
export function buildDriveTree(
  files: DriveFile[],
  opts: { maxChildren?: number } = {},
): TreeNode {
  const maxChildren = opts.maxChildren ?? 24
  if (!(maxChildren >= 1)) throw new RangeError('buildDriveTree: maxChildren must be >= 1')

  const live = files.filter((f) => f.owned && !f.trashed)
  const folders = new Map<string, DriveFile>()
  for (const f of live) if (f.isFolder) folders.set(f.id, f)

  // Resolve each folder's parent, refusing any link that would create a cycle.
  const parentOf = new Map<string, string>()
  for (const f of folders.values()) {
    parentOf.set(f.id, f.parents.find((p) => folders.has(p) && p !== f.id) ?? ROOT_ID)
  }
  const orderedFolderIds = [...folders.keys()].sort()
  for (const id of orderedFolderIds) {
    let x = parentOf.get(id) ?? ROOT_ID
    let steps = 0
    let cyclic = false
    while (x !== ROOT_ID) {
      if (x === id || steps > folders.size) {
        cyclic = true
        break
      }
      x = parentOf.get(x) ?? ROOT_ID
      steps++
    }
    if (cyclic) parentOf.set(id, ROOT_ID)
  }

  const root: TreeNode = { id: ROOT_ID, name: 'My Drive', value: 0, children: [] }
  const folderNodes = new Map<string, TreeNode>()
  for (const f of folders.values()) {
    folderNodes.set(f.id, { id: f.id, name: f.name, value: 0, children: [] })
  }
  const containerFor = (id: string): TreeNode => folderNodes.get(id) ?? root

  for (const f of folders.values()) {
    containerFor(parentOf.get(f.id) ?? ROOT_ID).children!.push(folderNodes.get(f.id)!)
  }
  for (const f of live) {
    if (f.isFolder) continue
    const parent = f.parents.find((p) => folders.has(p)) ?? ROOT_ID
    containerFor(parent).children!.push({ id: f.id, name: f.name, value: bytesOf(f) })
  }

  const byValue = (a: TreeNode, b: TreeNode) =>
    b.value - a.value || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)

  const finish = (node: TreeNode): number => {
    if (!node.children) return node.value
    let total = 0
    for (const c of node.children) total += finish(c)
    node.children.sort(byValue)
    if (node.children.length > maxChildren) {
      const kept = node.children.slice(0, maxChildren)
      const extra = node.children.slice(maxChildren)
      const other: TreeNode = {
        id: `${node.id}/other`,
        name: 'Other',
        value: extra.reduce((s, c) => s + c.value, 0),
        children: extra,
      }
      node.children = [...kept, other]
    }
    node.value = total
    return total
  }
  finish(root)
  return root
}

/** Bytes in owned files sitting in the trash (these still count against quota). */
export function trashedBytes(files: DriveFile[]): number {
  let sum = 0
  for (const f of files) if (f.owned && f.trashed) sum += bytesOf(f)
  return sum
}

/**
 * Who shares files with `me`: one node per owner of a non-owned, shared, not-trashed file,
 * and one link from `me` to each owner weighted by the bytes they have shared.
 */
export function shareGraph(files: DriveFile[], me: string): GraphData {
  const self = me.toLowerCase()
  const byOwner = new Map<string, number>()
  for (const f of files) {
    if (f.owned || f.trashed || !f.shared) continue
    const owner = f.ownerEmails[0]
    if (!owner || owner === self) continue
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + bytesOf(f))
  }
  const owners = [...byOwner.keys()].sort()
  const total = owners.reduce((s, o) => s + (byOwner.get(o) ?? 0), 0)
  return {
    nodes: [
      { id: self, label: self, value: total },
      ...owners.map((o) => ({ id: o, label: o, value: byOwner.get(o) ?? 0 })),
    ],
    links: owners.map((o) => ({ source: self, target: o, weight: byOwner.get(o) ?? 0 })),
  }
}
