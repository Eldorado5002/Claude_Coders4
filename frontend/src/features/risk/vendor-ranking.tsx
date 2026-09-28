import { useQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { riskQ } from '@/api/queries'
import { EmptyState, Section } from '@/components/precedent'
import { Skeleton } from '@/components/ui/skeleton'
import { categoryLabel } from '@/features/vendors/vendors-view'
import { cn } from '@/lib/utils'
import { LevelChip, RiskLoadError, ScoreBar } from './risk-parts'
import { rankVendors, rankingSummary, splitRanking, type RankedVendor } from './risk-view'

const LINK =
  'rounded-sm font-medium decoration-rule underline-offset-4 outline-none hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/40'

function VendorName({ r, className }: { r: RankedVendor; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <Link to={`/vendors/${r.vendor.id}`} className={LINK}>
        {r.vendor.name}
      </Link>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {r.vendor.city} · {categoryLabel(r.vendor.category)}
      </div>
    </div>
  )
}

function Signals({ signals, className }: { signals: string[]; className?: string }) {
  if (!signals.length) return <p className={cn('text-sm text-muted-foreground', className)}>No risk signals</p>
  return (
    <ul className={cn('space-y-1 text-sm', className)} aria-label="Risk signals">
      {signals.map((s, i) => (
        <li key={`${i}-${s}`} className="flex gap-2">
          <span className="mt-[0.6em] h-px w-2 shrink-0 bg-muted-foreground" aria-hidden />
          <span className="text-pretty">{s}</span>
        </li>
      ))}
    </ul>
  )
}

/** The vendors that need a look, given room: rank, big score, level, and why. */
function TopRisks({ rows }: { rows: RankedVendor[] }) {
  return (
    <ol className="grid border-b border-rule md:grid-cols-3" aria-label="Vendors to look at first">
      {rows.map((r, i) => (
        <li
          key={r.vendor.id}
          className={cn(
            'min-w-0 space-y-4 py-6 md:px-6',
            i > 0 && 'border-t border-rule md:border-t-0 md:border-l',
            i === 0 && 'md:pl-0',
            i === rows.length - 1 && 'md:pr-0',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              <span className="sr-only">Rank </span>No. {r.rank}
            </span>
            <LevelChip level={r.risk.level} />
          </div>
          <VendorName r={r} />
          <div className="space-y-2">
            <p className="flex items-baseline gap-1.5">
              <span className="sr-only">Risk score </span>
              <span className="serif-display text-[2.75rem] leading-none tabular-nums">{r.risk.score}</span>
              <span className="text-xs text-muted-foreground tabular-nums">/ 100</span>
            </p>
            <ScoreBar score={r.risk.score} level={r.risk.level} />
          </div>
          <Signals signals={r.signals} />
        </li>
      ))}
    </ol>
  )
}

// rank · vendor · score · level · signals; on a phone each row stacks under its rank
const ROW =
  'grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-2 py-3 md:grid-cols-[2.5rem_minmax(0,1.15fr)_9rem_5.5rem_minmax(0,1.5fr)] md:items-baseline md:gap-x-6'

function RankingList({ rows }: { rows: RankedVendor[] }) {
  return (
    <div>
      <div
        className={cn(ROW, 'hidden border-b border-rule py-2 text-[11px] tracking-wider text-muted-foreground uppercase md:grid')}
        aria-hidden
      >
        <span className="text-right">#</span>
        <span>Vendor</span>
        <span>Score</span>
        <span>Level</span>
        <span>Signals</span>
      </div>
      <ol className="divide-y divide-rule border-b border-rule" aria-label="Vendor ranking, highest risk first">
        {rows.map((r) => (
          <li key={r.vendor.id} className={ROW}>
            <span className="row-span-3 text-right text-sm text-muted-foreground tabular-nums md:row-span-1">
              <span className="sr-only">Rank </span>
              {r.rank}
            </span>
            <VendorName r={r} />
            <div className="flex items-center gap-3 md:contents">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="w-7 text-right text-sm font-medium tabular-nums">
                  <span className="sr-only">Risk score </span>
                  {r.risk.score}
                </span>
                <ScoreBar score={r.risk.score} level={r.risk.level} className="w-16 md:w-full md:flex-1" />
              </div>
              <div>
                <LevelChip level={r.risk.level} />
              </div>
            </div>
            <Signals signals={r.signals} />
          </li>
        ))}
      </ol>
    </div>
  )
}

function RankingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the vendor ranking">
      <div className="grid gap-6 border-b border-rule pb-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-1 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        ))}
      </div>
      <div className="divide-y divide-rule">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 py-3">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-1 w-24" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="hidden h-4 w-56 md:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

function RankingBody({ ranked }: { ranked: RankedVendor[] }) {
  const { top, rest } = splitRanking(ranked)
  return (
    <div className="space-y-6">
      {top.length ? (
        <TopRisks rows={top} />
      ) : (
        <p className="font-serif text-lg text-pretty text-muted-foreground">
          No vendor shows a fraud or control signal yet.
        </p>
      )}
      {rest.length > 0 && (
        <div className="space-y-2">
          {top.length > 0 && <p className="text-xs text-muted-foreground">Everyone else, highest first</p>}
          <RankingList rows={rest} />
        </div>
      )}
    </div>
  )
}

export function VendorRankingSection() {
  const q = useQuery(riskQ())
  const ranked = q.data ? rankVendors(q.data) : null
  return (
    <Section title="Vendor ranking" aside={ranked?.length ? rankingSummary(ranked) : undefined}>
      {q.isPending ? (
        <RankingSkeleton />
      ) : q.isError ? (
        <RiskLoadError error={q.error} what="ranking" retry={() => void q.refetch()} />
      ) : !ranked?.length ? (
        <EmptyState className="py-10" icon={<ShieldCheck />} title="No vendors to rank yet.">
          Vendors are scored once their first invoice arrives.
        </EmptyState>
      ) : (
        <RankingBody ranked={ranked} />
      )}
    </Section>
  )
}
