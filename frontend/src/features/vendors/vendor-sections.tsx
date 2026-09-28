import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Link } from 'react-router'
import { lessonsQ } from '@/api/queries'
import type { AutonomyState, Citation, ExceptionSummary } from '@/api/types'
import {
  AgentMark,
  AutoSeal,
  CaseId,
  DecisionChip,
  KindBadge,
  Markdown,
  Money,
  RedactedText,
  Section,
  TrustDots,
  TypeChip,
} from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { simDay, simRelative } from '@/lib/format'
import { isPendingContent } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { lessonReason, sortLanes } from './vendors-view'

/** loading: the Hindsight call is in flight · unavailable: it failed, the header came from the index cache */
export type Phase = 'loading' | 'ready' | 'unavailable'

/** A section-sized empty or unavailable note: quieter than a page EmptyState. */
function Quiet({ children }: { children: ReactNode }) {
  return <p className="border border-dashed border-rule px-4 py-3 text-sm text-pretty text-muted-foreground">{children}</p>
}

function Lines({ n = 3, tall }: { n?: number; tall?: boolean }) {
  return (
    <div className="space-y-5 pt-1" aria-busy>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className={cn('w-full', tall ? 'h-12' : 'h-4')} />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  )
}

const UNAVAILABLE = 'Not available while the profile can’t be loaded.'

export function Learned({ items, phase }: { items: Citation[]; phase: Phase }) {
  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <AgentMark /> What Precedent has learned
        </span>
      }
      aside={phase === 'ready' && items.length > 0 ? `${items.length} from Hindsight memory` : undefined}
    >
      {phase === 'loading' ? (
        <Lines />
      ) : phase === 'unavailable' ? (
        <Quiet>{UNAVAILABLE}</Quiet>
      ) : items.length === 0 ? (
        <Quiet>Nothing learned yet. Resolve a case for this vendor and the lesson appears here.</Quiet>
      ) : (
        <ul className="divide-y divide-rule">
          {items.map((c) => (
            <li key={c.id} className="animate-rise space-y-1.5 py-4 first:pt-1">
              <div className="flex items-center justify-between gap-3">
                <KindBadge kind={c.kind} />
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                  {c.occurred_at && simDay(c.occurred_at)}
                  {c.exception_id && (
                    <Link
                      to={`/exceptions/${c.exception_id}`}
                      className="font-mono underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {c.exception_id} →
                    </Link>
                  )}
                </span>
              </div>
              <p className="font-serif text-[1.05rem] leading-[1.55] text-pretty">
                <RedactedText text={c.text} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function Playbook({
  text,
  phase,
  retrying,
  onRetry,
}: {
  text: string | null | undefined
  phase: Phase
  retrying: boolean
  onRetry: () => void
}) {
  return (
    <Section
      title="Playbook"
      aside={
        <span className="inline-flex items-center gap-1.5 border border-rule px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase">
          <AgentMark /> Maintained by Hindsight
        </span>
      }
    >
      {phase === 'loading' ? (
        <Lines n={2} tall />
      ) : phase === 'unavailable' ? (
        <Quiet>{UNAVAILABLE}</Quiet>
      ) : isPendingContent(text) ? (
        <div className="space-y-3 pt-1" role="status">
          <p className="font-serif text-[1.05rem] text-muted-foreground">Drafting the playbook…</p>
          <div className="writing-rule" aria-hidden />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-pretty text-muted-foreground">
              Hindsight writes it in the background from this vendor’s decided cases.
            </p>
            <Button variant="outline" size="xs" onClick={onRetry} disabled={retrying}>
              <RefreshCw className={cn(retrying && 'animate-spin')} aria-hidden /> Retry
            </Button>
          </div>
        </div>
      ) : (
        <ErrorBoundary fallback={<Quiet>The playbook couldn’t be displayed.</Quiet>}>
          <Markdown>{text ?? ''}</Markdown>
        </ErrorBoundary>
      )}
    </Section>
  )
}

export function Trust({ vendorId, lanes, phase }: { vendorId: string; lanes: AutonomyState[]; phase: Phase }) {
  return (
    <Section
      title="Trust"
      aside={
        <Link to="/trust" className="hover:text-foreground hover:underline underline-offset-2">
          Trust map →
        </Link>
      }
    >
      {phase === 'loading' ? (
        <Lines n={2} />
      ) : phase === 'unavailable' ? (
        <Quiet>{UNAVAILABLE}</Quiet>
      ) : lanes.length === 0 ? (
        <Quiet>No trust lanes yet. A lane opens the first time the team decides one of this vendor’s cases.</Quiet>
      ) : (
        <ul className="divide-y divide-rule">
          {sortLanes(lanes).map((a) => (
            <li key={a.exception_type}>
              <Link
                to={`/exceptions?status=all&vendor=${vendorId}&type=${a.exception_type}`}
                className="-mx-2 block space-y-2 px-2 py-3 outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:bg-accent"
              >
                <div className="flex items-center justify-between gap-3">
                  <TypeChip type={a.exception_type} />
                  <TrustDots level={a.level} streak={a.streak} required={a.required_streak} />
                </div>
                {a.level !== 'locked' && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {a.accepted} accepted · {a.overruled} overruled · {a.auto_resolved} auto
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

const LESSONS_SHOWN = 5

export function Lessons({ vendorId }: { vendorId: string }) {
  const q = useQuery(lessonsQ(vendorId))
  const [all, setAll] = useState(false)
  const lessons = q.data ?? []
  const shown = all ? lessons : lessons.slice(0, LESSONS_SHOWN)
  return (
    <Section title="Lessons taught" aside={q.data && lessons.length > 0 ? `${lessons.length} on file` : undefined}>
      {q.isPending ? (
        <Lines n={2} />
      ) : q.isError ? (
        <Quiet>
          Lessons didn’t load.{' '}
          <button className="underline underline-offset-2 hover:text-foreground" onClick={() => q.refetch()}>
            Try again
          </button>
        </Quiet>
      ) : lessons.length === 0 ? (
        <Quiet>No lessons yet. Every decision the team explains becomes one.</Quiet>
      ) : (
        <>
          <ol className="divide-y divide-rule">
            {shown.map((l) => (
              <li key={l.case_id} className="space-y-1.5 py-3 first:pt-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <DecisionChip action={l.decision} size="xs" className={cn(l.revoked && 'opacity-60')} />
                    <TypeChip type={l.exception_type} />
                  </span>
                  <Link to={`/exceptions/${l.case_id}`} className="shrink-0 text-[11px] hover:underline underline-offset-2">
                    <CaseId id={l.case_id} />
                  </Link>
                </div>
                <blockquote
                  className={cn(
                    'font-serif text-[0.98rem] leading-snug text-pretty',
                    l.revoked && 'text-muted-foreground line-through decoration-reject/70',
                  )}
                >
                  “<RedactedText text={lessonReason(l)} />”
                </blockquote>
                <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground tabular-nums">
                  {l.auto && <AgentMark />}
                  {l.taught_by} <span aria-hidden>·</span> {simDay(l.taught_at)}
                  {l.revoked && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-reject">Revoked{l.revoked_by ? ` by ${l.revoked_by}` : ''}</span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ol>
          {lessons.length > LESSONS_SHOWN && (
            <Button variant="ghost" size="xs" onClick={() => setAll((x) => !x)}>
              {all ? 'Show fewer' : `Show all ${lessons.length}`}
            </Button>
          )}
        </>
      )}
    </Section>
  )
}

const STATUS_LABEL = { open: 'Awaiting decision', auto_resolved: 'Auto-resolved', resolved: 'Resolved' } as const

export function RecentCases({
  vendorId,
  cases,
  phase,
  simToday,
}: {
  vendorId: string
  cases: ExceptionSummary[]
  phase: Phase
  simToday?: string
}) {
  return (
    <Section
      title="Recent cases"
      aside={
        <Link to={`/exceptions?status=all&vendor=${vendorId}`} className="hover:text-foreground hover:underline underline-offset-2">
          All in docket →
        </Link>
      }
    >
      {phase === 'loading' ? (
        <Lines n={3} />
      ) : phase === 'unavailable' ? (
        <Quiet>{UNAVAILABLE}</Quiet>
      ) : cases.length === 0 ? (
        <Quiet>No cases for this vendor yet.</Quiet>
      ) : (
        <ul className="divide-y divide-rule">
          {cases.map((c) => (
            <li key={c.id}>
              <Link
                to={`/exceptions/${c.id}`}
                className="-mx-2 block px-2 py-3 outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:bg-accent"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-xs">
                    <CaseId id={c.id} />
                    <TypeChip type={c.primary_type} />
                  </span>
                  <Money value={c.amount_at_risk} className="text-sm font-medium" />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    {c.status === 'auto_resolved' && <AutoSeal />}
                    {c.recommended_action ? (
                      <DecisionChip action={c.recommended_action} size="xs" className={cn(c.status !== 'open' && 'opacity-70')} />
                    ) : (
                      c.status === 'open' && (
                        <span className="flex items-center gap-1.5">
                          <AgentMark /> Reasoning…
                        </span>
                      )
                    )}
                    <span className="truncate">{STATUS_LABEL[c.status]}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {simToday ? simRelative(c.created_at, simToday) : simDay(c.created_at)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
