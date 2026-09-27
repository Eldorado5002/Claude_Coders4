import type { StatusFilter } from '@/api/keys'
import type { ExceptionSummary } from '@/api/types'

export type StatusCounts = Record<StatusFilter, number>

/** One fetched list → the visible tab + counts for every tab. */
export function docketView(items: ExceptionSummary[], status: StatusFilter) {
  const counts: StatusCounts = { open: 0, auto_resolved: 0, resolved: 0, all: items.length }
  for (const c of items) counts[c.status] += 1
  let visible = status === 'all' ? items : items.filter((c) => c.status === status)
  // hard controls first on the open tab: they block payment and never automate
  if (status === 'open') visible = [...visible.filter((c) => c.blocking), ...visible.filter((c) => !c.blocking)]
  return { visible, counts }
}

/** J/K: the next or previous case id, clamped to the list. */
export function neighbour(ids: string[], current: string | undefined, dir: 1 | -1): string | undefined {
  if (!ids.length) return undefined
  const at = current ? ids.indexOf(current) : -1
  if (at < 0) return ids[0]
  return ids[Math.min(ids.length - 1, Math.max(0, at + dir))]
}
