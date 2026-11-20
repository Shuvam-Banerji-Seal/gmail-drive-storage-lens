// SPDX-License-Identifier: AGPL-3.0-or-later
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Heatmap } from './Heatmap'
import { RaceBars, type RaceFrame } from './RaceBars'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const rows = ['Ann', 'Bob']
const cols = ['2024-01', '2024-02', '2024-03']
const values = [
  [100, 0, 2048],
  [0, 5, 10],
]

const frames: RaceFrame[] = [
  {
    month: '2024-01',
    rows: [
      { key: 'a', label: 'Alpha list', value: 300 },
      { key: 'b', label: 'Beta sender', value: 500 },
    ],
  },
  {
    month: '2024-02',
    rows: [
      { key: 'a', label: 'Alpha list', value: 900 },
      { key: 'b', label: 'Beta sender', value: 600 },
    ],
  },
  {
    month: '2024-03',
    rows: [
      { key: 'a', label: 'Alpha list', value: 1000 },
      { key: 'b', label: 'Beta sender', value: 650 },
    ],
  },
]

describe('Heatmap', () => {
  it('renders an accessible summary with the largest cells in a table', () => {
    render(<Heatmap rows={rows} cols={cols} values={values} />)
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Sender' })).toBeInTheDocument()
    expect(within(table).getAllByRole('rowheader', { name: 'Ann' }).length).toBeGreaterThan(0)
    expect(within(table).getByText('2.0 KiB')).toBeInTheDocument()
    expect(screen.getByText(/across 2 senders and 3 months/)).toBeInTheDocument()
  })

  it('draws one cell per row and column', () => {
    const { container } = render(<Heatmap rows={rows} cols={cols} values={values} />)
    expect(container.querySelectorAll('svg rect')).toHaveLength(rows.length * cols.length)
  })

  it('shows a tooltip with the exact size on hover', () => {
    const { container } = render(<Heatmap rows={rows} cols={cols} values={values} />)
    const cell = container.querySelectorAll('svg rect')[2]!
    fireEvent.pointerMove(cell, { clientX: 10, clientY: 10 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('2.0 KiB')
    fireEvent.pointerLeave(cell)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('handles empty data without drawing', () => {
    const { container } = render(<Heatmap rows={[]} cols={[]} values={[]} />)
    expect(screen.getByText('No monthly data yet.')).toBeInTheDocument()
    expect(container.querySelectorAll('rect')).toHaveLength(0)
  })

  it('handles an all-zero matrix without dividing by zero', () => {
    render(<Heatmap rows={['Ann']} cols={['2024-01']} values={[[0]]} />)
    expect(screen.getByText('0 B across 1 sender and 1 months')).toBeInTheDocument()
  })
})

describe('RaceBars', () => {
  it('shows the first month and ranks bars by value', () => {
    render(<RaceBars frames={frames} />)
    expect(screen.getByText('2024-01')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Ranked by cumulative size at 2024-01' })
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Beta sender: 500 B')
    expect(items[1]).toHaveTextContent('Alpha list: 300 B')
  })

  it('starts paused and Play toggles to Pause and back', () => {
    render(<RaceBars frames={frames} />)
    const play = screen.getByRole('button', { name: 'Play' })
    fireEvent.click(play)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('advances the month while playing and stops at the last frame', () => {
    vi.useFakeTimers()
    render(<RaceBars frames={frames} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    act(() => vi.advanceTimersByTime(900))
    expect(screen.getByText('2024-02')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(900 * 5))
    expect(screen.getByText('2024-03')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('changes the month label when the slider moves', () => {
    render(<RaceBars frames={frames} />)
    const slider = screen.getByRole('slider', { name: 'Month' })
    expect(slider).toHaveAttribute('max', '2')
    fireEvent.change(slider, { target: { value: '2' } })
    expect(screen.getByText('2024-03')).toBeInTheDocument()
    expect(slider).toHaveAttribute('aria-valuetext', '2024-03')
  })

  it('shows at most `top` bars', () => {
    const many: RaceFrame[] = [
      {
        month: '2024-01',
        rows: Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, label: `Sender ${i}`, value: i + 1 })),
      },
    ]
    render(<RaceBars frames={many} top={3} />)
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('renders an empty state without frames', () => {
    render(<RaceBars frames={[]} />)
    expect(screen.getByText('No monthly data yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
  })
})
