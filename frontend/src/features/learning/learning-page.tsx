import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TriangleAlert } from 'lucide-react'
import { ApiError } from '@/api/client'
import { metricsQ } from '@/api/queries'
import type { Metrics } from '@/api/types'
import { EmptyState, PageHeader, Section } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ByType, ByTypeSkeleton } from './by-type'
import { Figures, FiguresSkeleton } from './figures'
import { LearningChart } from './learning-chart'
import { findReplaySummary, headline } from './learning-view'
import { Footnotes, NoteRef } from './notes'

const SHELL = 'mx-auto w-full max-w-[1240px] px-5 py-8 md:px-10'
const CHART_GRID = 'grid gap-12 @min-[1000px]:grid-cols-2 @min-[1000px]:gap-10'

function LearningBody({ m }: { m: Metrics }) {
  const replay = findReplaySummary(m.assumptions)
  const weeks = Math.max(m.touchless_by_week.length, m.acceptance_by_week.length)

  return (
    <div className="space-y-14">
      <PageHeader
        eyebrow="Learning · with memory vs without"
        title={
          <span className="block max-w-4xl animate-rise text-[1.65rem] leading-[1.18] sm:text-[2.05rem] md:text-[2.4rem] md:leading-[1.1]">
            {headline(m)}
            <NoteRef n={replay ? replay.index + 1 : null} />
          </span>
        }
        description={
          weeks
            ? `Figures from the live docket, and a replay of ${weeks} weeks run twice: once with Hindsight memory, once without.`
            : 'Figures from the live docket. The replay curves appear once the first weeks have been scored.'
        }
      />

      <Section title="Live docket so far">
        <Figures m={m} />
      </Section>

      <Section title="Learning curves" aside={weeks ? `Replay · ${weeks} weeks · same model` : undefined}>
        <div className="@container pt-2">
          <div className={CHART_GRID}>
            <LearningChart
              id="touchless"
              title="Resolved without a human"
              description="Share of each week’s exceptions closed with no human action."
              points={m.touchless_by_week}
            />
            <LearningChart
              id="accuracy"
              title="Recommendation accuracy"
              description="Share of recommendations that matched the correct payment outcome."
              points={m.acceptance_by_week}
            />
          </div>
        </div>
      </Section>

      <Section title="By exception type" aside="Resolved without a human">
        <ByType rows={m.by_type} />
      </Section>

      <Section title="How these numbers are made">
        <Footnotes items={m.assumptions} />
      </Section>
    </div>
  )
}

function LearningSkeleton() {
  return (
    <div className="space-y-14" aria-busy="true" aria-label="Loading the learning numbers">
      <div className="space-y-3 border-b border-rule pb-6">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-9 w-4/5" />
        <Skeleton className="h-9 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <FiguresSkeleton />
      </div>
      <div className="@container">
        <div className={CHART_GRID}>
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-[272px] w-full" />
            </div>
          ))}
        </div>
      </div>
      <ByTypeSkeleton />
    </div>
  )
}

function LoadError({ error, retry }: { error: Error; retry: () => void }) {
  const status = error instanceof ApiError ? error.status : undefined
  const [title, body] =
    status === 0
      ? ['Can’t reach the Precedent API.', 'Start the backend, or switch to sample data from the banner above.']
      : status === 503
        ? ['Hindsight memory is unreachable.', 'The learning numbers come from memory, so they are paused until Hindsight is back.']
        : ['The learning numbers didn’t load.', error.message]
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Learning" title="With memory vs without" />
      <EmptyState
        icon={status === 503 || status === 0 ? <TriangleAlert /> : <TrendingUp />}
        title={title}
        action={
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        }
      >
        {body}
      </EmptyState>
    </div>
  )
}

export default function LearningPage() {
  const q = useQuery(metricsQ())
  return (
    <div className={SHELL}>
      {q.isPending ? (
        <LearningSkeleton />
      ) : q.isError ? (
        <LoadError error={q.error} retry={() => void q.refetch()} />
      ) : (
        <LearningBody m={q.data} />
      )}
    </div>
  )
}
