// SPDX-License-Identifier: AGPL-3.0-or-later
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildVip, repliedThreads, safety, type SafetyCtx } from '../analytics/scores'
import { startDemo } from '../state/session'
import { useApp } from '../state/store'
import type { GmailMsg } from '../types'
import Cleanup from './Cleanup'
import Overview from './Overview'

// jsdom has no canvas: make getContext return null so chart painters take their guarded path.
let getContextSpy: ReturnType<typeof vi.spyOn> | undefined
beforeAll(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never)
})
afterAll(() => getContextSpy?.mockRestore())
afterEach(() => cleanup())
beforeEach(() => {
  startDemo()
})

function safetyCtx(): SafetyCtx {
  const { sent, me } = useApp.getState()
  return { vip: buildVip(sent, me), me, now: Date.now(), userLabels: new Set(), repliedThreads: repliedThreads(sent) }
}

describe('Overview insights', () => {
  it('renders the recommendations and the offenders table', () => {
    render(<Overview />)
    expect(screen.getByRole('heading', { level: 2, name: 'Recommendations' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Top offenders across Gmail and Drive' })).toBeInTheDocument()
  })

  it('never puts a blocked or high-risk message in the basket when a recommendation is added', () => {
    const ctx = safetyCtx()
    const byId = new Map<string, GmailMsg>(useApp.getState().gmail.map((m) => [m.id, m]))
    render(<Overview />)
    const adds = screen.getAllByRole('button', { name: /Add to Airlock/ })
    expect(adds.length).toBeGreaterThan(0)
    for (const b of adds) fireEvent.click(b)

    const basket = Object.values(useApp.getState().basket)
    expect(basket.length).toBeGreaterThan(0)
    for (const item of basket) {
      if (item.kind !== 'gmail') continue
      const msg = byId.get(item.id)
      expect(msg).toBeDefined()
      const level = safety(msg!, ctx).level
      expect(level).not.toBe('blocked')
      expect(level).not.toBe('high')
    }
  })
})

describe('Airlock rule builder', () => {
  it('updates the live preview when the minimum size changes', () => {
    render(<Cleanup />)
    const region = screen.getByRole('region', { name: 'Select by rule' })
    const preview = within(region).getByRole('status')
    expect(preview.textContent).toMatch(/^0 emails/)

    fireEvent.change(within(region).getByRole('spinbutton', { name: 'Rule minimum size in MB' }), { target: { value: '1' } })
    const small = preview.textContent ?? ''
    expect(small).not.toMatch(/^0 emails/)

    fireEvent.change(within(region).getByRole('spinbutton', { name: 'Rule minimum size in MB' }), { target: { value: '100000' } })
    expect(preview.textContent).toMatch(/^0 emails/)
    expect(preview.textContent).not.toBe(small)
  })
})

describe('Airlock destructive actions', () => {
  it('keeps the empty-trash button disabled until the exact phrase is typed', () => {
    render(<Cleanup />)
    const button = screen.getByRole('button', { name: 'Empty Gmail Trash' })
    const input = screen.getByRole('textbox', { name: 'Type EMPTY GMAIL TRASH' })
    expect(button).toBeDisabled()

    fireEvent.change(input, { target: { value: 'EMPTY GMAIL TRAS' } })
    expect(button).toBeDisabled()
    fireEvent.change(input, { target: { value: 'empty gmail trash' } })
    expect(button).toBeDisabled()
    fireEvent.change(input, { target: { value: 'EMPTY GMAIL TRASH' } })
    expect(button).toBeEnabled()
  })

  it('keeps permanent deletion behind the typed DELETE count', () => {
    const ctx = safetyCtx()
    const safe = useApp.getState().gmail.find((m) => {
      const level = safety(m, ctx).level
      return level === 'low' || level === 'medium'
    })
    expect(safe).toBeDefined()
    useApp.getState().addToBasket([{ kind: 'gmail', id: safe!.id, bytes: safe!.size, label: 'Test message' }])

    render(<Cleanup />)
    const button = screen.getByRole('button', { name: /^Permanently delete 1 items/ })
    const input = screen.getByRole('textbox', { name: 'Confirmation text' })
    expect(button).toBeDisabled()

    fireEvent.change(input, { target: { value: 'DELETE 2' } })
    expect(button).toBeDisabled()
    fireEvent.change(input, { target: { value: 'DELETE 1' } })
    expect(button).toBeEnabled()
  })
})
