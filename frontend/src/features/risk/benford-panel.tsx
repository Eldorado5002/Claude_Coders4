import { useQuery } from '@tanstack/react-query'
import { Sigma } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, XAxis, YAxis } from 'recharts'
import { benfordQ } from '@/api/queries'
import type { BenfordResult } from '@/api/types'
import { EmptyState, Section } from '@/components/precedent'
import { Safe } from '@/components/precedent/safe'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { RiskLoadError } from './risk-parts'
import {
  CONFORMITY_SCALE,
  benfordAxis,
  benfordRows,
  benfordVerdict,
  pctFigure,
  signedPts,
  type BenfordRow,
  type VerdictTone,
} from './risk-view'

const EXPLANATION =
  'In genuine financial data, about 30% of amounts start with 1. Large deviations can point to invented invoices.'

type SeriesKey = 'observed' | 'expected'
const SERIES: Record<SeriesKey, { label: string; color: string }> = {
  observed: { label: 'Invoice amounts', color: 'var(--chart-1)' },
  expected: { label: 'Benford’s law', color: 'var(--chart-2)' },
}
const config = {
  observed: { label: SERIES.observed.label, color: SERIES.observed.color },
  expected: { label: SERIES.expected.label, color: SERIES.expected.color },
} satisfies ChartConfig

const HEIGHT = 280
const DASH = '6 4'

const TONE_WORD: Record<VerdictTone, string> = {
  neutral: 'text-foreground',
  hold: 'text-hold',
  reject: 'text-reject',
  muted: 'text-muted-foreground',
}

/** Legend keys: a block for the bars, a dashed stroke for the reference line. */
function SeriesKeyMark({ series }: { series: SeriesKey }) {
  if (series === 'observed')
    return <span className="inline-block size-2.5 shrink-0 rounded-[1px]" style={{ background: SERIES.observed.color }} aria-hidden />
  return (
    <svg width="18" height="4" viewBox="0 0 18 4" aria-hidden className="shrink-0">
      <line x1="1" x2="17" y1="2" y2="2" stroke={SERIES.expected.color} strokeWidth="2" strokeDasharray="4 3" />
    </svg>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {(Object.keys(SERIES) as SeriesKey[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <SeriesKeyMark series={k} />
          {SERIES[k].label}
        </li>
      ))}
    </ul>
  )
}

/** Direct label at the right end of the dashed reference line. */
function ExpectedEndLabel(props: {
  viewBox?: unknown
  x?: number | string
  y?: number | string
  index?: number
  last: number
}) {
  // a Line's label viewBox is the point itself; fall back to x/y
  const point = (props.viewBox ?? {}) as { x?: number; y?: number }
  const x = Number(point.x ?? props.x)
  const y = Number(point.y ?? props.y)
  if (props.index !== props.last || Number.isNaN(x) || Number.isNaN(y)) return null
  return (
    <text x={x + 10} y={y} dominantBaseline="central" className="fill-muted-foreground text-[11px]">
      Benford
    </text>
  )
}

function BenfordTable({ rows }: { rows: BenfordRow[] }) {
  return (
    <details className="group text-xs">
      <summary className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground underline decoration-rule underline-offset-4 select-none hover:text-foreground focus-visible:text-foreground">
        <span className="group-open:hidden">View as table</span>
        <span className="hidden group-open:inline">Hide table</span>
      </summary>
      <Table className="mt-2 text-xs">
        <caption className="sr-only">Share of amounts by first digit, observed vs Benford’s law</caption>
        <TableHeader>
          <TableRow>
            <TableHead>First digit</TableHead>
            <TableHead className="text-right">Observed</TableHead>
            <TableHead className="text-right">Benford</TableHead>
            <TableHead className="text-right">Difference</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.digit}>
              <TableCell className="tabular-nums">{r.digit}</TableCell>
              <TableCell className="text-right tabular-nums">{pctFigure(r.observed)}</TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">{pctFigure(r.expected)}</TableCell>
              <TableCell className="text-right tabular-nums">{signedPts(r.diff)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </details>
  )
}

/** Observed first-digit shares (ink bars) against Benford's expected curve (muted, dashed), one % axis. */
function BenfordChart({ rows }: { rows: BenfordRow[] }) {
  const compact = useIsMobile()
  const axis = benfordAxis(rows)
  return (
    <figure className="min-w-0 space-y-3" aria-labelledby="benford-chart-title">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <figcaption className="min-w-0 space-y-1">
          <h3 id="benford-chart-title" className="serif-display text-[1.4rem] leading-tight">
            First digit of each amount
          </h3>
          <p className="text-xs text-pretty text-muted-foreground">Share of amounts starting with 1 to 9.</p>
        </figcaption>
        <Legend />
      </div>
      <ChartContainer config={config} id="benford" className="aspect-auto w-full" style={{ height: HEIGHT }}>
        <ComposedChart data={rows} margin={{ top: 8, right: compact ? 8 : 64, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis dataKey="digit" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            domain={[0, axis.max]}
            ticks={axis.ticks}
            tickFormatter={(v: number) => `${v}%`}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            width={42}
          />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
            content={
              <ChartTooltipContent
                className="min-w-44"
                labelFormatter={(_, payload) => {
                  const r = payload?.[0]?.payload as BenfordRow | undefined
                  return r ? `Starts with ${r.digit}` : null
                }}
                formatter={(value, name) => {
                  const key = name as SeriesKey
                  return (
                    <div className="flex w-full items-center gap-2">
                      <SeriesKeyMark series={key} />
                      <span className="font-medium text-foreground tabular-nums">
                        {typeof value === 'number' ? pctFigure(value) : '—'}
                      </span>
                      <span className="text-muted-foreground">{SERIES[key]?.label ?? name}</span>
                    </div>
                  )
                }}
              />
            }
          />
          <Bar
            dataKey="observed"
            fill="var(--color-observed)"
            maxBarSize={24}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            dataKey="expected"
            type="linear"
            stroke="var(--color-expected)"
            strokeWidth={2}
            strokeDasharray={DASH}
            dot={{ r: 3.5, fill: 'var(--color-expected)', stroke: 'var(--background)', strokeWidth: 2 }}
            activeDot={{ r: 4, fill: 'var(--color-expected)', stroke: 'var(--background)', strokeWidth: 2 }}
            isAnimationActive={false}
          >
            {!compact && (
              <LabelList dataKey="expected" content={(p) => <ExpectedEndLabel {...p} last={rows.length - 1} />} />
            )}
          </Line>
        </ComposedChart>
      </ChartContainer>
      <BenfordTable rows={rows} />
    </figure>
  )
}

/** The verdict first: MAD and its conformity word, what it means, and where it sits on Nigrini's bands. */
function Verdict({ b }: { b: BenfordResult }) {
  const v = benfordVerdict(b)
  return (
    <div className="min-w-0 space-y-5">
      <div className="space-y-2">
        <p className="serif-display text-[1.9rem] leading-tight tabular-nums">
          {v.mad == null ? (
            <span className={TONE_WORD.muted}>{v.text}</span>
          ) : (
            <>
              MAD {v.mad}
              <span className="text-muted-foreground"> · </span>
              <span className={TONE_WORD[v.tone]}>{v.conformity}</span>
            </>
          )}
        </p>
        <p className="text-sm text-pretty">{v.sentence}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {b.n.toLocaleString('en-IN')} invoice {b.n === 1 ? 'amount' : 'amounts'} analysed
        </p>
      </div>

      <p className="border-l border-rule pl-4 font-serif text-[15px] leading-relaxed text-pretty">{EXPLANATION}</p>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Mean absolute deviation (Nigrini)
        </p>
        <ol className="divide-y divide-rule border-y border-rule text-sm">
          {CONFORMITY_SCALE.map((s) => {
            const current = s.conformity === v.conformity
            return (
              <li
                key={s.conformity}
                aria-current={current ? 'true' : undefined}
                className={cn('flex items-baseline justify-between gap-4 py-1.5', current ? 'font-medium' : 'text-muted-foreground')}
              >
                <span className="flex items-baseline gap-2">
                  <span className={cn('w-2 text-[10px]', current ? TONE_WORD[v.tone] : 'invisible')} aria-hidden>
                    ▸
                  </span>
                  <span className={current ? TONE_WORD[v.tone] : undefined}>{s.label}</span>
                  {current && <span className="sr-only">(this result)</span>}
                </span>
                <span className="tabular-nums">{s.range}</span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

const GRID = 'grid gap-10 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-14'

function BenfordSkeleton() {
  return (
    <div className={GRID} aria-busy="true" aria-label="Loading the Benford test">
      <div className="space-y-3">
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="mt-6 h-16 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-[280px] w-full" />
      </div>
    </div>
  )
}

export function BenfordSection() {
  const q = useQuery(benfordQ())
  return (
    <Section title="Benford’s law" aside="All invoice amounts received so far">
      {q.isPending ? (
        <BenfordSkeleton />
      ) : q.isError ? (
        <RiskLoadError error={q.error} what="benford" retry={() => void q.refetch()} />
      ) : q.data.n === 0 ? (
        <EmptyState className="py-10" icon={<Sigma />} title="No invoice amounts yet.">
          The test runs once invoices arrive.
        </EmptyState>
      ) : (
        <div className={cn(GRID, 'pt-3')}>
          <Verdict b={q.data} />
          <Safe label="This chart">
            <BenfordChart rows={benfordRows(q.data)} />
          </Safe>
        </div>
      )}
    </Section>
  )
}
