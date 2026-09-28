import type { ReactNode } from 'react'
import type { VendorProfile } from '@/api/types'
import { AgentMark, Eyebrow, Mono } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { pct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'
import type { Phase } from './vendor-sections'
import { categoryLabel } from './vendors-view'

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function Figure({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="min-w-0 space-y-1.5 sm:border-l sm:border-rule sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{label}</dt>
      <dd className={cn('serif-display text-[1.75rem] leading-none tabular-nums', muted && 'text-muted-foreground')}>{value}</dd>
    </div>
  )
}

/** Who the vendor is and what we hold on file. Renders from the index cache before the profile arrives. */
export function VendorHeader({ v, phase }: { v: VendorProfile; phase: Phase }) {
  const bank = v.bank_account
  return (
    <header className="space-y-6 border-b border-rule pb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 space-y-2">
          <Eyebrow className="flex items-center gap-2">
            Vendor <span aria-hidden>·</span> <Mono className="tracking-normal normal-case">{v.id}</Mono>
          </Eyebrow>
          <h1 className="serif-display text-[2.4rem] leading-[1.05] font-medium text-balance">{v.name}</h1>
          <p className="text-sm text-muted-foreground">
            {v.city}, {v.state} <span aria-hidden>·</span> {categoryLabel(v.category)}
          </p>
        </div>
        <Button variant="outline" onClick={() => useUi.getState().openAsk({ vendorId: v.id })}>
          <AgentMark /> Ask about this vendor
        </Button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-10">
          <Fact label="GSTIN">
            <Mono>{v.gstin}</Mono>
          </Fact>
          <Fact label="Payment terms">
            <span className="tabular-nums">{v.payment_terms_days} days</span>
          </Fact>
          <Fact label="Bank on file" className="col-span-2 sm:col-span-1">
            {phase === 'loading' ? (
              <Skeleton className="mt-1 h-4 w-60" />
            ) : phase === 'unavailable' ? (
              <span className="text-muted-foreground">Not available right now</span>
            ) : bank.bank_name ? (
              <span className="flex flex-wrap items-baseline gap-x-2">
                {bank.bank_name}
                <Mono>{bank.account_number}</Mono>
                <span className="text-muted-foreground">
                  IFSC <Mono className="text-foreground">{bank.ifsc}</Mono>
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Not on file</span>
            )}
          </Fact>
        </dl>
        <dl className="grid grid-cols-4 gap-x-4 max-sm:w-full max-sm:grid-cols-2 max-sm:gap-y-4">
          <Figure label="Invoices" value={v.invoices_count} />
          <Figure label="Exceptions" value={v.exceptions_count} />
          <Figure label="Open" value={v.open_exceptions} muted={v.open_exceptions === 0} />
          <Figure label="Touchless" value={pct(v.touchless_rate)} muted={v.touchless_rate == null} />
        </dl>
      </div>
    </header>
  )
}
