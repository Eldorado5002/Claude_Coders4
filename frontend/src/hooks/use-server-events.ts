import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { API_BASE, FIXTURES } from '@/api/client'
import { eventInvalidations } from '@/api/keys'
import { useLive } from '@/stores/live'

export const SERVER_EVENTS = [
  'exception.created',
  'exception.updated',
  'memory.retained',
  'autonomy.changed',
  'memory.revoked',
  'sim.changed',
] as const
export type ServerEvent = (typeof SERVER_EVENTS)[number]

type Listener = (event: ServerEvent, data: Record<string, unknown>) => void
const listeners = new Set<Listener>()

/** Subscribe to raw server events for UI moments (toasts, stamps). Returns an unsubscribe. */
export function onServerEvent(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Mount once. Keeps TanStack Query fresh from the backend's SSE stream. */
export function useServerEvents() {
  const qc = useQueryClient()
  useEffect(() => {
    if (FIXTURES || typeof EventSource === 'undefined') {
      useLive.setState({ sse: 'off' })
      return
    }
    let es: EventSource | undefined
    let disposed = false
    let attempt = 0
    let retry: number | undefined
    let flush: number | undefined
    let everything = false
    const pending = new Map<string, readonly unknown[]>()

    const schedule = () => {
      if (flush) return
      // while the simulator is replaying days, batch the flood of events
      const delay = useLive.getState().simBusy ? 1000 : 120
      flush = window.setTimeout(() => {
        flush = undefined
        if (everything) {
          everything = false
          pending.clear()
          void qc.invalidateQueries()
          return
        }
        for (const key of pending.values()) void qc.invalidateQueries({ queryKey: key })
        pending.clear()
      }, delay)
    }

    const handler = (name: ServerEvent) => (e: MessageEvent<string>) => {
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(e.data)
      } catch {
        /* keep-alive or non-JSON */
      }
      const keys = eventInvalidations(name, data)
      if (keys === 'all') everything = true
      else for (const k of keys) pending.set(JSON.stringify(k), k)
      schedule()
      for (const fn of listeners) fn(name, data)
    }

    const connect = () => {
      useLive.setState({ sse: 'connecting' })
      es = new EventSource(`${API_BASE}/api/events`)
      es.onopen = () => {
        if (attempt > 0) void qc.invalidateQueries() // resync after a gap
        attempt = 0
        useLive.setState({ sse: 'open' })
      }
      for (const name of SERVER_EVENTS) es.addEventListener(name, handler(name) as EventListener)
      es.onerror = () => {
        useLive.setState({ sse: 'closed' })
        attempt += 1
        if (es?.readyState === EventSource.CLOSED && !disposed) {
          es.close()
          retry = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt))
        }
      }
    }
    connect()
    return () => {
      disposed = true
      window.clearTimeout(retry)
      window.clearTimeout(flush)
      es?.close()
    }
  }, [qc])
}
