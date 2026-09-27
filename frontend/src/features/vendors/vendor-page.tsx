import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CloudOff, FileX } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ApiError } from '@/api/client'
import { qk } from '@/api/keys'
import { settingsQ, vendorQ } from '@/api/queries'
import type { VendorSummary } from '@/api/types'
import { EmptyState } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { VendorHeader } from './vendor-header'
import { Learned, Lessons, Playbook, RecentCases, Trust, type Phase } from './vendor-sections'
import { placeholderProfile } from './vendors-view'

const is404 = (e: unknown) => e instanceof ApiError && e.status === 404

function unavailableCopy(e: unknown): string {
  if (e instanceof ApiError && e.status === 503)
    return 'Hindsight isn’t answering, so what Precedent has learned about this vendor can’t be shown right now.'
  if (e instanceof ApiError && e.status === 0) return 'Can’t reach the Precedent API. The details below are from the vendor list.'
  return `The vendor profile didn’t load${e instanceof Error && e.message ? `: ${e.message}` : '.'}`
}

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-3 border-b border-rule pb-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-60" />
        <div className="flex gap-10 pt-4">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-64" />
        </div>
      </div>
      <div className="grid gap-10 @min-[880px]:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  )
}

export default function VendorPage() {
  const { id = '' } = useParams()
  const { state } = useLocation()
  const back = `/vendors${(state as { back?: string } | null)?.back ?? ''}`
  const qc = useQueryClient()
  const settings = useQuery(settingsQ())
  // The profile call goes through Hindsight and can take seconds: paint the header from the index cache meanwhile.
  const q = useQuery({
    ...vendorQ(id),
    placeholderData: () => placeholderProfile(qc.getQueryData<VendorSummary[]>(qk.vendors), id),
  })

  // pages share the shell's scrolling <main>: start each vendor file at the top
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 })
  }, [id])

  const backLink = (
    <Link to={back} className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" aria-hidden /> Vendors
    </Link>
  )

  if (q.isError && is404(q.error))
    return (
      <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-10">
        <EmptyState
          icon={<FileX />}
          title={`There’s no vendor called ${id}.`}
          action={
            <Button variant="outline" asChild>
              <Link to="/vendors">Back to vendors</Link>
            </Button>
          }
        />
      </div>
    )

  // A failed profile still leaves us the index row: keep the header, explain the gap.
  // (A failed background refetch keeps the profile we already have.)
  const fallback = !q.data && q.isError ? placeholderProfile(qc.getQueryData<VendorSummary[]>(qk.vendors), id) : undefined
  const v = q.data ?? fallback

  if (q.isError && !v)
    return (
      <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-10">
        {backLink}
        <EmptyState
          icon={<CloudOff />}
          title="This vendor didn’t load."
          action={
            <Button variant="outline" size="sm" onClick={() => q.refetch()}>
              Try again
            </Button>
          }
        >
          {q.error.message}
        </EmptyState>
      </div>
    )

  const phase: Phase = q.isPlaceholderData ? 'loading' : q.data ? 'ready' : 'unavailable'

  return (
    <article className="@container mx-auto w-full max-w-[1240px] px-5 py-8 md:px-10">
      {backLink}
      {!v ? (
        <PageSkeleton />
      ) : (
        <>
          <VendorHeader v={v} phase={phase} />

          {phase === 'unavailable' && (
            <div role="alert" className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border border-rule bg-muted/40 px-4 py-3 text-sm">
              <CloudOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="min-w-0 flex-1 text-pretty">{unavailableCopy(q.error)}</p>
              <Button variant="outline" size="xs" onClick={() => q.refetch()} disabled={q.isFetching}>
                Try again
              </Button>
            </div>
          )}

          <div className="mt-8 grid gap-10 @min-[880px]:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] @min-[880px]:gap-12">
            <div className="min-w-0 space-y-10">
              <Learned items={v.learned} phase={phase} />
              <Playbook
                text={v.playbook}
                phase={phase}
                retrying={q.isFetching && !q.isPlaceholderData}
                onRetry={() => q.refetch()}
              />
            </div>
            <div className="min-w-0 space-y-10">
              <Trust vendorId={v.id} lanes={v.autonomy} phase={phase} />
              <Lessons vendorId={v.id} />
              <RecentCases vendorId={v.id} cases={v.recent} phase={phase} simToday={settings.data?.sim_date} />
            </div>
          </div>
        </>
      )}
    </article>
  )
}
