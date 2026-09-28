import { AlertCircle, FileWarning, RotateCcw, WifiOff } from 'lucide-react'
import { AgentMark, Mono, Section } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ErrorView } from './capture-logic'

const STEPS = [
  { title: 'Gemini reads the invoice', body: 'Vendor and GSTIN, every line, GST and the pay-to account.', agent: false },
  { title: 'The 3-way match runs', body: 'Line by line against the purchase order and the goods receipt.', agent: false },
  {
    title: 'Precedent opens a case if anything is off',
    body: 'With an opinion grounded in how your team settled similar cases before.',
    agent: true,
  },
]

/** Idle right-hand column on desktop: what will happen to the invoice. */
export function WhatHappens({ className }: { className?: string }) {
  return (
    <Section title="What happens next" className={className}>
      <ol className="divide-y divide-rule">
        {STEPS.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-4">
            <span className="pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-serif text-lg leading-snug">
                {s.agent && <AgentMark />}
                {s.title}
              </p>
              <p className="text-sm text-pretty text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/** The API refused or failed; say what, and offer the right next step. */
export function CaptureErrorPanel({
  view,
  unreachable,
  onRetry,
  onReset,
}: {
  view: ErrorView
  unreachable: boolean
  onRetry: () => void
  onReset: () => void
}) {
  const Icon = unreachable ? WifiOff : FileWarning
  return (
    <div role="alert" className="animate-rise space-y-4 border border-rule bg-card px-5 py-5">
      <div className="flex items-start gap-3">
        <Icon className="mt-1 size-5 shrink-0 text-reject" strokeWidth={2} aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-serif text-[1.3rem] leading-snug text-pretty">{view.message}</p>
          {view.hint && <p className="text-sm text-pretty text-muted-foreground">{view.hint}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {view.retry && (
          <Button onClick={onRetry} className="h-12 w-full sm:h-10 sm:w-auto">
            <RotateCcw data-icon="inline-start" /> Try again
          </Button>
        )}
        <Button variant={view.retry ? 'outline' : 'default'} onClick={onReset} className="h-12 w-full sm:h-10 sm:w-auto">
          Choose another file
        </Button>
      </div>
    </div>
  )
}

/** A file the browser-side checks refused before anything was sent. */
export function RejectionNotice({ name, reasons, className }: { name: string | null; reasons: string[]; className?: string }) {
  return (
    <div role="alert" className={cn('flex items-start gap-2.5 border-l-2 border-reject bg-reject-soft px-3 py-2.5 text-sm', className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-reject" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {name && <Mono className="block truncate text-xs text-muted-foreground">{name}</Mono>}
        <p className="text-pretty">{reasons.join(' ')}</p>
      </div>
    </div>
  )
}
