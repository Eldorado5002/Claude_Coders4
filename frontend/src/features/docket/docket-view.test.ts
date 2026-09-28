import { describe, expect, it } from 'vitest'
import type { ExceptionSummary } from '@/api/types'
import { docketView, neighbour } from './docket-view'

const c = (id: string, status: ExceptionSummary['status'], blocking = false): ExceptionSummary => ({
  id,
  status,
  primary_type: 'freight_charge',
  issue_types: ['freight_charge'],
  vendor: { id: 'V001', name: 'Balaji', gstin: 'X', city: 'Hyderabad', category: 'raw_materials' },
  invoice_number: `INV-${id}`,
  invoice_total: 1000,
  amount_at_risk: 10,
  created_at: '2026-03-18T09:30:00',
  recommended_action: null,
  confidence: null,
  autonomy_level: 'suggest',
  blocking,
})

describe('docketView', () => {
  const items = [c('E5', 'open'), c('E4', 'auto_resolved'), c('E3', 'resolved'), c('E2', 'open', true), c('E1', 'resolved')]

  it('counts every status tab from one list', () => {
    expect(docketView(items, 'open').counts).toEqual({ open: 2, auto_resolved: 1, resolved: 2, all: 5 })
  })
  it('shows only the chosen status, newest first as the API sent them', () => {
    expect(docketView(items, 'resolved').visible.map((x) => x.id)).toEqual(['E3', 'E1'])
    expect(docketView(items, 'all').visible).toHaveLength(5)
  })
  it('floats hard-control cases to the top of the open tab', () => {
    expect(docketView(items, 'open').visible.map((x) => x.id)).toEqual(['E2', 'E5'])
  })
})

describe('neighbour', () => {
  const ids = ['A', 'B', 'C']
  it('moves down and up', () => {
    expect(neighbour(ids, 'A', 1)).toBe('B')
    expect(neighbour(ids, 'C', -1)).toBe('B')
  })
  it('stops at the ends', () => {
    expect(neighbour(ids, 'C', 1)).toBe('C')
    expect(neighbour(ids, 'A', -1)).toBe('A')
  })
  it('starts at the first case when nothing is open', () => {
    expect(neighbour(ids, undefined, 1)).toBe('A')
    expect(neighbour([], undefined, 1)).toBeUndefined()
  })
})
