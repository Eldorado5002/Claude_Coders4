import type { Action } from '@/api/types'
import { ACTION_META } from '@/lib/labels'

export type ResolveDraft = {
  decision: Action | null
  reason: string
  adjusted: string
  blocking: boolean
  callbackVerified: boolean
}

type Field = 'decision' | 'reason' | 'adjusted' | 'callback'
export type ResolveCheck = {
  ok: boolean
  errors: Partial<Record<Field, string>>
  body?: { decision: Action; reason: string; adjusted_amount: number | null }
}

/** "₹1,23,456.50" / "Rs 4,956" → number; null when it isn't one. */
export function parseAmount(s: string): number | null {
  const clean = s.replace(/₹|rs\.?|inr|,|\s/gi, '')
  if (!clean || !/^\d+(\.\d+)?$/.test(clean)) return null
  return Number(clean)
}

export function validateResolve(d: ResolveDraft): ResolveCheck {
  const errors: ResolveCheck['errors'] = {}
  if (!d.decision) errors.decision = 'Choose a decision.'
  const reason = d.reason.trim()
  if (reason.length < 5) errors.reason = 'Give a reason of at least 5 characters: this is what Precedent learns from.'
  let adjusted: number | null = null
  if (d.decision === 'approve_adjusted') {
    adjusted = parseAmount(d.adjusted)
    if (adjusted == null || adjusted <= 0) errors.adjusted = 'Enter the corrected amount to pay.'
  }
  if (d.decision && d.blocking && ACTION_META[d.decision].paysMoney && !d.callbackVerified)
    errors.callback = 'A hard control fired. Confirm the callback / KYC check before paying.'
  const ok = Object.keys(errors).length === 0
  return { ok, errors, body: ok && d.decision ? { decision: d.decision, reason, adjusted_amount: adjusted } : undefined }
}
