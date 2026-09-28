import { Lock } from 'lucide-react'
import type { AutonomyLevel } from '@/api/types'
import { cn } from '@/lib/utils'
import { AgentMark } from './agent-mark'

/** An ink stamp: the lane has earned autonomy. */
export function AutoSeal({ animate, size = 'sm', className }: { animate?: boolean; size?: 'sm' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex -rotate-4 items-center gap-1 border-[1.5px] border-foreground font-semibold tracking-[0.14em] text-foreground uppercase',
        size === 'lg' ? 'h-8 px-3 text-sm [&_svg]:size-2.5' : 'h-5 px-1.5 text-[10px] [&_svg]:size-2',
        animate && 'animate-stamp',
        className,
      )}
    >
      <AgentMark />
      Auto
    </span>
  )
}

/** Progress toward autonomy for one vendor × exception type. */
export function TrustDots({
  level,
  streak,
  required = 3,
  className,
  label = true,
}: {
  level: AutonomyLevel
  streak: number
  required?: number
  className?: string
  label?: boolean
}) {
  if (level === 'locked')
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
        <Lock className="size-3.5" strokeWidth={2.25} aria-hidden />
        {label && 'Always human'}
      </span>
    )
  if (level === 'auto') return <AutoSeal className={className} />
  const filled = Math.min(streak, required)
  return (
    <span
      className={cn('inline-flex items-center gap-2 text-xs text-muted-foreground', className)}
      aria-label={`${filled} of ${required} accepted recommendations toward auto`}
    >
      <span className="inline-flex gap-1" aria-hidden>
        {Array.from({ length: required }, (_, i) => (
          <span
            key={i}
            className={cn(
              'size-2 rounded-full border border-foreground transition-colors duration-200',
              i < filled ? 'bg-foreground' : 'bg-transparent',
            )}
          />
        ))}
      </span>
      {label && (
        <span className="tabular-nums">
          {filled} of {required} to auto
        </span>
      )}
    </span>
  )
}
