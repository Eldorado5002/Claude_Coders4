import { differenceInCalendarDays, format, parseISO } from 'date-fns'

type Num = number | null | undefined

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const INR_WHOLE = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

const missing = (n: Num): n is null | undefined => n == null || Number.isNaN(n)
const oneDecimal = (n: number) => n.toFixed(1).replace(/\.0$/, '')

/** ₹2,41,428.00 */
export function inr(n: Num): string {
  return missing(n) ? '—' : INR.format(n)
}

/** ₹4,956 · ₹5.5L · ₹12Cr */
export function inrCompact(n: Num): string {
  if (missing(n)) return '—'
  const a = Math.abs(n)
  if (a < 1e5) return INR_WHOLE.format(n)
  if (a < 1e7) return `₹${oneDecimal(n / 1e5)}L`
  return `₹${oneDecimal(n / 1e7)}Cr`
}

/** 0.955 → 96% */
export function pct(n: Num): string {
  if (missing(n)) return '—'
  return `${Math.round(Number((n * 100).toFixed(6)))}%`
}

// The app runs on a simulated clock: every date comes from the API, never from Date.now().
// parseISO treats date-only and naive datetimes as local time (no UTC shift).
export const toDate = (iso: string) => parseISO(iso)

/** Wed, 18 Mar 2026 */
export const simDate = (iso: string) => format(parseISO(iso), 'EEE, d MMM yyyy')

/** 18 Mar */
export const simDay = (iso: string) => format(parseISO(iso), 'd MMM')

/** 09:30 */
export const simTime = (iso: string) => format(parseISO(iso), 'HH:mm')

/** "Today, 09:30" relative to the simulated today */
export function simRelative(iso: string, simToday: string): string {
  const when = parseISO(iso)
  const diff = differenceInCalendarDays(parseISO(simToday), when)
  if (diff === 0) return `Today, ${format(when, 'HH:mm')}`
  if (diff === 1) return `Yesterday, ${format(when, 'HH:mm')}`
  return format(when, 'd MMM')
}

/**
 * A model cost in dollars, the same on every screen: three decimals ("$0.034"; the fast path's $0.000986 reads
 * "$0.001"), "< $0.001" only when three decimals would read zero, "$0" for a recommendation with no model call.
 */
export function usdSmall(usd: number | null | undefined): string | null {
  if (usd == null || Number.isNaN(usd)) return null
  if (usd === 0) return '$0'
  const shown = usd.toFixed(3)
  return Number(shown) === 0 ? '< $0.001' : `$${shown}`
}
