import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { toast } from 'sonner'
import { useResolve } from '@/api/mutations'
import type { Action, ExceptionDetail, ResolveResult } from '@/api/types'
import { ACTION_ICON, TONE_SOLID, TONE_TEXT, toneOf } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Kbd } from '@/components/ui/kbd'
import { Textarea } from '@/components/ui/textarea'
import { inr } from '@/lib/format'
import { ACTIONS, ACTION_META } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'
import { validateResolve } from './resolve-validation'

export type Preset = { decision: Action | null; reason: string; adjusted?: string }

export function ResolveForm({
  c,
  preset,
  onCancel,
  onDone,
}: {
  c: ExceptionDetail
  preset: Preset
  onCancel: () => void
  onDone: (r: ResolveResult) => void
}) {
  const clerk = useUi((s) => s.clerk)
  const [decision, setDecision] = useState<Action | null>(preset.decision)
  const [reason, setReason] = useState(preset.reason)
  const [adjusted, setAdjusted] = useState(preset.adjusted ?? '')
  const [callback, setCallback] = useState(false)
  const [touched, setTouched] = useState(false)
  const resolve = useResolve(c.id)
  const check = validateResolve({ decision, reason, adjusted, blocking: c.blocking, callbackVerified: callback })
  const agent = c.recommendation?.action

  const submit = () => {
    setTouched(true)
    if (!check.ok || !check.body) return
    resolve.mutate(
      { ...check.body, resolved_by: clerk },
      {
        onSuccess: onDone,
        onError: (e) => toast.error('Decision not filed', { description: e.message }),
      },
    )
  }
  useHotkeys('mod+enter', submit, { enableOnFormTags: true }, [check, clerk])
  useHotkeys('escape', onCancel, { enableOnFormTags: true })

  return (
    <form
      className="animate-rise space-y-4 border-t border-rule px-5 py-5"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[11px] font-semibold tracking-[0.12em] uppercase">Your decision</div>
        <div className="text-xs text-muted-foreground">Signed as {clerk}</div>
      </div>

      <div role="radiogroup" aria-label="Decision" className="grid grid-cols-5 gap-1">
        {ACTIONS.map((a) => {
          const Icon = ACTION_ICON[a]
          const on = decision === a
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setDecision(a)}
              className={cn(
                'press flex flex-col items-center justify-center gap-1 border px-1 py-2 text-[10px] leading-tight font-semibold tracking-[0.06em] uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                on ? TONE_SOLID[toneOf(a)] : cn('border-rule bg-background hover:border-foreground/40', TONE_TEXT[toneOf(a)]),
              )}
            >
              <Icon className="size-4" strokeWidth={2.25} aria-hidden />
              <span className="text-center">{ACTION_META[a].label}</span>
              {a === agent && <span className="text-[9px] font-normal tracking-normal normal-case opacity-80">Precedent’s pick</span>}
            </button>
          )
        })}
      </div>
      {decision && <p className="-mt-1 text-xs text-muted-foreground">{ACTION_META[decision].verb}.</p>}

      {decision === 'approve_adjusted' && (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium">Corrected amount to pay</span>
          <div className="flex items-center border border-input focus-within:border-foreground">
            <span className="px-3 text-muted-foreground">₹</span>
            <input
              inputMode="decimal"
              value={adjusted}
              onChange={(e) => setAdjusted(e.target.value)}
              placeholder={c.recommendation?.adjusted_amount ? String(c.recommendation.adjusted_amount) : 'e.g. 2,36,885'}
              className="h-10 min-w-0 flex-1 bg-transparent pr-3 tabular-nums outline-none"
            />
          </div>
          <span className="text-[11px] text-muted-foreground">Invoice total {inr(c.invoice_total)}</span>
          {touched && check.errors.adjusted && <span className="block text-xs text-reject">{check.errors.adjusted}</span>}
        </label>
      )}

      <label className="block space-y-1.5">
        <span className="text-xs font-medium">Why?</span>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Why? Precedent learns from this."
          className="resize-none font-serif text-[1rem] leading-relaxed"
        />
        <span className="block text-[11px] text-pretty text-muted-foreground">
          This reason becomes a precedent. Phone numbers, account numbers and PANs are removed before it’s stored.
        </span>
        {touched && check.errors.reason && <span className="block text-xs text-reject">{check.errors.reason}</span>}
      </label>

      {c.blocking && decision && ACTION_META[decision].paysMoney && (
        <label className="flex items-start gap-2.5 border border-reject/40 bg-reject-soft px-3 py-2.5 text-sm">
          <Checkbox checked={callback} onCheckedChange={(v) => setCallback(v === true)} className="mt-0.5" />
          <span className="text-pretty">
            A hard control fired. I verified the vendor’s bank details by callback on the registered number.
          </span>
        </label>
      )}
      {touched && check.errors.callback && <p className="text-xs text-reject">{check.errors.callback}</p>}
      {touched && check.errors.decision && <p className="text-xs text-reject">{check.errors.decision}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={resolve.isPending} className="press">
          <ShieldCheck /> {resolve.isPending ? 'Filing…' : 'File decision'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>↵</Kbd> to file
        </span>
      </div>
    </form>
  )
}
