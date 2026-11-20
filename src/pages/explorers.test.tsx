// SPDX-License-Identifier: AGPL-3.0-or-later
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clusterMessages } from '../analytics/cluster'
import { buildVip, repliedThreads, safety, type SafetyCtx } from '../analytics/scores'
import { startDemo } from '../state/session'
import { useApp } from '../state/store'
import type { GmailMsg } from '../types'
import Drive from './Drive'
import Gmail from './Gmail'

// jsdom has no canvas: make getContext return null so chart painters take their guarded path.
let getContextSpy: ReturnType<typeof vi.spyOn> | undefined
beforeAll(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never)
})
afterAll(() => getContextSpy?.mockRestore())
afterEach(() => cleanup())

const GMAIL_TABS: Array<[string, string]> = [
  ['senders', 'Senders by weight'],
  ['constellation', 'Constellation of senders'],
  ['rivers', 'Rivers: where the bytes flow'],
  ['tides', 'Tides: storage over time'],
  ['mailfall', 'Mailfall: bytes per day'],
  ['nebula', 'Nebula: similar subjects'],
  ['repeats', 'Repeated attachments'],
  ['unsubscribe', 'Unsubscribe radar'],
]

const DRIVE_TABS: Array<[string, string]> = [
  ['continents', 'Continents: where the bytes live'],
  ['twins', 'Twins: duplicate copies'],
  ['ghosts', 'Ghost weight: hidden old versions'],
  ['cold', 'Cold files: large and untouched'],
  ['public', 'Public links'],
  ['sharing', 'Shared with you'],
]

beforeEach(() => {
  startDemo()
})

describe('Gmail explorer tabs', () => {
  it.each(GMAIL_TABS)('renders the %s tab with its heading', (tab, heading) => {
    render(<Gmail tab={tab} />)
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument()
  })

  it('defaults to the first tab when the tab prop is missing or unknown', () => {
    render(<Gmail tab="nope" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Senders by weight' })).toBeInTheDocument()
  })

  it('never adds a blocked message when a sender cluster goes to the Airlock', () => {
    const { gmail, me, sent } = useApp.getState()
    const ctx: SafetyCtx = { vip: buildVip(sent, me), me, now: Date.now(), userLabels: new Set(), repliedThreads: repliedThreads(sent) }
    const byId = new Map<string, GmailMsg>(gmail.map((m) => [m.id, m]))
    const blockedOf = (ids: string[]) => ids.filter((id) => safety(byId.get(id)!, ctx).level === 'blocked').length

    // Prefer a visible cluster that actually contains protected mail, so the assertion has teeth.
    const visible = clusterMessages(gmail).slice(0, 40)
    const target = visible.find((c) => blockedOf(c.messageIds) > 0) ?? visible[0]
    expect(target).toBeDefined()

    render(<Gmail tab="senders" />)
    const row = screen.getAllByRole('button').find((b) => b.textContent?.includes(target!.label))
    expect(row).toBeDefined()
    fireEvent.click(row!)

    const add = screen.getByRole('button', { name: /Add \d+ emails? to Airlock/ })
    fireEvent.click(add)

    const added = Object.values(useApp.getState().basket).filter((i) => i.kind === 'gmail')
    expect(added.length).toBeGreaterThan(0)
    for (const item of added) {
      const msg = byId.get(item.id)
      expect(msg).toBeDefined()
      expect(safety(msg!, ctx).level).not.toBe('blocked')
    }
  })
})

describe('Drive explorer tabs', () => {
  it.each(DRIVE_TABS)('renders the %s tab with its heading', (tab, heading) => {
    render(<Drive tab={tab} />)
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument()
  })

  it('shows the header stats', () => {
    render(<Drive tab="twins" />)
    expect(screen.getByText('files scanned')).toBeInTheDocument()
    expect(screen.getByText('trashed bytes still counted')).toBeInTheDocument()
  })
})

describe('Gmail attachments tab', () => {
  it('renders the attachments tab with its heading and the optional deep-scan button', () => {
    render(<Gmail tab="attachments" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Attachments: types and duplicate copies' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deep-scan the \d+ largest emails/ })).toBeInTheDocument()
  })

  it('shows the type breakdown after a deep scan in demo mode', async () => {
    render(<Gmail tab="attachments" />)
    fireEvent.click(screen.getByRole('button', { name: /Deep-scan the \d+ largest emails/ }))
    expect(await screen.findByText('Images', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Ranked by size' })).toBeInTheDocument()
  })
})
