import { useQuery } from '@tanstack/react-query'
import { BookMarked, Check, ChevronsUpDown, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { lessonsQ } from '@/api/queries'
import { EmptyState } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Marker, MarkerContent } from '@/components/ui/marker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { simDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LessonItem } from './lesson-item'
import {
  filterByVendor,
  groupByDay,
  lessonStats,
  lessonVendors,
  lessonsHeadline,
  type LessonVendor,
} from './lessons-view'
import { LessonsSkeleton, LoadError } from './memory-states'

function VendorFilter({
  vendors,
  value,
  onChange,
}: {
  vendors: LessonVendor[]
  value?: string
  onChange: (id?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = vendors.find((v) => v.id === value)
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            aria-label="Filter lessons by vendor"
            className={cn(
              'h-7 max-w-[15rem] justify-between gap-1.5 font-medium tracking-normal normal-case',
              !current && 'text-muted-foreground',
            )}
          >
            <span className="truncate">{current?.name ?? 'All vendors'}</span>
            <ChevronsUpDown className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Filter vendors…" />
            <CommandList>
              <CommandEmpty>No vendor matches.</CommandEmpty>
              <CommandGroup>
                {vendors.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={`${v.name} ${v.id}`}
                    onSelect={() => {
                      onChange(v.id === value ? undefined : v.id)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn('size-3.5', v.id === value ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{v.name}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{v.count}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {current && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onChange(undefined)}
          aria-label={`Show lessons for all vendors`}
        >
          <X />
        </Button>
      )}
    </div>
  )
}

export function LessonsTab({ vendor, onVendor }: { vendor?: string; onVendor: (id?: string) => void }) {
  const q = useQuery(lessonsQ())
  const all = useMemo(() => q.data ?? [], [q.data])
  const vendors = useMemo(() => lessonVendors(all), [all])
  const visible = useMemo(() => filterByVendor(all, vendor), [all, vendor])
  const days = useMemo(() => groupByDay(visible), [visible])

  if (q.isPending) return <LessonsSkeleton />
  // a failed background refetch keeps the lessons already on screen
  if (!q.data) return <LoadError error={q.error ?? new Error('No data')} what="The lessons" onRetry={() => void q.refetch()} />
  if (all.length === 0)
    return (
      <EmptyState icon={<BookMarked />} title="No lessons yet.">
        Every case the team resolves is filed here as a lesson, with the reason Precedent learns from.
      </EmptyState>
    )

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {lessonsHeadline(lessonStats(visible))}
        </p>
        <VendorFilter vendors={vendors} value={vendor} onChange={onVendor} />
      </div>

      {days.length === 0 ? (
        <EmptyState
          title="No lessons for this vendor yet."
          action={
            <Button variant="outline" size="sm" onClick={() => onVendor(undefined)}>
              Show all vendors
            </Button>
          }
        />
      ) : (
        days.map((d) => (
          <section key={d.day} aria-labelledby={`day-${d.day}`}>
            <Marker asChild className="text-[11px] font-semibold tracking-[0.12em]">
              <h2 id={`day-${d.day}`}>
                <MarkerContent>{simDate(d.day)}</MarkerContent>
                <span aria-hidden className="h-px min-w-6 flex-1 bg-rule" />
                <span className="font-normal tracking-normal normal-case tabular-nums">
                  {d.lessons.length} {d.lessons.length === 1 ? 'lesson' : 'lessons'}
                </span>
              </h2>
            </Marker>
            <ol className="divide-y divide-rule">
              {d.lessons.map((l) => (
                <LessonItem key={l.case_id} lesson={l} />
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  )
}
