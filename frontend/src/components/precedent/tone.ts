import { ArrowUpRight, Check, Pause, X, type LucideIcon } from 'lucide-react'
import type { Action } from '@/api/types'
import { ACTION_META, type Tone } from '@/lib/labels'

// Static class maps (Tailwind needs literal class names).
export const TONE_TEXT: Record<Tone, string> = {
  approve: 'text-approve',
  adjusted: 'text-adjusted',
  hold: 'text-hold',
  reject: 'text-reject',
  escalate: 'text-escalate',
}
export const TONE_SOFT: Record<Tone, string> = {
  approve: 'bg-approve-soft text-approve border-approve/30',
  adjusted: 'bg-adjusted-soft text-adjusted border-adjusted/30',
  hold: 'bg-hold-soft text-hold border-hold/30',
  reject: 'bg-reject-soft text-reject border-reject/30',
  escalate: 'bg-escalate-soft text-escalate border-escalate/30',
}
export const TONE_SOLID: Record<Tone, string> = {
  approve: 'bg-approve text-white border-approve dark:text-black',
  adjusted: 'bg-adjusted text-white border-adjusted dark:text-black',
  hold: 'bg-hold text-white border-hold dark:text-black',
  reject: 'bg-reject text-white border-reject dark:text-black',
  escalate: 'bg-escalate text-white border-escalate dark:text-black',
}
export const TONE_BAR: Record<Tone, string> = {
  approve: 'bg-approve',
  adjusted: 'bg-adjusted',
  hold: 'bg-hold',
  reject: 'bg-reject',
  escalate: 'bg-escalate',
}

export const ACTION_ICON: Record<Action, LucideIcon> = {
  approve: Check,
  approve_adjusted: Check,
  hold: Pause,
  reject: X,
  escalate: ArrowUpRight,
}

export const toneOf = (a: Action): Tone => ACTION_META[a].tone
