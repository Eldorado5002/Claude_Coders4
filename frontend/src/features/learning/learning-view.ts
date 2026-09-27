import type { Metrics, WeeklyPoint } from '@/api/types'
import { pct } from '@/lib/format'

/** Weeks the fallback headline averages over. */
export const HEADLINE_WINDOW = 9

/** Demo stages drawn on the learning curves. */
export const STAGE_MARKERS = [
  { week: 1, label: 'Day 1' },
  { week: 3, label: 'Week 3' },
  { week: 8, label: 'Week 8' },
  { week: 9, label: 'Twist' },
] as const

/** The backend's replay evaluation, parsed out of its assumptions footnote. Rates are whole percents. */
export type ReplaySummary = {
  /** position in `assumptions` (0-based), so the headline can cite its footnote */
  index: number
  from: number
  to: number
  correctOn: number
  correctOff: number
  touchlessOn: number | null
  touchlessOff: number | null
  falseApprovals: number | null
}

// "Months 5-6: agent correct 96% with memory vs 35% without; touchless 55% vs 0%; false approvals 0."
const PERIOD = /\bMonths?\s+(\d+)(?:\s*[-–]\s*(\d+))?\s*:/i
const CORRECT = /correct\s+(\d+(?:\.\d+)?)%\s+with memory\s+vs\s+(\d+(?:\.\d+)?)%\s+without/i
const TOUCHLESS = /touchless\s+(\d+(?:\.\d+)?)%\s+vs\s+(\d+(?:\.\d+)?)%/i
const FALSE_APPROVALS = /false approvals?\s+(\d+)/i

export function findReplaySummary(assumptions: readonly string[]): ReplaySummary | null {
  for (let index = 0; index < assumptions.length; index++) {
    const s = assumptions[index]
    const period = PERIOD.exec(s)
    const correct = CORRECT.exec(s)
    if (!period || !correct) continue
    const touchless = TOUCHLESS.exec(s)
    const fa = FALSE_APPROVALS.exec(s)
    const from = Number(period[1])
    return {
      index,
      from,
      to: period[2] ? Number(period[2]) : from,
      correctOn: Math.round(Number(correct[1])),
      correctOff: Math.round(Number(correct[2])),
      touchlessOn: touchless ? Math.round(Number(touchless[1])) : null,
      touchlessOff: touchless ? Math.round(Number(touchless[2])) : null,
      falseApprovals: fa ? Number(fa[1]) : null,
    }
  }
  return null
}

/** "zero false approvals" reads as a promise; anything above one stays a plain figure. */
function falseApprovalsPhrase(n: number): string {
  if (n === 0) return 'zero false approvals'
  if (n === 1) return 'one false approval'
  return `${n} false approvals`
}

/** Second sentence: what it did on its own, and the trust number. */
function secondSentence(touchless: string | null, falseApprovals: number | null): string {
  if (touchless != null && falseApprovals != null)
    return ` It resolved ${touchless} of exceptions on its own, with ${falseApprovalsPhrase(falseApprovals)}.`
  if (touchless != null) return ` It resolved ${touchless} of exceptions on its own.`
  if (falseApprovals != null) return ` It made ${falseApprovalsPhrase(falseApprovals)}.`
  return ''
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** The last `n` weeks that have a memory-on value. */
function recentWeeks(points: readonly WeeklyPoint[], n: number): WeeklyPoint[] {
  return points.filter((p) => p.memory_on != null).slice(-n)
}

const values = (pts: readonly WeeklyPoint[], key: 'memory_on' | 'memory_off') =>
  pts.map((p) => p[key]).filter((v): v is number => v != null)

/**
 * The page's one-line finding. Prefers the backend's replay summary (months 5-6);
 * otherwise averages the last 9 weeks of the weekly curves.
 */
export function headline(m: Metrics): string {
  const replay = findReplaySummary(m.assumptions)
  if (replay) {
    const months = replay.from === replay.to ? `month ${replay.from}` : `months ${replay.from}–${replay.to}`
    return (
      `In ${months}, Precedent was right ${replay.correctOn}% of the time with memory, ${replay.correctOff}% without.` +
      secondSentence(replay.touchlessOn == null ? null : `${replay.touchlessOn}%`, replay.falseApprovals)
    )
  }

  const window = recentWeeks(m.acceptance_by_week, HEADLINE_WINDOW)
  if (!window.length) return 'Not enough history yet to say how memory changes the agent’s decisions.'

  const span = window.length === 1 ? 'In the last week' : `Over the last ${window.length} weeks`
  const on = pct(mean(values(window, 'memory_on')))
  const offs = values(window, 'memory_off')
  const first = offs.length
    ? `${span}, Precedent was right ${on} of the time with memory, ${pct(mean(offs))} without.`
    : `${span}, Precedent was right ${on} of the time with memory.`

  const touchlessWindow = recentWeeks(m.touchless_by_week, HEADLINE_WINDOW)
  const touchless = touchlessWindow.length ? pct(mean(values(touchlessWindow, 'memory_on'))) : null
  return first + secondSentence(touchless, m.kpis.false_approvals)
}

/** 1-based footnote number of the first assumption matching `pattern`, so a figure can cite its definition. */
export function footnoteFor(assumptions: readonly string[], pattern: RegExp): number | null {
  const i = assumptions.findIndex((a) => pattern.test(a))
  return i < 0 ? null : i + 1
}

/** True when at least one week has a memory-off (baseline) value. */
export function hasBaseline(points: readonly WeeklyPoint[]): boolean {
  return points.some((p) => p.memory_off != null)
}

/** The last week that has a value for this series: where the direct label sits. */
export function lastPoint(
  points: readonly WeeklyPoint[],
  key: 'memory_on' | 'memory_off',
): { week: number; value: number } | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i][key]
    if (v != null) return { week: points[i].week, value: v }
  }
  return null
}

/**
 * Two end-of-line labels (pixel y) that would overlap: push them apart around their
 * midpoint so they are `minGap` apart, keep their order, and keep both inside [min, max].
 */
export function spreadLabels(ys: [number, number], minGap: number, min: number, max: number): [number, number] {
  const [a, b] = ys
  if (Math.abs(a - b) >= minGap) return [a, b]
  const mid = (a + b) / 2
  let lo = mid - minGap / 2
  let hi = mid + minGap / 2
  if (lo < min) {
    hi += min - lo
    lo = min
  }
  if (hi > max) {
    lo -= hi - max
    hi = max
  }
  lo = Math.round(lo)
  hi = Math.round(hi)
  // equal inputs keep the first label on top
  return a <= b ? [lo, hi] : [hi, lo]
}
