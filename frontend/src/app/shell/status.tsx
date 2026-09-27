import { useQuery } from '@tanstack/react-query'
import { CloudOff, DatabaseZap, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { API_BASE, ApiError, FIXTURES } from '@/api/client'
import { useSetMemory } from '@/api/mutations'
import { healthQ, settingsQ } from '@/api/queries'
import { Eyebrow, Mono } from '@/components/precedent'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useLive } from '@/stores/live'
import { dotTone } from './live-moments'

/** The before/after switch: Hindsight memory on or off, for the whole app. */
export function MemorySwitch() {
  const settings = useQuery(settingsQ())
  const set = useSetMemory()
  const on = set.isPending ? !!set.variables : (settings.data?.memory_enabled ?? true)
  return (
    <label className="flex cursor-pointer items-center gap-2 select-none">
      <span className="text-[11px] font-semibold tracking-[0.12em] uppercase">Memory</span>
      <Switch
        checked={on}
        disabled={!settings.data || set.isPending}
        onCheckedChange={(v) =>
          set.mutate(v, {
            onSuccess: (s) =>
              toast(s.memory_enabled ? 'Memory on' : 'Memory off', {
                description: s.memory_enabled
                  ? 'Precedent recalls how the team resolved similar cases.'
                  : 'Stateless baseline: same model, no past decisions.',
              }),
            onError: (e) => toast.error('Could not switch memory', { description: e.message }),
          })
        }
        aria-label="Hindsight memory"
      />
      <span className="w-7 text-xs font-medium tabular-nums">{on ? 'On' : 'Off'}</span>
    </label>
  )
}

/** Hindsight health dot; hover shows the real memory bank and model chain. */
export function HealthDot() {
  const health = useQuery(healthQ())
  const settings = useQuery(settingsQ())
  const sse = useLive((s) => s.sse)
  const up = health.data?.hindsight === 'up'
  const known = !!health.data
  const tone = dotTone(health.data?.hindsight, sse)
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button type="button" className="flex items-center gap-1.5 text-xs text-muted-foreground outline-none">
          <span
            className={cn(
              'size-2 rounded-full',
              tone === 'up' ? 'bg-approve' : tone === 'down' ? 'bg-hold' : 'bg-muted-foreground/40',
            )}
            aria-hidden
          />
          <span className="hidden xl:inline">Hindsight</span>
          <span className="sr-only">
            {tone === 'offline' ? 'Live updates disconnected' : known ? (up ? 'Hindsight up' : 'Hindsight down') : 'Checking Hindsight'}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80 space-y-3 text-sm">
        <Eyebrow>System</Eyebrow>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Hindsight</dt>
          <dd className={cn('font-medium', up ? 'text-approve' : 'text-hold')}>
            {known ? (up ? 'Up' : 'Unreachable') : 'Checking…'}
          </dd>
          <dt className="text-muted-foreground">Memory bank</dt>
          <dd>
            <Mono>{settings.data?.bank_id ?? '—'}</Mono>
          </dd>
          <dt className="text-muted-foreground">Model chain</dt>
          <dd className="space-y-0.5">
            {(settings.data?.llm_chain ?? []).map((m) => (
              <Mono key={m} className="block truncate">
                {m}
              </Mono>
            ))}
          </dd>
          <dt className="text-muted-foreground">Live updates</dt>
          <dd>{sse === 'open' ? 'Connected' : sse === 'off' ? 'Off' : sse === 'connecting' ? 'Connecting…' : 'Reconnecting…'}</dd>
          <dt className="text-muted-foreground">Data</dt>
          <dd>{FIXTURES ? 'Sample data (docs/mocks)' : <Mono>{API_BASE}</Mono>}</dd>
        </dl>
      </HoverCardContent>
    </HoverCard>
  )
}

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

function Banner({ tone, icon, children }: { tone: 'warn' | 'quiet'; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-3 border-b px-4 py-2 text-xs md:px-6 [&_svg]:size-4 [&_svg]:shrink-0',
        tone === 'warn' ? 'border-hold/30 bg-hold-soft text-foreground [&_svg]:text-hold' : 'border-rule bg-muted/60 text-muted-foreground',
      )}
    >
      {icon}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
    </div>
  )
}

/** System states: API unreachable, Hindsight down, offline, sample-data mode. */
export function Banners() {
  const health = useQuery(healthQ())
  const online = useOnline()
  const unreachable = health.error instanceof ApiError && health.error.status === 0

  if (!online)
    return (
      <Banner tone="warn" icon={<CloudOff />}>
        You're offline. Showing the last synced data.
      </Banner>
    )
  if (FIXTURES)
    return (
      <Banner tone="quiet" icon={<DatabaseZap />}>
        <span>
          Sample data mode: answers come from <Mono>docs/mocks</Mono> (Week 3).
        </span>
        <a className="underline underline-offset-2 hover:text-foreground" href="?fixtures=0">
          Use the live backend
        </a>
      </Banner>
    )
  if (unreachable)
    return (
      <Banner tone="warn" icon={<TriangleAlert />}>
        <span>
          Can't reach the Precedent API at <Mono>{API_BASE}</Mono>.
        </span>
        <Button size="xs" variant="outline" asChild>
          <a href="?fixtures=1">Use sample data</a>
        </Button>
      </Banner>
    )
  if (health.data?.hindsight === 'down')
    return (
      <Banner tone="warn" icon={<TriangleAlert />}>
        Hindsight memory is unreachable. Recommendations fall back to recall + model, and memory views are paused.
      </Banner>
    )
  return null
}
