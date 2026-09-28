import { FileQuestion } from 'lucide-react'
import type { ExceptionDetail, LineItem } from '@/api/types'
import { Mono, Section } from '@/components/precedent'
import { inr } from '@/lib/format'

/** ₹56,500 (whole rupees) or ₹3,850.50 */
const rs = (n: number) => (Number.isInteger(n) ? `₹${n.toLocaleString('en-IN')}` : inr(n))
import { joinThreeWay, type ThreeWayRow } from '@/lib/three-way'
import { cn } from '@/lib/utils'

const qtyFmt = (q: number, uom: string) => `${Number.isInteger(q) ? q : q.toFixed(2).replace(/0+$/, '')} ${uom}`

function Cell({ children, flag, className }: { children: React.ReactNode; flag?: boolean; className?: string }) {
  return (
    <td
      className={cn(
        'px-2 py-2.5 text-right align-top whitespace-nowrap tabular-nums',
        flag && 'font-semibold text-hold underline decoration-hold/60 decoration-1 underline-offset-4',
        className,
      )}
    >
      {children}
    </td>
  )
}

function Flag({ on, children }: { on: boolean; children: React.ReactNode }) {
  return on ? <span className="font-semibold text-hold underline decoration-hold/60 underline-offset-4">{children}</span> : <>{children}</>
}

function Row({ r, hasPo }: { r: ThreeWayRow; hasPo: boolean }) {
  const inv = r.invoice
  const po = r.po
  const flagged = r.issueTypes.length > 0 || r.flags.offPo
  return (
    <tr
      className={cn(
        'group border-b border-rule transition-colors hover:bg-accent/70',
        flagged && 'bg-hold-soft/60',
        !inv && 'text-muted-foreground',
      )}
    >
      <td className="relative py-2.5 pr-3 pl-4 align-top">
        {flagged && <span className="absolute inset-y-0 left-0 w-[3px] bg-hold" aria-hidden />}
        <div className="max-w-[14rem] truncate font-medium" title={r.description}>{r.description}</div>
        <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
          {r.sku && <Mono>{r.sku}</Mono>}
          {(inv?.hsn || po?.hsn) && <span>HSN {inv?.hsn ?? po?.hsn}</span>}
          {!inv && <span>ordered, not billed</span>}
        </div>
      </td>
      {/* invoice */}
      <Cell flag={r.flags.qty} className="border-l border-rule">
        {inv ? qtyFmt(inv.qty, inv.uom) : '—'}
      </Cell>
      <Cell>
        {inv ? (
          <>
            <Flag on={r.flags.price}>{rs(inv.unit_price)}</Flag>
            <span className="text-muted-foreground"> · </span>
            <Flag on={r.flags.tax}>{inv.tax_rate}%</Flag>
          </>
        ) : (
          '—'
        )}
      </Cell>
      <Cell className="font-medium">{inv ? rs(inv.amount) : '—'}</Cell>
      {/* PO + GRN */}
      {hasPo &&
        (r.flags.offPo ? (
          <td colSpan={3} className="hatch border-l border-rule px-2 py-2.5 text-center text-[11px] font-semibold tracking-[0.08em] uppercase">
            Not on the purchase order
          </td>
        ) : (
          <>
            <Cell className="border-l border-rule">{po ? qtyFmt(po.qty, po.uom) : '—'}</Cell>
            <Cell>{po ? `${rs(po.unit_price)} · ${po.tax_rate}%` : '—'}</Cell>
            <Cell flag={r.flags.qty} className="border-l border-rule">
              {r.grn ? qtyFmt(r.grn.qty_received, r.grn.uom) : po ? '0' : '—'}
            </Cell>
          </>
        ))}
    </tr>
  )
}

const sum = (lines: LineItem[] | undefined) => (lines ?? []).reduce((a, l) => a + l.amount, 0)

export function ThreeWayTable({ c }: { c: ExceptionDetail }) {
  const { rows, hasPo } = joinThreeWay(c.invoice, c.purchase_order, c.goods_receipt, c.issues)
  const po = c.purchase_order
  const delta = po ? c.invoice.total - po.total : null
  const th = 'px-2 pb-2 text-right text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase'
  return (
    <Section
      title="3-way match"
      aside={
        hasPo ? (
          <>
            Invoice vs <Mono>{po?.po_number}</Mono> vs <Mono>{c.goods_receipt?.grn_number ?? 'no GRN'}</Mono>
          </>
        ) : (
          'No purchase order referenced'
        )
      }
    >
      {!hasPo && (
        <div className="flex items-start gap-3 border border-dashed border-rule px-4 py-3 text-sm text-muted-foreground">
          <FileQuestion className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-pretty">
            This bill came without a purchase order, so there is nothing to match it against. Teams usually allow this
            for utilities and small spend under an agreed limit.
          </p>
        </div>
      )}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-rule">
              <th className="pb-2 pl-4 text-left text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase" rowSpan={2}>
                Line
              </th>
              <th colSpan={3} className="border-l border-rule px-2 pt-0 pb-1 text-center text-[11px] font-semibold tracking-[0.1em] uppercase">
                Invoice
              </th>
              {hasPo && (
                <>
                  <th colSpan={2} className="border-l border-rule px-2 pb-1 text-center text-[11px] font-semibold tracking-[0.1em] uppercase">
                    Purchase order
                  </th>
                  <th className="border-l border-rule px-3 pb-1 text-center text-[11px] font-semibold tracking-[0.1em] uppercase">GRN</th>
                </>
              )}
            </tr>
            <tr className="border-b border-rule">
              <th className={cn(th, 'border-l border-rule')}>Qty</th>
              <th className={th}>Rate · GST</th>
              <th className={th}>Amount</th>
              {hasPo && (
                <>
                  <th className={cn(th, 'border-l border-rule')}>Qty</th>
                  <th className={th}>Rate · GST</th>
                  <th className={cn(th, 'border-l border-rule')}>Received</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.key} r={r} hasPo={hasPo} />
            ))}
          </tbody>
          <tfoot className="text-[12px]">
            <tr>
              <td className="pt-3 pl-4 text-muted-foreground">Totals incl. GST</td>
              <td colSpan={3} className="border-l border-rule px-2 pt-3 text-right tabular-nums">
                <span className="font-semibold" title={`Subtotal ${inr(sum(c.invoice.lines))} + GST ${inr(c.invoice.tax_total)}`}>
                  {inr(c.invoice.total)}
                </span>
              </td>
              {hasPo && po && (
                <td colSpan={3} className="border-l border-rule px-2 pt-3 text-right tabular-nums">
                  PO {inr(po.total)}
                  {delta != null && Math.abs(delta) > 0.005 && (
                    <span className="ml-2 font-semibold text-hold">Δ {delta > 0 ? '+' : ''}{inr(delta)}</span>
                  )}
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  )
}
