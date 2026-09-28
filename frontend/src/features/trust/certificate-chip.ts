import type { AutonomyCertificate } from '@/api/types'

export type ChipTone = 'certified' | 'collecting' | 'paused'

/**
 * Verified pay decisions needed before certification. Prefer the backend's own number
 * ("…takes 59 of them…"); with zero errors the 95% Clopper–Pearson upper bound is
 * 1 − (1 − conf)^(1/n), so n is the smallest count that pushes it under the target.
 */
export function decisionsNeeded(c: AutonomyCertificate): number | null {
  const stated = c.explanation.match(/takes (\d+)/)
  if (stated) return Number(stated[1])
  if (c.errors !== 0) return null
  return Math.ceil(Math.log(1 - c.confidence_level) / Math.log(1 - c.target_error))
}

/** The Trust map header chip: one line on whether auto-pay is statistically earned. */
export function certificateChip(c: AutonomyCertificate): { label: string; detail: string; tone: ChipTone } {
  if (c.status === 'certified')
    return { label: 'Certified', detail: `auto-pay at ≥ ${(c.threshold ?? 0).toFixed(2)}`, tone: 'certified' }
  if (c.status === 'paused')
    return { label: 'Auto-pay paused', detail: `${c.errors} wrong of ${c.decisions} verified`, tone: 'paused' }
  const need = decisionsNeeded(c)
  return {
    label: 'Collecting evidence',
    detail: need ? `${c.decisions} of ${need} verified decisions` : `${c.decisions} verified decisions`,
    tone: 'collecting',
  }
}
