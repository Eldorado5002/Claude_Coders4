import NumberFlow from '@number-flow/react'
import { confidenceBand } from '@/lib/labels'
import { cn } from '@/lib/utils'

const ROLL = { duration: 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }

/**
 * "High · 95" with a hairline meter. `animated`: when the value changes in place (memory switched on a case), the
 * number rolls and the meter slides to it (300 ms, ease-out) instead of jumping. Mounting never animates.
 */
export function Confidence({
  value,
  className,
  meter = true,
  animated = false,
}: {
  value: number
  className?: string
  meter?: boolean
  animated?: boolean
}) {
  const { band, score } = confidenceBand(value)
  return (
    <span className={cn('inline-flex flex-col gap-1', className)}>
      <span className="text-xs whitespace-nowrap text-muted-foreground">
        <span className="font-medium text-foreground">{band}</span>
        <span className="mx-1 text-muted-foreground/60">·</span>
        <span className="font-medium text-foreground tabular-nums">
          {animated ? <NumberFlow value={score} transformTiming={ROLL} spinTiming={ROLL} opacityTiming={ROLL} /> : score}
        </span>
      </span>
      {meter && (
        <span className="block h-px w-full bg-rule" aria-hidden>
          {animated ? (
            <span
              className="block h-px origin-left bg-foreground transition-transform duration-300 ease-out"
              style={{ transform: `scaleX(${score / 100})` }}
            />
          ) : (
            <span className="block h-px bg-foreground" style={{ width: `${score}%` }} />
          )}
        </span>
      )}
    </span>
  )
}
