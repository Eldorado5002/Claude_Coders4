import type { RecRoute, Recommendation } from '@/api/types'
import { pct, simTime } from '@/lib/format'
import { ROUTE_LABEL } from '@/lib/labels'

/**
 * "$0.001" to 3 decimals. When 3 decimals would read as zero, "< $0.001".
 * (The Week 3 fast path costs $0.000986: that is "about $0.001", so it rounds.)
 */
export function formatCost(usd: number | null | undefined): string | null {
  if (usd == null || Number.isNaN(usd)) return null
  const shown = usd.toFixed(3)
  if (usd > 0 && Number(shown) === 0) return '< $0.001'
  return `$${shown}`
}

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
    formatCost(rec.cost_usd),
    `${(rec.latency_ms / 1000).toFixed(1)} s`,
    simTime(rec.generated_at),
  ].filter((p): p is string => !!p)
}
