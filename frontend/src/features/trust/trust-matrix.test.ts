import { describe, expect, it } from 'vitest'
import type { AutonomyState } from '@/api/types'
import { buildTrustMatrix, nextStepCopy } from './trust-matrix'

const row = (vendor_id: string, exception_type: AutonomyState['exception_type'], level: AutonomyState['level'], extra: Partial<AutonomyState> = {}): AutonomyState => ({
  vendor_id,
  vendor_name: `Vendor ${vendor_id}`,
  exception_type,
  level,
  streak: 0,
  required_streak: 3,
  accepted: 0,
  overruled: 0,
  auto_resolved: 0,
  updated_at: null,
  ...extra,
})

describe('buildTrustMatrix', () => {
  const rows = [
    row('V005', 'bank_details_changed', 'locked'),
    row('V004', 'tax_mismatch', 'suggest', { streak: 1, accepted: 1 }),
    row('V001', 'freight_charge', 'auto', { streak: 4, accepted: 4, auto_resolved: 2 }),
    row('V005', 'rounding_difference', 'suggest', { streak: 2, accepted: 2 }),
  ]
  const m = buildTrustMatrix(rows)

  it('puts soft exception types first and hard controls last, only those that occur', () => {
    expect(m.types).toEqual(['freight_charge', 'tax_mismatch', 'rounding_difference', 'bank_details_changed'])
  })
  it('lists vendors with earned autonomy first, then by how much they have been taught', () => {
    expect(m.vendors.map((v) => v.id)).toEqual(['V001', 'V005', 'V004'])
  })
  it('places each lane in its vendor × type cell', () => {
    const v5 = m.vendors.find((v) => v.id === 'V005')!
    expect(v5.cells.rounding_difference?.streak).toBe(2)
    expect(v5.cells.freight_charge).toBeUndefined()
  })
  it('counts lanes by level', () => {
    expect(m.counts).toEqual({ auto: 1, suggest: 2, locked: 1 })
  })
})

describe('nextStepCopy', () => {
  it('says how many accepted recommendations are left', () => {
    expect(nextStepCopy(row('V1', 'freight_charge', 'suggest', { streak: 2 }))).toBe('1 more accepted recommendation to earn autonomy.')
    expect(nextStepCopy(row('V1', 'freight_charge', 'suggest', { streak: 0 }))).toBe('3 more accepted recommendations to earn autonomy.')
  })
  it('explains auto and locked lanes', () => {
    expect(nextStepCopy(row('V1', 'freight_charge', 'auto'))).toMatch(/resolves these on its own/)
    expect(nextStepCopy(row('V1', 'duplicate_invoice', 'locked'))).toMatch(/always human/i)
  })
})
