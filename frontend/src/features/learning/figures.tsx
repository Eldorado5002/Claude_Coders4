import type { Format } from '@number-flow/react'
import type { ReactNode } from 'react'
import type { Metrics } from '@/api/types'
import { Stat } from '@/components/precedent'
import { Skeleton } from '@/components/ui/skeleton'
import { footnoteFor } from './learning-view'
import { NoteRef } from './notes'

const PERCENT: Format = { style: 'percent', maximumFractionDigits: 0 }
const HOURS: Format = { maximumFractionDigits: 1 }

// 2 per row on phones, 5 on tablets, one row of 10 when the page is wide enough
// the Section rule sits above; hairlines come from the 1px gaps showing the rule colour through
const GRID = 'grid grid-cols-2 gap-px border-b border-rule bg-rule @min-[640px]:grid-cols-5 @min-[1120px]:grid-cols-10'
const CELL = 'bg-background px-4 py-5 @min-[1120px]:px-3.5'

type Figure = { key: string; label: ReactNode; value: number | null | undefined; format?: Format; hint?: ReactNode; emphasis?: boolean }

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
  ]
  return (
    <div className="@container">
      <div className={GRID}>
        {figures.map((f) => (
          <Stat key={f.key} className={CELL} label={f.label} value={f.value} format={f.format} hint={f.hint} emphasis={f.emphasis} />
        ))}
      </div>
    </div>
  )
}

export function FiguresSkeleton() {
  return (
    <div className="@container">
      <div className={GRID}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={`${CELL} space-y-2.5`}>
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}
