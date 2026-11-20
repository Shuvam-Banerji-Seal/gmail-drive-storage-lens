// SPDX-License-Identifier: AGPL-3.0-or-later
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULTS } from '../state/settings'
import { useApp } from '../state/store'
import { restartTour, Tour } from './Tour'

const setState = (mode: 'landing' | 'demo' | 'live', tourDone: boolean) => useApp.setState({ mode, settings: { ...DEFAULTS, tourDone } })

beforeEach(() => {
  window.location.hash = '#/overview'
  setState('demo', false)
})
afterEach(() => cleanup())

describe('Tour', () => {
  it('shows a labelled, non-modal dialog in demo mode until finished', () => {
    render(<Tour />)
    const dialog = screen.getByRole('dialog', { name: 'Your storage orbit' })
    expect(dialog).toHaveAttribute('aria-modal', 'false')
    expect(dialog).toHaveFocus()
    expect(screen.getByText(/Step 1 of 5/)).toBeInTheDocument()
  })

  it('is shown in live mode but not in landing mode', () => {
    setState('live', false)
    const { unmount } = render(<Tour />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    unmount()
    setState('landing', false)
    render(<Tour />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Next advances the step and navigates to its view', () => {
    render(<Tour />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'Gmail explorer' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/gmail')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('dialog', { name: 'Your storage orbit' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/overview')
  })

  it('Skip marks the tour done and hides it', () => {
    render(<Tour />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(useApp.getState().settings.tourDone).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape skips the tour', () => {
    render(<Tour />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useApp.getState().settings.tourDone).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('finishing on the last step marks it done', () => {
    render(<Tour />)
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/Step 5 of 5/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(useApp.getState().settings.tourDone).toBe(true)
  })

  it('stays hidden when tourDone is already true', () => {
    setState('demo', true)
    render(<Tour />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('restartTour brings it back', () => {
    setState('demo', true)
    render(<Tour />)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => restartTour())
    expect(useApp.getState().settings.tourDone).toBe(false)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
