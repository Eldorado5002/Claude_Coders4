import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { beliefsQ } from '@/api/queries'
import type { Belief, BeliefVersion } from '@/api/types'
import { AgentMark, RedactedText, Section } from '@/components/precedent'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  beliefDates,
  beliefsErrorCopy,
  dayLabel,
  memoriesLabel,
  orderVersions,
  parseEvidence,
  revisedByLabel,
  versionsLabel,
} from './beliefs-view'
import { Quiet } from './vendor-sections'

/**
 * "What Precedent believes": Hindsight's consolidated beliefs about this vendor, each with the memories behind it
 * and how it changed. Its own query (about 1.5 s through Hindsight), so it loads and fails on its own.
 */
export function Beliefs({ vendorId }: { vendorId: string }) {
  const q = useQuery(beliefsQ(vendorId))
  const list = q.data ?? []
  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <AgentMark /> What Precedent believes
        </span>
      }
      aside={q.data && list.length > 0 ? `${list.length} ${list.length === 1 ? 'belief' : 'beliefs'}` : undefined}
    >
      {q.isPending ? (
        <BeliefsSkeleton />
      ) : q.isError && !q.data ? (
        <Quiet>
          {beliefsErrorCopy(q.error)}{' '}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground disabled:opacity-60"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
          >
            Try again
          </button>
        </Quiet>
      ) : list.length === 0 ? (
        <Quiet>No consolidated beliefs yet.</Quiet>
      ) : (
        <>
          {/* a failed background refresh keeps what Hindsight last said */}
          {q.isError && (
            <p className="mb-2 text-xs text-muted-foreground">Couldn’t refresh from Hindsight; showing the last beliefs it gave.</p>
          )}
          <ul className="divide-y divide-rule">
            {list.map((b) => (
              <BeliefItem key={b.id} b={b} />
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

function BeliefsSkeleton() {
  return (
    <div className="space-y-7 pt-2" aria-busy>
      <span className="sr-only">Recalling beliefs from Hindsight…</span>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2.5">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="mt-3 h-3 w-60" />
        </div>
      ))}
    </div>
  )
}

function BeliefItem({ b }: { b: Belief }) {
  const { firstSeen, lastUpdated } = beliefDates(b)
  const versions = orderVersions(b.versions ?? [])
  return (
    <li className="animate-rise space-y-3 py-5 first:pt-2">
      <p className="font-serif text-[1.125rem] leading-[1.55] text-pretty">
        <RedactedText text={b.text} />
      </p>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span>
          Backed by <strong className="font-semibold text-foreground">{memoriesLabel(b.evidence_count)}</strong>
        </span>
        {firstSeen && (
          <>
            <span aria-hidden>·</span>
            <span>First seen {firstSeen}</span>
          </>
        )}
        {lastUpdated && (
          <>
            <span aria-hidden>·</span>
            <span>Last updated {lastUpdated}</span>
          </>
        )}
      </p>
      {versions.length > 0 && <History versions={versions} now={dayLabel(b.last_updated)} />}
    </li>
  )
}

/** The disclosure: a vertical timeline, oldest first, ending at today's belief. */
function History({ versions, now }: { versions: BeliefVersion[]; now: string | null }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group -ml-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40">
        <ChevronRight
          className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-data-[state=open]:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        {versionsLabel(versions.length)}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="animate-rise mt-4 ml-0.5">
          {versions.map((v, i) => (
            <VersionNode key={i} v={v} />
          ))}
          <li className="relative pl-6">
            <AgentMark className="absolute top-[4.5px] left-[-1px] size-[9px] text-foreground" />
            <p className="text-[11px] font-semibold tracking-[0.1em] uppercase tabular-nums">
              Now{now && <span className="text-muted-foreground"> · {now}</span>}
            </p>
          </li>
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

function VersionNode({ v }: { v: BeliefVersion }) {
  const day = dayLabel(v.as_of)
  const evidence = v.new_evidence.map(parseEvidence)
  return (
    <li className="relative pb-6 pl-6">
      {/* the rule runs from this node down to the next one; the hollow square sits on it */}
      <span className="absolute top-[9px] left-[3px] h-full w-px bg-rule" aria-hidden />
      <span className="absolute top-[5.5px] left-0 size-[7px] border border-muted-foreground bg-background" aria-hidden />

      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase tabular-nums">{day ?? 'Undated'}</p>
      <p className="mt-1.5 font-serif text-[1rem] leading-[1.55] text-pretty text-muted-foreground">
        <span className="mr-1.5 font-sans text-[11px] font-semibold tracking-[0.1em] uppercase">was:</span>
        <RedactedText text={v.text} />
      </p>

      {evidence.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">{revisedByLabel(evidence.length)}</p>
          <ul className="space-y-2.5">
            {evidence.map((e, i) => (
              <li key={i} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 text-[13px] leading-snug text-muted-foreground">
                <span className={cn('pt-px text-[11px] tabular-nums', !e.when && 'select-none')}>
                  {e.when ? dayLabel(e.when) : <span aria-hidden>+</span>}
                </span>
                <span className="min-w-0 text-pretty">
                  <RedactedText text={e.text} />
                  {e.detail && (
                    <span className="mt-0.5 block text-[12px] text-muted-foreground/85">
                      <RedactedText text={e.detail} />
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}
