import { ShieldAlert, TriangleAlert } from 'lucide-react'
import { ApiError } from '@/api/client'
import { EmptyState } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { levelMeta, riskErrorCopy, scoreWidth, type RiskTone } from './risk-view'

// Static class maps (Tailwind needs literal class names).
const CHIP: Record<RiskTone, string> = {
  muted: 'border-border text-muted-foreground',
  hold: 'bg-hold-soft text-hold border-hold/30',
  reject: 'bg-reject-soft text-reject border-reject/30',
}
const BAR: Record<RiskTone, string> = {
  muted: 'bg-muted-foreground',
  hold: 'bg-hold',
  reject: 'bg-reject',
}

/** Low / Medium / High: the word always travels with the colour. */
export function LevelChip({ level, className }: { level: string; className?: string }) {
  const { label, tone } = levelMeta(level)
  return (
    <span
      data-level={level}
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-[10px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase',
        CHIP[tone],
        className,
      )}
    >
      {label}
      <span className="sr-only"> risk</span>
    </span>
  )
}

/** A thin 0–100 track; the fill takes the level's tone. Decorative: the figure beside it carries the value. */
export function ScoreBar({ score, level, className }: { score: number; level: string; className?: string }) {
  const { tone } = levelMeta(level)
  return (
    <span className={cn('relative block h-1 bg-rule', className)} aria-hidden>
      <span className={cn('absolute inset-y-0 left-0', BAR[tone])} style={{ width: `${scoreWidth(score)}%` }} />
    </span>
  )
}

/** A section-level load failure, with the API / Hindsight cases said plainly. */
export function RiskLoadError({
  error,
  what,
  retry,
}: {
  error: Error
  what: 'ranking' | 'benford'
  retry: () => void
}) {
  const { title, body } = riskErrorCopy(error, what)
  const down = error instanceof ApiError && (error.status === 0 || error.status === 503)
  return (
    <EmptyState
      className="py-10"
      icon={down ? <TriangleAlert /> : <ShieldAlert />}
      title={title}
      action={
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      }
    >
      {body}
    </EmptyState>
  )
}
