import { Lock } from 'lucide-react'
import type { TypeBreakdown } from '@/api/types'
import { Skeleton } from '@/components/ui/skeleton'
import { TYPE_LABEL, isHardControl } from '@/lib/labels'
import { pct } from '@/lib/format'

const ROW = 'grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_3rem] items-center gap-x-4 py-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_3.5rem]'

/** Touchless rate per exception type, in the order the API sends. Hard controls never get a bar. */
export function ByType({ rows }: { rows: TypeBreakdown[] }) {
  if (!rows.length)
    return <p className="py-6 text-sm text-muted-foreground">No exceptions yet, so there is nothing to break down by type.</p>

  return (
    <ul className="divide-y divide-rule border-b border-rule">
      {rows.map((r) => {
        const hard = isHardControl(r.type)
        const label = TYPE_LABEL[r.type] ?? r.type
        return (
          <li key={r.type} className={ROW}>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{label}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {r.count} {r.count === 1 ? 'case' : 'cases'}
              </div>
            </div>
            {hard ? (
              <div className="col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                <span>0% by design — always human</span>
              </div>
            ) : (
              <>
                <div
                  className="relative h-2 bg-muted"
                  role="img"
                  aria-label={`${label}: ${pct(r.touchless_rate)} resolved without a human`}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-r-[2px] bg-foreground"
                    style={{ width: `${Math.min(1, Math.max(0, r.touchless_rate)) * 100}%` }}
                  />
                </div>
                <div className="text-right text-sm tabular-nums">{pct(r.touchless_rate)}</div>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function ByTypeSkeleton() {
  return (
    <div className="divide-y divide-rule">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={ROW}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="ml-auto h-4 w-8" />
        </div>
      ))}
    </div>
  )
}
