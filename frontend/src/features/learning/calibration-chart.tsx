import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis, usePlotArea, useXAxisScale, useYAxisScale } from 'recharts'
import type { Calibration } from '@/api/types'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { pct } from '@/lib/format'
import { binLabel, calibrationPoints, calibrationSummary, eceText, type CalPoint } from './trust-view'

const HEIGHT = 300
const TICKS = [0, 0.25, 0.5, 0.75, 1]
const config = { actual: { label: 'Actually right', color: 'var(--chart-1)' } } satisfies ChartConfig

/** The "perfect calibration" diagonal (muted, dashed), its label along the line, and the two halves named. */
function Diagonal() {
  const x = useXAxisScale()
  const y = useYAxisScale()
  const area = usePlotArea()
  if (!x || !y || !area) return null
  const x0 = x(0)
  const y0 = y(0)
  const x1 = x(1)
  const y1 = y(1)
  if (x0 == null || y0 == null || x1 == null || y1 == null) return null
  const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI
  const lx = x0 + (x1 - x0) * 0.2
  const ly = y0 + (y1 - y0) * 0.2
  return (
    <g aria-hidden>
      <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="6 4" />
      <text x={lx} y={ly - 6} transform={`rotate(${angle} ${lx} ${ly - 6})`} className="fill-muted-foreground text-[10.5px]">
        Perfect calibration
      </text>
      <text x={area.x + 8} y={area.y + 14} className="fill-muted-foreground text-[10.5px]">
        Right more often than it says
      </text>
      <text x={area.x + area.width - 8} y={area.y + area.height - 8} textAnchor="end" className="fill-muted-foreground text-[10.5px]">
        Says more than it gets right
      </text>
    </g>
  )
}

/** One ink dot per band, area by n, with a surface ring and a hit target bigger than the mark. */
function Dot(props: unknown) {
  const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: CalPoint }
  if (cx == null || cy == null || !payload) return <g />
  return (
    <g>
      <circle cx={cx} cy={cy} r={Math.max(12, payload.r + 4)} fill="transparent" />
      <circle cx={cx} cy={cy} r={payload.r} fill="var(--color-actual)" stroke="var(--background)" strokeWidth={2} />
    </g>
  )
}

/** Direct label on the biggest band only: the one most decisions sit in. */
function BiggestLabel({ points }: { points: CalPoint[] }) {
  const x = useXAxisScale()
  const y = useYAxisScale()
  if (!x || !y || !points.length) return null
  const p = points.reduce((a, b) => (b.n > a.n ? b : a))
  const px = x(p.stated)
  const py = y(p.actual)
  if (px == null || py == null) return null
  const left = p.stated > 0.5
  return (
    <text
      aria-hidden
      x={left ? px - p.r - 6 : px + p.r + 6}
      y={py}
      textAnchor={left ? 'end' : 'start'}
      dominantBaseline="central"
      className="fill-foreground text-[11px] font-medium"
    >
      {p.n} decisions
    </text>
  )
}

function DotTooltip({ active, point: p }: { active?: boolean; point?: CalPoint }) {
  if (!active || !p) return null
  return (
    <div className="grid min-w-40 gap-1 bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm ring-1 ring-foreground/10">
      <div className="font-medium">Confidence {binLabel(p)}</div>
      <div className="tabular-nums">
        Said <span className="font-medium">{pct(p.stated)}</span> · right <span className="font-medium">{pct(p.actual)}</span>
      </div>
      <div className="text-muted-foreground tabular-nums">
        {p.n} {p.n === 1 ? 'decision' : 'decisions'}
      </div>
    </div>
  )
}

function BinTable({ cal }: { cal: Calibration }) {
  const bins = cal.bins.filter((b) => b.n > 0)
  return (
    <details className="group text-xs">
      <summary className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground underline decoration-rule underline-offset-4 select-none hover:text-foreground focus-visible:text-foreground">
        <span className="group-open:hidden">View as table</span>
        <span className="hidden group-open:inline">Hide table</span>
      </summary>
      <Table className="mt-2 text-xs">
        <caption className="sr-only">Stated confidence vs how often it was right, by confidence band</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Confidence band</TableHead>
            <TableHead className="text-right">Decisions</TableHead>
            <TableHead className="text-right">Stated</TableHead>
            <TableHead className="text-right">Actually right</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bins.map((b) => (
            <TableRow key={`${b.low}-${b.high}`}>
              <TableCell className="tabular-nums">{binLabel(b)}</TableCell>
              <TableCell className="text-right tabular-nums">{b.n}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(b.stated)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {b.actual == null ? <span className="text-muted-foreground">Too few to score</span> : pct(b.actual)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </details>
  )
}

/** Stated confidence vs how often it was right: dots on the diagonal mean the confidence can be taken at its word. */
export function CalibrationChart({ cal }: { cal: Calibration }) {
  const points = calibrationPoints(cal.bins)
  // an error figure next to "not enough to check" would contradict it
  const ece = points.length ? eceText(cal.ece) : null
  const summary = calibrationSummary(cal)

  return (
    <figure className="min-w-0 space-y-3" aria-labelledby="calibration-title">
      <figcaption className="space-y-1">
        <h3 id="calibration-title" className="serif-display text-[1.4rem] leading-tight">
          Does its confidence mean what it says?
        </h3>
        <p className="text-xs text-pretty text-muted-foreground">
          Each dot is a band of stated confidence, placed at how often those recommendations were right. Bigger dots hold more
          decisions.
        </p>
      </figcaption>

      {(ece || summary) && (
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {ece && <span className="font-medium">{ece}</span>}
          {summary && <span className="text-muted-foreground">{summary}</span>}
        </p>
      )}

      {points.length === 0 ? (
        <p className="flex h-40 items-center justify-center border-y border-rule px-4 text-center text-sm text-pretty text-muted-foreground">
          Not enough scored decisions in any band yet to check calibration.
        </p>
      ) : (
        <div>
          <div className="pb-1 text-[11px] text-muted-foreground">Actually right</div>
          <ChartContainer
            config={config}
            id="calibration"
            className="aspect-auto w-full"
            style={{ height: HEIGHT }}
          >
            <ScatterChart margin={{ top: 8, right: 16, bottom: 0, left: 0 }} accessibilityLayer>
              <CartesianGrid stroke="var(--rule)" />
              <XAxis
                type="number"
                dataKey="stated"
                name="Stated"
                domain={[0, 1]}
                ticks={TICKS}
                tickFormatter={(v: number) => pct(v)}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                type="number"
                dataKey="actual"
                name="Actually right"
                domain={[0, 1]}
                ticks={TICKS}
                tickFormatter={(v: number) => pct(v)}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                width={46}
              />
              <Diagonal />
              <ChartTooltip
                cursor={false}
                content={({ active, payload }) => (
                  <DotTooltip active={active} point={payload?.[0]?.payload as CalPoint | undefined} />
                )}
              />
              <Scatter data={points} shape={Dot} isAnimationActive={false} />
              <BiggestLabel points={points} />
            </ScatterChart>
          </ChartContainer>
          <div className="pt-1 text-right text-[11px] text-muted-foreground">Stated confidence</div>
        </div>
      )}

      {points.length > 0 && <BinTable cal={cal} />}
    </figure>
  )
}
