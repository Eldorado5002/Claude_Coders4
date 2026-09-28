import type { QueryKey } from '@tanstack/react-query'
import type { ExceptionType } from './types'

export type StatusFilter = 'open' | 'auto_resolved' | 'resolved' | 'all'
export type DocketSort = 'newest' | 'msme_deadline' | 'amount'
export type ExceptionFilters = { status?: StatusFilter; vendor_id?: string; type?: ExceptionType; sort?: DocketSort }

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
  certificate: ['certificate'] as const,
  beliefsAll: ['beliefs'] as const,
  beliefs: (vendorId: string) => ['beliefs', vendorId] as const,
  risk: ['risk'] as const,
  benford: ['benford'] as const,
}

type Payload = Record<string, unknown>

/** The vendor an ExceptionSummary or Lesson payload is about: its file (with the risk figure) goes stale too. */
function vendorOf(data: Payload): QueryKey[] {
  const v = data.vendor as { id?: unknown } | null | undefined
  return typeof v?.id === 'string' ? [qk.vendor(v.id)] : []
}

/** Which queries a live server event makes stale. 'all' = refetch everything. */
export function eventInvalidations(event: string, data: Payload): QueryKey[] | 'all' {
  switch (event) {
    case 'exception.created':
      return [qk.exceptionsAll, qk.vendors, qk.metrics, qk.risk, qk.benford, ...vendorOf(data)]
    case 'exception.updated':
      return [
        qk.exceptionsAll,
        qk.exceptionById(String(data.id)),
        qk.vendors,
        qk.metrics,
        qk.certificate,
        qk.risk,
        qk.benford,
        ...vendorOf(data),
      ]
    case 'memory.retained':
      return data.vendor_id
        ? [qk.memoryAll, qk.lessonsAll, qk.metrics, qk.beliefs(String(data.vendor_id))]
        : [qk.memoryAll, qk.lessonsAll, qk.metrics]
    case 'autonomy.changed':
      return [qk.autonomy, qk.exceptionAll, qk.vendor(String(data.vendor_id)), qk.certificate]
    case 'memory.revoked': {
      const v = vendorOf(data)
      const beliefs = v.length ? [qk.beliefs(String((data.vendor as { id: string }).id))] : []
      return [qk.lessonsAll, qk.autonomy, qk.exceptionsAll, qk.exceptionAll, qk.metrics, qk.certificate, ...v, ...beliefs]
    }
    case 'sim.changed':
      return 'all'
    default:
      return []
  }
}
