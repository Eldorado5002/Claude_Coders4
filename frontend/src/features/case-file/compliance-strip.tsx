import { Check, Clock, Lock, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ExceptionDetail } from '@/api/types'
import { Mono } from '@/components/precedent'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { MSME_43BH_TIP, eInvoiceCheck, gstinCheck, msmeLine, type StatusTone } from './compliance'

type Tone = StatusTone | 'ok' | 'muted'

// colour only where it means something: warnings get the soft status fill, passes only a green tick
const ROW: Record<Tone, string> = {
  neutral: '',
  ok: '',
  muted: 'text-muted-foreground',
  hold: 'bg-hold-soft',
  reject: 'bg-reject-soft',
}
const ICON: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  ok: 'text-approve',
  muted: 'text-muted-foreground',
  hold: 'text-hold',
  reject: 'text-reject',
}

function Item({ tone, icon, label, children }: { tone: Tone; icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className={cn('flex min-w-0 items-start gap-3 px-3 py-1.5', ROW[tone])} data-tone={tone}>
      {/* same 16px icon column as the issue strip above, so the labels line up */}
      <span className={cn('flex w-4 shrink-0 justify-center pt-px [&_svg]:size-3.5', ICON[tone])}>{icon}</span>
      <span className="min-w-0 text-pretty">
        <span className="mr-1.5 text-[11px] font-semibold tracking-[0.1em] text-foreground uppercase">{label}</span>
        {children}
      </span>
    </li>
  )
}

const Sep = () => (
  <span aria-hidden className="mx-1 text-muted-foreground/60">
    ·
  </span>
)

function Msme({ c }: { c: ExceptionDetail }) {
  const m = c.compliance?.msme
  if (!m) return null
  const l = msmeLine(m, { decided: c.status !== 'open' })
  return (
    <Item tone={l.tone} icon={<Clock strokeWidth={2.25} aria-hidden />} label="MSME">
      {l.category}
      <Sep />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'cursor-help text-left underline decoration-current/35 decoration-dotted underline-offset-[3px] outline-none focus-visible:decoration-solid',
              l.tone === 'reject' && 'text-reject',
            )}
          >
            {l.strong && <span className="font-semibold">{l.strong}</span>}
            {l.rest}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="flex-col items-start gap-1 text-pretty">
          <span>{MSME_43BH_TIP}</span>
          <span className="opacity-70">{l.detail}</span>
        </TooltipContent>
      </Tooltip>
      {l.tax && (
        <>
          <Sep />
          <span className="tabular-nums">{l.tax}</span>
        </>
      )}
      {l.udyam && (
        <>
          <Sep />
          <Mono className="text-muted-foreground">{l.udyam}</Mono>
        </>
      )}
    </Item>
  )
}

function EInvoice({ c }: { c: ExceptionDetail }) {
  const e = eInvoiceCheck(c.compliance?.e_invoice, c.invoice.irn)
  if (e.status === 'not_required') return null
  if (e.status === 'missing')
    return (
      <Item tone="reject" icon={<Lock strokeWidth={2.5} aria-label="Hard control" />} label="E-invoice">
        <span className="font-medium text-reject">IRN missing: not a valid tax invoice</span>
      </Item>
    )
  return (
    <Item tone="ok" icon={<Check strokeWidth={2.5} aria-label="Present" />} label="E-invoice">
      IRN
      {e.irn && (
        <Mono className="ml-1.5 text-muted-foreground">
          <span title={c.invoice.irn ?? undefined}>{e.irn}</span>
        </Mono>
      )}
    </Item>
  )
}

function Gstin({ c }: { c: ExceptionDetail }) {
  const g = gstinCheck(c.invoice.supplier_gstin, c.vendor.gstin)
  if (g.status === 'missing')
    return (
      <Item tone="muted" icon={<Minus strokeWidth={2.25} aria-hidden />} label="GSTIN">
        not printed
        <Sep />
        master <Mono>{g.master}</Mono>
      </Item>
    )
  if (g.status === 'mismatch')
    return (
      <Item tone="reject" icon={<Lock strokeWidth={2.5} aria-label="Hard control" />} label="GSTIN">
        <span className="font-medium text-reject">
          on invoice <Mono>{g.onInvoice}</Mono> ≠ master <Mono>{g.master}</Mono>
        </span>
      </Item>
    )
  return (
    <Item tone="ok" icon={<Check strokeWidth={2.5} aria-label="Matches" />} label="GSTIN">
      on invoice matches master
      <Mono className="ml-1.5 text-muted-foreground">{g.master}</Mono>
    </Item>
  )
}

/** India compliance under the issue strip: MSME 43B(h) deadline, e-invoice IRN, GSTIN against the master. */
export function ComplianceStrip({ c }: { c: ExceptionDetail }) {
  return (
    <ul aria-label="Compliance checks" className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
      <Msme c={c} />
      <EInvoice c={c} />
      <Gstin c={c} />
    </ul>
  )
}
