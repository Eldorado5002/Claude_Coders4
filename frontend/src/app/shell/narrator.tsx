import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { demoQ } from '@/api/queries'
import type { DemoStageId } from '@/api/types'
import { AgentMark } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { useUi } from '@/stores/ui'

const NARRATION: Record<DemoStageId, { title: string; body: string }> = {
  day1: {
    title: 'Fresh agent, no memory.',
    body: 'Watch what Precedent does with its first freight charge, then teach it why the team pays it.',
  },
  week3: {
    title: 'Two weeks of decisions later…',
    body: 'The same kind of invoice arrives. Precedent now cites the team’s own precedents. Flip memory off to see the difference.',
  },
  week8: {
    title: 'Earned autonomy.',
    body: 'After enough accepted recommendations, Precedent resolves Balaji’s freight on its own, inside limits humans already approved.',
  },
  twist: {
    title: 'Someone changes Balaji’s bank account.',
    body: 'Balaji’s freight is on autopilot, yet this invoice stops cold: a changed bank account and a resubmitted duplicate hit hard controls, which run before memory and never bend.',
  },
}

/** One narrator card per demo stage, dismissible, for the judges. */
export function Narrator() {
  const demo = useQuery(demoQ())
  const { narratorsSeen, seeNarrator } = useUi()
  const stage = demo.data?.stage
  if (!stage || narratorsSeen.includes(stage)) return null
  const n = NARRATION[stage]
  const label = demo.data?.stages.find((s) => s.id === stage)?.label
  return (
    <aside className="animate-rise relative border-b border-rule bg-card px-5 py-4 pr-12">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        <AgentMark /> {label}
      </div>
      <p className="serif-display text-xl leading-snug">{n.title}</p>
      <p className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground">{n.body}</p>
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-3 right-3"
        onClick={() => seeNarrator(stage)}
        aria-label="Dismiss"
      >
        <X />
      </Button>
    </aside>
  )
}
