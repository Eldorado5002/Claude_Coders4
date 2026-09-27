import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useAdvance } from '@/api/mutations'
import { demoQ } from '@/api/queries'
import { useTheme } from '@/app/theme'
import { Kbd } from '@/components/ui/kbd'
import { useLive } from '@/stores/live'
import { useUi } from '@/stores/ui'

/** Global keys + presenter mode (bigger type for the projector, number keys jump stages). */
export function useShellShortcuts() {
  const { presenter, togglePresenter } = useUi()
  const { toggle } = useTheme()
  const demo = useQuery(demoQ())
  const advance = useAdvance()
  const busy = useLive((s) => s.simBusy)

  useEffect(() => {
    document.documentElement.dataset.presenter = presenter ? 'true' : 'false'
  }, [presenter])

  useHotkeys('p', togglePresenter)
  useHotkeys('d', toggle)

  const stages = demo.data?.stages ?? []
  const at = stages.findIndex((s) => s.id === demo.data?.stage)
  const jump = (i: number) => {
    const s = stages[i]
    if (!presenter || busy || !s || i === at) return
    advance.mutate(s.id)
  }
  useHotkeys('1', () => jump(0), [presenter, busy, at, stages])
  useHotkeys('2', () => jump(1), [presenter, busy, at, stages])
  useHotkeys('3', () => jump(2), [presenter, busy, at, stages])
  useHotkeys('4', () => jump(3), [presenter, busy, at, stages])
  useHotkeys('bracketleft', () => jump(at - 1), [presenter, busy, at, stages])
  useHotkeys('bracketright', () => jump(at + 1), [presenter, busy, at, stages])
}

export function PresenterHint() {
  const presenter = useUi((s) => s.presenter)
  if (!presenter) return null
  const k = (key: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <Kbd>{key}</Kbd>
      <span>{label}</span>
    </span>
  )
  return (
    <div className="animate-rise pointer-events-none fixed right-4 bottom-4 z-40 hidden flex-wrap items-center gap-x-4 gap-y-1 border border-rule bg-card/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm lg:flex">
      <span className="font-semibold tracking-[0.12em] text-foreground uppercase">Presenter</span>
      {k('1–4', 'stages')}
      {k('J K', 'cases')}
      {k('↵', 'accept')}
      {k('⌘K', 'search / ask')}
      {k('P', 'exit')}
    </div>
  )
}
