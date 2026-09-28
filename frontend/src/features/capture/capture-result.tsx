import { ArrowRight, Check, Pause, RotateCcw, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { CaptureResult, InvoiceDoc, VendorRef } from '@/api/types'
import { AgentMark, Eyebrow, Money, Mono, Section, TONE_SOFT, TONE_TEXT } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { simDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { captureOutcome, qtyText, rupees, type Outcome, type OutcomeTone } from './capture-logic'

const TONE_ICON: Record<OutcomeTone, LucideIcon> = { approve: Check, hold: Pause, reject: X }

function OutcomeBanner({ o }: { o: Outcome }) {
  const Icon = TONE_ICON[o.tone]
  return (
    <div className={cn('flex flex-col gap-4 border px-5 py-4 sm:flex-row sm:items-center', TONE_SOFT[o.tone])}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className="mt-1 size-5 shrink-0" strokeWidth={2.5} aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-serif text-[1.35rem] leading-snug text-balance text-foreground">
            {o.caseId ? (
              <>
                Opened <Mono className="text-[0.8em] tracking-normal">{o.caseId}</Mono>
              </>
            ) : (
              o.title
            )}
          </p>
          <p className="text-sm text-pretty text-muted-foreground">
            {o.tone === 'hold' && <AgentMark className="mr-1.5 text-foreground" />}
            {o.body}
          </p>
        </div>
      </div>
      {o.caseId && (
        <Button asChild className="h-12 w-full sm:h-10 sm:w-auto">
          <Link to={`/exceptions/${o.caseId}`}>
            Open case <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      )}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</dt>
      <dd className="truncate text-sm">{children}</dd>
    </div>
  )
}

function VendorRow({ vendor }: { vendor: VendorRef | null }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 py-4">
      <div className="min-w-0 space-y-1">
        <Eyebrow>Vendor</Eyebrow>
        {vendor ? (
          <>
            <Link
              to={`/vendors/${vendor.id}`}
              className="block font-serif text-xl leading-tight text-balance decoration-rule underline-offset-4 hover:underline"
            >
              {vendor.name}
            </Link>
            <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>
                GSTIN <Mono className="text-foreground">{vendor.gstin}</Mono>
              </span>
              <span aria-hidden>·</span>
              <span>{vendor.city}</span>
            </p>
          </>
        ) : (
          <p className="font-serif text-xl leading-tight text-muted-foreground">Not a vendor we know</p>
        )}
      </div>
      {vendor ? (
        <span className={cn('inline-flex items-center gap-1 text-xs font-medium', TONE_TEXT.approve)}>
          <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> Matched to vendor master
        </span>
      ) : (
        <span className={cn('inline-flex items-center gap-1 text-xs font-medium', TONE_TEXT.reject)}>
          <X className="size-3.5" strokeWidth={2.5} aria-hidden /> No match by GSTIN or name
        </span>
      )}
    </div>
  )
}

function LinesTable({ lines }: { lines: InvoiceDoc['lines'] }) {
  const th = 'pb-2 text-right text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase'
  return (
    <table className="w-full border-collapse text-[13px]">
      <caption className="sr-only">Invoice lines</caption>
      <thead>
        <tr className="border-b border-rule">
          <th scope="col" className={cn(th, 'pl-5 text-left')}>
            Line
          </th>
          <th scope="col" className={cn(th, 'hidden px-2 sm:table-cell')}>
            Qty
          </th>
          <th scope="col" className={cn(th, 'hidden px-2 sm:table-cell')}>
            Rate
          </th>
          <th scope="col" className={cn(th, 'hidden px-2 sm:table-cell')}>
            GST
          </th>
          <th scope="col" className={cn(th, 'pr-5 pl-2')}>
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 && (
          <tr>
            <td colSpan={5} className="px-5 py-4 text-sm text-muted-foreground">
              No line items could be read from this invoice.
            </td>
          </tr>
        )}
        {lines.map((l) => (
          <tr key={l.line_no} className="border-b border-rule last:border-b-0">
            <td className="py-2.5 pr-2 pl-5 align-top">
              <div className="font-medium text-pretty">{l.description}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground tabular-nums">
                {l.hsn && <span>HSN {l.hsn}</span>}
                <span className="sm:hidden">
                  {qtyText(l.qty, l.uom)} × {rupees(l.unit_price)} · GST {l.tax_rate}%
                </span>
              </div>
            </td>
            <td className="hidden px-2 py-2.5 text-right align-top whitespace-nowrap tabular-nums sm:table-cell">
              {qtyText(l.qty, l.uom)}
            </td>
            <td className="hidden px-2 py-2.5 text-right align-top whitespace-nowrap tabular-nums sm:table-cell">
              {rupees(l.unit_price)}
            </td>
            <td className="hidden px-2 py-2.5 text-right align-top whitespace-nowrap tabular-nums sm:table-cell">
              {l.tax_rate}%
            </td>
            <td className="py-2.5 pr-5 pl-2 text-right align-top font-medium whitespace-nowrap tabular-nums">
              {rupees(l.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Everything Gemini read off the page, laid out like the ledger would file it. */
function InvoiceCard({ inv, vendor }: { inv: InvoiceDoc; vendor: VendorRef | null }) {
  const bank = inv.bank_account
  return (
    <Section
      title="Extracted invoice"
      aside={
        <span className="inline-flex items-center gap-1.5">
          <AgentMark /> Read by Precedent
        </span>
      }
    >
      <div className="divide-y divide-rule border border-rule bg-card">
        <VendorRow vendor={vendor} />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-4">
          <Fact label="Invoice">
            <Mono>{inv.invoice_number}</Mono>
          </Fact>
          <Fact label="Dated">{simDate(inv.invoice_date)}</Fact>
          <Fact label="Due">{simDate(inv.due_date)}</Fact>
          <Fact label="Purchase order">
            {inv.po_number ? <Mono>{inv.po_number}</Mono> : <span className="text-muted-foreground">No PO</span>}
          </Fact>
        </dl>
        <div className="pt-3">
          <LinesTable lines={inv.lines} />
        </div>
        <div className="space-y-1.5 px-5 py-4">
          <div className="flex justify-between gap-4 text-sm text-muted-foreground">
            <span>Subtotal</span>
            <Money value={inv.subtotal} />
          </div>
          <div className="flex justify-between gap-4 text-sm text-muted-foreground">
            <span>GST</span>
            <Money value={inv.tax_total} />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-rule pt-3">
            <Eyebrow>Total</Eyebrow>
            <Money value={inv.total} className="serif-display text-[2rem] leading-none" />
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 px-5 py-4">
          <Eyebrow>Pay to</Eyebrow>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="font-medium">{bank.bank_name || 'Bank not printed'}</span>
            <Mono>{bank.account_number || '—'}</Mono>
            <Mono className="text-muted-foreground">{bank.ifsc || '—'}</Mono>
          </div>
        </div>
      </div>
    </Section>
  )
}

export function CaptureResultView({ result, onReset }: { result: CaptureResult; onReset: () => void }) {
  const o = captureOutcome(result)
  return (
    <div className="animate-rise space-y-8">
      <OutcomeBanner o={o} />
      <InvoiceCard inv={result.extracted} vendor={result.vendor ?? null} />
      <Button variant="outline" onClick={onReset} className="h-12 w-full md:h-10 md:w-auto">
        <RotateCcw data-icon="inline-start" /> Capture another
      </Button>
    </div>
  )
}
