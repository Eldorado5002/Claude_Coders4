import { useQuery } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import type { StatusFilter } from '@/api/keys'
import { exceptionsQ, settingsQ } from '@/api/queries'
import type { ExceptionType } from '@/api/types'
import { Narrator } from '@/app/shell/narrator'
import { EmptyState, Eyebrow } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { insideDialogOrForm } from '@/lib/hotkeys'
import { cn } from '@/lib/utils'
import { CaseRow } from './case-row'
import { DocketFilters } from './docket-filters'
import { DocketSort } from './docket-sort'
import { docketView, neighbour, parseSort, querySort } from './docket-view'
import { useFresh } from './use-fresh'

const TABS: { id: StatusFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'auto_resolved', label: 'Auto' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
]

const EMPTY: Record<StatusFilter, { title: string; body: string }> = {
  open: { title: 'Docket clear.', body: 'Precedent handled everything that arrived today.' },
  auto_resolved: {
    title: 'Nothing auto-resolved yet.',
    body: 'Precedent earns autonomy after three accepted recommendations in a row for the same vendor and exception type.',
  },
  resolved: { title: 'No decisions yet.', body: 'Resolved cases, and the reasons behind them, collect here.' },
  all: { title: 'No exceptions yet.', body: 'Invoices that fail the 3-way match will appear here.' },
}

export default function DocketPage() {
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as StatusFilter) || 'open'
  const vendor = params.get('vendor') ?? undefined
  const type = (params.get('type') as ExceptionType | null) ?? undefined
  const sort = parseSort(params.get('sort'))
  const { id: activeId } = useParams()
  const navigate = useNavigate()
  const { search } = useLocation()
  const isMobile = useIsMobile()

  const settings = useQuery(settingsQ())
  const list = useQuery(exceptionsQ({ status: 'all', vendor_id: vendor, type, sort: querySort(sort) }))
  const { visible, counts } = useMemo(() => docketView(list.data?.items ?? [], status, sort), [list.data, status, sort])
  const ids = useMemo(() => visible.map((c) => c.id), [visible])
  const fresh = useFresh(ids, `${status}|${vendor ?? ''}|${type ?? ''}|${sort}`)
  const rowRefs = useRef(new Map<string, HTMLAnchorElement>())

  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const go = (dir: 1 | -1) => {
    const next = neighbour(ids, activeId, dir)
    if (!next || next === activeId) return
    navigate({ pathname: `/exceptions/${next}`, search })
    rowRefs.current.get(next)?.scrollIntoView({ block: 'nearest' })
  }
  useHotkeys('j', () => go(1), { ignoreEventWhen: insideDialogOrForm }, [ids, activeId, search])
  useHotkeys('k', () => go(-1), { ignoreEventWhen: insideDialogOrForm }, [ids, activeId, search])

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-rule px-5 pt-5 pb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Eyebrow>Docket</Eyebrow>
            <h1 className="serif-display text-[1.9rem] leading-tight">Exceptions</h1>
          </div>
          <span className="pb-1 text-xs text-muted-foreground tabular-nums">
            {list.data ? `${counts.open} open` : ''}
          </span>
        </div>
        <Tabs value={status} onValueChange={(v) => setParam('status', v === 'open' ? undefined : v)}>
          <TabsList variant="line" className="-mx-1 h-9 w-full justify-start gap-0">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="flex-none px-2.5 text-[11px]">
                {t.label}
                <span className="font-normal tabular-nums opacity-60">{list.data ? counts[t.id] : ''}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <DocketFilters
          vendor={vendor}
          type={type}
          onVendor={(v) => setParam('vendor', v)}
          onType={(t) => setParam('type', t)}
        />
        <DocketSort value={sort} onChange={(s) => setParam('sort', s === 'newest' ? undefined : s)} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {list.isPending ? (
          <div className="space-y-px">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="space-y-2.5 border-b border-rule px-5 py-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-5 w-1/3" />
              </div>
            ))}
          </div>
        ) : list.isError ? (
          <EmptyState title="The docket didn’t load." action={<Button variant="outline" size="sm" onClick={() => list.refetch()}>Try again</Button>}>
            {list.error.message}
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState icon={<Inbox />} title={vendor || type ? 'No cases match these filters.' : EMPTY[status].title}>
            {vendor || type ? null : (
              <>
                {EMPTY[status].body}
                {status === 'open' && counts.auto_resolved > 0 && (
                  <button className="mt-2 block w-full underline underline-offset-4" onClick={() => setParam('status', 'auto_resolved')}>
                    See the {counts.auto_resolved} it resolved on its own
                  </button>
                )}
              </>
            )}
          </EmptyState>
        ) : (
          <nav aria-label="Exceptions">
            {visible.map((c) => (
              <CaseRow
                key={c.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(c.id, el)
                  else rowRefs.current.delete(c.id)
                }}
                c={c}
                to={`/exceptions/${c.id}${search}`}
                active={c.id === activeId}
                fresh={fresh.has(c.id)}
                simToday={settings.data?.sim_date}
              />
            ))}
          </nav>
        )}
      </ScrollArea>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Narrator />
      {isMobile ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{activeId ? <Outlet /> : listPane}</div>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1" id="docket">
          <ResizablePanel defaultSize={420} minSize={340} maxSize={600} className="border-r border-rule bg-card/40">
            <div className="h-full">{listPane}</div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel minSize={560} className={cn('min-w-0')}>
            <div className="h-full overflow-y-auto" id="case-scroll">
              <Outlet />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  )
}
