import { cn } from '@/lib/utils'
import type { Action } from '@/api/types'
import { ACTION_META } from '@/lib/labels'
import { ACTION_ICON, TONE_SOFT, TONE_SOLID, toneOf } from './tone'

type Props = {
  action: Action
  size?: 'xs' | 'sm' | 'lg'
  variant?: 'soft' | 'solid'
  className?: string
}

const SIZE = {
  xs: 'h-5 gap-1 px-1.5 text-[10px] [&_svg]:size-3',
  sm: 'h-6 gap-1.5 px-2 text-[11px] [&_svg]:size-3.5',
  lg: 'h-9 gap-2 px-3.5 text-[13px] [&_svg]:size-4',
}

/** A decision: colour + icon + label, never colour alone. */
export function DecisionChip({ action, size = 'sm', variant = 'soft', className }: Props) {
  const Icon = ACTION_ICON[action]
  const tone = toneOf(action)
  return (
    <span
      data-action={action}
      className={cn(
        'inline-flex shrink-0 items-center rounded-sm border font-semibold uppercase tracking-[0.08em] whitespace-nowrap',
        SIZE[size],
        variant === 'solid' ? TONE_SOLID[tone] : TONE_SOFT[tone],
        className,
      )}
    >
      <Icon strokeWidth={2.5} aria-hidden />
      {action === 'approve_adjusted' && <span aria-hidden>₹</span>}
      {ACTION_META[action].label}
    </span>
  )
}
