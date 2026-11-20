// SPDX-License-Identifier: AGPL-3.0-or-later
import { create } from 'zustand'
import type { BasketItem, DriveFile, GmailMsg, QuotaInfo, ScanProgress } from '../types'
import type { MimePart } from '../api/gmail'
import type { NetEntry } from './netlog'
import { loadSettings, saveSettings, type Settings } from './settings'

export type Mode = 'landing' | 'demo' | 'live'
export interface LabelCount {
  id: string
  name: string
  messagesTotal: number
  messagesUnread: number
}
export interface Receipt {
  at: number
  action: 'trash' | 'delete' | 'label' | 'filter' | 'revisions' | 'emptyTrash' | 'untrash'
  kind: 'gmail' | 'drive'
  count: number
  bytes: number
  demo: boolean
  top: Array<{ label: string; bytes: number }>
}
export interface Toast {
  id: number
  text: string
  tone: 'ok' | 'warn' | 'bad'
  undo?: () => void
}

const IDLE: ScanProgress = { phase: 'idle', done: 0, total: 0, bytesSeen: 0 }

export interface AppState {
  mode: Mode
  settings: Settings
  me: string
  quota: QuotaInfo | null
  gmail: GmailMsg[]
  sent: GmailMsg[]
  drive: DriveFile[]
  labelCounts: LabelCount[]
  historyId: string | null
  /** Drive changes.list token for incremental sync. */
  driveToken: string | null
  /** Opt-in deep scan results: attachment structure per message id. */
  parts: Record<string, MimePart[]>
  gmailScan: ScanProgress
  driveScan: ScanProgress
  basket: Record<string, BasketItem>
  netlog: NetEntry[]
  receipts: Receipt[]
  toasts: Toast[]
  granted: string[]
  /** Id of the currently focused entity (sender key, file id...) for linked views. */
  focus: string | null

  setSettings(p: Partial<Settings>): void
  setMode(m: Mode): void
  load(p: Partial<Pick<AppState, 'me' | 'quota' | 'gmail' | 'sent' | 'drive' | 'labelCounts' | 'historyId' | 'driveToken' | 'parts'>>): void
  setScan(which: 'gmail' | 'drive', p: ScanProgress): void
  addToBasket(items: BasketItem[]): void
  removeFromBasket(keys: string[]): void
  clearBasket(): void
  logNet(e: NetEntry): void
  addReceipt(r: Receipt): void
  toast(text: string, tone?: Toast['tone'], undo?: () => void): void
  dismissToast(id: number): void
  setGranted(s: string[]): void
  setFocus(id: string | null): void
  /** Removes items from the in-memory dataset after a successful action. */
  applyRemoval(kind: 'gmail' | 'drive', ids: string[]): void
  reset(): void
}

export const basketKey = (i: Pick<BasketItem, 'kind' | 'id'>) => `${i.kind}:${i.id}`
let toastSeq = 0

export const useApp = create<AppState>((set, get) => ({
  mode: 'landing',
  settings: loadSettings(),
  me: '',
  quota: null,
  gmail: [],
  sent: [],
  drive: [],
  labelCounts: [],
  historyId: null,
  driveToken: null,
  parts: {},
  gmailScan: IDLE,
  driveScan: IDLE,
  basket: {},
  netlog: [],
  receipts: [],
  toasts: [],
  granted: [],
  focus: null,

  setSettings(p) {
    const settings = { ...get().settings, ...p }
    saveSettings(settings)
    set({ settings })
  },
  setMode: (mode) => set({ mode }),
  load: (p) => set(p),
  setScan: (which, p) => set(which === 'gmail' ? { gmailScan: p } : { driveScan: p }),
  addToBasket(items) {
    const basket = { ...get().basket }
    for (const i of items) basket[basketKey(i)] = i
    set({ basket })
  },
  removeFromBasket(keys) {
    const basket = { ...get().basket }
    for (const k of keys) delete basket[k]
    set({ basket })
  },
  clearBasket: () => set({ basket: {} }),
  logNet: (e) => set({ netlog: [...get().netlog.slice(-499), e] }),
  addReceipt: (r) => set({ receipts: [r, ...get().receipts] }),
  toast(text, tone = 'ok', undo) {
    const id = ++toastSeq
    set({ toasts: [...get().toasts, { id, text, tone, undo }] })
    setTimeout(() => get().dismissToast(id), undo ? 12_000 : 6_000)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setGranted: (granted) => set({ granted }),
  setFocus: (focus) => set({ focus }),
  applyRemoval(kind, ids) {
    const gone = new Set(ids)
    const basket = { ...get().basket }
    for (const id of ids) delete basket[`${kind}:${id}`]
    if (kind === 'gmail') set({ gmail: get().gmail.filter((m) => !gone.has(m.id)), basket })
    else set({ drive: get().drive.filter((f) => !gone.has(f.id)), basket })
  },
  reset: () =>
    set({
      mode: 'landing',
      me: '',
      quota: null,
      gmail: [],
      sent: [],
      drive: [],
      labelCounts: [],
      historyId: null,
      driveToken: null,
      parts: {},
      gmailScan: IDLE,
      driveScan: IDLE,
      basket: {},
      receipts: [],
      granted: [],
      focus: null,
    }),
}))

export function basketTotals(basket: Record<string, BasketItem>) {
  let bytes = 0
  let gmail = 0
  let drive = 0
  for (const i of Object.values(basket)) {
    bytes += i.bytes
    if (i.kind === 'gmail') gmail++
    else drive++
  }
  return { bytes, gmail, drive, count: gmail + drive }
}
