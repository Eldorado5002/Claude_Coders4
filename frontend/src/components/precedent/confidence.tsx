import { confidenceBand } from '@/lib/labels'
import { cn } from '@/lib/utils'

/** "High · 95" with a hairline meter. */
export function Confidence({ value, className, meter = true }: { value: number; className?: string; meter?: boolean }) {
  const { band, score } = confidenceBand(value)
  return (
    <span className={cn('inline-flex flex-col gap-1', className)}>
      <span className="text-xs whitespace-nowrap text-muted-foreground">
        <span className="font-medium text-foreground">{band}</span>
        <span className="mx-1 text-muted-foreground/60">·</span>
        <span className="font-medium text-foreground tabular-nums">{score}</span>
      </span>
      {meter && (
        <span className="block h-px w-full bg-rule" aria-hidden>
          <span className="block h-px bg-foreground" style={{ width: `${score}%` }} />
        </span>
      )}
    </span>
  )
}
