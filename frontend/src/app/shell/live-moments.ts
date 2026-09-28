import { useEffect } from 'react'
import { toast } from 'sonner'
import type { ExceptionType } from '@/api/types'
import { onServerEvent } from '@/hooks/use-server-events'
import { TYPE_LABEL } from '@/lib/labels'
import { useLive } from '@/stores/live'

type Payload = Record<string, unknown>

/** Which live events deserve a toast. Silent while the simulator replays days (it would be a flood). */
export function momentFor(event: string, data: Payload, busy: boolean): { title: string; description: string } | null {
  if (busy) return null
  if (event === 'exception.created') {
    const vendor = (data.vendor as { name?: string } | undefined)?.name ?? 'A vendor'
    const type = TYPE_LABEL[data.primary_type as ExceptionType] ?? String(data.primary_type)
    return {
      title: data.blocking ? 'Hard control blocked an invoice' : 'New exception',
      description: `${vendor} · ${type} · ${String(data.id)}`,
    }
  }
  if (event === 'memory.retained') return { title: '◆ Precedent learned', description: String(data.text ?? '') }
  return null
}

export type DotTone = 'up' | 'down' | 'offline' | 'unknown'

/** Top-bar status dot: grey when live updates drop, else Hindsight health. */
export function dotTone(hindsight: 'up' | 'down' | undefined, sse: 'connecting' | 'open' | 'closed' | 'off'): DotTone {
  if (sse === 'closed') return 'offline'
  if (!hindsight) return 'unknown'
  return hindsight
}

/** Mount once in the shell: turns server events into toasts. */
export function useLiveMoments() {
  useEffect(
    () =>
      onServerEvent((event, data) => {
        const m = momentFor(event, data, useLive.getState().simBusy)
        if (m) toast(m.title, { description: m.description })
      }),
    [],
  )
}
