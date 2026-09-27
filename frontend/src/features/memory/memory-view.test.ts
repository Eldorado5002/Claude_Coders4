import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { MemoryItem } from '@/api/types'
import { filterByKind, isHindsightDown, kindCounts, parseKind, parseTab, splitMemoryText } from './memory-view'

const m = (id: string, kind: MemoryItem['kind']): MemoryItem => ({
  id,
  kind,
  text: 'x',
  vendor_id: 'V001',
  exception_type: null,
  occurred_at: '2026-03-18T09:44:00Z',
})

describe('parseTab', () => {
  it('defaults to lessons and accepts only the three tabs', () => {
    expect(parseTab(null)).toBe('lessons')
    expect(parseTab('policy')).toBe('policy')
    expect(parseTab('raw')).toBe('raw')
    expect(parseTab('nonsense')).toBe('lessons')
  })
})

describe('parseKind', () => {
  it('accepts memory kinds and falls back to all', () => {
    expect(parseKind('observation')).toBe('observation')
    expect(parseKind(null)).toBe('all')
    expect(parseKind('bogus')).toBe('all')
  })
})

describe('kindCounts and filterByKind', () => {
  const items = [m('1', 'experience'), m('2', 'observation'), m('3', 'world'), m('4', 'observation')]

  it('counts every kind, including the ones with none', () => {
    expect(kindCounts(items)).toEqual({ all: 4, observation: 2, world: 1, experience: 1, mental_model: 0, directive: 0 })
  })

  it('keeps one kind in the order the API sent, or everything', () => {
    expect(filterByKind(items, 'observation').map((x) => x.id)).toEqual(['2', '4'])
    expect(filterByKind(items, 'all')).toHaveLength(4)
  })
})

describe('splitMemoryText', () => {
  it('separates Hindsight’s "| When: … | Involving: …" facts from the statement', () => {
    const r = splitMemoryText(
      'Sneha placed invoice RCA/2526/1310 on hold. | When: 2026-03-17 | Involving: Sneha (AP Lead), Rayalaseema Cement Agencies (V013) | The unit price was ₹408.30 against ₹392.00 on the PO.',
    )
    expect(r.body).toBe('Sneha placed invoice RCA/2526/1310 on hold.')
    expect(r.facts).toEqual([
      { label: 'When', value: '2026-03-17' },
      { label: 'Involving', value: 'Sneha (AP Lead), Rayalaseema Cement Agencies (V013)' },
    ])
    expect(r.notes).toEqual(['The unit price was ₹408.30 against ₹392.00 on the PO.'])
  })

  it('leaves plain text alone', () => {
    const t = 'Freight under ₹5,000 per trip is approved for Shree Balaji Steel Traders Pvt Ltd (V001).'
    expect(splitMemoryText(t)).toEqual({ body: t, facts: [], notes: [] })
  })
})

describe('isHindsightDown', () => {
  it('treats 503 and an unreachable API as memory being down', () => {
    expect(isHindsightDown(new ApiError(503, 'Hindsight unavailable'))).toBe(true)
    expect(isHindsightDown(new ApiError(0, 'Cannot reach the Precedent API'))).toBe(true)
    expect(isHindsightDown(new ApiError(500, 'boom'))).toBe(false)
    expect(isHindsightDown(new Error('x'))).toBe(false)
  })
})
