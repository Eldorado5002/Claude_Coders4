import type { QueryKey } from '@tanstack/react-query'
import type { ExceptionType } from './types'

export type StatusFilter = 'open' | 'auto_resolved' | 'resolved' | 'all'
export type ExceptionFilters = { status?: StatusFilter; vendor_id?: string; type?: ExceptionType }

export const qk = {
  settings: ['settings'] as const,
  health: ['health'] as const,
  demo: ['demo'] as const,
  exceptionsAll: ['exceptions'] as const,
  exceptions: (f: ExceptionFilters) => ['exceptions', f] as const,
  exceptionAll: ['exception'] as const,
  exceptionById: (id: string) => ['exception', id] as const,
  /** memory mode is part of the key so both verdicts stay cached (verdict diff) */
  exception: (id: string, memOn: boolean) => ['exception', id, memOn] as const,
  vendors: ['vendors'] as const,
  vendorAll: ['vendor'] as const,
  vendor: (id: string) => ['vendor', id] as const,
  autonomy: ['autonomy'] as const,
  metrics: ['metrics'] as const,
  memoryAll: ['memory'] as const,
  memoryRecent: ['memory', 'recent'] as const,
  lessonsAll: ['lessons'] as const,
  lessons: (vendorId?: string) => ['lessons', vendorId ?? 'all'] as const,
  policy: ['policy'] as const,
}

type Payload = Record<string, unknown>

/** Which queries a live server event makes stale. 'all' = refetch everything. */
export function eventInvalidations(event: string, data: Payload): QueryKey[] | 'all' {
  switch (event) {
    case 'exception.created':
      return [qk.exceptionsAll, qk.vendors, qk.metrics]
    case 'exception.updated':
      return [qk.exceptionsAll, qk.exceptionById(String(data.id)), qk.vendors, qk.metrics]
    case 'memory.retained':
      return [qk.memoryAll, qk.lessonsAll, qk.metrics]
    case 'autonomy.changed':
      return [qk.autonomy, qk.exceptionAll, qk.vendor(String(data.vendor_id))]
    case 'memory.revoked':
      return [qk.lessonsAll, qk.autonomy, qk.exceptionsAll, qk.exceptionAll, qk.metrics]
    case 'sim.changed':
      return 'all'
    default:
      return []
  }
}
