import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { VendorProfile } from '@/api/types'
import { AgentMark, Eyebrow, Mono } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { pct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'
import { useCanHover } from './use-can-hover'
import type { Phase } from './vendor-sections'
import { benfordLine, categoryLabel, msmeLabel, profileRisk, RISK_TEXT, riskReason, type ProfileRisk } from './vendors-view'

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

const FIGURE_CELL = 'min-w-0 space-y-1.5 sm:border-l sm:border-rule sm:pl-4 sm:first:border-l-0 sm:first:pl-0'
const FIGURE_LABEL = 'text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase'

function Figure({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className={FIGURE_CELL}>
      <dt className={FIGURE_LABEL}>{label}</dt>
      <dd className={cn('serif-display text-[1.75rem] leading-none tabular-nums', muted && 'text-muted-foreground')}>{value}</dd>
    </div>
  )
}

/** What's behind the score: the backend's reasons, the first-digit test, and a way to the full ranking. */
function RiskSignals({ risk, id }: { risk: ProfileRisk; id?: string }) {
  const benford = benfordLine(risk.benford)
  return (
    <div id={id} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
        <Eyebrow>Risk signals</Eyebrow>
        <span className={cn('text-xs font-semibold tabular-nums', RISK_TEXT[risk.tone])}>
          {risk.score} / 100 · {risk.label}
        </span>
      </div>
      {risk.reasons.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {risk.reasons.map((r) => (
            <li key={r} className="flex gap-2 text-pretty">
              <span className="text-muted-foreground" aria-hidden>
                –
              </span>
              <span>{riskReason(r)}</span>
            </li>
          ))}
        </ul>
      )}
      {benford && <p className="text-xs text-pretty text-muted-foreground">{benford}</p>}
      <Link to="/risk" className="inline-block text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        All vendors by risk →
      </Link>
    </div>
  )
}

/** "58 HIGH": the score and its word, in the level's tone (low stays muted). */
function RiskValue({ risk, interactive }: { risk: ProfileRisk; interactive?: boolean }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5', RISK_TEXT[risk.tone])}>
      <span className="serif-display text-[1.75rem] leading-none tabular-nums">{risk.score}</span>{' '}
      <span
        className={cn(
          'text-[11px] font-semibold tracking-[0.1em] uppercase',
          interactive && 'underline decoration-current/50 decoration-dotted underline-offset-[3px]',
        )}
      >
        {risk.label}
      </span>
    </span>
  )
}

function RiskFigure({ risk }: { risk: ProfileRisk }) {
  const canHover = useCanHover()
  const describedBy = useId()
  // While the profile loads we only have the index row's score: nothing to explain yet.
  const explained = risk.reasons.length > 0 || risk.benford != null

  const trigger = (
    <button
      type="button"
      className="-m-1 cursor-help rounded-sm p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      aria-describedby={canHover ? describedBy : undefined}
    >
      <RiskValue risk={risk} interactive />
      <span className="sr-only"> risk. Show the signals behind it.</span>
    </button>
  )

  return (
    <div className={FIGURE_CELL}>
      <dt className={FIGURE_LABEL}>Risk</dt>
      <dd>
        {!explained ? (
          <RiskValue risk={risk} />
        ) : canHover ? (
          <>
            <HoverCard openDelay={120} closeDelay={80}>
              <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
              <HoverCardContent align="end" className="w-80">
                <RiskSignals risk={risk} />
              </HoverCardContent>
            </HoverCard>
            {/* the hover card isn't announced; screen readers get the same signals as a description */}
            <span id={describedBy} className="sr-only">
              {risk.reasons.map(riskReason).join('. ')}
            </span>
          </>
        ) : (
          <Popover>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
              <RiskSignals risk={risk} />
            </PopoverContent>
          </Popover>
        )}
      </dd>
    </div>
  )
}

/** Who the vendor is and what we hold on file. Renders from the index cache before the profile arrives. */
export function VendorHeader({ v, phase }: { v: VendorProfile; phase: Phase }) {
  const bank = v.bank_account
  const risk = profileRisk(v)
  const msme = msmeLabel(v.msme_category)
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
          {(msme || v.udyam) && (
            <Fact label="MSME">
              <span className="flex flex-wrap items-baseline gap-x-2">
                {msme ?? 'Registered'}
                {v.udyam && <Mono className="text-muted-foreground">{v.udyam}</Mono>}
              </span>
            </Fact>
          )}
          {v.e_invoice_required && <Fact label="E-invoicing">Required</Fact>}
        </dl>
        <dl
          className={cn(
            'grid gap-x-4 max-sm:w-full max-sm:gap-y-4',
            risk ? 'grid-cols-5 max-sm:grid-cols-3' : 'grid-cols-4 max-sm:grid-cols-2',
          )}
        >
          <Figure label="Invoices" value={v.invoices_count} />
          <Figure label="Exceptions" value={v.exceptions_count} />
          <Figure label="Open" value={v.open_exceptions} muted={v.open_exceptions === 0} />
          <Figure label="Touchless" value={pct(v.touchless_rate)} muted={v.touchless_rate == null} />
          {risk && <RiskFigure risk={risk} />}
        </dl>
      </div>
    </header>
  )
}
