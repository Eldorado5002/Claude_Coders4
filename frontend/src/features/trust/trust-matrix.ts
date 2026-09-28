import type { AutonomyLevel, AutonomyState, ExceptionType } from '@/api/types'
import { HARD_CONTROLS, SOFT_TYPES } from '@/lib/labels'

export type TrustVendor = { id: string; name: string; cells: Partial<Record<ExceptionType, AutonomyState>>; score: number; hasAuto: boolean }

/** Autonomy lanes → a vendor × exception-type matrix (soft types first, hard controls last). */
export function buildTrustMatrix(rows: AutonomyState[]) {
  const present = new Set(rows.map((r) => r.exception_type))
  const types = [...SOFT_TYPES, ...HARD_CONTROLS].filter((t) => present.has(t))
  const byVendor = new Map<string, TrustVendor>()
  const counts: Record<AutonomyLevel, number> = { auto: 0, suggest: 0, locked: 0 }
  for (const r of rows) {
    counts[r.level] += 1
    const v = byVendor.get(r.vendor_id) ?? { id: r.vendor_id, name: r.vendor_name, cells: {}, score: 0, hasAuto: false }
    v.cells[r.exception_type] = r
    v.score += r.accepted + r.auto_resolved
    v.hasAuto ||= r.level === 'auto'
    byVendor.set(r.vendor_id, v)
  }
  const vendors = [...byVendor.values()].sort(
    (a, b) => Number(b.hasAuto) - Number(a.hasAuto) || b.score - a.score || a.name.localeCompare(b.name),
  )
  return { types, vendors, counts }
}

export function nextStepCopy(a: AutonomyState): string {
  if (a.level === 'locked') return 'Hard control: always human, however much the agent learns.'
  if (a.level === 'auto') return 'Earned autonomy: Precedent resolves these on its own, inside amounts humans already approved.'
  const left = Math.max(0, a.required_streak - a.streak)
  return `${left} more accepted recommendation${left === 1 ? '' : 's'} to earn autonomy.`
}
