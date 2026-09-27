import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAdvance, useReset } from '@/api/mutations'
import { demoQ } from '@/api/queries'
import type { DemoStage, DemoStageId } from '@/api/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { simDate, simDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLive } from '@/stores/live'

/** Day 1 → Week 3 → Week 8 → The twist. Snapshots make each jump near-instant. */
export function StageRail({ className }: { className?: string }) {
  const demo = useQuery(demoQ())
  const advance = useAdvance()
  const reset = useReset()
  const busy = useLive((s) => s.simBusy) || !!demo.data?.busy
  const target = useLive((s) => s.simTarget)
  const [confirm, setConfirm] = useState<DemoStage | 'reset' | null>(null)

  if (!demo.data) return <div className={cn('h-8 w-[26rem]', className)} aria-hidden />
  const { stages, stage: current } = demo.data
  const at = stages.findIndex((s) => s.id === current)

  const go = (id: DemoStageId) =>
    advance.mutate(id, {
      onSuccess: (s) => toast(`Now at ${s.stages.find((x) => x.id === s.stage)?.label}`, { description: simDate(s.sim_date) }),
      onError: (e) => toast.error('Could not change stage', { description: e.message }),
    })

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <ol className="flex items-center" aria-label="Demo timeline">
        {stages.map((s, i) => {
          const isCurrent = s.id === current
          const reached = i <= at
          return (
            <li key={s.id} className="flex items-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn('mx-1.5 h-px w-6 xl:w-9', i <= at ? 'bg-foreground' : 'bg-border')}
                />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => !isCurrent && setConfirm(s)}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={cn(
                      'group flex items-center gap-1.5 px-1 py-1 text-xs outline-none disabled:cursor-wait',
                      isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'relative size-2.5 rounded-full border border-foreground transition-colors',
                        reached ? 'bg-foreground' : 'bg-transparent border-muted-foreground/60',
                        isCurrent && 'ring-2 ring-foreground/15 ring-offset-2 ring-offset-background',
                        busy && target === s.id && 'animate-pulse',
                      )}
                    />
                    <span className="whitespace-nowrap">{s.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="font-medium">{s.description}</span>
                  <span className="text-background/70"> · {simDay(s.sim_date)}</span>
                </TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ol>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Demo options" disabled={busy}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setConfirm('reset')}>
            <RotateCcw /> Reset demo to Day 1
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="serif-display text-2xl font-medium">
              {confirm === 'reset' ? 'Reset the demo to Day 1?' : `Go to ${confirm?.label}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'reset'
                ? 'The docket, trust and memory return to a fresh agent on 2 Mar 2026.'
                : confirm && (
                    <>
                      {confirm.description}. The simulated clock moves to {simDate(confirm.sim_date)}.
                    </>
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm === 'reset')
                  reset.mutate(undefined, { onError: (e) => toast.error('Reset failed', { description: e.message }) })
                else if (confirm) go(confirm.id)
                setConfirm(null)
              }}
            >
              {confirm === 'reset' ? 'Reset' : 'Go'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
