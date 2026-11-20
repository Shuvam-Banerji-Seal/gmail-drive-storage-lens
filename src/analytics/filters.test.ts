// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { buildFilter } from './filters'

describe('buildFilter', () => {
  it('trash action adds the TRASH label', () => {
    expect(buildFilter({ from: 'news@example.com', action: 'trash' })).toEqual({
      criteria: { from: 'news@example.com' },
      action: { addLabelIds: ['TRASH'] },
      search: 'from:news@example.com',
    })
  })
  it('skipInbox action removes INBOX', () => {
    expect(buildFilter({ listId: 'club.example.com', action: 'skipInbox' })).toEqual({
      criteria: { list: 'club.example.com' },
      action: { removeLabelIds: ['INBOX'] },
      search: 'list:club.example.com',
    })
  })
  it('label action adds the given label id', () => {
    expect(buildFilter({ from: 'a@example.com', action: 'label', labelId: 'Label_9' }).action).toEqual({ addLabelIds: ['Label_9'] })
  })
  it('combines criteria with size and sizeComparison', () => {
    const f = buildFilter({ from: 'a@example.com', listId: 'l.example.com', minSizeBytes: 5 * 2 ** 20, action: 'trash' })
    expect(f.criteria).toEqual({ from: 'a@example.com', list: 'l.example.com', size: 5 * 2 ** 20, sizeComparison: 'larger' })
    expect(f.search).toBe('from:a@example.com list:l.example.com larger:5M')
  })
  it('size-only criteria produce a size search term', () => {
    const f = buildFilter({ minSizeBytes: 1536, action: 'trash' })
    expect(f.criteria).toEqual({ size: 1536, sizeComparison: 'larger' })
    expect(f.search).toBe('larger:2k')
  })
  it('throws when no criteria are given', () => {
    expect(() => buildFilter({ action: 'trash' })).toThrow()
    expect(() => buildFilter({ from: '  ', listId: '', action: 'skipInbox' })).toThrow()
    expect(() => buildFilter({ minSizeBytes: 0, action: 'trash' })).toThrow()
  })
  it('throws for the label action without a labelId', () => {
    expect(() => buildFilter({ from: 'a@example.com', action: 'label' })).toThrow()
  })
})
