import NumberFlow, { type Format } from '@number-flow/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A figure in the typographic row: big tabular number, small label. No card chrome. */
export function Stat({
  label,
  value,
  format,
  suffix,
  hint,
  emphasis,
  className,
}: {
  label: ReactNode
  value: number | null | undefined
  format?: Format
  suffix?: string
  hint?: ReactNode
  emphasis?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <div className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{label}</div>
      <div className={cn('serif-display text-[2rem] leading-none tabular-nums', emphasis && 'underline decoration-1 underline-offset-8')}>
        {value == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <NumberFlow value={value} format={format} locales="en-IN" suffix={suffix} />
        )}
      </div>
      {hint && <div className="text-xs text-pretty text-muted-foreground">{hint}</div>}
    </div>
  )
}
