import type { ReactNode } from 'react'
import { inr, inrCompact } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Rupees, tabular, Indian grouping. */
export function Money({ value, compact, className }: { value: number | null | undefined; compact?: boolean; className?: string }) {
  return <span className={cn('tabular-nums whitespace-nowrap', className)}>{compact ? inrCompact(value) : inr(value)}</span>
}

/** IDs, GSTIN, IFSC, masked accounts: the ledger face. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[0.92em] tracking-tight', className)}>{children}</span>
}

export function CaseId({ id, className }: { id: string; className?: string }) {
  return <Mono className={cn('text-muted-foreground', className)}>{id}</Mono>
}

/** Small-caps label above a block. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase', className)}>
      {children}
    </div>
  )
}
