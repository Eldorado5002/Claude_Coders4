import { DatabaseZap, TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { isHindsightDown } from './memory-view'

/** A failed memory query: Hindsight down gets its own sentence, anything else says what failed. */
export function LoadError({ error, what, onRetry }: { error: Error; what: string; onRetry: () => void }) {
  const retry = (
    <Button variant="outline" size="sm" onClick={onRetry}>
      Try again
    </Button>
  )
  if (isHindsightDown(error))
    return <EmptyState icon={<DatabaseZap />} title="Hindsight is unreachable. The ledger returns when memory does." action={retry} />
  return (
    <EmptyState icon={<TriangleAlert />} title={`${what} didn’t load.`} action={retry}>
      {error.message}
    </EmptyState>
  )
}

/** Rows of the lessons ledger while it loads. */
export function LessonsSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading lessons">
      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="space-y-1">
          <Skeleton className="h-3 w-36" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2.5 border-b border-rule py-5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function ProseSkeleton() {
  return (
    <div className="max-w-3xl space-y-4" aria-busy="true" aria-label="Loading team policy">
      <Skeleton className="h-3 w-56" />
      <Skeleton className="h-7 w-2/3" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className={i % 3 === 2 ? 'h-4 w-3/5' : 'h-4 w-full'} />
      ))}
    </div>
  )
}

export function MemoryListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading memories">
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-24" />
        ))}
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="space-y-2 border-b border-rule py-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  )
}
