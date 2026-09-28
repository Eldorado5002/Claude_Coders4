import type { Format } from '@number-flow/react'
import type { ReactNode } from 'react'
import type { Metrics, Performance } from '@/api/types'
import { Stat } from '@/components/precedent'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { footnoteFor } from './learning-view'
import { NoteRef } from './notes'
import { latencyLine, secondsDigits, usdDigits, usdPerRec } from './trust-view'

const PERCENT: Format = { style: 'percent', maximumFractionDigits: 0 }
const HOURS: Format = { maximumFractionDigits: 1 }
const RUPEES: Format = { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }
const dollars = (digits: number): Format => ({
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
})
const fixed = (digits: number): Format => ({ minimumFractionDigits: digits, maximumFractionDigits: digits })

// 12 figures: 2 per row on phones, 4 on tablets, two rows of 6 when the page is wide enough
// the Section rule sits above; hairlines come from the 1px gaps showing the rule colour through
const GRID = 'grid grid-cols-2 gap-px border-b border-rule bg-rule @min-[640px]:grid-cols-4 @min-[1120px]:grid-cols-6'
const CELL = 'bg-background px-4 py-5 @min-[1120px]:px-3.5'

type Figure = {
  key: string
  label: ReactNode
  value: number | null | undefined
  format?: Format
  suffix?: string
  hint?: ReactNode
  emphasis?: boolean
  className?: string
}

/** The typographic row of figures: hairline dividers, no cards. */
export function Figures({ m }: { m: Metrics }) {
  const k = m.kpis
  const note = (re: RegExp) => <NoteRef n={footnoteFor(m.assumptions, re)} />
  const figures: Figure[] = [
    { key: 'touchless', label: <>Touchless rate{note(/^touchless/i)}</>, value: k.touchless_rate, format: PERCENT },
    { key: 'acceptance', label: <>Acceptance{note(/^acceptance/i)}</>, value: k.acceptance_rate, format: PERCENT },
    { key: 'relevance', label: 'Citation relevance', value: k.citation_relevance, format: PERCENT },
    { key: 'exceptions', label: 'Exceptions', value: k.exceptions_total },
    { key: 'auto', label: 'Auto-resolved', value: k.auto_resolved },
    { key: 'blocked', label: 'Blocked by controls', value: k.blocked_by_controls },
    {
      key: 'false',
      label: 'False approvals',
      value: k.false_approvals,
      emphasis: true,
      hint: 'Paid when it should not have been',
    },
    { key: 'revoked', label: 'Lessons revoked', value: k.lessons_revoked },
    { key: 'memories', label: 'Memories', value: k.memories },
    { key: 'hours', label: <>Hours saved{note(/^minutes saved/i)}</>, value: k.minutes_saved / 60, format: HOURS },
    // India compliance: MSME invoices near or past the 43B(h) payment deadline (warning tone while any are open)
    {
      key: 'msme',
      label: 'MSME invoices at risk',
      value: k.msme_open_at_risk,
      hint: 'Due within 7 days or overdue',
      className: k.msme_open_at_risk > 0 ? 'text-hold' : undefined,
    },
    {
      key: 'msme-tax',
      label: 'MSME tax at risk',
      value: k.msme_tax_at_risk,
      format: RUPEES,
      hint: 'Tax deduction at stake under 43B(h)',
      className: k.msme_open_at_risk > 0 ? 'text-hold' : undefined,
    },
  ]
  return <FigureRow figures={figures} grid={GRID} />
}

function FigureRow({ figures, grid }: { figures: Figure[]; grid: string }) {
  return (
    <div className="@container">
      <div className={grid}>
        {figures.map((f) => (
          <Stat
            key={f.key}
            className={cn(CELL, f.className)}
            label={f.label}
            value={f.value}
            format={f.format}
            suffix={f.suffix}
            hint={f.hint}
            emphasis={f.emphasis}
          />
        ))}
      </div>
    </div>
  )
}

// 2 per row in a half-width column, 4 in a row when the block has the full width
const PERF_GRID = 'grid grid-cols-2 gap-px border-y border-rule bg-rule @min-[640px]:grid-cols-4'

/** Cost and speed, in the same typographic row as the live docket figures. */
export function PerformanceFigures({ p }: { p: Performance }) {
  const cost = p.cost_per_1000_exceptions_usd
  const p50 = p.latency_p50_ms
  const figures: Figure[] = [
    {
      key: 'cost',
      label: 'Cost per 1,000 exceptions',
      value: cost,
      format: dollars(cost == null ? 0 : usdDigits(cost)),
      hint: p.avg_cost_usd != null ? `${usdPerRec(p.avg_cost_usd)} a recommendation` : undefined,
    },
    { key: 'fast', label: 'On the fast path', value: p.fast_share, format: PERCENT, hint: 'Memory recall and one model call' },
    {
      key: 'latency',
      label: 'Time to a recommendation',
      value: p50 == null ? null : p50 / 1000,
      format: fixed(p50 == null ? 1 : secondsDigits(p50)),
      suffix: ' s',
      hint: latencyLine(p),
    },
    { key: 'recs', label: 'Recommendations', value: p.recommendations, hint: 'Measured for cost and time' },
  ]
  return <FigureRow figures={figures} grid={PERF_GRID} />
}

export function FiguresSkeleton() {
  return (
    <div className="@container">
      <div className={GRID}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className={`${CELL} space-y-2.5`}>
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}
