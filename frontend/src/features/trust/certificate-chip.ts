import type { AutonomyCertificate } from '@/api/types'
import { decisionsNeeded } from '@/lib/certificate'

export type ChipTone = 'certified' | 'collecting' | 'paused'

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
