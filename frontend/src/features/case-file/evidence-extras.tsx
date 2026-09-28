import { Check, Lock } from 'lucide-react'
import type { BankAccount, ExceptionDetail } from '@/api/types'
import { AgentMark, Mono, Section } from '@/components/precedent'
import { simDate, simTime } from '@/lib/format'
import { ACTION_META } from '@/lib/labels'
import { cn } from '@/lib/utils'

const same = (a: BankAccount, b: BankAccount) => a.account_number === b.account_number && a.ifsc === b.ifsc

function Account({ label, a, bad }: { label: string; a: BankAccount; bad?: boolean }) {
  return (
    <div className={cn('space-y-1 px-4 py-3', bad && 'bg-reject-soft')}>
      <div className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</div>
      <div className="text-sm font-medium">{a.bank_name}</div>
      <div className="flex gap-3 text-xs text-muted-foreground">
        <Mono className={cn(bad && 'text-reject')}>{a.account_number}</Mono>
        <Mono className={cn(bad && 'text-reject')}>{a.ifsc}</Mono>
      </div>
    </div>
  )
}

export function BankCheck({ c }: { c: ExceptionDetail }) {
  const ok = same(c.invoice.bank_account, c.vendor_bank_on_file)
  return (
    <Section
      title="Pay-to account"
      aside={
        ok ? (
          <span className="inline-flex items-center gap-1 text-approve">
            <Check className="size-3.5" strokeWidth={2.5} /> Matches vendor master
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-semibold text-reject">
            <Lock className="size-3.5" strokeWidth={2.5} /> Different account: payment blocked
          </span>
        )
      }
    >
      <div className="grid grid-cols-2 divide-x divide-rule border border-rule">
        <Account label="On the invoice" a={c.invoice.bank_account} bad={!ok} />
        <Account label="Vendor master" a={c.vendor_bank_on_file} />
      </div>
    </Section>
  )
}

export function AnomalyNote({ score }: { score: number | null | undefined }) {
  const label =
    score == null ? 'Not enough history yet' : score >= 0.9 ? 'Very unusual for this vendor' : score >= 0.6 ? 'Somewhat unusual' : 'Typical for this vendor'
  return (
    <Section title="Unusual?" aside="IsolationForest on this vendor’s invoices">
      <div className="space-y-2">
        <div className="relative h-2 border border-rule" aria-hidden>
          {score != null && (
            <span
              className={cn('absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45', score >= 0.9 ? 'bg-reject' : score >= 0.6 ? 'bg-hold' : 'bg-foreground')}
              style={{ left: `${Math.max(2, Math.min(98, score * 100))}%` }}
            />
          )}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className={cn(score != null && score >= 0.6 && 'font-medium text-foreground')}>{label}</span>
          {score != null && <span className="tabular-nums">{score.toFixed(2)}</span>}
        </div>
      </div>
    </Section>
  )
}

export function CaseTimeline({ c }: { c: ExceptionDetail }) {
  const rec = c.recommendation
  const res = c.resolution
  const steps: { at?: string; title: string; detail?: string; agent?: boolean; muted?: boolean }[] = [
    { at: c.created_at, title: 'Invoice received', detail: `3-way match found ${c.issues.length} issue${c.issues.length === 1 ? '' : 's'}` },
  ]
  if (rec)
    steps.push({
      at: rec.generated_at,
      title: `Opinion: ${ACTION_META[rec.action].label}`,
      detail: `${rec.provider} · ${(rec.latency_ms / 1000).toFixed(1)} s`,
      agent: true,
    })
  if (res)
    steps.push({
      at: res.resolved_at,
      title: c.status === 'auto_resolved' ? 'Resolved by Precedent' : `Decided by ${res.resolved_by}`,
      detail: ACTION_META[res.decision].label,
      agent: c.status === 'auto_resolved',
    })
  if (res && !res.revoked_at) steps.push({ title: 'Lesson filed to Hindsight', agent: true })
  if (res?.revoked_at) steps.push({ at: res.revoked_at, title: `Lesson revoked by ${res.revoked_by}`, detail: res.revoke_reason ?? undefined })
  if (c.status === 'open') steps.push({ title: 'Waiting for a decision', muted: true })

  return (
    <Section title="Timeline">
      <ol className="relative space-y-4 pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-rule">
        {steps.map((s, i) => (
          <li key={i} className={cn('relative text-sm', s.muted && 'text-muted-foreground')}>
            <span
              className={cn(
                'absolute top-1.5 -left-5 flex size-[7px] items-center justify-center',
                s.muted ? 'rounded-full border border-muted-foreground bg-background' : s.agent ? '' : 'rounded-full bg-foreground',
              )}
              aria-hidden
            >
              {s.agent && <AgentMark className="size-[9px]" />}
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium">{s.title}</span>
              {s.at && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {simDate(s.at)} · {simTime(s.at)}
                </span>
              )}
            </div>
            {s.detail && <div className="text-xs text-pretty text-muted-foreground">{s.detail}</div>}
          </li>
        ))}
      </ol>
    </Section>
  )
}
