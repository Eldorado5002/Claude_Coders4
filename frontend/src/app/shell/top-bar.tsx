import { useQuery } from '@tanstack/react-query'
import { useNavigation } from 'react-router'
import { settingsQ } from '@/api/queries'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { simDate } from '@/lib/format'
import { StageRail } from './stage-rail'
import { HealthDot, MemorySwitch } from './status'

export function TopBar() {
  const settings = useQuery(settingsQ())
  const navigating = useNavigation().state === 'loading'
  const memoryOff = settings.data?.memory_enabled === false

  return (
    <div className="sticky top-0 z-30 bg-background">
      <header className="relative flex h-14 items-center gap-3 border-b border-rule px-3 md:px-5">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="!h-5" />
        <div className="min-w-0 leading-tight">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Simulated day</div>
          <div className="truncate text-sm font-medium">{settings.data ? simDate(settings.data.sim_date) : '—'}</div>
        </div>
        <StageRail className="mx-auto hidden lg:flex" />
        <div className="ml-auto flex items-center gap-4">
          <MemorySwitch />
          <HealthDot />
        </div>
        {navigating && <div className="writing-rule absolute inset-x-0 -bottom-px" aria-hidden />}
      </header>
      {memoryOff && (
        <div className="hatch flex items-center justify-center gap-2 border-b border-rule py-1.5 text-center text-[11px] font-semibold tracking-[0.12em] uppercase">
          Memory off · stateless baseline
          <span className="font-normal tracking-normal text-muted-foreground normal-case">
            same model, no past decisions
          </span>
        </div>
      )}
      <StageRail className="flex justify-center border-b border-rule py-1.5 lg:hidden" />
    </div>
  )
}
