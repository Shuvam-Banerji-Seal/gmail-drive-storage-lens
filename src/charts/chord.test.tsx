// SPDX-License-Identifier: AGPL-3.0-or-later
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Chord } from './Chord'

afterEach(() => cleanup())

const names = ['acme.com', 'beta.io', 'other']
const matrix = [
  [0, 150, 20],
  [150, 0, 0],
  [20, 0, 5],
]

describe('Chord', () => {
  it('renders one arc and label per group, with a text alternative', () => {
    const { container } = render(<Chord names={names} matrix={matrix} />)
    expect(container.querySelectorAll('.chord-arc')).toHaveLength(3)
    expect(container.querySelectorAll('.chord-ribbon').length).toBeGreaterThan(0)
    const table = screen.getByRole('table', { hidden: true })
    expect(within(table).getAllByText('acme.com').length).toBeGreaterThan(0)
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1)
  })

  it('dims ribbons that do not touch a hovered group', () => {
    const { container } = render(<Chord names={names} matrix={matrix} />)
    const arcs = container.querySelectorAll('.chord-arc')
    fireEvent.pointerEnter(arcs[1]!)
    const dimmed = container.querySelectorAll('.chord-ribbon.is-dim').length
    const lit = container.querySelectorAll('.chord-ribbon:not(.is-dim)').length
    // beta.io only touches the acme.com ribbon, so the acme-other and other-other ribbons dim.
    expect(lit).toBe(1)
    expect(dimmed).toBe(2)
    fireEvent.pointerLeave(container.querySelector('.chord-svg')!)
    expect(container.querySelectorAll('.chord-ribbon.is-dim')).toHaveLength(0)
  })

  it('is safe with an empty or all-zero matrix', () => {
    const empty = render(<Chord names={[]} matrix={[]} />)
    expect(screen.getByText('No shared flows to draw yet.')).toBeInTheDocument()
    empty.unmount()
    const zero = render(
      <Chord
        names={['a', 'b']}
        matrix={[
          [0, 0],
          [0, 0],
        ]}
      />,
    )
    expect(zero.container.querySelectorAll('.chord-arc')).toHaveLength(0)
    expect(zero.container.textContent).toContain('No shared flows')
  })

  it('treats non-finite cells as zero', () => {
    const { container } = render(
      <Chord
        names={['a', 'b']}
        matrix={[
          [Number.NaN, 10],
          [10, -5],
        ]}
      />,
    )
    expect(container.querySelectorAll('.chord-arc')).toHaveLength(2)
  })
})
