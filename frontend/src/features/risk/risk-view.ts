import { ApiError } from '@/api/client'
import type { BenfordResult, VendorRisk, VendorRiskRow } from '@/api/types'
import { tidyReason } from '@/lib/risk'

// ── Vendor ranking ──────────────────────────────────────────────────────────

/** How a level is drawn: low stays quiet, medium warns (hold), high is serious (reject). */
export type RiskTone = 'muted' | 'hold' | 'reject'

const LEVELS: Record<string, { label: string; tone: RiskTone }> = {
  low: { label: 'Low', tone: 'muted' },
  medium: { label: 'Medium', tone: 'hold' },
  high: { label: 'High', tone: 'reject' },
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function levelMeta(level: string): { label: string; tone: RiskTone } {
  return LEVELS[level] ?? { label: capitalise(level), tone: 'muted' }
}

/** A 0–100 score as a bar width in percent, clamped. */
export function scoreWidth(score: number | null | undefined): number {
  if (score == null || Number.isNaN(score)) return 0
  return Math.min(100, Math.max(0, score))
}

export { tidyReason }

// The backend says this when a vendor has no signals at all (backend/app/services/risk.py).
const NO_SIGNALS = /^no .*signals/i

/** The vendor's risk reasons, tidied; an empty list means no fraud or control signal. */
export function riskSignals(risk: Pick<VendorRisk, 'reasons'>): string[] {
  return risk.reasons.filter((r) => r.trim() && !NO_SIGNALS.test(r.trim())).map(tidyReason)
}

export type RankedVendor = VendorRiskRow & { rank: number; signals: string[] }

/** The server sends the ranking highest first; keep that order and number it. */
export function rankVendors(rows: VendorRiskRow[]): RankedVendor[] {
  return rows.map((r, i) => ({ ...r, rank: i + 1, signals: riskSignals(r.risk) }))
}

const flagged = (r: RankedVendor) => r.signals.length > 0 || r.risk.score > 0

/** Up to `max` leading vendors that show a signal get the emphasis; everyone else follows in rank order. */
export function splitRanking(ranked: RankedVendor[], max = 3): { top: RankedVendor[]; rest: RankedVendor[] } {
  let n = 0
  while (n < Math.min(max, ranked.length) && flagged(ranked[n])) n++
  return { top: ranked.slice(0, n), rest: ranked.slice(n) }
}

/** "25 vendors · 1 high · 4 with signals" or "25 vendors · none flagged". */
export function rankingSummary(ranked: RankedVendor[]): string {
  const parts = [`${ranked.length} ${ranked.length === 1 ? 'vendor' : 'vendors'}`]
  const high = ranked.filter((r) => r.risk.level === 'high').length
  const medium = ranked.filter((r) => r.risk.level === 'medium').length
  const withSignals = ranked.filter(flagged).length
  if (high) parts.push(`${high} high`)
  if (medium) parts.push(`${medium} medium`)
  parts.push(withSignals ? `${withSignals} with signals` : 'none flagged')
  return parts.join(' · ')
}

// ── Benford's law ───────────────────────────────────────────────────────────

/** Same minimum as backend/app/ml/benford.py (MIN_N): below it there is no MAD. */
export const BENFORD_MIN_N = 50

const round1 = (n: number) => Math.round(n * 10) / 10

/** One chart/table row per first digit, in percent. `diff` is observed − expected in points. */
export type BenfordRow = { digit: number; observed: number; expected: number; diff: number }

export function benfordRows(b: Pick<BenfordResult, 'observed' | 'expected'>): BenfordRow[] {
  return Array.from({ length: 9 }, (_, i) => {
    const o = (b.observed[i] ?? 0) * 100
    const e = (b.expected[i] ?? 0) * 100
    return { digit: i + 1, observed: round1(o), expected: round1(e), diff: round1(o - e) }
  })
}

/** One % axis: the top rounds up to the next 10 (at least 10), ticks every 10 (every 5 on short axes). */
export function benfordAxis(rows: BenfordRow[]): { max: number; ticks: number[] } {
  const peak = Math.max(0, ...rows.flatMap((r) => [r.observed, r.expected]))
  const max = Math.max(10, Math.ceil(peak / 10) * 10)
  const step = max > 20 ? 10 : 5
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step) }
}

export type Conformity = 'close' | 'acceptable' | 'marginal' | 'nonconformity' | 'insufficient data'
export type VerdictTone = 'neutral' | 'hold' | 'reject' | 'muted'

const CONFORMITY: Record<Exclude<Conformity, 'insufficient data'>, { tone: VerdictTone; sentence: string }> = {
  close: { tone: 'neutral', sentence: 'First digits follow Benford’s law closely.' },
  acceptable: { tone: 'neutral', sentence: 'First digits follow Benford’s law within normal variation.' },
  marginal: { tone: 'hold', sentence: 'First digits drift from Benford’s law. Worth a second look.' },
  nonconformity: { tone: 'reject', sentence: 'First digits don’t follow Benford’s law. Look at the vendors with signals.' },
}

/** Nigrini's first-digit bands for the mean absolute deviation (same as the backend). */
export const CONFORMITY_SCALE: { conformity: Exclude<Conformity, 'insufficient data'>; label: string; range: string }[] = [
  { conformity: 'close', label: 'Close', range: '≤ 0.006' },
  { conformity: 'acceptable', label: 'Acceptable', range: '≤ 0.012' },
  { conformity: 'marginal', label: 'Marginal', range: '≤ 0.015' },
  { conformity: 'nonconformity', label: 'Nonconformity', range: '> 0.015' },
]

export type BenfordVerdict = {
  /** "MAD 0.0146 · marginal" or "Insufficient data" */
  text: string
  conformity: string
  tone: VerdictTone
  /** MAD to 4 decimals, or null when there is too little data */
  mad: string | null
  /** One plain sentence under the verdict. */
  sentence: string
}

export function benfordVerdict(b: Pick<BenfordResult, 'n' | 'mad' | 'conformity'>): BenfordVerdict {
  if (b.mad == null || b.conformity === 'insufficient data') {
    return {
      text: 'Insufficient data',
      conformity: 'insufficient data',
      tone: 'muted',
      mad: null,
      sentence:
        b.n < BENFORD_MIN_N
          ? `Only ${b.n} ${b.n === 1 ? 'amount' : 'amounts'} so far. The test needs at least ${BENFORD_MIN_N}.`
          : 'Not enough amounts to judge yet.',
    }
  }
  const mad = b.mad.toFixed(4)
  const known = CONFORMITY[b.conformity as keyof typeof CONFORMITY]
  return {
    text: `MAD ${mad} · ${b.conformity}`,
    conformity: b.conformity,
    tone: known?.tone ?? 'neutral',
    mad,
    sentence: known?.sentence ?? `Mean absolute deviation ${mad} from Benford’s law.`,
  }
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** 31.76 → "31.8%" */
export const pctFigure = (n: number) => `${n.toFixed(1)}%`

/** 1.7 → "+1.7 pts", −4.1 → "−4.1 pts" (a real minus sign) */
export function signedPts(n: number): string {
  if (n > 0) return `+${n.toFixed(1)} pts`
  if (n < 0) return `−${Math.abs(n).toFixed(1)} pts`
  return '0.0 pts'
}

// ── Errors ──────────────────────────────────────────────────────────────────

const WHAT = { ranking: 'The vendor ranking', benford: 'The Benford test' } as const

export function riskErrorCopy(error: unknown, what: keyof typeof WHAT): { title: string; body: string } {
  const status = error instanceof ApiError ? error.status : undefined
  if (status === 0)
    return { title: 'Can’t reach the Precedent API.', body: 'Start the backend, or switch to sample data from the banner above.' }
  return { title: `${WHAT[what]} didn’t load.`, body: error instanceof Error ? error.message : String(error) }
}
