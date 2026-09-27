import { useQuery } from '@tanstack/react-query'
import { Database } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { memoryRecentQ, vendorsQ } from '@/api/queries'
import type { MemoryItem } from '@/api/types'
import { EmptyState, Eyebrow, KindBadge, RedactedText, TypeChip } from '@/components/precedent'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { simDay } from '@/lib/format'
import { KIND_META } from '@/lib/labels'
import { KIND_ICON } from '@/components/precedent/kind-badge'
import { LoadError, MemoryListSkeleton } from './memory-states'
import { KINDS, filterByKind, kindCounts, splitMemoryText, type KindFilter } from './memory-view'

function MemoryRow({ m, vendorName }: { m: MemoryItem; vendorName?: string }) {
  const { body, facts, notes } = splitMemoryText(m.text)
  // the date is shown on the right already
  const shownFacts = facts.filter((f) => f.label !== 'When')
  return (
    <li className="space-y-2 py-4">
      <div className="flex items-center justify-between gap-3">
        <KindBadge kind={m.kind} />
        {m.occurred_at && (
          <time dateTime={m.occurred_at} className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {simDay(m.occurred_at)}
          </time>
        )}
      </div>
      <p className="max-w-[72ch] text-[13.5px] leading-relaxed text-pretty">
        <RedactedText text={body} />
      </p>
      {notes.map((n, i) => (
        <p key={i} className="max-w-[72ch] text-[13px] leading-relaxed text-pretty text-muted-foreground">
          <RedactedText text={n} />
        </p>
      ))}
      {shownFacts.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {shownFacts.map((f) => (
            <div key={f.label} className="flex gap-1.5">
              <dt className="font-medium text-foreground/70">{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(m.vendor_id || m.exception_type) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {m.vendor_id && (
            <Link
              to={`/vendors/${m.vendor_id}`}
              className="text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
            >
              {vendorName ?? m.vendor_id}
            </Link>
          )}
          {m.exception_type && <TypeChip type={m.exception_type} />}
        </div>
      )}
    </li>
  )
}

/** Plain-language definitions of what Hindsight keeps, plus the three verbs it runs on. */
function Glossary() {
  return (
    <aside className="space-y-6 self-start border-t border-rule pt-5 lg:sticky lg:top-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
      <div className="space-y-4">
        <Eyebrow>What these are</Eyebrow>
        <dl className="space-y-4">
          {KINDS.map((k) => {
            const Icon = KIND_ICON[k]
            return (
              <div key={k} className="space-y-1">
                <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  <Icon className="size-3 text-muted-foreground" strokeWidth={2.25} aria-hidden />
                  {KIND_META[k].label}
                </dt>
                <dd className="text-[13px] leading-relaxed text-pretty text-muted-foreground">{KIND_META[k].tip}</dd>
              </div>
            )
          })}
        </dl>
      </div>
      <div className="space-y-3 border-t border-rule pt-5">
        <Eyebrow>How Hindsight works</Eyebrow>
        <dl className="space-y-2 text-[13px] leading-relaxed text-pretty">
          <div>
            <dt className="inline font-semibold">Retain.</dt>{' '}
            <dd className="inline text-muted-foreground">Every resolution is filed with who decided, what, and why.</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Recall.</dt>{' '}
            <dd className="inline text-muted-foreground">
              Before each opinion, Precedent pulls the memories that match this vendor and exception.
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold">Reflect.</dt>{' '}
            <dd className="inline text-muted-foreground">
              In the background, Hindsight merges facts into patterns and rewrites playbooks and policy.
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  )
}

export function RawTab({ kind, onKind }: { kind: KindFilter; onKind: (k: KindFilter) => void }) {
  const q = useQuery(memoryRecentQ())
  const vendors = useQuery(vendorsQ())
  const names = useMemo(() => new Map((vendors.data ?? []).map((v) => [v.id, v.name])), [vendors.data])
  const items = useMemo(() => q.data ?? [], [q.data])
  const counts = useMemo(() => kindCounts(items), [items])
  const visible = useMemo(() => filterByKind(items, kind), [items, kind])
  // only kinds that are present, plus the chosen one so it can be cleared
  const chips = KINDS.filter((k) => counts[k] > 0 || k === kind)

  let list: ReactNode
  if (q.isPending) list = <MemoryListSkeleton />
  else if (!q.data)
    list = <LoadError error={q.error ?? new Error('No data')} what="Recent memories" onRetry={() => void q.refetch()} />
  else if (items.length === 0)
    list = (
      <EmptyState icon={<Database />} title="Hindsight holds no memories yet.">
        Resolve a case and the facts Hindsight keeps from it appear here.
      </EmptyState>
    )
  else
    list = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={1}
            value={kind}
            onValueChange={(v) => v && onKind(v as KindFilter)}
            aria-label="Filter by memory kind"
            className="flex-wrap"
          >
            {(['all', ...chips] as KindFilter[]).map((k) => (
              <ToggleGroupItem
                key={k}
                value={k}
                className="h-7 gap-1.5 px-2.5 text-[11px] tracking-[0.08em] data-[state=on]:border-foreground"
              >
                {k === 'all' ? 'All' : KIND_META[k].label}
                <span className="font-normal tabular-nums opacity-60">{counts[k]}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="text-xs text-muted-foreground">Latest {items.length} from Hindsight</span>
        </div>
        {visible.length === 0 ? (
          <EmptyState title={`No ${kind === 'all' ? '' : KIND_META[kind].label.toLowerCase() + ' '}memories in the latest ${items.length}.`} />
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {visible.map((m) => (
              <MemoryRow key={m.id} m={m} vendorName={m.vendor_id ? names.get(m.vendor_id) : undefined} />
            ))}
          </ol>
        )}
      </div>
    )

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">{list}</div>
      <Glossary />
    </div>
  )
}
