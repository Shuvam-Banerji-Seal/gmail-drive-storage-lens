// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import type { DriveFile } from '../types'
import {
  buildDriveTree,
  coldFiles,
  findDuplicates,
  keepRule,
  publicLinks,
  revisionBloat,
  shareGraph,
  trashedBytes,
} from './drive'

const MIB = 1024 * 1024
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 20)

const file = (over: Partial<DriveFile> & { id: string }): DriveFile => ({
  name: `${over.id}.bin`,
  mime: 'application/octet-stream',
  size: 0,
  quota: 0,
  parents: [],
  owned: true,
  shared: false,
  trashed: false,
  modified: NOW,
  created: NOW,
  ownerEmails: ['owner@example.test'],
  publicLink: false,
  isFolder: false,
  ...over,
})

const folder = (over: Partial<DriveFile> & { id: string }): DriveFile =>
  file({ mime: 'application/vnd.google-apps.folder', isFolder: true, ...over })

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

function leaves(n: { value: number; children?: unknown[] }): number[] {
  const kids = (n.children ?? []) as Array<{ value: number; children?: unknown[] }>
  if (kids.length === 0) return n.children ? [] : [n.value]
  return kids.flatMap((k) => leaves(k))
}

describe('findDuplicates', () => {
  it('returns [] for empty input', () => {
    expect(findDuplicates([])).toEqual([])
  })

  it('groups by sha256, falls back to md5, ignores files without a hash', () => {
    const files = [
      file({ id: 'a', size: 100, sha256: 'h1' }),
      file({ id: 'b', size: 100, sha256: 'h1' }),
      file({ id: 'c', size: 50, md5: 'm1' }),
      file({ id: 'd', size: 50, md5: 'm1' }),
      file({ id: 'e', size: 50, md5: 'm1' }),
      file({ id: 'nohash', size: 999 }),
      file({ id: 'nohash2', size: 999 }),
    ]
    const groups = findDuplicates(files)
    expect(groups).toHaveLength(2)
    // both groups waste 100 bytes; ties break by hash ascending
    expect(groups.map((g) => g.hash)).toEqual(['h1', 'm1'])
    const md5Group = groups.find((g) => g.hash === 'm1')!
    expect(md5Group.files.map((f) => f.id)).toEqual(['c', 'd', 'e'])
    expect(md5Group.wasted).toBe(50 * 2)
    const shaGroup = groups.find((g) => g.hash === 'h1')!
    expect(shaGroup.wasted).toBe(100)
  })

  it('excludes trashed, not-owned, folder, zero-size and single-member files', () => {
    const files = [
      file({ id: 'a', size: 10, sha256: 'x' }),
      file({ id: 'b', size: 10, sha256: 'x', trashed: true }),
      file({ id: 'c', size: 10, sha256: 'x', owned: false }),
      folder({ id: 'd', size: 10, sha256: 'x' }),
      file({ id: 'e', size: 0, sha256: 'y' }),
      file({ id: 'f', size: 0, sha256: 'y' }),
      file({ id: 'g', size: 7, sha256: 'z' }),
    ]
    expect(findDuplicates(files)).toEqual([])
  })

  it('sorts groups by wasted bytes descending', () => {
    const files = [
      file({ id: 'a1', size: 10, sha256: 'small' }),
      file({ id: 'a2', size: 10, sha256: 'small' }),
      file({ id: 'b1', size: 1000, sha256: 'big' }),
      file({ id: 'b2', size: 1000, sha256: 'big' }),
      file({ id: 'b3', size: 1000, sha256: 'big' }),
    ]
    const groups = findDuplicates(files)
    expect(groups.map((g) => g.hash)).toEqual(['big', 'small'])
    expect(groups[0]!.wasted).toBe(2000)
  })
})

describe('keepRule', () => {
  const group = findDuplicates([
    file({ id: 'old', name: 'report-final-long.pdf', size: 5, sha256: 'h', modified: NOW - 10 * DAY, parents: ['f1'] }),
    file({ id: 'new', name: 'r.pdf', size: 5, sha256: 'h', modified: NOW, parents: ['f2'] }),
    file({ id: 'mid', name: 'report.pdf', size: 5, sha256: 'h', modified: NOW - 5 * DAY, parents: ['f1'] }),
  ])[0]!

  it('newest keeps the most recently modified copy', () => {
    const { keep, remove } = keepRule(group, 'newest')
    expect(keep.id).toBe('new')
    expect(remove.map((f) => f.id).sort()).toEqual(['mid', 'old'])
  })
  it('oldest keeps the least recently modified copy', () => {
    expect(keepRule(group, 'oldest').keep.id).toBe('old')
  })
  it('shortestName keeps the shortest file name', () => {
    expect(keepRule(group, 'shortestName').keep.id).toBe('new')
  })
  it('folderId keeps the newest copy inside that folder', () => {
    const { keep, remove } = keepRule(group, { folderId: 'f1' })
    expect(keep.id).toBe('mid')
    expect(remove.map((f) => f.id).sort()).toEqual(['new', 'old'])
  })
  it('folderId falls back to newest overall when no copy is in the folder', () => {
    expect(keepRule(group, { folderId: 'nowhere' }).keep.id).toBe('new')
  })
  it('keep plus remove always covers the whole group exactly once', () => {
    const { keep, remove } = keepRule(group, 'oldest')
    expect([keep, ...remove].map((f) => f.id).sort()).toEqual(group.files.map((f) => f.id).sort())
  })
})

describe('revisionBloat', () => {
  it('returns [] for empty input', () => {
    expect(revisionBloat([])).toEqual([])
  })
  it('uses quota minus size, owned only, default threshold 1 MiB, largest first', () => {
    const files = [
      file({ id: 'big', size: 10 * MIB, quota: 30 * MIB }),
      file({ id: 'small', size: 10 * MIB, quota: 10 * MIB + 2 * MIB }),
      file({ id: 'tiny', size: 10 * MIB, quota: 10 * MIB + 1024 }),
      file({ id: 'notmine', size: 1, quota: 100 * MIB, owned: false }),
      file({ id: 'none', size: 4, quota: 0 }),
    ]
    const out = revisionBloat(files)
    expect(out.map((r) => r.file.id)).toEqual(['big', 'small'])
    expect(out.map((r) => r.extra)).toEqual([20 * MIB, 2 * MIB])
  })
  it('respects a custom minExtra', () => {
    const files = [file({ id: 'x', size: 1, quota: 1001 })]
    expect(revisionBloat(files, 1000)).toHaveLength(1)
    expect(revisionBloat(files, 1001)).toHaveLength(0)
  })
})

describe('coldFiles', () => {
  const big = 20 * MIB
  it('returns [] for empty input', () => {
    expect(coldFiles([], NOW)).toEqual([])
  })
  it('uses viewed time when present, otherwise modified time, against a years cutoff', () => {
    const old = NOW - 3 * 365 * DAY
    const files = [
      file({ id: 'never-viewed-old', size: big, modified: old }),
      file({ id: 'viewed-recently', size: big, modified: old, viewed: NOW - DAY }),
      file({ id: 'modified-recent', size: big, modified: NOW - DAY }),
    ]
    expect(coldFiles(files, NOW).map((f) => f.id)).toEqual(['never-viewed-old'])
  })
  it('excludes small, trashed and not-owned files and sorts by size desc', () => {
    const old = NOW - 5 * 365 * DAY
    const files = [
      file({ id: 'a', size: 30 * MIB, modified: old }),
      file({ id: 'b', size: 11 * MIB, modified: old }),
      file({ id: 'small', size: 9 * MIB, modified: old }),
      file({ id: 'trashed', size: 50 * MIB, modified: old, trashed: true }),
      file({ id: 'shared', size: 50 * MIB, modified: old, owned: false }),
    ]
    expect(coldFiles(files, NOW).map((f) => f.id)).toEqual(['a', 'b'])
  })
  it('honours custom years and minSize', () => {
    const files = [file({ id: 'x', size: 100, modified: NOW - 400 * DAY })]
    expect(coldFiles(files, NOW, 1, 100).map((f) => f.id)).toEqual(['x'])
    expect(coldFiles(files, NOW, 2, 100)).toEqual([])
  })
})

describe('publicLinks', () => {
  it('returns owned, not trashed, publicly linked files', () => {
    const files = [
      file({ id: 'pub', publicLink: true }),
      file({ id: 'priv', publicLink: false }),
      file({ id: 'pub-trashed', publicLink: true, trashed: true }),
      file({ id: 'pub-other', publicLink: true, owned: false }),
    ]
    expect(publicLinks(files).map((f) => f.id)).toEqual(['pub'])
    expect(publicLinks([])).toEqual([])
  })
})

describe('trashedBytes', () => {
  it('sums owned trashed files, using quota when present', () => {
    const files = [
      file({ id: 'a', size: 10, quota: 15, trashed: true }),
      file({ id: 'b', size: 7, trashed: true }),
      file({ id: 'c', size: 100, trashed: false }),
      file({ id: 'd', size: 100, trashed: true, owned: false }),
    ]
    expect(trashedBytes(files)).toBe(22)
    expect(trashedBytes([])).toBe(0)
  })
})

describe('buildDriveTree', () => {
  it('returns an empty root for empty input', () => {
    const root = buildDriveTree([])
    expect(root.name).toBe('My Drive')
    expect(root.value).toBe(0)
    expect(root.children).toEqual([])
  })

  it('nests files under folders and totals equal the sum of leaves', () => {
    const files = [
      folder({ id: 'F', name: 'Projects' }),
      folder({ id: 'G', name: 'Sub', parents: ['F'] }),
      file({ id: 'a', quota: 100, size: 90, parents: ['F'] }),
      file({ id: 'b', quota: 0, size: 40, parents: ['G'] }),
      file({ id: 'c', quota: 7, size: 7 }),
      file({ id: 'dead', quota: 1000, size: 1000, trashed: true, parents: ['F'] }),
      file({ id: 'foreign', quota: 5000, size: 5000, owned: false }),
    ]
    const root = buildDriveTree(files)
    expect(root.value).toBe(100 + 40 + 7)
    expect(sum(leaves(root))).toBe(root.value)
    const projects = root.children!.find((c) => c.id === 'F')!
    expect(projects.value).toBe(140)
    const sub = projects.children!.find((c) => c.id === 'G')!
    expect(sub.value).toBe(40)
    expect(root.children!.some((c) => c.id === 'dead' || c.id === 'foreign')).toBe(false)
  })

  it('attaches children whose parent is not visible to the root', () => {
    const files = [file({ id: 'orphan', quota: 9, parents: ['not-owned-folder'] })]
    const root = buildDriveTree(files)
    expect(root.children!.map((c) => c.id)).toEqual(['orphan'])
    expect(root.value).toBe(9)
  })

  it('does not loop forever on folder cycles', () => {
    const files = [
      folder({ id: 'A', parents: ['B'] }),
      folder({ id: 'B', parents: ['A'] }),
      file({ id: 'x', quota: 3, parents: ['A'] }),
    ]
    const root = buildDriveTree(files)
    expect(root.value).toBe(3)
    expect(sum(leaves(root))).toBe(3)
  })

  it('folds children beyond maxChildren into one other node, keeping totals', () => {
    const files = Array.from({ length: 5 }, (_, i) => file({ id: `f${i}`, quota: (i + 1) * 10 }))
    const root = buildDriveTree(files, { maxChildren: 3 })
    expect(root.children).toHaveLength(4)
    const other = root.children![3]!
    expect(other.name).toBe('Other')
    // sizes 50,40,30,20,10: keep 50,40,30 and fold 20+10
    expect(other.value).toBe(30)
    expect(root.children!.slice(0, 3).map((c) => c.value)).toEqual([50, 40, 30])
    expect(root.value).toBe(150)
    expect(sum(leaves(root))).toBe(150)
  })

  it('does not fold when the child count is within maxChildren', () => {
    const files = Array.from({ length: 3 }, (_, i) => file({ id: `f${i}`, quota: 1 }))
    const root = buildDriveTree(files, { maxChildren: 3 })
    expect(root.children).toHaveLength(3)
    expect(root.children!.every((c) => c.name !== 'Other')).toBe(true)
  })

  it('rejects maxChildren below 1', () => {
    expect(() => buildDriveTree([], { maxChildren: 0 })).toThrow()
  })
})

describe('shareGraph', () => {
  it('returns only the me node for empty input', () => {
    const g = shareGraph([], 'Me@Example.test')
    expect(g.nodes.map((n) => n.id)).toEqual(['me@example.test'])
    expect(g.links).toEqual([])
  })

  it('links me to each owner of files shared with me, weighted by bytes', () => {
    const files = [
      file({ id: 'a', owned: false, shared: true, size: 100, ownerEmails: ['alice@example.test'] }),
      file({ id: 'b', owned: false, shared: true, size: 50, ownerEmails: ['alice@example.test'] }),
      file({ id: 'c', owned: false, shared: true, quota: 30, size: 0, ownerEmails: ['bob@example.test'] }),
      file({ id: 'd', owned: false, shared: false, size: 999, ownerEmails: ['carol@example.test'] }),
      file({ id: 'e', owned: false, shared: true, trashed: true, size: 999, ownerEmails: ['dan@example.test'] }),
      file({ id: 'f', owned: true, shared: true, size: 999 }),
    ]
    const g = shareGraph(files, 'me@example.test')
    const link = (t: string) => g.links.find((l) => l.target === t)
    expect(link('alice@example.test')?.weight).toBe(150)
    expect(link('bob@example.test')?.weight).toBe(30)
    expect(link('carol@example.test')).toBeUndefined()
    expect(link('dan@example.test')).toBeUndefined()
    expect(g.links.every((l) => l.source === 'me@example.test')).toBe(true)
    expect(g.nodes.find((n) => n.id === 'me@example.test')?.value).toBe(180)
  })
})
