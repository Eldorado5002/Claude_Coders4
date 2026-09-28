import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Grid3x3, Lock } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { autonomyQ } from '@/api/queries'
import type { AutonomyState, ExceptionType } from '@/api/types'
import { AgentMark, AutoSeal, EmptyState, Eyebrow, PageHeader, TrustDots, TypeChip } from '@/components/precedent'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Skeleton } from '@/components/ui/skeleton'
import { simDay } from '@/lib/format'
import { TYPE_LABEL, isHardControl } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { CertificateBadge } from './certificate-badge'
import { buildTrustMatrix, nextStepCopy } from './trust-matrix'

const cellLink = (a: AutonomyState) => `/exceptions?status=all&vendor=${a.vendor_id}&type=${a.exception_type}`

/** Remembers each lane's level so a promotion can stamp exactly once. */
function usePromotions(rows: AutonomyState[] | undefined) {
  const prev = useRef<Map<string, string> | null>(null)
  const [stamped, setStamped] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!rows) return
    const now = new Map(rows.map((r) => [`${r.vendor_id}:${r.exception_type}`, r.level]))
    if (prev.current) {
      const up = [...now].filter(([k, lvl]) => lvl === 'auto' && prev.current!.get(k) !== 'auto').map(([k]) => k)
      if (up.length) setStamped(new Set(up))
    }
    prev.current = now
  }, [rows])
  return stamped
}

function Cell({ a, stamp }: { a?: AutonomyState; stamp: boolean }) {
  if (!a) return <span className="block text-center text-muted-foreground/40" aria-hidden>·</span>
  const hard = a.level === 'locked'
  return (
    <HoverCard openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>
        <Link
          to={cellLink(a)}
          className={cn(
            'flex h-12 w-full items-center justify-center outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/40',
            hard ? 'hatch text-foreground' : 'hover:bg-accent',
            a.level === 'auto' && 'bg-accent/50',
          )}
          aria-label={`${a.vendor_name}, ${TYPE_LABEL[a.exception_type]}: ${nextStepCopy(a)}`}
        >
          {a.level === 'auto' ? (
            <span className="flex items-center gap-1.5">
              <AutoSeal animate={stamp} />
              {a.auto_resolved > 0 && <span className="text-[11px] text-muted-foreground tabular-nums">×{a.auto_resolved}</span>}
            </span>
          ) : hard ? (
            <Lock className="size-3.5" strokeWidth={2.25} />
          ) : (
            <TrustDots level={a.level} streak={a.streak} required={a.required_streak} label={false} />
          )}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 space-y-3" side="top">
        <div>
          <div className="text-sm font-medium">{a.vendor_name}</div>
          <TypeChip type={a.exception_type} className="mt-1" />
        </div>
        <p className="text-sm text-pretty">{nextStepCopy(a)}</p>
        {!hard && (
          <dl className="grid grid-cols-3 gap-2 border-t border-rule pt-2 text-center">
            {[
              ['Accepted', a.accepted],
              ['Overruled', a.overruled],
              ['Auto', a.auto_resolved],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{k}</dt>
                <dd className="serif-display text-xl tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {a.updated_at && <p className="text-[11px] text-muted-foreground">Last change {simDay(a.updated_at)}</p>}
      </HoverCardContent>
    </HoverCard>
  )
}

function HowTrustWorks() {
  const steps = [
    ['Suggest', 'Precedent recommends; a clerk decides. Every decision and its reason is filed to memory.'],
    ['Earn', 'Three accepted, memory-grounded recommendations in a row for the same vendor and exception type.'],
    ['Auto', 'Precedent resolves those on its own, only inside amounts humans already approved, and a clerk can still override.'],
    ['Reset', 'One overrule sends the lane back to suggesting. Hard controls never automate.'],
  ]
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground">
        How trust is earned
        <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-4 grid gap-4 border-t border-rule pt-4 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map(([t, d], i) => (
            <li key={t} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="serif-display text-lg text-muted-foreground">{i + 1}</span>
                <span className="text-sm font-semibold">{t}</span>
              </div>
              <p className="text-xs text-pretty text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function TrustPage() {
  const q = useQuery(autonomyQ())
  const m = useMemo(() => buildTrustMatrix(q.data ?? []), [q.data])
  const stamped = usePromotions(q.data)
  const soft = m.types.filter((t) => !isHardControl(t))
  const hard = m.types.filter((t) => isHardControl(t))
  const col = (t: ExceptionType) => (
    <th key={t} scope="col" className={cn('pb-3 align-bottom', isHardControl(t) ? 'hatch px-0.5' : 'px-2')}>
      <span className="block text-center text-[10px] leading-tight font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {TYPE_LABEL[t]}
      </span>
    </th>
  )

  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-10">
      <PageHeader
        eyebrow="Trust map"
        title="Where Precedent has earned autonomy."
        description="Each lane is one vendor and one kind of exception. Trust is earned lane by lane, from accepted recommendations, and hard controls are always human."
      />
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <AutoSeal /> <span className="font-semibold tabular-nums">{m.counts.auto}</span> on auto
        </span>
        <span className="flex items-center gap-2">
          <TrustDots level="suggest" streak={1} label={false} /> <span className="font-semibold tabular-nums">{m.counts.suggest}</span>{' '}
          learning
        </span>
        <span className="flex items-center gap-2">
          <Lock className="size-3.5" /> <span className="font-semibold tabular-nums">{m.counts.locked}</span> locked
        </span>
        <CertificateBadge />
        <span className="ml-auto">
          <HowTrustWorks />
        </span>
      </div>

      {q.isPending ? (
        <Skeleton className="mt-8 h-96 w-full" />
      ) : q.isError ? (
        <EmptyState title="The trust map didn’t load.">{q.error.message}</EmptyState>
      ) : m.vendors.length === 0 ? (
        <EmptyState icon={<Grid3x3 />} title="No lanes yet.">
          Lanes appear as soon as Precedent recommends on a vendor’s first exception.
        </EmptyState>
      ) : (
        <>
          {/* desktop / tablet: the matrix */}
          <div className="mt-8 hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className="w-[15rem] pb-3 text-left align-bottom">
                    <Eyebrow>Vendor</Eyebrow>
                  </th>
                  {soft.map(col)}
                  {hard.length > 0 && <th aria-hidden className="w-3" />}
                  {hard.map(col)}
                </tr>
                {hard.length > 0 && (
                  <tr>
                    <th />
                    <th colSpan={soft.length} />
                    <th />
                    <th colSpan={hard.length} className="pb-2 text-center text-[10px] font-semibold tracking-[0.12em] uppercase">
                      Always human
                    </th>
                  </tr>
                )}
              </thead>
              <tbody>
                {m.vendors.map((v) => (
                  <tr key={v.id} className="border-t border-rule">
                    <th scope="row" className="py-1 pr-4 text-left font-normal">
                      {/* long names wrap rather than widen the table: at the Twist all 11 lanes fit at 1440px */}
                      <Link to={`/vendors/${v.id}`} className="flex max-w-[13rem] items-center gap-2 text-sm hover:underline">
                        {v.hasAuto && <AgentMark className="shrink-0 text-foreground" />}
                        <span className="text-pretty">{v.name}</span>
                      </Link>
                    </th>
                    {soft.map((t) => (
                      <td key={t} className="min-w-[5.5rem] border-l border-rule p-0">
                        <Cell a={v.cells[t]} stamp={stamped.has(`${v.id}:${t}`)} />
                      </td>
                    ))}
                    {hard.length > 0 && <td aria-hidden />}
                    {hard.map((t) => (
                      // a hard-control cell only ever holds a lock, so it can be narrower than a lane that can stamp AUTO
                      <td key={t} className="min-w-[4rem] border-l border-rule p-0">
                        <Cell a={v.cells[t]} stamp={false} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* phones: a list per vendor */}
          <ul className="mt-6 space-y-5 md:hidden">
            {m.vendors.map((v) => (
              <li key={v.id} className="border-t border-rule pt-3">
                <Link to={`/vendors/${v.id}`} className="text-sm font-medium">
                  {v.name}
                </Link>
                <ul className="mt-2 space-y-2">
                  {m.types
                    .filter((t) => v.cells[t])
                    .map((t) => {
                      const a = v.cells[t]!
                      return (
                        <li key={t} className="flex items-center justify-between gap-3">
                          <TypeChip type={t} />
                          <TrustDots level={a.level} streak={a.streak} required={a.required_streak} />
                        </li>
                      )
                    })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
