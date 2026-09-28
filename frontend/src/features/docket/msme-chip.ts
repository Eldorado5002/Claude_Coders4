export type MsmeChip = { label: string; tone: 'neutral' | 'hold' | 'reject'; title: string }

/** Due soon = within a week, as the backend counts it. */
export const MSME_DUE_SOON_DAYS = 7

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

/** "MSME · 5d" from ExceptionSummary.msme_days_left. null: not MSME, or a duplicate that will never be paid. */
export function msmeChip(daysLeft: number | null | undefined): MsmeChip | null {
  if (daysLeft == null || Number.isNaN(daysLeft)) return null
  if (daysLeft < 0)
    return {
      label: `MSME · ${-daysLeft}d overdue`,
      tone: 'reject',
      title: `${days(-daysLeft)} past the MSME 43B(h) payment deadline`,
    }
  if (daysLeft === 0) return { label: 'MSME · today', tone: 'hold', title: 'The MSME 43B(h) payment deadline is today' }
  return {
    label: `MSME · ${daysLeft}d`,
    tone: daysLeft <= MSME_DUE_SOON_DAYS ? 'hold' : 'neutral',
    title: `${days(daysLeft)} to the MSME 43B(h) payment deadline`,
  }
}
