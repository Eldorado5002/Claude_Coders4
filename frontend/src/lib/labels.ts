import type { Action, AutonomyLevel, CitationKind, ExceptionType, RecRoute, RecSource } from '@/api/types'

export type Tone = 'approve' | 'adjusted' | 'hold' | 'reject' | 'escalate'

export const TYPE_LABEL: Record<ExceptionType, string> = {
  price_variance: 'Price variance',
  quantity_variance: 'Quantity variance',
  freight_charge: 'Freight',
  tax_mismatch: 'GST mismatch',
  rounding_difference: 'Rounding',
  missing_po: 'No PO',
  duplicate_invoice: 'Duplicate',
  bank_details_changed: 'Bank change',
  new_vendor: 'New vendor',
  over_threshold: 'Over ₹5L',
  einvoice_missing: 'E-invoice (IRN)',
  invalid_gstin: 'GSTIN',
}

export const HARD_CONTROLS: readonly ExceptionType[] = [
  'duplicate_invoice',
  'bank_details_changed',
  'new_vendor',
  'over_threshold',
  'einvoice_missing',
  'invalid_gstin',
]
export const SOFT_TYPES: readonly ExceptionType[] = [
  'freight_charge',
  'price_variance',
  'quantity_variance',
  'tax_mismatch',
  'rounding_difference',
  'missing_po',
]

export const isHardControl = (t: ExceptionType) => HARD_CONTROLS.includes(t)

export const ACTION_META: Record<Action, { label: string; tone: Tone; verb: string; paysMoney: boolean }> = {
  approve: { label: 'Approve', tone: 'approve', verb: 'Pay as invoiced', paysMoney: true },
  approve_adjusted: { label: 'Approve adjusted', tone: 'adjusted', verb: 'Pay a corrected amount', paysMoney: true },
  hold: { label: 'Hold', tone: 'hold', verb: 'Send back / wait for information', paysMoney: false },
  reject: { label: 'Reject', tone: 'reject', verb: 'Never pay', paysMoney: false },
  escalate: { label: 'Escalate', tone: 'escalate', verb: 'Manager or treasury review', paysMoney: false },
}

export const ACTIONS: readonly Action[] = ['approve', 'approve_adjusted', 'hold', 'reject', 'escalate']

// Plain-language memory kinds; tips follow Hindsight's own definitions.
export const KIND_META: Record<CitationKind, { label: string; tip: string }> = {
  observation: {
    label: 'Learned pattern',
    tip: 'A pattern Hindsight built by merging related facts. It changes as new evidence supports or contradicts it.',
  },
  world: { label: 'Past decision', tip: 'A fact about what happened: who decided what, for which vendor, and why.' },
  experience: { label: "Agent's action", tip: 'Something Precedent itself did: its own first-person history.' },
  mental_model: {
    label: 'Playbook',
    tip: 'A standing answer Hindsight keeps rewriting in the background as the team resolves more cases.',
  },
  directive: { label: 'Policy', tip: 'A hard rule the agent must follow when it reasons. Memory can never override it.' },
}

export const SOURCE_LABEL: Record<RecSource, string> = {
  memory: 'Grounded in precedent',
  no_memory: 'No precedent',
  guardrail: 'Hard control',
}

/** How a recommendation was produced: the cost story (routine cases take the fast path). */
export const ROUTE_LABEL: Record<RecRoute, string> = {
  fast: 'Fast path',
  reflect: 'Deep reasoning',
  guardrail: 'Hard control',
  no_memory: 'No memory',
}

export const LEVEL_LABEL: Record<AutonomyLevel, string> = {
  suggest: 'Learning',
  auto: 'Auto',
  locked: 'Locked',
}

export function confidenceBand(c: number): { band: 'High' | 'Medium' | 'Low'; score: number } {
  const score = Math.round(Number((c * 100).toFixed(6)))
  return { band: score >= 80 ? 'High' : score >= 50 ? 'Medium' : 'Low', score }
}

/** Hindsight returns placeholder text while a mental model is still being written. */
export function isPendingContent(s: string | null | undefined): boolean {
  if (s == null) return true
  const t = s.trim()
  return t === '' || /^generating content/i.test(t)
}
