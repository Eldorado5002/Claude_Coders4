import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type OnChangeFn,
  type SortDirection,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { VendorSummary } from '@/api/types'
import { Mono } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { categoryLabel, complianceBadges, matchesVendor, RISK_TEXT, riskFigure, riskSortValue, touchlessWidth } from './vendors-view'

const col = createColumnHelper<VendorSummary>()

const Dash = ({ sr }: { sr: string }) => (
  <span className="text-muted-foreground">
    <span aria-hidden>—</span>
    <span className="sr-only">{sr}</span>
  </span>
)

/** "58 High": score and word in the level's tone. The word column has a fixed width so scores line up. */
function Risk({ v }: { v: VendorSummary }) {
  const r = riskFigure(v.risk_score, v.risk_level)
  if (!r) return <Dash sr="No risk score yet" />
  return (
    <span className={cn('inline-flex items-baseline justify-end gap-2', RISK_TEXT[r.tone])}>
      <span className={cn('tabular-nums', r.tone !== 'muted' && 'font-semibold')}>{r.score}</span>
      <span className="w-12 text-left text-[10px] font-semibold tracking-[0.1em] uppercase">{r.label}</span>
    </span>
  )
}

/** MSME and e-invoicing as quiet outlined chips: facts, not warnings. */
function Compliance({ v }: { v: VendorSummary }) {
  const badges = complianceBadges(v)
  if (!badges.length) return <Dash sr="No MSME or e-invoicing requirement" />
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b.id}
          title={b.hint}
          className="rounded-[2px] border border-rule px-1.5 py-px text-[10px] font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase"
        >
          {b.label}
          <span className="sr-only">. {b.hint}</span>
        </span>
      ))}
    </span>
  )
}

const Count = ({ n, strong }: { n: number; strong?: boolean }) => (
  <span className={cn('tabular-nums', n === 0 ? 'text-muted-foreground' : strong && 'font-semibold')}>{n}</span>
)

function Touchless({ rate }: { rate: number | null | undefined }) {
  const w = touchlessWidth(rate)
  if (w === null) return <Dash sr="No touchless rate yet" />
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="relative hidden h-1 w-14 bg-rule sm:block" aria-hidden>
        <span className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${w}%` }} />
      </span>
      <span className="w-9 text-right tabular-nums">{w}%</span>
    </span>
  )
}

/** The vendor file's back link returns to this sort and search. */
const backState = (search: string) => ({ back: search })

function VendorName({ v }: { v: VendorSummary }) {
  const { search } = useLocation()
  return (
    <div className="min-w-44 whitespace-normal">
      <Link
        to={`/vendors/${v.id}`}
        state={backState(search)}
        className="rounded-sm font-medium decoration-rule underline-offset-4 outline-none hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {v.name}
      </Link>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {v.city} · {categoryLabel(v.category)}
      </div>
    </div>
  )
}

const columns = [
  col.accessor('name', {
    id: 'name',
    header: 'Vendor',
    sortingFn: 'text',
    cell: ({ row }) => <VendorName v={row.original} />,
  }),
  col.accessor('gstin', {
    id: 'gstin',
    header: 'GSTIN',
    sortingFn: 'text',
    cell: (c) => <Mono className="text-muted-foreground">{c.getValue()}</Mono>,
  }),
  col.accessor('payment_terms_days', {
    id: 'terms',
    header: 'Terms',
    sortDescFirst: false,
    cell: (c) => <span className="tabular-nums">{c.getValue()} days</span>,
  }),
  col.accessor('invoices_count', { id: 'invoices', header: 'Invoices', sortDescFirst: true, cell: (c) => <Count n={c.getValue()} /> }),
  col.accessor('exceptions_count', {
    id: 'exceptions',
    header: 'Exceptions',
    sortDescFirst: true,
    cell: (c) => <Count n={c.getValue()} />,
  }),
  col.accessor('open_exceptions', { id: 'open', header: 'Open', sortDescFirst: true, cell: (c) => <Count n={c.getValue()} strong /> }),
  // null → undefined so vendors without a rate always sort last, whichever way
  col.accessor((v) => v.touchless_rate ?? undefined, {
    id: 'touchless',
    header: 'Touchless',
    sortDescFirst: true,
    sortUndefined: 'last',
    cell: ({ row }) => <Touchless rate={row.original.touchless_rate} />,
  }),
  col.accessor(riskSortValue, {
    id: 'risk',
    header: 'Risk',
    sortDescFirst: true,
    sortUndefined: 'last',
    cell: ({ row }) => <Risk v={row.original} />,
  }),
  col.display({
    id: 'compliance',
    header: 'Compliance',
    enableSorting: false,
    cell: ({ row }) => <Compliance v={row.original} />,
  }),
]

const NUMERIC = new Set(['terms', 'invoices', 'exceptions', 'open', 'touchless', 'risk'])
/** Columns that step aside on narrow screens (the table still scrolls sideways if it must). */
const RESPONSIVE: Record<string, string> = {
  gstin: 'hidden xl:table-cell',
  terms: 'hidden lg:table-cell',
  invoices: 'hidden md:table-cell',
  exceptions: 'hidden sm:table-cell',
  compliance: 'hidden md:table-cell',
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

function SortIcon({ dir }: { dir: false | SortDirection }) {
  if (dir === 'asc') return <ArrowUp className="size-3 text-foreground" strokeWidth={2.5} aria-hidden />
  if (dir === 'desc') return <ArrowDown className="size-3 text-foreground" strokeWidth={2.5} aria-hidden />
  return (
    <ArrowUpDown
      className="size-3 opacity-0 transition-opacity duration-150 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60"
      strokeWidth={2.25}
      aria-hidden
    />
  )
}

type Props = {
  data: VendorSummary[]
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  search: string
  empty: ReactNode
}

export function VendorTable({ data, sorting, onSortingChange, search, empty }: Props) {
  const navigate = useNavigate()
  const { search: urlSearch } = useLocation()
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange,
    enableMultiSort: false,
    globalFilterFn: (row, _columnId, value: string) => matchesVendor(row.original, value),
    getRowId: (v) => v.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })
  const rows = table.getRowModel().rows

  // Whole row opens the vendor. Links, buttons and text selection keep their own behaviour.
  const openRow = (e: MouseEvent<HTMLTableRowElement>, id: string) => {
    if ((e.target as HTMLElement).closest('a, button, input')) return
    if (window.getSelection()?.toString()) return
    if (e.metaKey || e.ctrlKey) window.open(`/vendors/${id}`, '_blank', 'noopener')
    else navigate(`/vendors/${id}`, { state: backState(urlSearch) })
  }

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id} className="border-rule hover:bg-transparent">
            {hg.headers.map((h) => {
              const dir = h.column.getIsSorted()
              const numeric = NUMERIC.has(h.column.id)
              if (!h.column.getCanSort())
                return (
                  <TableHead key={h.id} className={cn('h-10 text-[11px] tracking-wider uppercase', RESPONSIVE[h.column.id])}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                )
              return (
                <TableHead
                  key={h.id}
                  aria-sort={dir ? ARIA_SORT[dir] : 'none'}
                  className={cn('h-10 text-[11px]', numeric && 'text-right', RESPONSIVE[h.column.id])}
                >
                  <button
                    type="button"
                    onClick={h.column.getToggleSortingHandler()}
                    className={cn(
                      'group/sort inline-flex items-center gap-1 rounded-sm tracking-wider uppercase outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40',
                      numeric && 'flex-row-reverse',
                      dir && 'text-foreground',
                    )}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    <SortIcon dir={dir} />
                  </button>
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columns.length} className="whitespace-normal">
              {empty}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={(e) => openRow(e, row.original.id)}
              className="cursor-pointer border-rule has-[a:focus-visible]:bg-muted/60"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn('py-2.5', NUMERIC.has(cell.column.id) && 'text-right', RESPONSIVE[cell.column.id])}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

export function VendorTableSkeleton() {
  return (
    <div aria-busy className="divide-y divide-rule border-y border-rule">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center gap-6 py-3.5">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-3 w-32 lg:block" />
          <Skeleton className="hidden h-3 w-14 md:block" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="hidden h-3 w-24 md:block" />
        </div>
      ))}
    </div>
  )
}

export function NoMatch({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="serif-display text-xl text-balance">No vendor matches “{query}”.</p>
      <p className="text-sm text-muted-foreground">Search looks at the vendor’s name, city and GSTIN.</p>
      <Button variant="outline" size="sm" onClick={onClear}>
        Clear search
      </Button>
    </div>
  )
}
