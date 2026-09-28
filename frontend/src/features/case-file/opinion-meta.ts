import type { RecRoute, Recommendation } from '@/api/types'
import { pct, simTime, usdSmall } from '@/lib/format'
import { ROUTE_LABEL } from '@/lib/labels'

/** "right 67% of the time at this confidence": null until there is a track record. */
export function calibratedCopy(c: number | null | undefined): string | null {
  if (c == null || Number.isNaN(c)) return null
  return `right ${pct(c)} of the time at this confidence`
}

/** The opinion footer: route · cost · latency · time (anything the API did not send is left out). */
export function opinionMeta(rec: Pick<Recommendation, 'route' | 'cost_usd' | 'latency_ms' | 'generated_at'>): string[] {
  const route = rec.route as RecRoute | undefined
  return [
    route ? (ROUTE_LABEL[route] ?? route) : null,
    usdSmall(rec.cost_usd),
    `${(rec.latency_ms / 1000).toFixed(1)} s`,
    simTime(rec.generated_at),
  ].filter((p): p is string => !!p)
}
