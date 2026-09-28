import { describe, expect, it } from 'vitest'
import type { Lesson, RevokeResult } from '@/api/types'
import {
  checkRevokeReason,
  filterByVendor,
  groupByDay,
  lessonReason,
  lessonStats,
  lessonVendors,
  lessonsHeadline,
  revokeSummary,
} from './lessons-view'

const vendor = (id: string, name: string) => ({ id, name, gstin: 'X', city: 'Hyderabad', category: 'logistics' })

const l = (case_id: string, taught_at: string, extra: Partial<Lesson> = {}): Lesson => ({
  case_id,
  vendor: vendor('V001', 'Shree Balaji Steel Traders Pvt Ltd'),
  exception_type: 'freight_charge',
  decision: 'approve',
  reason: 'Freight under the ₹5,000 per-trip cap.',
  taught_by: 'Priya (AP)',
  taught_at,
  auto: false,
  revoked: false,
  revoked_by: null,
  revoke_reason: null,
  ...extra,
})

describe('groupByDay', () => {
  it('groups lessons by the day they were taught, newest day first and newest lesson first', () => {
    const groups = groupByDay([
      l('EXC-0040', '2026-04-21T12:43:00'),
      l('EXC-0046', '2026-04-27T09:30:05'),
      l('EXC-0038', '2026-04-21T09:10:00'),
      l('EXC-0041', '2026-04-21T15:02:00'),
    ])
    expect(groups.map((g) => g.day)).toEqual(['2026-04-27', '2026-04-21'])
    expect(groups[1].lessons.map((x) => x.case_id)).toEqual(['EXC-0041', 'EXC-0040', 'EXC-0038'])
  })

  it('returns nothing for no lessons', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('lessonReason', () => {
  it('drops the boilerplate auto-resolution prefix from lessons the agent taught itself', () => {
    const auto = l('EXC-0046', '2026-04-27T09:30:05', {
      auto: true,
      reason: 'Auto-resolved under earned autonomy. Rounding within the ₹10 tolerance.',
    })
    expect(lessonReason(auto)).toBe('Rounding within the ₹10 tolerance.')
  })

  it('leaves a clerk’s reason exactly as written', () => {
    const r = 'Auto-resolved under earned autonomy. Quoted by the clerk.'
    expect(lessonReason(l('E1', '2026-04-27T09:30:05', { reason: r }))).toBe(r)
  })
})

describe('lessonStats and lessonsHeadline', () => {
  const all = [
    l('E1', '2026-04-27T09:30:05', { auto: true }),
    l('E2', '2026-04-26T09:30:05', { auto: true }),
    l('E3', '2026-04-25T09:30:05', { revoked: true }),
    l('E4', '2026-04-24T09:30:05'),
  ]

  it('counts lessons, the ones the agent taught itself, and the revoked ones', () => {
    expect(lessonStats(all)).toEqual({ total: 4, auto: 2, revoked: 1 })
  })

  it('reads as one line, with a singular for one lesson', () => {
    expect(lessonsHeadline(lessonStats(all))).toBe('4 lessons · 2 taught by the agent itself · 1 revoked')
    expect(lessonsHeadline({ total: 1, auto: 0, revoked: 0 })).toBe('1 lesson · 0 taught by the agent itself · 0 revoked')
  })
})

describe('vendor filter', () => {
  const all = [
    l('E1', '2026-04-27T09:30:05', { vendor: vendor('V005', 'Deccan Freight Carriers') }),
    l('E2', '2026-04-26T09:30:05'),
    l('E3', '2026-04-25T09:30:05', { vendor: vendor('V005', 'Deccan Freight Carriers') }),
  ]

  it('lists each vendor that has lessons once, by name, with a count', () => {
    expect(lessonVendors(all)).toEqual([
      { id: 'V005', name: 'Deccan Freight Carriers', count: 2 },
      { id: 'V001', name: 'Shree Balaji Steel Traders Pvt Ltd', count: 1 },
    ])
  })

  it('keeps only that vendor’s lessons, or all of them with no filter', () => {
    expect(filterByVendor(all, 'V005').map((x) => x.case_id)).toEqual(['E1', 'E3'])
    expect(filterByVendor(all, undefined)).toHaveLength(3)
  })
})

describe('checkRevokeReason', () => {
  it('needs at least 5 characters, ignoring surrounding spaces', () => {
    expect(checkRevokeReason('')).toMatch(/5 characters/)
    expect(checkRevokeReason('  no  ')).toMatch(/5 characters/)
    expect(checkRevokeReason('Wrong cap')).toBeNull()
  })
})

describe('revokeSummary', () => {
  const result = (over: Partial<RevokeResult> = {}): RevokeResult => ({
    lesson: l('EXC-0042', '2026-04-24T11:40:00', { revoked: true }),
    autonomy: {
      vendor_id: 'V001',
      vendor_name: 'Shree Balaji Steel Traders Pvt Ltd',
      exception_type: 'freight_charge',
      level: 'suggest',
      streak: 0,
      required_streak: 3,
      accepted: 2,
      overruled: 1,
      auto_resolved: 0,
      updated_at: '2026-03-12T11:05:00',
    },
    memory_deleted: true,
    invalidated_recommendations: 1,
    ...over,
  })

  it('says what happened to memory, open cases and trust', () => {
    expect(revokeSummary(result())).toBe(
      'Memory deleted · 1 open case will be re-evaluated · trust for Freight reset to suggest',
    )
  })

  it('pluralises cases and admits when the memory was only marked revoked', () => {
    expect(revokeSummary(result({ memory_deleted: false, invalidated_recommendations: 3 }))).toBe(
      'Memory marked revoked · 3 open cases will be re-evaluated · trust for Freight reset to suggest',
    )
  })
})
