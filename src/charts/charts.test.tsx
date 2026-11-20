// SPDX-License-Identifier: AGPL-3.0-or-later
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GraphData, TreeNode } from '../types'
import { buildCalendar } from './calendar'
import { seriesColor } from './colors'
import { CalendarHeatmap } from './CalendarHeatmap'
import { dropBackEdges, sanitizeFlows } from './flows'
import { BarList } from './BarList'
import { ForceGraph } from './ForceGraph'
import { pointInPolygon } from './geometry'
import { QuotaOrbit } from './QuotaOrbit'
import { Sankey } from './Sankey'
import { Scatter } from './Scatter'
import { Stream } from './Stream'
import { Sunburst } from './Sunburst'
import { Treemap } from './Treemap'

// jsdom has no canvas implementation; make getContext return null so painters take their guarded path.
let getContextSpy: ReturnType<typeof vi.spyOn> | undefined
beforeAll(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never)
})
afterAll(() => getContextSpy?.mockRestore())
afterEach(() => cleanup())

const tree: TreeNode = {
  id: 'root',
  name: 'Drive',
  value: 0,
  children: [
    {
      id: 'docs',
      name: 'Documents',
      value: 3000,
      children: [
        { id: 'a', name: 'a.pdf', value: 2000 },
        { id: 'b', name: 'b.doc', value: 1000 },
      ],
    },
    { id: 'pics', name: 'Photos', value: 5000 },
  ],
}

const graph: GraphData = {
  nodes: [
    { id: 'alice', label: 'Alice', value: 2048, group: 0 },
    { id: 'bob', label: 'Bob', value: 512, group: 1 },
    { id: 'carol', label: 'Carol', value: 128, group: 0 },
  ],
  links: [
    { source: 'alice', target: 'bob', weight: 1 },
    { source: 'bob', target: 'carol', weight: 0.2 },
  ],
}

describe('colors', () => {
  it('wraps series indices and maps negatives to the other colour', () => {
    expect(seriesColor(0)).toBe('var(--series-1)')
    expect(seriesColor(8)).toBe('var(--series-1)')
    expect(seriesColor(-1)).toBe('var(--series-other)')
  })
})

describe('pointInPolygon', () => {
  const square: Array<[number, number]> = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]
  it('detects interior and exterior points', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true)
    expect(pointInPolygon(15, 5, square)).toBe(false)
    expect(pointInPolygon(-1, -1, square)).toBe(false)
  })
  it('handles concave polygons and degenerate input', () => {
    const notch: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [5, 4],
      [0, 10],
    ]
    expect(pointInPolygon(5, 8, notch)).toBe(false)
    expect(pointInPolygon(2, 5, notch)).toBe(true)
    expect(pointInPolygon(2, 8, notch)).toBe(false)
    expect(pointInPolygon(0, 0, [])).toBe(false)
  })
})

describe('flow sanitising', () => {
  it('drops invalid links, merges duplicates and breaks cycles', () => {
    const nodes = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'orphan', label: 'Orphan' },
    ]
    const links = [
      { source: 'a', target: 'b', value: 10 },
      { source: 'a', target: 'b', value: 5 },
      { source: 'b', target: 'c', value: 7 },
      { source: 'c', target: 'a', value: 3 },
      { source: 'a', target: 'ghost', value: 4 },
      { source: 'a', target: 'a', value: 4 },
      { source: 'b', target: 'c', value: 0 },
    ]
    const out = sanitizeFlows(nodes, links)
    expect(out.links).toEqual([
      { source: 'a', target: 'b', value: 15 },
      { source: 'b', target: 'c', value: 7 },
    ])
    expect(out.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c'])
    expect(dropBackEdges(out.links)).toHaveLength(2)
  })
})

describe('calendar model', () => {
  it('ends at the newest key and gives the peak day the top level', () => {
    const days = new Map([
      ['2024-03-05', 1500],
      ['2024-03-06', 3000],
    ])
    const m = buildCalendar(days, 2)
    expect(m.endKey).toBe('2024-03-06')
    expect(m.cells).toHaveLength(11) // full first week plus Sun..Wed of the last
    expect(m.cells.find((c) => c.key === '2024-03-06')?.level).toBe(4)
    expect(m.cells.find((c) => c.key === '2024-03-05')?.level).toBe(2)
    expect(m.peak).toEqual({ key: '2024-03-06', value: 3000 })
  })
  it('falls back to today when there is no data', () => {
    const m = buildCalendar(new Map(), 53, Date.UTC(2026, 10, 20))
    expect(m.endKey).toBe('2026-11-20')
    expect(m.total).toBe(0)
  })
})

describe('chart components', () => {
  it('QuotaOrbit shows shares and a text summary', () => {
    const { container } = render(
      <QuotaOrbit
        rings={[
          { label: 'Gmail', value: 3e9 },
          { label: 'Drive', value: 5e9 },
        ]}
        total={10e9}
        centerLabel="8.0 GiB"
        centerSub="of 10 GiB"
      />,
    )
    expect(screen.getByText('8.0 GiB')).toBeInTheDocument()
    expect(screen.getByText(/Storage .* used \(80%\)/)).toBeInTheDocument()
    expect(container.querySelectorAll('.orbit-arc')).toHaveLength(2)
    expect(screen.queryByText(/Over capacity/)).toBeNull()
  })

  it('QuotaOrbit flags over-capacity in danger colour', () => {
    const { container } = render(
      <QuotaOrbit
        rings={[
          { label: 'Gmail', value: 6 },
          { label: 'Drive', value: 6 },
        ]}
        total={10}
        centerLabel="12 B"
      />,
    )
    expect(screen.getAllByText(/Over capacity by/).length).toBeGreaterThan(0)
    expect(container.querySelector('.orbit.is-over')).not.toBeNull()
  })

  it('QuotaOrbit survives a zero total', () => {
    render(<QuotaOrbit rings={[]} total={0} centerLabel="0 B" />)
    expect(screen.getByText('0 B')).toBeInTheDocument()
  })

  it('Treemap drills into a folder and climbs back with the breadcrumb', () => {
    render(<Treemap root={tree} />)
    const crumbs = screen.getByRole('navigation', { name: 'Folder path' })
    expect(within(crumbs).getByText('Drive')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Documents,/ }))
    expect(screen.getByRole('button', { name: /^a\.pdf,/ })).toBeInTheDocument()
    expect(within(crumbs).getByText('Documents')).toBeInTheDocument()
    fireEvent.click(within(crumbs).getByRole('button', { name: 'Drive' }))
    expect(screen.getByRole('button', { name: /^Photos,/ })).toBeInTheDocument()
  })

  it('Treemap shows a tooltip with size and share on hover', () => {
    render(<Treemap root={tree} />)
    fireEvent.pointerMove(screen.getByRole('button', { name: /^Photos,/ }), {
      clientX: 10,
      clientY: 10,
    })
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Photos')
    expect(tip).toHaveTextContent(/KiB/)
  })

  it('Treemap handles an empty root', () => {
    render(<Treemap root={{ id: 'e', name: 'Empty', value: 0 }} />)
    expect(screen.getByText('Nothing to show in this folder.')).toBeInTheDocument()
  })

  it('Sunburst renders arcs and zooms on click', () => {
    render(<Sunburst root={tree} />)
    expect(screen.getByRole('button', { name: /^Photos,/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Centre: Drive/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Documents,/ }))
    expect(screen.getByRole('button', { name: /^Zoom out from Documents/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^a\.pdf,/ })).toBeInTheDocument()
  })

  it('Sunburst handles an empty root', () => {
    render(<Sunburst root={{ id: 'e', name: 'Empty', value: 0 }} />)
    expect(screen.getByText('Empty')).toBeInTheDocument()
  })

  it('ForceGraph renders an accessible canvas and a list of senders', () => {
    const onSelect = vi.fn()
    render(<ForceGraph data={graph} groups={new Map([['bob', 2]])} onSelect={onSelect} height={300} />)
    expect(screen.getByRole('application')).toBeInTheDocument()
    expect(screen.getByText(/3 senders · 2 links · 2 communities/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Bob/ }))
    expect(onSelect).toHaveBeenCalledWith('bob')
  })

  it('ForceGraph handles zero nodes', () => {
    render(<ForceGraph data={{ nodes: [], links: [] }} />)
    expect(screen.getByText(/0 senders · 0 links/)).toBeInTheDocument()
  })

  it('Sankey drops the cycle and invalid links, and labels nodes with sizes', () => {
    const { container } = render(
      <Sankey
        data={{
          nodes: [
            { id: 'a', label: 'Origin' },
            { id: 'b', label: 'Category' },
            { id: 'c', label: 'Action' },
          ],
          links: [
            { source: 'a', target: 'b', value: 1024 },
            { source: 'b', target: 'c', value: 512 },
            { source: 'c', target: 'a', value: 100 },
            { source: 'a', target: 'nowhere', value: 9 },
          ],
        }}
      />,
    )
    expect(container.querySelectorAll('.sk-label')).toHaveLength(3)
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2 acyclic flows
    expect(screen.getByText(/Origin · 1.0 KiB/)).toBeInTheDocument()
  })

  it('Sankey highlights the path around a focused node', () => {
    const { container } = render(
      <Sankey
        data={{
          nodes: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
            { id: 'x', label: 'X' },
          ],
          links: [
            { source: 'a', target: 'b', value: 10 },
            { source: 'x', target: 'b', value: 4 },
          ],
        }}
      />,
    )
    fireEvent.focus(screen.getByRole('button', { name: /^A · / }))
    expect(container.querySelectorAll('.sk-link.is-dim')).toHaveLength(1)
  })

  it('Sankey handles empty data', () => {
    render(<Sankey data={{ nodes: [], links: [] }} />)
    expect(screen.getByText('No flows to draw yet.')).toBeInTheDocument()
  })

  it('CalendarHeatmap summarises the window and handles empty data', () => {
    const { rerender } = render(
      <CalendarHeatmap
        days={
          new Map([
            ['2024-03-05', 1500],
            ['2024-03-06', 3000],
          ])
        }
        weeks={10}
      />,
    )
    expect(screen.getByText(/ending 2024-03-06/)).toBeInTheDocument()
    expect(screen.getByText('Mar')).toBeInTheDocument()
    rerender(<CalendarHeatmap days={new Map()} />)
    expect(screen.getAllByText(/active days/).length).toBeGreaterThan(0)
  })

  it('Stream renders one band per series with a legend and table', () => {
    const { container } = render(
      <Stream
        months={['2024-01', '2024-02', '2024-03']}
        series={[
          { key: 'a', label: 'Alpha', values: [1, 2, 3] },
          { key: 'b', label: 'Beta', values: [3, 2, 1] },
        ]}
      />,
    )
    expect(container.querySelectorAll('.stream-band')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Beta' })).toBeInTheDocument()
  })

  it('Stream handles empty input', () => {
    render(<Stream months={[]} series={[]} />)
    expect(screen.getByText('No monthly data yet.')).toBeInTheDocument()
  })

  it('Scatter reports counts, supports keyboard selection and lasso', () => {
    const onLasso = vi.fn()
    const points = [
      { id: 'a', x: 0.2, y: 0.5, group: 0, label: 'Invoices' },
      { id: 'b', x: 0.8, y: 0.5, group: 1, label: 'Receipts' },
    ]
    render(<Scatter points={points} selected={new Set(['b'])} onLasso={onLasso} height={420} />)
    expect(screen.getByText(/2 subjects · 1 selected/)).toBeInTheDocument()
    const canvas = screen.getByRole('application')
    fireEvent.keyDown(canvas, { key: 'ArrowRight' })
    fireEvent.keyDown(canvas, { key: 'Enter' })
    expect(onLasso).toHaveBeenLastCalledWith(['b', 'a'])
    fireEvent.keyDown(canvas, { key: 'Escape' })
    expect(onLasso).toHaveBeenLastCalledWith([])
  })

  it('Scatter lasso selects the points inside the drawn polygon', () => {
    const onLasso = vi.fn()
    const points = [
      { id: 'a', x: 0.2, y: 0.5 },
      { id: 'b', x: 0.8, y: 0.5 },
    ]
    render(<Scatter points={points} onLasso={onLasso} height={420} />)
    const canvas = screen.getByRole('application')
    // Canvas pixels: a sits near (155, 210), b near (565, 210). Draw a box around a only.
    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 100,
      clientY: 150,
      pointerId: 1,
    })
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: 260, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 260, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 100, clientY: 260, pointerId: 1 })
    expect(onLasso).toHaveBeenLastCalledWith(['a'])
  })

  it('Scatter handles zero points', () => {
    render(<Scatter points={[]} />)
    expect(screen.getByText(/0 subjects · 0 selected/)).toBeInTheDocument()
  })

  it('BarList ranks rows by size and calls onClick', () => {
    const onClick = vi.fn()
    render(
      <BarList
        rows={[
          { id: 'small', label: 'Small sender', value: 512 },
          { id: 'big', label: 'Big sender', value: 1536, badge: 'List' },
          { id: 'mid', label: 'Mid sender', value: 1024, sub: 'newsletters' },
        ]}
        onClick={onClick}
      />,
    )
    const list = screen.getByRole('list', { name: 'Ranked by size' })
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Big sender')
    expect(items[0]).toHaveTextContent('1.5 KiB')
    expect(items[2]).toHaveTextContent('Small sender')
    fireEvent.click(within(items[1] as HTMLElement).getByRole('button'))
    expect(onClick).toHaveBeenCalledWith('mid')
  })

  it('BarList handles empty rows', () => {
    render(<BarList rows={[]} />)
    expect(screen.getByText('Nothing ranked yet.')).toBeInTheDocument()
  })
})
