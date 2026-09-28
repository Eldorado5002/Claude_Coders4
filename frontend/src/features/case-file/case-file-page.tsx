import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileX } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ApiError } from '@/api/client'
import { exceptionQ, settingsQ } from '@/api/queries'
import { EmptyState } from '@/components/precedent'
import { Safe } from '@/components/precedent/safe'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CaseHeader } from './case-header'
import { AnomalyNote, BankCheck, CaseTimeline } from './evidence-extras'
import { OpinionPanel } from './opinion-panel'
import { ThreeWayTable } from './three-way-table'

function CaseSkeleton() {
  return (
    <div className="space-y-6 px-5 py-6 md:px-8">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

export default function CaseFilePage() {
  const { id = '' } = useParams()
  const { search } = useLocation()
  const settings = useQuery(settingsQ())
  const memOn = settings.data?.memory_enabled ?? true
  const q = useQuery({ ...exceptionQ(id, memOn), enabled: !!settings.data })
  // the other memory mode, if it's in the cache: powers "Memory changed this verdict"
  const other = useQuery({ ...exceptionQ(id, !memOn), enabled: false })

  useEffect(() => {
    document.getElementById('case-scroll')?.scrollTo({ top: 0 })
  }, [id])

  if (q.isPending) return <CaseSkeleton />
  if (q.isError)
    return (
      <EmptyState
        icon={<FileX />}
        title={q.error instanceof ApiError && q.error.status === 404 ? `There’s no case called ${id}.` : 'This case didn’t load.'}
        action={
          <Button variant="outline" asChild>
            <Link to={`/exceptions${search}`}>Back to the docket</Link>
          </Button>
        }
      >
        {!(q.error instanceof ApiError && q.error.status === 404) && q.error.message}
      </EmptyState>
    )

  const c = q.data
  return (
    <article className="@container mx-auto w-full max-w-[1320px] px-5 py-6 md:px-8">
      <Link
        to={`/exceptions${search}`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground md:hidden"
      >
        <ArrowLeft className="size-3.5" /> Docket
      </Link>
      <CaseHeader c={c} />
      <div className="mt-6 grid gap-8 @min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
        <aside className="self-start @min-[1100px]:sticky @min-[1100px]:top-6 @min-[1100px]:order-2">
          <Safe label="Precedent’s opinion">
            <OpinionPanel key={c.id} c={c} other={other.data} memOn={memOn} />
          </Safe>
        </aside>
        <div className="min-w-0 space-y-9 @min-[1100px]:order-1">
          <ThreeWayTable c={c} />
          <div className="grid gap-8 @min-[640px]:grid-cols-2">
            <BankCheck c={c} />
            <AnomalyNote score={c.recommendation?.anomaly_score} />
          </div>
          <CaseTimeline c={c} />
        </div>
      </div>
    </article>
  )
}
