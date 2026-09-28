import { AlertTriangle, Lock } from 'lucide-react'
import { Link } from 'react-router'
import type { ExceptionDetail } from '@/api/types'
import { CaseId, Eyebrow, Money, Mono, TrustDots } from '@/components/precedent'
import { inr, simDate } from '@/lib/format'
import { TYPE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { ComplianceStrip } from './compliance-strip'

const STATUS_LABEL = { open: 'Awaiting decision', auto_resolved: 'Auto-resolved', resolved: 'Resolved' } as const

export function CaseHeader({ c }: { c: ExceptionDetail }) {
  return (
    <header className="space-y-5 border-b border-rule pb-5">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <CaseId id={c.id} />
            <span className="text-muted-foreground">·</span>
            <span className={cn('font-medium', c.status === 'open' ? 'text-foreground' : 'text-muted-foreground')}>
              {STATUS_LABEL[c.status]}
            </span>
          </div>
          <h1 className="serif-display text-[2rem] leading-[1.1] text-balance">
            <Link to={`/vendors/${c.vendor.id}`} className="decoration-rule underline-offset-4 hover:underline">
              {c.vendor.name}
            </Link>
            <span className="text-muted-foreground"> — {TYPE_LABEL[c.primary_type]}</span>
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>
              Invoice <Mono className="text-foreground">{c.invoice_number}</Mono>
            </span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{inr(c.invoice_total)}</span>
            <span aria-hidden>·</span>
            <span>received {simDate(c.created_at)}</span>
            {c.purchase_order && (
              <>
                <span aria-hidden>·</span>
                <Mono>{c.purchase_order.po_number}</Mono>
              </>
            )}
            {c.goods_receipt && (
              <>
                <span aria-hidden>·</span>
                <Mono>{c.goods_receipt.grn_number}</Mono>
              </>
            )}
          </p>
        </div>
        <div className="flex items-start gap-8">
          <div className="text-right">
            <Eyebrow>At risk</Eyebrow>
            <Money value={c.amount_at_risk} className="serif-display text-[1.9rem] leading-tight" />
          </div>
          <div className="min-w-[9rem] space-y-1.5 border-l border-rule pl-6">
            <Eyebrow>Trust · {TYPE_LABEL[c.autonomy.exception_type]}</Eyebrow>
            <TrustDots level={c.autonomy.level} streak={c.autonomy.streak} required={c.autonomy.required_streak} />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <ul className="space-y-1.5" aria-label="Issues found by the 3-way match">
          {c.issues.map((i, n) => (
            <li
              key={n}
              className={cn(
                'flex items-start gap-3 px-3 py-2 text-sm',
                i.blocking ? 'bg-foreground text-background' : 'bg-hold-soft',
              )}
            >
              {i.blocking ? (
                <Lock className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} aria-label="Hard control" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-hold" strokeWidth={2.25} aria-hidden />
              )}
              <span className="min-w-0 flex-1 text-pretty">
                <span className="mr-2 text-[11px] font-semibold tracking-[0.1em] uppercase">{TYPE_LABEL[i.type]}</span>
                {i.message}
              </span>
              {i.variance_amount != null && !i.blocking && (
                <span className="shrink-0 text-xs font-medium tabular-nums">
                  {inr(i.variance_amount)}
                  {i.variance_pct != null && <span className="text-muted-foreground"> · {i.variance_pct.toFixed(1)}%</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
        <ComplianceStrip c={c} />
      </div>
    </header>
  )
}
