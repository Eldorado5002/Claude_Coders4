import { Lock } from 'lucide-react'
import { forwardRef } from 'react'
import { Link } from 'react-router'
import type { ExceptionSummary } from '@/api/types'
import { AgentMark, AutoSeal, CaseId, DecisionChip, Money, Mono, TONE_SOFT, TypeChip } from '@/components/precedent'
import { simRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { msmeChip, type MsmeChip } from './msme-chip'

type Props = { c: ExceptionSummary; active: boolean; fresh: boolean; to: string; simToday?: string }

function Verdict({ c }: { c: ExceptionSummary }) {
  if (c.status === 'auto_resolved')
    return (
      <span className="flex items-center gap-2">
        <AutoSeal />
        {c.recommended_action && <DecisionChip action={c.recommended_action} size="xs" />}
      </span>
    )
  if (c.status === 'resolved')
    return (
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        Resolved
        {c.recommended_action && <DecisionChip action={c.recommended_action} size="xs" className="opacity-70" />}
      </span>
    )
  if (!c.recommended_action)
    return (
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <AgentMark /> Reasoning over precedents…
      </span>
    )
  return (
    <span className="flex items-center gap-2">
      {c.blocking && <Lock className="size-3.5" strokeWidth={2.5} aria-label="Hard control" />}
      <DecisionChip action={c.recommended_action} size="xs" />
      {c.confidence != null && (
        <span className="text-xs text-muted-foreground tabular-nums">{Math.round(c.confidence * 100)}</span>
      )}
    </span>
  )
}

const CHIP_TONE: Record<MsmeChip['tone'], string> = {
  neutral: 'border-border text-muted-foreground',
  hold: TONE_SOFT.hold,
  reject: TONE_SOFT.reject,
}

/** "MSME · 5d": days to the 43B(h) payment deadline. */
function MsmeBadge({ chip }: { chip: MsmeChip }) {
  return (
    <span
      title={chip.title}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-[11px] font-medium whitespace-nowrap tabular-nums',
        CHIP_TONE[chip.tone],
      )}
    >
      <span aria-hidden>{chip.label}</span>
      <span className="sr-only">{chip.title}</span>
    </span>
  )
}

export const CaseRow = forwardRef<HTMLAnchorElement, Props>(function CaseRow({ c, active, fresh, to, simToday }, ref) {
  const msme = msmeChip(c.msme_days_left)
  return (
    <Link
      ref={ref}
      to={to}
      aria-current={active ? 'page' : undefined}
      data-fresh={fresh || undefined}
      className={cn(
        'group relative block border-b border-rule px-5 py-3.5 outline-none transition-colors duration-150',
        'hover:bg-accent/60 focus-visible:bg-accent',
        active && 'bg-accent',
        fresh && 'animate-arrive',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-foreground before:opacity-0',
        active && 'before:opacity-100',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[0.95rem] font-medium">{c.vendor.name}</span>
        <Money value={c.amount_at_risk} className="text-sm font-medium" />
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <TypeChip type={c.primary_type} />
        {msme && <MsmeBadge chip={msme} />}
        <CaseId id={c.id} />
        <span aria-hidden>·</span>
        <Mono className="truncate">{c.invoice_number}</Mono>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <Verdict c={c} />
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {simToday ? simRelative(c.created_at, simToday) : ''}
        </span>
      </div>
    </Link>
  )
})
