import { Lock } from 'lucide-react'
import type { ExceptionType } from '@/api/types'
import { TYPE_LABEL, isHardControl } from '@/lib/labels'
import { cn } from '@/lib/utils'

export function TypeChip({ type, className }: { type: ExceptionType; className?: string }) {
  const hard = isHardControl(type)
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-[11px] font-medium whitespace-nowrap',
        hard ? 'hatch border-foreground/70 text-foreground' : 'border-border text-muted-foreground',
        className,
      )}
    >
      {hard && <Lock className="size-3" strokeWidth={2.5} aria-hidden />}
      {TYPE_LABEL[type]}
    </span>
  )
}
