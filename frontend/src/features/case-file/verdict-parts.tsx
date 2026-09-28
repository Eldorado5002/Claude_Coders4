import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ExceptionDetail, Recommendation } from '@/api/types'
import { AgentMark, DecisionChip, Eyebrow } from '@/components/precedent'
import { cn } from '@/lib/utils'

/** While the agent writes its opinion (7–9 s against Hindsight Cloud). */
export function ReasoningState({ vendor }: { vendor: string }) {
  const steps = [`Recalling ${vendor}’s precedents…`, 'Weighing past decisions…', 'Checking hard controls…']
  const [at, setAt] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setAt((i) => Math.min(i + 1, steps.length - 1)), 2400)
    return () => window.clearInterval(t)
  }, [steps.length])
  return (
    <div className="space-y-4 px-5 py-6" role="status" aria-live="polite">
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li
            key={s}
            className={cn(
              'flex items-center gap-2.5 font-serif text-[1.05rem] transition-opacity duration-300',
              i > at && 'opacity-35',
              i < at && 'text-muted-foreground',
            )}
          >
            {i < at ? <Check className="size-3.5" strokeWidth={2.5} /> : <AgentMark className={cn(i === at && 'animate-pulse')} />}
            {s}
          </li>
        ))}
      </ol>
      <div className="writing-rule" aria-hidden />
    </div>
  )
}

function Mini({ label, rec, withMemory }: { label: string; rec: Recommendation; withMemory: boolean }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {withMemory ? <AgentMark /> : <span className="inline-block size-2 rounded-full border border-current" aria-hidden />}
        {label}
      </div>
      <div className="flex items-center gap-2">
        <DecisionChip action={rec.action} size="xs" />
        <span className="text-xs font-medium tabular-nums">{Math.round(rec.confidence * 100)}</span>
      </div>
    </div>
  )
}

/** The before/after on the same case: shows once both memory modes are in the cache. */
export function VerdictDiff({ c, other, memOn }: { c: ExceptionDetail; other?: ExceptionDetail | null; memOn: boolean }) {
  const cur = c.recommendation
  const oth = other?.recommendation
  if (!cur || !oth) return null
  if (cur.action === oth.action && Math.abs(cur.confidence - oth.confidence) < 0.1) return null
  const withMem = memOn ? cur : oth
  const without = memOn ? oth : cur
  return (
    <div className="animate-rise space-y-3 border border-foreground/80 px-4 py-3">
      <Eyebrow className="text-foreground">Memory changed this verdict</Eyebrow>
      <div className="flex items-center gap-4">
        <Mini label="Without memory" rec={without} withMemory={false} />
        <span className="text-lg text-muted-foreground" aria-hidden>
          →
        </span>
        <Mini label="With memory" rec={withMem} withMemory />
      </div>
    </div>
  )
}
