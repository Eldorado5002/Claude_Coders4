import type { SortingState } from '@tanstack/react-table'
import type { AutonomyLevel, AutonomyState, Lesson, VendorProfile, VendorSummary } from '@/api/types'
import { TYPE_LABEL } from '@/lib/labels'

/** Column ids the vendor table can sort by (and the only ones the URL may name). */
export const SORT_COLUMNS = ['name', 'gstin', 'terms', 'invoices', 'exceptions', 'open', 'touchless'] as const
export type SortColumn = (typeof SORT_COLUMNS)[number]

const ACRONYMS: Record<string, string> = { it: 'IT', mro: 'MRO', gst: 'GST' }

/** raw_materials → "Raw materials", it_services → "IT services". */
export function categoryLabel(category: string): string {
  const words = category.split('_').filter(Boolean)
  return words
    .map((w, i) => ACRONYMS[w.toLowerCase()] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(' ')
}

/** Search box: every word must appear in the name, city or GSTIN. */
export function matchesVendor(v: Pick<VendorSummary, 'name' | 'city' | 'gstin'>, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = `${v.name} ${v.city} ${v.gstin}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** `?sort=open.desc` → TanStack sorting state. Anything unexpected means "no sort". */
export function parseSort(param: string | null | undefined): SortingState {
  const m = param?.match(/^([a-z]+)\.(asc|desc)$/)
  if (!m || !(SORT_COLUMNS as readonly string[]).includes(m[1])) return []
  return [{ id: m[1], desc: m[2] === 'desc' }]
}

export function formatSort(sorting: SortingState): string | null {
  const s = sorting[0]
  return s ? `${s.id}.${s.desc ? 'desc' : 'asc'}` : null
}

/** Touchless rate → bar width in percent, or null when there's nothing to draw. */
export function touchlessWidth(rate: number | null | undefined): number | null {
  if (rate == null || Number.isNaN(rate)) return null
  return Math.round(Math.min(1, Math.max(0, rate)) * 100)
}

export function vendorCounts(list: VendorSummary[]) {
  return { total: list.length, withOpen: list.filter((v) => v.open_exceptions > 0).length }
}

/**
 * The vendor file's first paint: the index row we already have, with the Hindsight-backed parts empty.
 * The page shows skeletons for those while the real profile loads.
 */
export function placeholderProfile(list: VendorSummary[] | undefined, id: string): VendorProfile | undefined {
  const v = list?.find((x) => x.id === id)
  if (!v) return undefined
  return {
    ...v,
    bank_account: { bank_name: '', account_number: '', ifsc: '' },
    learned: [],
    playbook: null,
    recent: [],
    autonomy: [],
  }
}

const AUTO_PREFIX = /^Auto-resolved under earned autonomy\.\s*/i

/** A lesson's reason without the boilerplate the agent prepends to its own. */
export function lessonReason(l: Pick<Lesson, 'reason' | 'auto'>): string {
  return l.auto ? l.reason.replace(AUTO_PREFIX, '') : l.reason
}

const LEVEL_RANK: Record<AutonomyLevel, number> = { auto: 0, suggest: 1, locked: 2 }

/** Trust lanes: earned autonomy first, then the closest to it, hard controls last. */
export function sortLanes(rows: AutonomyState[]): AutonomyState[] {
  return [...rows].sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      b.streak - a.streak ||
      (TYPE_LABEL[a.exception_type] ?? a.exception_type).localeCompare(TYPE_LABEL[b.exception_type] ?? b.exception_type),
  )
}
