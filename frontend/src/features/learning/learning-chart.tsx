import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis, usePlotArea, useXAxisScale, useYAxisScale } from 'recharts'
import type { WeeklyPoint } from '@/api/types'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useIsMobile } from '@/hooks/use-mobile'
import { pct, simDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { STAGE_MARKERS, hasBaseline, lastPoint, spreadLabels } from './learning-view'

type SeriesKey = 'memory_on' | 'memory_off'

const SERIES: Record<SeriesKey, { label: string; color: string; dash?: string }> = {
  memory_on: { label: 'With memory', color: 'var(--chart-1)' },
  memory_off: { label: 'Without memory', color: 'var(--chart-2)', dash: '6 4' },
}

const config = {
  memory_on: { label: SERIES.memory_on.label, color: SERIES.memory_on.color },
  memory_off: { label: SERIES.memory_off.label, color: SERIES.memory_off.color },
} satisfies ChartConfig

const HEIGHT = 272
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1]
// label rows above the plot: 0 = higher, 1 = just above the plot edge
const STAGE_LAYOUT: Record<number, { anchor: 'start' | 'end'; row: 0 | 1 }> = {
  1: { anchor: 'start', row: 0 },
  3: { anchor: 'start', row: 1 },
  8: { anchor: 'end', row: 0 },
  9: { anchor: 'start', row: 0 },
}

/** A short stroke of the series: the key in legends and tooltips (a line, not a box). */
export function LineKey({ series, className }: { series: SeriesKey; className?: string }) {
  const s = SERIES[series]
  return (
    <svg width="18" height="4" viewBox="0 0 18 4" aria-hidden className={cn('shrink-0', className)}>
      {/* butt caps on the dashed key: round caps would close the gaps */}
      <line
        x1="1"
        x2="17"
        y1="2"
        y2="2"
        stroke={s.color}
        strokeWidth="2"
        strokeDasharray={s.dash ? '4 3' : undefined}
        strokeLinecap={s.dash ? 'butt' : 'round'}
      />
    </svg>
  )
}

function Legend({ baseline }: { baseline: boolean }) {
  if (!baseline) return null // one series: the title already names it
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {(Object.keys(SERIES) as SeriesKey[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <LineKey series={k} />
          {SERIES[k].label}
        </li>
      ))}
    </ul>
  )
}

/** Small muted stage names above the plot, staggered on two rows so neighbours never collide. */
function StageLabel({ viewBox, text, week }: { viewBox?: { x?: number; y?: number }; text: string; week: number }) {
  const x = viewBox?.x
  const y = viewBox?.y
  if (x == null || y == null) return null
  const { anchor, row } = STAGE_LAYOUT[week] ?? { anchor: 'start', row: 0 }
  return (
    <text
      x={anchor === 'start' ? x + 3 : x - 3}
      y={y - (row === 0 ? 17 : 5)}
      textAnchor={anchor}
      className="fill-muted-foreground text-[10.5px]"
    >
      {text}
    </text>
  )
}

/** Direct labels at the right end of each line, with an end-dot and a leader line when nudged apart. */
function EndLabels({ points, baseline, compact }: { points: WeeklyPoint[]; baseline: boolean; compact: boolean }) {
  const x = useXAxisScale()
  const y = useYAxisScale()
  const area = usePlotArea()
  if (!x || !y || !area) return null

  const ends = (['memory_on', 'memory_off'] as const)
    .filter((k) => k === 'memory_on' || baseline)
    .map((k) => {
      const p = lastPoint(points, k)
      if (!p) return null
      const px = x(p.week)
      const py = y(p.value)
      return px == null || py == null ? null : { key: k, value: p.value, px, py, ly: py }
    })
    .filter((e) => e != null)

  if (ends.length === 2) {
    const [a, b] = spreadLabels([ends[0].py, ends[1].py], 15, area.y + 6, area.y + area.height - 2)
    ends[0].ly = a
    ends[1].ly = b
  }
  const labelX = area.x + area.width + 12

  return (
    <g aria-hidden>
      {ends.map((e) => (
        <g key={e.key}>
          {(e.ly !== e.py || labelX - e.px > 16) && (
            <polyline
              points={`${e.px + 6},${e.py} ${labelX - 8},${e.py} ${labelX - 4},${e.ly}`}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
          )}
          <circle cx={e.px} cy={e.py} r={4} fill={SERIES[e.key].color} stroke="var(--background)" strokeWidth={2} />
          <text x={labelX} y={e.ly} dominantBaseline="central" className="text-[11px]">
            {!compact && <tspan className="fill-muted-foreground">{SERIES[e.key].label} </tspan>}
            <tspan className="fill-foreground font-medium">{pct(e.value)}</tspan>
          </text>
        </g>
      ))}
    </g>
  )
}

function WeeklyTable({ points, baseline, caption }: { points: WeeklyPoint[]; baseline: boolean; caption: string }) {
  return (
    <details className="group text-xs">
      <summary className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground underline decoration-rule underline-offset-4 select-none hover:text-foreground focus-visible:text-foreground">
        <span className="group-open:hidden">View as table</span>
        <span className="hidden group-open:inline">Hide table</span>
      </summary>
      <Table className="mt-2 text-xs">
        <caption className="sr-only">{caption}, by week</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Week</TableHead>
            <TableHead>Starting</TableHead>
            <TableHead className="text-right">With memory</TableHead>
            {baseline && <TableHead className="text-right">Without memory</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.map((p) => (
            <TableRow key={p.week}>
              <TableCell className="tabular-nums">W{p.week}</TableCell>
              <TableCell className="text-muted-foreground">{simDay(p.week_start)}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(p.memory_on)}</TableCell>
              {baseline && <TableCell className="text-right tabular-nums">{pct(p.memory_off)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </details>
  )
}

/** One learning curve: memory on (ink, solid) vs memory off (grey, dashed), one 0–100% axis. */
export function LearningChart({
  id,
  title,
  description,
  points,
}: {
  id: string
  title: string
  description: string
  points: WeeklyPoint[]
}) {
  const compact = useIsMobile()
  const baseline = hasBaseline(points)
  const weeks = new Set(points.map((p) => p.week))
  const empty = !points.some((p) => p.memory_on != null || p.memory_off != null)

  return (
    <figure className="min-w-0 space-y-3" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <figcaption className="min-w-0 space-y-1">
          <h3 id={`${id}-title`} className="serif-display text-[1.4rem] leading-tight">
            {title}
          </h3>
          <p className="text-xs text-pretty text-muted-foreground">{description}</p>
        </figcaption>
        <Legend baseline={baseline} />
      </div>

      {empty ? (
        <p className="flex h-40 items-center justify-center border-y border-rule text-sm text-muted-foreground">
          No weeks measured yet. The curve starts once the replay has scored a week.
        </p>
      ) : (
        <ChartContainer config={config} id={id} className="aspect-auto w-full" style={{ height: HEIGHT }}>
          <LineChart
            data={points}
            margin={{ top: 30, right: compact ? 44 : 132, bottom: 0, left: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} stroke="var(--rule)" />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={18}
              tickFormatter={(w: number) => `W${w}`}
            />
            <YAxis
              domain={[0, 1]}
              ticks={Y_TICKS}
              tickFormatter={(v: number) => pct(v)}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              width={46}
            />
            {STAGE_MARKERS.filter((m) => weeks.has(m.week)).map((m) => (
              <ReferenceLine
                key={m.week}
                x={m.week}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.35}
                label={(props: { viewBox?: { x?: number; y?: number } }) => (
                  <StageLabel viewBox={props.viewBox} text={m.label} week={m.week} />
                )}
              />
            ))}
            <ChartTooltip
              cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeOpacity: 0.6 }}
              itemSorter={(item) => (item.dataKey === 'memory_on' ? 0 : 1)}
              content={
                <ChartTooltipContent
                  className="min-w-40"
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as WeeklyPoint | undefined
                    return p ? `Week ${p.week} · ${simDay(p.week_start)}` : null
                  }}
                  formatter={(value, name) => {
                    const key = name as SeriesKey
                    return (
                      <div className="flex w-full items-center gap-2">
                        <LineKey series={key} />
                        <span className="font-medium text-foreground tabular-nums">
                          {typeof value === 'number' ? pct(value) : '—'}
                        </span>
                        <span className="text-muted-foreground">{SERIES[key]?.label ?? name}</span>
                      </div>
                    )
                  }}
                />
              }
            />
            {baseline && (
              <Line
                dataKey="memory_off"
                type="monotone"
                stroke="var(--color-memory_off)"
                strokeWidth={2}
                strokeDasharray={SERIES.memory_off.dash}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--color-memory_off)', stroke: 'var(--background)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}
            <Line
              dataKey="memory_on"
              type="monotone"
              stroke="var(--color-memory_on)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--color-memory_on)', stroke: 'var(--background)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <EndLabels points={points} baseline={baseline} compact={compact} />
          </LineChart>
        </ChartContainer>
      )}

      {!empty && !baseline && <p className="text-xs text-muted-foreground">Baseline (memory off) not available yet</p>}
      {!empty && <WeeklyTable points={points} baseline={baseline} caption={title} />}
    </figure>
  )
}
