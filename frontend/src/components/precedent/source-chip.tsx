import { Lock } from 'lucide-react'
import type { RecSource } from '@/api/types'
import { cn } from '@/lib/utils'
import { AgentMark } from './agent-mark'

/** Where a recommendation came from — told apart by shape and fill, not hue. */
export function SourceChip({ source, count, className }: { source: RecSource; count?: number; className?: string }) {
  const base =
    'inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-[11px] font-medium tracking-[0.02em] whitespace-nowrap'
  if (source === 'guardrail')
    return (
      <span className={cn(base, 'bg-foreground text-background', className)}>
        <Lock className="size-3" strokeWidth={2.5} aria-hidden />
        Hard control
      </span>
    )
  if (source === 'memory')
    return (
      <span className={cn(base, 'border border-foreground text-foreground', className)}>
        <AgentMark />
        {count ? `Grounded in ${count} precedent${count === 1 ? '' : 's'}` : 'Grounded in precedent'}
      </span>
    )
  return (
    <span className={cn(base, 'border border-dashed border-muted-foreground/60 text-muted-foreground', className)}>
      <span aria-hidden className="inline-block size-2 rounded-full border border-current" />
      No precedent
    </span>
  )
}
