import { Ban, Check, EyeOff, X } from 'lucide-react'
import type { ExceptionDetail, ResolveResult } from '@/api/types'
import { AgentMark, AutoSeal, DecisionChip, Eyebrow, Money, RedactedText, TrustDots } from '@/components/precedent'
import { simDate, simTime } from '@/lib/format'
import { ACTION_META, TYPE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'

/** What the human (or the agent, under autonomy) decided, and whether it agreed. */
export function ResolutionCard({ c }: { c: ExceptionDetail }) {
  const res = c.resolution
  if (!res) return null
  const auto = c.status === 'auto_resolved'
  const revoked = !!res.revoked_at
  const reason = auto ? res.reason.replace(/^Auto-resolved under earned autonomy\.\s*/, '') : res.reason
  return (
    <div className="space-y-3 border-t border-rule px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow className="flex items-center gap-1.5">{auto ? <><AgentMark /> Resolved under earned autonomy</> : 'Resolution'}</Eyebrow>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {res.resolved_by} · {simDate(res.resolved_at)}, {simTime(res.resolved_at)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {auto && <AutoSeal />}
        <DecisionChip action={res.decision} size="sm" />
        {!auto && res.agreed_with_agent === true && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5" /> Agreed with Precedent
          </span>
        )}
        {!auto && res.agreed_with_agent === false && res.agent_action && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <X className="size-3.5" /> Overruled Precedent (it said {ACTION_META[res.agent_action].label.toLowerCase()})
          </span>
        )}
      </div>
      {res.adjusted_amount != null && (
        <p className="text-sm">
          Paid <Money value={res.adjusted_amount} className="font-semibold" /> instead of <Money value={c.invoice_total} />
        </p>
      )}
      <blockquote
        className={cn(
          'border-l-2 border-foreground pl-3 font-serif text-[1.05rem] leading-relaxed text-pretty',
          revoked && 'text-muted-foreground line-through decoration-reject/70',
        )}
      >
        “<RedactedText text={reason} />”
      </blockquote>
      {!!res.redacted?.length && (
        <span className="inline-flex items-center gap-1.5 bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          <EyeOff className="size-3" /> PII redacted: {(res.redacted ?? []).join(', ').replace(/_/g, ' ')}
        </span>
      )}
      {revoked ? (
        <p className="flex items-start gap-2 text-sm text-reject">
          <Ban className="mt-0.5 size-4 shrink-0" />
          <span>
            Lesson revoked by {res.revoked_by}
            {res.revoke_reason && <>: “{res.revoke_reason}”</>}. Precedent no longer uses it.
          </span>
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AgentMark /> On file in Hindsight as a precedent for {c.vendor.name} · {TYPE_LABEL[c.primary_type]}
        </p>
      )}
    </div>
  )
}

/** Right after a decision: what the agent learned, and what it did to trust. */
export function LessonCard({ result }: { result: ResolveResult }) {
  const a = result.autonomy
  return (
    <div className="animate-rise space-y-3 border-t border-foreground bg-muted/50 px-5 py-4">
      <Eyebrow className="flex items-center gap-1.5 text-foreground">
        <AgentMark /> Lesson filed to memory
      </Eyebrow>
      <p className="font-serif text-[1.05rem] leading-relaxed text-pretty">
        <RedactedText text={result.lesson} />
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {result.promoted ? (
          <>
            <AutoSeal animate size="lg" />
            <p className="text-sm text-pretty">
              Earned autonomy. Precedent will now resolve {a.vendor_name} · {TYPE_LABEL[a.exception_type]} on its own,
              inside amounts your team has already approved.
            </p>
          </>
        ) : result.demoted ? (
          <p className="text-sm">Overruled, so trust resets: back to suggesting for {TYPE_LABEL[a.exception_type]}.</p>
        ) : (
          <TrustDots level={a.level} streak={a.streak} required={a.required_streak} />
        )}
      </div>
    </div>
  )
}
