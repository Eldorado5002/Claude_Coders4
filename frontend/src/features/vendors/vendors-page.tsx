import { useQuery } from '@tanstack/react-query'
import type { OnChangeFn, SortingState } from '@tanstack/react-table'
import { Building2, Search } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { vendorsQ } from '@/api/queries'
import { EmptyState, PageHeader } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NoMatch, VendorTable, VendorTableSkeleton } from './vendor-table'
import { formatSort, matchesVendor, parseSort, vendorCounts } from './vendors-view'

export default function VendorsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const sortParam = params.get('sort')
  const sorting = useMemo(() => parseSort(sortParam), [sortParam])
  const vendors = useQuery(vendorsQ())

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const onSortingChange: OnChangeFn<SortingState> = (updater) =>
    setParam('sort', formatSort(typeof updater === 'function' ? updater(sorting) : updater))

  const list = vendors.data ?? []
  const counts = vendorCounts(list)
  const shown = q.trim() ? list.filter((v) => matchesVendor(v, q)).length : list.length

  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-10">
      <PageHeader
        eyebrow="Vendors"
        title="Who we pay, and what we’ve learned about them."
        description="Every supplier on file with its exception history. Open one to see what Precedent has learned and how far it’s trusted to act alone."
      />

      {vendors.isPending ? (
        <div className="mt-6">
          <VendorTableSkeleton />
        </div>
      ) : !vendors.data ? (
        <EmptyState
          title="The vendor list didn’t load."
          action={
            <Button variant="outline" size="sm" onClick={() => vendors.refetch()}>
              Try again
            </Button>
          }
        >
          {vendors.error?.message}
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState icon={<Building2 />} title="No vendors on file yet.">
          Vendors appear here when their first invoice arrives.
        </EmptyState>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <label className="relative block w-full max-w-sm">
              <span className="sr-only">Search vendors</span>
              <Search className="pointer-events-none absolute top-1/2 left-0 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={q}
                onChange={(e) => setParam('q', e.target.value || null)}
                placeholder="Search name, city or GSTIN"
                className="pl-6"
              />
            </label>
            <p className="pb-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {q.trim()
                ? `${shown} of ${counts.total} vendors`
                : `${counts.total} vendors · ${counts.withOpen} with open cases`}
            </p>
          </div>
          <div className="mt-3">
            <VendorTable
              data={list}
              sorting={sorting}
              onSortingChange={onSortingChange}
              search={q}
              empty={<NoMatch query={q.trim()} onClear={() => setParam('q', null)} />}
            />
          </div>
        </>
      )}
    </div>
  )
}
