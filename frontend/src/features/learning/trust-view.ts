import type { AutonomyCertificate, Calibration, CalibrationBin, Metrics, Performance } from '@/api/types'
import { pct } from '@/lib/format'

/* ------------------------------------------------------------------ text segments */

/** A sentence as runs of plain text and emphasised figures, so the view can bold the numbers. */
export type Seg = string | { b: string }

export const plain = (segs: readonly Seg[]): string => segs.map((s) => (typeof s === 'string' ? s : s.b)).join('')

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/* ------------------------------------------------------------------ numbers */

/** 0.0402 → "4.0%": upper bounds keep one decimal so small differences show. */
export function boundPct(x: number): string {
  if (x >= 1) return '100%'
  return `${(x * 100).toFixed(1)}%`
}

/** 0.05 → "5%", 0.025 → "2.5%": round targets drop the trailing .0. */
export function plainPct(x: number): string {
  return `${Number((x * 100).toFixed(1))}%`
}

/** 0.75 → "0.75", 0.9 → "0.90": thresholds read as confidences. */
const thresholdText = (t: number) => t.toFixed(2)

/* ------------------------------------------------------------------ certificate */

export type SealVariant = 'solid' | 'outline' | 'reject'
export type Seal = { label: string; variant: SealVariant }

const SEALS: Record<AutonomyCertificate['status'], Seal> = {
  certified: { label: 'Certified', variant: 'solid' },
  collecting: { label: 'Collecting', variant: 'outline' },
  paused: { label: 'Paused', variant: 'reject' },
}

/** Certified is a solid ink stamp, collecting an outline, paused the reject tone. */
export function sealFor(status: AutonomyCertificate['status']): Seal {
  return SEALS[status] ?? SEALS.collecting
}

/** "Auto-pay allowed at confidence ≥ 0.75" */
export function allowance(c: AutonomyCertificate): Seg[] {
  if (c.status === 'paused' || c.threshold == null) return ['Auto-pay is paused']
  const t = { b: thresholdText(c.threshold) }
  if (c.status === 'certified') return ['Auto-pay allowed at confidence ≥ ', t]
  return ['Provisional: auto-pay only at confidence ≥ ', t]
}

/** "73 verified payment decisions · 0 wrong" */
export function record(c: AutonomyCertificate): Seg[] {
  if (c.decisions === 0) return ['No verified payment decisions yet']
  return [
    { b: String(c.decisions) },
    ` verified payment ${plural(c.decisions, 'decision', 'decisions')} · `,
    { b: String(c.errors) },
    ' wrong',
  ]
}

/** "With 95% confidence, at most 4.0% of automatic payments are wrong (target 5%)" */
export function boundSentence(c: AutonomyCertificate): Seg[] {
  return [
    `With ${plainPct(c.confidence_level)} confidence, at most `,
    { b: boundPct(c.error_upper_bound) },
    ` of automatic payments are wrong (target ${plainPct(c.target_error)})`,
  ]
}

/** "46 paid automatically · 0 wrong" */
export function autoRecord(c: AutonomyCertificate): Seg[] {
  if (c.auto_resolutions === 0) return ['Nothing paid automatically yet']
  return [{ b: String(c.auto_resolutions) }, ' paid automatically · ', { b: String(c.auto_errors) }, ' wrong']
}

/** P(X ≤ k) for X ~ Binomial(n, p), summed term by term. */
function binomCdf(k: number, n: number, p: number): number {
  let term = Math.pow(1 - p, n)
  let sum = term
  for (let i = 0; i < k; i++) {
    term *= ((n - i) / (i + 1)) * (p / (1 - p))
    sum += term
  }
  return sum
}

/**
 * Verified decisions needed to certify with `errors` wrong: the smallest n whose one-sided
 * Clopper-Pearson upper bound is at or below `target` (0 errors at 5% / 95% → 59).
 */
export function decisionsNeeded(errors: number, target: number, confidence: number): number | null {
  const alpha = 1 - confidence
  for (let n = Math.max(1, errors + 1); n <= 100_000; n++) {
    if (binomCdf(errors, n, target) <= alpha + 1e-12) return n
  }
  return null
}

export type Progress = { have: number; need: number; text: string }

/** While collecting: "2 of 59 verified decisions", assuming no more are wrong. */
export function certificateProgress(c: AutonomyCertificate): Progress | null {
  if (c.status !== 'collecting') return null
  const need = decisionsNeeded(c.errors, c.target_error, c.confidence_level)
  if (need == null || need <= c.decisions) return null
  return { have: c.decisions, need, text: `${c.decisions} of ${need} verified decisions` }
}

export type LadderRow = {
  key: string
  threshold: string
  decisions: number
  errors: number
  bound: string
  certified: boolean
  /** the threshold auto-pay runs at now */
  current: boolean
}

/** The certificate table, strictest threshold first. */
export function ladderRows(c: AutonomyCertificate): LadderRow[] {
  const live = c.status === 'paused' ? null : c.threshold
  return [...c.table]
    .sort((a, b) => b.threshold - a.threshold)
    .map((r) => ({
      key: thresholdText(r.threshold),
      threshold: thresholdText(r.threshold),
      decisions: r.decisions,
      errors: r.errors,
      bound: boundPct(r.upper_bound),
      certified: r.certified,
      current: live != null && Math.abs(r.threshold - live) < 1e-9,
    }))
}

/** One row would only repeat the headline figures; the ladder earns its space from two thresholds up. */
export function showLadder(c: AutonomyCertificate): boolean {
  return c.table.length > 1
}

/* ------------------------------------------------------------------ calibration */

export type CalPoint = { key: string; low: number; high: number; n: number; stated: number; actual: number; r: number }

/**
 * One dot per bin that has both a stated and an actual rate. Radius grows with √n so
 * dot area tracks the number of decisions; the biggest bin gets `maxR`.
 */
export function calibrationPoints(
  bins: readonly CalibrationBin[],
  { minR = 4, maxR = 14 }: { minR?: number; maxR?: number } = {},
): CalPoint[] {
  const kept = bins.filter(
    (b): b is CalibrationBin & { stated: number; actual: number } => b.n > 0 && b.stated != null && b.actual != null,
  )
  const maxN = Math.max(0, ...kept.map((b) => b.n))
  return kept.map((b) => ({
    key: `${b.low}-${b.high}`,
    low: b.low,
    high: b.high,
    n: b.n,
    stated: b.stated,
    actual: b.actual,
    r: Math.round((minR + (maxR - minR) * Math.sqrt(b.n / maxN)) * 10) / 10,
  }))
}

/** "95–100%" */
export function binLabel(b: Pick<CalibrationBin, 'low' | 'high'>): string {
  return `${Math.round(b.low * 100)}–${Math.round(b.high * 100)}%`
}

/** "Expected calibration error 0.07"; nothing when the API has no value yet. */
export function eceText(ece: number | null | undefined): string | null {
  return ece == null ? null : `Expected calibration error ${ece.toFixed(2)}`
}

/** "Right 90% of the time across 123 scored recommendations" */
export function calibrationSummary(c: Calibration): string {
  return `Right ${pct(c.pooled_accuracy)} of the time across ${c.n} scored ${plural(c.n, 'recommendation', 'recommendations')}`
}

/* ------------------------------------------------------------------ cost and speed */

const USD = (digits: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

/** Whole dollars per 1,000 exceptions; cents only when it's under a dollar. */
export const usdDigits = (x: number): 0 | 2 => (x >= 1 ? 0 : 2)

/** 17.3 → "$17" */
export function usdPer1000(x: number | null | undefined): string {
  if (x == null) return '—'
  return USD(usdDigits(x)).format(x)
}

/** 0.0173 → "$0.017", 0.000986 → "< $0.001" */
export function usdPerRec(x: number | null | undefined): string {
  if (x == null) return '—'
  if (x < 0.001) return '< $0.001'
  return USD(3).format(x)
}

/** 2653 → "2.7 s", 11498 → "11 s", 850 → "850 ms" */
export function seconds(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  return s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`
}

/** Decimals for the seconds figure: one under 10 s, none above (matches `seconds`). */
export const secondsDigits = (ms: number): 0 | 1 => (ms < 10_000 ? 1 : 0)

/** "2.7 s median · 9.4 s p95" */
export function latencyLine(p: Pick<Performance, 'latency_p50_ms' | 'latency_p95_ms'>): string | null {
  const parts = [
    p.latency_p50_ms != null ? `${seconds(p.latency_p50_ms)} median` : null,
    p.latency_p95_ms != null ? `${seconds(p.latency_p95_ms)} p95` : null,
  ].filter((s) => s != null)
  return parts.length ? parts.join(' · ') : null
}

/* ------------------------------------------------------------------ section */

/** Whether the "Trust you can check" section has anything to show. */
export function hasTrustData(m: Pick<Metrics, 'certificate' | 'calibration' | 'performance'>): boolean {
  return m.certificate != null || m.calibration != null || m.performance != null
}
