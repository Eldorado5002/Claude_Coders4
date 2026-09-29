import type { SortingState } from '@tanstack/react-table'
import type { AutonomyLevel, AutonomyState, Belief, BenfordResult, Citation, Lesson, VendorProfile, VendorSummary } from '@/api/types'
import { TYPE_LABEL } from '@/lib/labels'
import { tidyReason } from '@/lib/risk'

/** Column ids the vendor table can sort by (and the only ones the URL may name). */
export const SORT_COLUMNS = ['name', 'gstin', 'terms', 'invoices', 'exceptions', 'open', 'touchless', 'risk'] as const
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

// ── Risk ────────────────────────────────────────────────────────────────────

export type RiskLevel = NonNullable<VendorSummary['risk_level']>
/** Low risk stays quiet; medium borrows the warning tone, high the breach tone. */
export type RiskTone = 'muted' | 'hold' | 'reject'

const RISK_META: Record<RiskLevel, { label: string; tone: RiskTone }> = {
  low: { label: 'Low', tone: 'muted' },
  medium: { label: 'Medium', tone: 'hold' },
  high: { label: 'High', tone: 'reject' },
}

/** Literal class names so Tailwind sees them. */
export const RISK_TEXT: Record<RiskTone, string> = {
  muted: 'text-muted-foreground',
  hold: 'text-hold',
  reject: 'text-reject',
}

export type RiskFigure = { score: number; level: RiskLevel; label: string; tone: RiskTone }

/** 58 + "high" → the figure the UI draws. Nothing to draw without both. */
export function riskFigure(score: number | null | undefined, level: RiskLevel | null | undefined): RiskFigure | null {
  if (score == null || Number.isNaN(score) || !level || !RISK_META[level]) return null
  return { score: Math.round(Math.min(100, Math.max(0, score))), level, ...RISK_META[level] }
}

export type ProfileRisk = RiskFigure & { reasons: string[]; benford: BenfordResult | null }

/**
 * The header's risk: the profile's own when it has loaded (null means "no risk data": hide it),
 * otherwise the index row's score and level, without reasons, while Hindsight is still answering.
 */
export function profileRisk(v: VendorProfile): ProfileRisk | null {
  if (v.risk) {
    const f = riskFigure(v.risk.score, v.risk.level)
    return f && { ...f, reasons: v.risk.reasons ?? [], benford: v.risk.benford ?? null }
  }
  if (v.risk === null) return null
  const f = riskFigure(v.risk_score, v.risk_level)
  return f && { ...f, reasons: [], benford: null }
}

/** Reasons arrive as clauses ("exception rate 91% vs …"); in a list each starts with a capital. */
/** The same sentence the /risk page shows: "1 request to pay…", capitalised. */
export const riskReason = (r: string) => tidyReason(r)

/** "First digits (Benford): marginal · MAD 0.0146 · 212 amounts" */
export function benfordLine(b: BenfordResult | null | undefined): string | null {
  if (!b) return null
  const mad = b.mad != null ? ` · MAD ${b.mad.toFixed(4)}` : ''
  return `First digits (Benford): ${b.conformity}${mad} · ${b.n} amounts`
}

/** Table accessor: vendors without a score become undefined, which the table always sorts last. */
export const riskSortValue = (v: Pick<VendorSummary, 'risk_score'>): number | undefined => v.risk_score ?? undefined

// ── India compliance ────────────────────────────────────────────────────────

type MsmeCategory = NonNullable<VendorSummary['msme_category']>
const MSME_LABEL: Record<MsmeCategory, string> = { micro: 'Micro', small: 'Small' }

export const msmeLabel = (c: MsmeCategory | null | undefined): string | null => (c ? (MSME_LABEL[c] ?? c) : null)

export type ComplianceBadge = { id: 'msme' | 'einvoice'; label: string; hint: string }

/** The index's compliance badges: MSME suppliers (43B(h) deadline) and e-invoicing (IRN required). */
export function complianceBadges(v: Pick<VendorSummary, 'msme_category' | 'e_invoice_required'>): ComplianceBadge[] {
  const out: ComplianceBadge[] = []
  const msme = msmeLabel(v.msme_category)
  if (msme)
    out.push({
      id: 'msme',
      label: `MSME · ${msme}`,
      hint: `${msme} enterprise: pay on time or lose the tax deduction (section 43B(h)).`,
    })
  if (v.e_invoice_required)
    out.push({ id: 'einvoice', label: 'E-invoice', hint: 'E-invoicing required: every invoice needs an IRN.' })
  return out
}

// ── Trust lanes ─────────────────────────────────────────────────────────────

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

const sameText = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * "What Precedent has learned" minus what "What Precedent believes" already shows. Both come from the same
 * Hindsight observations, so without this the vendor file says the same sentence twice. `null` while the beliefs
 * are still loading (so the section doesn't flash and then vanish); the full list if the beliefs couldn't load.
 */
export function learnedBeyondBeliefs(
  learned: Citation[],
  beliefs: { data?: Belief[]; isPending: boolean; isError: boolean },
): Citation[] | null {
  if (beliefs.isError && !beliefs.data) return learned
  if (beliefs.isPending || !beliefs.data) return null
  const ids = new Set(beliefs.data.map((b) => b.id))
  const texts = new Set(beliefs.data.map((b) => sameText(b.text)))
  return learned.filter((c) => !ids.has(c.id) && !texts.has(sameText(c.text)))
}

