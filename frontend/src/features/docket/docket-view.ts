import type { DocketSort, StatusFilter } from '@/api/keys'
import type { ExceptionSummary } from '@/api/types'

export type StatusCounts = Record<StatusFilter, number>

export const SORTS: { id: DocketSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'msme_deadline', label: 'MSME deadline' },
  { id: 'amount', label: 'Amount at risk' },
]

/** ?sort= → a sort the API knows; anything else is the default, newest. */
export function parseSort(v: string | null | undefined): DocketSort {
  return SORTS.some((s) => s.id === v) ? (v as DocketSort) : 'newest'
}

/** The sort for exceptionsQ: newest is the API default, so it stays out of the query key (shared cache). */
export function querySort(sort: DocketSort): DocketSort | undefined {
  return sort === 'newest' ? undefined : sort
}

/** One fetched list (already in the server's sort order) → the visible tab + counts for every tab. */
export function docketView(items: ExceptionSummary[], status: StatusFilter, sort: DocketSort = 'newest') {
  const counts: StatusCounts = { open: 0, auto_resolved: 0, resolved: 0, all: items.length }
  for (const c of items) counts[c.status] += 1
  let visible = status === 'all' ? items : items.filter((c) => c.status === status)
  // hard controls first on the open tab: they block payment and never automate.
  // Sorted by MSME deadline, the server's order is the point: the closest deadline leads.
  if (status === 'open' && sort !== 'msme_deadline')
    visible = [...visible.filter((c) => c.blocking), ...visible.filter((c) => !c.blocking)]
  return { visible, counts }
}

/** J/K: the next or previous case id, clamped to the list. */
export function neighbour(ids: string[], current: string | undefined, dir: 1 | -1): string | undefined {
  if (!ids.length) return undefined
  const at = current ? ids.indexOf(current) : -1
  if (at < 0) return ids[0]
  return ids[Math.min(ids.length - 1, Math.max(0, at + dir))]
}
