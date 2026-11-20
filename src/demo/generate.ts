// SPDX-License-Identifier: AGPL-3.0-or-later
// Deterministic, fully synthetic dataset for the "try the demo" mode.
// Every address is on example.com / example.org / example.edu, every person and organisation is
// invented, and nothing is read from a real account. Same seed in, same dataset out.
// No Math.random and no Date.now: the clock is fixed at 2026-11-01T00:00:00Z.
import type { DriveFile, GmailMsg, QuotaInfo } from '../types'

export interface DemoLabelCount {
  id: string
  name: string
  messagesTotal: number
  messagesUnread: number
}

export interface DemoDataset {
  me: string
  quota: QuotaInfo
  gmail: GmailMsg[]
  drive: DriveFile[]
  labelCounts: DemoLabelCount[]
}

const ME = 'you@example.edu'
const MIB = 1024 * 1024
const GIB = 1024 * MIB
const DAY = 86_400_000
/** Fixed "now" for the demo. */
const NOW = Date.UTC(2026, 10, 1)
/** Four years of history. */
const SPAN_START = Date.UTC(2022, 10, 1)
const FOLDER_MIME = 'application/vnd.google-apps.folder'

const LABEL_NAMES: Record<string, string> = {
  INBOX: 'INBOX',
  UNREAD: 'UNREAD',
  STARRED: 'STARRED',
  IMPORTANT: 'IMPORTANT',
  SENT: 'SENT',
  CATEGORY_FORUMS: 'Forums',
  CATEGORY_UPDATES: 'Updates',
  CATEGORY_PROMOTIONS: 'Promotions',
  CATEGORY_PERSONAL: 'Personal',
}

/** mulberry32: small, fast, deterministic 32-bit PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Rng {
  float(): number
  range(lo: number, hi: number): number
  int(lo: number, hi: number): number
  chance(p: number): boolean
  pick<T>(xs: readonly T[]): T
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T
  hex(n: number): string
}

function makeRng(seed: number): Rng {
  const next = mulberry32(seed)
  return {
    float: next,
    range(lo, hi) {
      return lo + (hi - lo) * next()
    },
    int(lo, hi) {
      return lo + Math.floor(next() * (hi - lo + 1))
    },
    chance(p) {
      return next() < p
    },
    pick<T>(xs: readonly T[]): T {
      return xs[Math.floor(next() * xs.length)] as T
    },
    weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
      const total = items.reduce((s, [, w]) => s + w, 0)
      let r = next() * total
      for (const [v, w] of items) {
        r -= w
        if (r < 0) return v
      }
      return items[items.length - 1]![0]
    },
    hex(n) {
      let s = ''
      for (let i = 0; i < n; i++) s += Math.floor(next() * 16).toString(16)
      return s
    },
  }
}

/** Returns a generator of unique random hex ids of the given length. */
function idFactory(rng: Rng, len: number): () => string {
  const seen = new Set<string>()
  return () => {
    let id = rng.hex(len)
    while (seen.has(id)) id = rng.hex(len)
    seen.add(id)
    return id
  }
}

const PEOPLE: ReadonlyArray<{ name: string; email: string }> = [
  { name: 'Prof. Example', email: 'prof.example@example.edu' },
  { name: 'Casey Park', email: 'casey.park@example.com' },
  { name: 'Riley Morgan', email: 'riley.morgan@example.edu' },
  { name: 'Drew Santos', email: 'drew.santos@example.org' },
  { name: 'Lee Hartwell', email: 'lee.hartwell@example.com' },
  { name: 'Noor Haddad', email: 'noor.haddad@example.edu' },
  { name: 'Ines Duarte', email: 'ines.duarte@example.org' },
  { name: 'Ollie Brandt', email: 'ollie.brandt@example.com' },
]

/** Members who reply inside mailing-list threads. */
const MEMBERS = [
  'Jamie Quill',
  'Dana Whitcomb',
  'Robin Vale',
  'Morgan Ells',
  'Harper Tate',
  'Quinn Adair',
  'Sage Linden',
  'Avery Holt',
  'Reese Calder',
  'Emery Fenwick',
  'Skyler Bramble',
  'Parker Wynn',
].map((name) => ({ name, email: `${name.toLowerCase().replace(' ', '.')}@example.com` }))

interface ListSpec {
  slug: string
  name: string
  /** Sender address; its domain is also used in the List-Id header. */
  email: string
  /** Repeating subject series, numbered "#n". */
  series: string
  category: string
  /** Attachment size per issue, MiB. Replies re-use the issue's size. */
  sizeMiB: [number, number]
  /** Issues over the four-year span. */
  issues: [number, number]
}

/** Twelve newsletters and forums. They carry almost all of the Gmail bytes. */
const LISTS: ListSpec[] = [
  { slug: 'stargazers', name: 'Stargazers Club', email: 'stargazers@example.org', series: 'Sky Report', category: 'CATEGORY_FORUMS', sizeMiB: [2, 12], issues: [49, 59] },
  { slug: 'movienight', name: 'Movie Night Society', email: 'movienight@example.edu', series: 'Weekend Screenings', category: 'CATEGORY_PROMOTIONS', sizeMiB: [14, 34], issues: [49, 59] },
  { slug: 'facilities', name: 'Campus Facilities', email: 'facilities@example.edu', series: 'Building Notice', category: 'CATEGORY_UPDATES', sizeMiB: [2, 6], issues: [49, 59] },
  { slug: 'boardgames', name: 'Board Game Guild', email: 'boardgames@example.com', series: 'Game Night Roundup', category: 'CATEGORY_PROMOTIONS', sizeMiB: [3, 18], issues: [49, 59] },
  { slug: 'trails', name: 'Hiking Trails Newsletter', email: 'trails@example.org', series: 'Trail Conditions', category: 'CATEGORY_FORUMS', sizeMiB: [4, 26], issues: [49, 59] },
  { slug: 'bakesale', name: 'Local Bake Sale', email: 'bakesale@example.com', series: 'Bake Sale Menu', category: 'CATEGORY_PROMOTIONS', sizeMiB: [2, 9], issues: [49, 59] },
  { slug: 'podcast', name: 'Podcast Digest', email: 'digest@example.com', series: 'Digest Episode', category: 'CATEGORY_FORUMS', sizeMiB: [8, 30], issues: [49, 59] },
  { slug: 'photo', name: 'Photography Circle', email: 'photo@example.org', series: 'Photo Walk', category: 'CATEGORY_FORUMS', sizeMiB: [10, 34], issues: [49, 59] },
  { slug: 'chess', name: 'Chess Ladder', email: 'chess@example.edu', series: 'Ladder Standings', category: 'CATEGORY_UPDATES', sizeMiB: [2, 4], issues: [49, 59] },
  { slug: 'recipes', name: 'Recipe Box', email: 'recipes@example.com', series: 'Weekly Recipe', category: 'CATEGORY_PROMOTIONS', sizeMiB: [2, 10], issues: [49, 59] },
  { slug: 'meetup', name: 'Coding Meetup', email: 'meetup@example.org', series: 'Meetup Recap', category: 'CATEGORY_FORUMS', sizeMiB: [5, 22], issues: [49, 59] },
  { slug: 'volunteer', name: 'Volunteer Corps', email: 'shifts@example.org', series: 'Shift Sign-up', category: 'CATEGORY_UPDATES', sizeMiB: [2, 7], issues: [49, 59] },
]

const PERSONAL_SUBJECTS = [
  'Lab schedule for next week',
  'Dinner on Friday?',
  'Thesis draft comments',
  'Lease renewal paperwork',
  'Photos from the trip',
  'Reading group notes',
  'Office hours moved',
  'Call tomorrow?',
  'Your reference letter',
  'Bike repair quote',
  'Concert tickets',
  'Project proposal v2',
  'Grant deadline reminder',
  'Weekend hike plans',
  'Recommendation request',
  'Syllabus question',
  'Apartment viewing',
  'Shared spreadsheet access',
  'Conference travel receipts',
  'Birthday plans',
  'Study group pizza',
  'Lab equipment booking',
  'Draft slides for review',
  'Thanks for the notes',
  'Campus parking permit',
]

interface MsgInit {
  id: string
  threadId: string
  size: number
  fromName: string
  fromEmail: string
  recipients: string[]
  subject: string
  ts: number
  labels: string[]
  listId?: string
  listUnsub?: string
}

/** Builds a GmailMsg whose from/fromName/fromEmail/domain fields agree with each other. */
function makeMsg(m: MsgInit): GmailMsg {
  const domain = m.fromEmail.slice(m.fromEmail.lastIndexOf('@') + 1)
  return {
    id: m.id,
    threadId: m.threadId,
    size: m.size,
    from: `"${m.fromName}" <${m.fromEmail}>`,
    fromName: m.fromName,
    fromEmail: m.fromEmail,
    domain,
    recipients: m.recipients,
    subject: m.subject,
    ts: m.ts,
    labels: m.labels,
    ...(m.listId ? { listId: m.listId } : {}),
    ...(m.listUnsub ? { listUnsub: m.listUnsub } : {}),
  }
}

function buildGmail(rng: Rng): GmailMsg[] {
  const newMsgId = idFactory(rng, 16)
  const newThreadId = idFactory(rng, 16)
  const out: GmailMsg[] = []

  for (const list of LISTS) {
    const domain = list.email.slice(list.email.indexOf('@') + 1)
    const listId = `"${list.name}" <${list.slug}.${domain}>`
    const listUnsub = `<https://example.com/unsub?list=${list.slug}>, <mailto:leave@example.com?subject=unsubscribe>`
    const n = rng.int(list.issues[0], list.issues[1])
    const starts = Array.from({ length: n }, () => Math.floor(rng.range(SPAN_START, NOW - 8 * DAY))).sort((a, b) => a - b)

    starts.forEach((ts, i) => {
      const subject = `${list.series} #${i + 1}`
      // Skewed towards the upper end of the range so attachments dominate the mailbox.
      const size = Math.round((list.sizeMiB[0] + (list.sizeMiB[1] - list.sizeMiB[0]) * Math.pow(rng.float(), 0.85)) * MIB)
      const threadId = newThreadId()
      const labels = ['INBOX', list.category]
      if (rng.chance(0.85)) labels.push('UNREAD')
      if (rng.chance(0.02)) labels.push('STARRED')
      if (rng.chance(0.03)) labels.push('IMPORTANT')
      out.push(
        makeMsg({
          id: newMsgId(),
          threadId,
          size,
          fromName: list.name,
          fromEmail: list.email,
          recipients: [ME],
          subject,
          ts,
          labels,
          listId,
          listUnsub,
        }),
      )

      const replies = rng.weighted<number>([
        [0, 0.3],
        [1, 0.3],
        [2, 0.25],
        [3, 0.15],
      ])
      let t = ts
      for (let r = 0; r < replies; r++) {
        t = Math.min(NOW, t + Math.floor(rng.range(0.2, 3) * DAY))
        const member = rng.pick(MEMBERS)
        const replyLabels = ['INBOX', list.category]
        if (rng.chance(0.5)) replyLabels.push('UNREAD')
        out.push(
          makeMsg({
            id: newMsgId(),
            threadId,
            size,
            fromName: member.name,
            fromEmail: member.email,
            recipients: [list.email],
            subject: `Re: ${subject}`,
            ts: t,
            labels: replyLabels,
            listId,
          }),
        )
      }
    })
  }

  PERSONAL_SUBJECTS.forEach((subject, p) => {
    const person = PEOPLE[p % PEOPLE.length]!
    const threadId = newThreadId()
    const count = rng.int(2, 6)
    let t = Math.floor(rng.range(SPAN_START, NOW - 60 * DAY))
    for (let j = 0; j < count; j++) {
      const fromMe = j > 0 && rng.chance(0.45)
      let size = Math.round(rng.range(4, 120) * 1024)
      if (rng.chance(0.12)) size += Math.round(rng.range(1, 8) * MIB)
      const labels = fromMe ? ['SENT'] : ['INBOX', 'CATEGORY_PERSONAL']
      if (!fromMe && rng.chance(0.3)) labels.push('UNREAD')
      if (rng.chance(0.06)) labels.push('STARRED')
      if (rng.chance(0.1)) labels.push('IMPORTANT')
      const sender = fromMe ? { name: 'You', email: ME } : person
      out.push(
        makeMsg({
          id: newMsgId(),
          threadId,
          size,
          fromName: sender.name,
          fromEmail: sender.email,
          recipients: [fromMe ? person.email : ME],
          subject: j === 0 ? subject : `Re: ${subject}`,
          ts: t,
          labels,
        }),
      )
      t = Math.min(NOW, t + Math.floor(rng.range(0.1, 4) * DAY))
    }
  })

  return out.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

const TOP_FOLDERS = ['Coursework', 'Photos', 'Archive 2021', 'Shared Lab', 'Travel', 'Downloads']
const SUB_FOLDERS = ['2024', 'Notes', 'Scans', 'Drafts', 'Exports', 'Assets', 'Old', 'Misc']
const TOPICS = [
  'Lab notes',
  'Budget',
  'Trip photos',
  'Thesis draft',
  'Reading list',
  'Syllabus',
  'Club minutes',
  'Hike log',
  'Recipe ideas',
  'Grant report',
  'Slides',
  'Field recordings',
  'Invoice',
  'Lease',
  'Robot build',
  'Chess games',
  'Sky chart',
  'Bake sale plan',
  'Film notes',
  'Poster draft',
]
const QUALIFIERS = ['final', 'v2', 'draft', 'notes', 'scan', 'export', '2023', '2024', '2025', 'backup']
const EXTERNAL_OWNERS = ['alumni.office@example.org', 'lab.partner@example.com', 'shared.drive@example.edu']

interface KindSpec {
  mime: string
  ext: string
  /** Google-native documents have no blob, so size and quota are 0. */
  native: boolean
  minMiB: number
  maxMiB: number
  weight: number
}

const KINDS: KindSpec[] = [
  { mime: 'application/pdf', ext: 'pdf', native: false, minMiB: 0.1, maxMiB: 12, weight: 22 },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
    native: false,
    minMiB: 0.02,
    maxMiB: 3,
    weight: 12,
  },
  { mime: 'application/vnd.google-apps.document', ext: '', native: true, minMiB: 0, maxMiB: 0, weight: 10 },
  { mime: 'application/vnd.google-apps.spreadsheet', ext: '', native: true, minMiB: 0, maxMiB: 0, weight: 8 },
  { mime: 'image/jpeg', ext: 'jpg', native: false, minMiB: 0.5, maxMiB: 8, weight: 18 },
  { mime: 'text/plain', ext: 'txt', native: false, minMiB: 0.001, maxMiB: 0.2, weight: 6 },
  { mime: 'application/zip', ext: 'zip', native: false, minMiB: 1, maxMiB: 20, weight: 8 },
  { mime: 'video/mp4', ext: 'mp4', native: false, minMiB: 10, maxMiB: 90, weight: 3 },
]

function buildDrive(rng: Rng): DriveFile[] {
  const newId = idFactory(rng, 28)
  const out: DriveFile[] = []
  const folderIds: string[] = []

  const times = (): { created: number; modified: number; viewed?: number } => {
    const created = Math.floor(rng.range(SPAN_START, NOW - DAY))
    const modified = Math.floor(rng.range(created, NOW))
    // A quarter of files are never viewed; about half of all files are older than two years.
    const viewed = rng.chance(0.25) ? undefined : Math.floor(rng.range(modified, NOW))
    return { created, modified, viewed }
  }

  const addFolder = (name: string, parent: string): string => {
    const id = newId()
    const t = times()
    out.push({
      id,
      name,
      mime: FOLDER_MIME,
      size: 0,
      quota: 0,
      parents: [parent],
      owned: true,
      shared: rng.chance(0.2),
      trashed: false,
      viewed: t.viewed,
      modified: t.modified,
      created: t.created,
      ownerEmails: [ME],
      publicLink: false,
      isFolder: true,
    })
    folderIds.push(id)
    return id
  }

  // Three levels of folders: top -> sub -> sub-sub.
  for (const top of TOP_FOLDERS) {
    const topId = addFolder(top, 'root')
    const subs = rng.int(2, 4)
    for (let s = 0; s < subs; s++) {
      const subId = addFolder(rng.pick(SUB_FOLDERS), topId)
      if (rng.chance(0.6)) {
        const deeper = rng.int(1, 3)
        for (let d = 0; d < deeper; d++) addFolder(`${rng.pick(TOPICS)} ${rng.pick(QUALIFIERS)}`, subId)
      }
    }
  }

  const makeFile = (kind: KindSpec, sizeOverride?: number): DriveFile => {
    const id = newId()
    const size = kind.native ? 0 : (sizeOverride ?? Math.round(rng.range(kind.minMiB, kind.maxMiB) * MIB))
    const base = `${rng.pick(TOPICS)} ${rng.pick(QUALIFIERS)}`
    const name = kind.native ? base : `${base}.${kind.ext}`
    const owned = !rng.chance(0.12)
    const t = times()
    return {
      id,
      name,
      mime: kind.mime,
      size,
      quota: size,
      ...(kind.native ? {} : { md5: rng.hex(32), sha256: rng.hex(64) }),
      parents: [rng.chance(0.08) ? 'root' : rng.pick(folderIds)],
      owned,
      shared: !owned || rng.chance(0.15),
      trashed: false,
      viewed: t.viewed,
      modified: t.modified,
      created: t.created,
      ownerEmails: owned ? [ME] : [rng.pick(EXTERNAL_OWNERS)],
      publicLink: false,
      isFolder: false,
    }
  }

  const FILE_COUNT = 340
  for (let i = 0; i < FILE_COUNT; i++) {
    const kind = rng.weighted(KINDS.map((k) => [k, k.weight] as const))
    out.push(makeFile(kind))
  }
  // Large single files, the biggest about 1.2 GiB.
  const video = KINDS[7]!
  out.push(makeFile(video, Math.round(1.2 * GIB)))
  out.push(makeFile(video, Math.round(0.3 * GIB)))
  out.push(makeFile(video, Math.round(0.18 * GIB)))

  const isBlob = (f: DriveFile) => !f.isFolder && f.size > 0
  const indexOfRandom = (pred: (f: DriveFile) => boolean): number => {
    for (let tries = 0; tries < 10_000; tries++) {
      const idx = rng.int(0, out.length - 1)
      if (pred(out[idx]!)) return idx
    }
    throw new Error('demo generator: no candidate file')
  }

  // Pinned old revisions: quota exceeds the head blob size.
  for (let i = 0; i < 25; i++) {
    const idx = indexOfRandom((f) => isBlob(f) && f.quota === f.size)
    const f = out[idx]!
    out[idx] = { ...f, quota: Math.round(f.size * rng.range(1.3, 3)) }
  }

  // Exact duplicate pairs and triples: same size, md5 and sha256, separate ids.
  const dupCandidates = out.filter((f) => isBlob(f) && f.size < 60 * MIB && !f.trashed && f.sha256 && f.quota === f.size)
  for (let g = 0; g < 20; g++) {
    const base = rng.pick(dupCandidates)
    const copies = rng.int(1, 2)
    for (let c = 0; c < copies; c++) {
      const created = Math.min(NOW - DAY, base.created + Math.floor(rng.range(1, 300) * DAY))
      out.push({
        ...base,
        id: newId(),
        name: rng.chance(0.5) ? base.name : `Copy of ${base.name}`,
        parents: [rng.pick(folderIds)],
        quota: base.size,
        viewed: undefined,
        created,
        modified: Math.max(created, base.modified),
      })
    }
  }

  // A few trashed files (counted in usageInTrash).
  for (let i = 0; i < 3; i++) {
    const idx = indexOfRandom((f) => isBlob(f) && !f.trashed)
    out[idx] = { ...out[idx]!, trashed: true }
  }

  // A few files shared through an "anyone with the link" permission.
  for (let i = 0; i < 6; i++) {
    const idx = indexOfRandom((f) => isBlob(f) && !f.publicLink)
    out[idx] = { ...out[idx]!, publicLink: true, shared: true }
  }

  return out
}

function buildLabelCounts(gmail: GmailMsg[]): DemoLabelCount[] {
  return Object.entries(LABEL_NAMES).map(([id, name]) => {
    const withLabel = gmail.filter((m) => m.labels.includes(id))
    return {
      id,
      name,
      messagesTotal: withLabel.length,
      messagesUnread: withLabel.filter((m) => m.labels.includes('UNREAD')).length,
    }
  })
}

/**
 * Build the synthetic demo account. Same seed gives the same dataset.
 * Gmail is about 1,500 messages over four years; mailing lists carry most of the bytes.
 * Drive is about 400 files and folders; the account is over its 20 GiB quota.
 */
export function generateDemo(seed = 7): DemoDataset {
  const rng = makeRng(seed)
  const gmail = buildGmail(rng)
  const drive = buildDrive(rng)

  const usageInDrive = drive.filter((f) => !f.trashed).reduce((s, f) => s + f.quota, 0)
  const usageInTrash = drive.filter((f) => f.trashed).reduce((s, f) => s + f.quota, 0)
  const gmailBytes = gmail.reduce((s, m) => s + m.size, 0)

  return {
    me: ME,
    quota: {
      limit: 20 * GIB,
      usage: usageInDrive + usageInTrash + gmailBytes,
      usageInDrive,
      usageInTrash,
      email: ME,
    },
    gmail,
    drive,
    labelCounts: buildLabelCounts(gmail),
  }
}
