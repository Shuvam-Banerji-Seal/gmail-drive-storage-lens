// SPDX-License-Identifier: AGPL-3.0-or-later
import { sizeQuery } from './csv'

export interface FilterSpec {
  from?: string
  listId?: string
  minSizeBytes?: number
  action: 'trash' | 'skipInbox' | 'label'
  labelId?: string
}

/**
 * Build a Gmail `settings.filters` body plus the equivalent search string.
 * Throws when no criteria are given (a criterion-less filter would match every message),
 * or when the label action has no labelId.
 */
export function buildFilter(s: FilterSpec): { criteria: Record<string, unknown>; action: Record<string, unknown>; search: string } {
  const criteria: Record<string, unknown> = {}
  const terms: string[] = []

  const from = s.from?.trim()
  if (from) {
    criteria.from = from
    terms.push(`from:${from}`)
  }
  const listId = s.listId?.trim()
  if (listId) {
    criteria.list = listId
    terms.push(`list:${listId}`)
  }
  if (s.minSizeBytes !== undefined && s.minSizeBytes > 0) {
    criteria.size = Math.ceil(s.minSizeBytes)
    criteria.sizeComparison = 'larger'
    terms.push(sizeQuery(s.minSizeBytes))
  }
  if (Object.keys(criteria).length === 0) throw new Error('buildFilter: at least one criterion (from, listId, minSizeBytes) is required')

  let action: Record<string, unknown>
  switch (s.action) {
    case 'trash':
      action = { addLabelIds: ['TRASH'] }
      break
    case 'skipInbox':
      action = { removeLabelIds: ['INBOX'] }
      break
    case 'label': {
      const labelId = s.labelId?.trim()
      if (!labelId) throw new Error('buildFilter: action "label" requires labelId')
      action = { addLabelIds: [labelId] }
      break
    }
    default:
      throw new Error(`buildFilter: unknown action ${String(s.action)}`)
  }

  return { criteria, action, search: terms.join(' ') }
}
