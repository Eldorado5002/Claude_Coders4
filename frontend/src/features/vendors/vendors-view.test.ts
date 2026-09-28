import { describe, expect, it } from 'vitest'
import type { AutonomyState, VendorSummary } from '@/api/types'
import {
  categoryLabel,
  formatSort,
  lessonReason,
  matchesVendor,
  parseSort,
  placeholderProfile,
  sortLanes,
  touchlessWidth,
  vendorCounts,
} from './vendors-view'

const v = (id: string, over: Partial<VendorSummary> = {}): VendorSummary => ({
  e_invoice_required: false,
  id,
  name: 'Shree Balaji Steel Traders Pvt Ltd',
  gstin: '36ASICS1238O1ZX',
  city: 'Hyderabad',
  category: 'raw_materials',
  state: 'Telangana',
  payment_terms_days: 45,
  invoices_count: 4,
  exceptions_count: 4,
  open_exceptions: 1,
  touchless_rate: 0,
  ...over,
})

describe('categoryLabel', () => {
  it('turns API categories into sentence-case words', () => {
    expect(categoryLabel('raw_materials')).toBe('Raw materials')
    expect(categoryLabel('office_supplies')).toBe('Office supplies')
    expect(categoryLabel('logistics')).toBe('Logistics')
  })
  it('keeps acronyms upper case', () => {
    expect(categoryLabel('it_services')).toBe('IT services')
    expect(categoryLabel('mro')).toBe('MRO')
  })
  it('copes with empty input', () => {
    expect(categoryLabel('')).toBe('')
  })
})

describe('matchesVendor', () => {
  const balaji = v('V001')
  it('matches everything when the query is blank', () => {
    expect(matchesVendor(balaji, '')).toBe(true)
    expect(matchesVendor(balaji, '   ')).toBe(true)
  })
  it('searches name, city and GSTIN, ignoring case', () => {
    expect(matchesVendor(balaji, 'balaji')).toBe(true)
    expect(matchesVendor(balaji, 'HYDERABAD')).toBe(true)
    expect(matchesVendor(balaji, '36asics')).toBe(true)
    expect(matchesVendor(balaji, 'kaveri')).toBe(false)
  })
  it('needs every word to match somewhere', () => {
    expect(matchesVendor(balaji, 'steel hyd')).toBe(true)
    expect(matchesVendor(balaji, 'steel pune')).toBe(false)
  })
  it('does not search the category or state', () => {
    expect(matchesVendor(balaji, 'telangana')).toBe(false)
    expect(matchesVendor(balaji, 'raw')).toBe(false)
  })
})

describe('sort params', () => {
  it('reads "column.direction" from the URL', () => {
    expect(parseSort('open.desc')).toEqual([{ id: 'open', desc: true }])
    expect(parseSort('name.asc')).toEqual([{ id: 'name', desc: false }])
  })
  it('ignores missing, unknown or malformed values', () => {
    expect(parseSort(null)).toEqual([])
    expect(parseSort('')).toEqual([])
    expect(parseSort('bogus.desc')).toEqual([])
    expect(parseSort('open.sideways')).toEqual([])
    expect(parseSort('open')).toEqual([])
  })
  it('writes the first sort back, or nothing', () => {
    expect(formatSort([{ id: 'touchless', desc: true }])).toBe('touchless.desc')
    expect(formatSort([{ id: 'name', desc: false }])).toBe('name.asc')
    expect(formatSort([])).toBeNull()
  })
  it('round-trips', () => {
    expect(parseSort(formatSort([{ id: 'terms', desc: false }]))).toEqual([{ id: 'terms', desc: false }])
  })
})

describe('touchlessWidth', () => {
  it('turns a rate into a 0–100 bar width', () => {
    expect(touchlessWidth(0.42)).toBe(42)
    expect(touchlessWidth(0)).toBe(0)
    expect(touchlessWidth(1)).toBe(100)
  })
  it('clamps out-of-range values', () => {
    expect(touchlessWidth(1.4)).toBe(100)
    expect(touchlessWidth(-0.2)).toBe(0)
  })
  it('has no bar when there is no rate', () => {
    expect(touchlessWidth(null)).toBeNull()
    expect(touchlessWidth(undefined)).toBeNull()
  })
})

describe('vendorCounts', () => {
  it('counts vendors and those with open cases', () => {
    expect(vendorCounts([v('A'), v('B', { open_exceptions: 0 }), v('C', { open_exceptions: 3 })])).toEqual({
      total: 3,
      withOpen: 2,
    })
    expect(vendorCounts([])).toEqual({ total: 0, withOpen: 0 })
  })
})

describe('placeholderProfile', () => {
  const list = [v('V001'), v('V002', { name: 'Sri Venkateswara Alloys' })]
  it('builds a header-only profile from the index cache', () => {
    const p = placeholderProfile(list, 'V002')
    expect(p?.name).toBe('Sri Venkateswara Alloys')
    expect(p?.learned).toEqual([])
    expect(p?.recent).toEqual([])
    expect(p?.autonomy).toEqual([])
    expect(p?.playbook).toBeNull()
    expect(p?.bank_account).toEqual({ bank_name: '', account_number: '', ifsc: '' })
  })
  it('has nothing to offer when the vendor or the cache is missing', () => {
    expect(placeholderProfile(list, 'V999')).toBeUndefined()
    expect(placeholderProfile(undefined, 'V001')).toBeUndefined()
  })
})

describe('lessonReason', () => {
  it('drops the boilerplate from auto-resolved lessons', () => {
    expect(
      lessonReason({
        auto: true,
        reason: 'Auto-resolved under earned autonomy. Rounding within ₹10 is approved.',
      }),
    ).toBe('Rounding within ₹10 is approved.')
  })
  it('keeps a clerk’s reason as written', () => {
    expect(lessonReason({ auto: false, reason: 'Fuel surcharge within contract.' })).toBe('Fuel surcharge within contract.')
  })
})

describe('sortLanes', () => {
  const lane = (exception_type: AutonomyState['exception_type'], level: AutonomyState['level'], streak = 0): AutonomyState => ({
    vendor_id: 'V001',
    vendor_name: 'Balaji',
    exception_type,
    level,
    streak,
    required_streak: 3,
    accepted: 0,
    overruled: 0,
    auto_resolved: 0,
    updated_at: null,
  })
  it('puts earned autonomy first, then the closest to auto, locked lanes last', () => {
    const rows = [
      lane('bank_details_changed', 'locked'),
      lane('price_variance', 'suggest', 1),
      lane('rounding_difference', 'auto', 3),
      lane('freight_charge', 'suggest', 2),
    ]
    expect(sortLanes(rows).map((r) => r.exception_type)).toEqual([
      'rounding_difference',
      'freight_charge',
      'price_variance',
      'bank_details_changed',
    ])
  })
  it('breaks ties by the type’s label and leaves the input alone', () => {
    const rows = [lane('tax_mismatch', 'suggest', 1), lane('freight_charge', 'suggest', 1)]
    expect(sortLanes(rows).map((r) => r.exception_type)).toEqual(['freight_charge', 'tax_mismatch'])
    expect(rows[0].exception_type).toBe('tax_mismatch')
  })
})

describe('sortLanes with a type the UI has never seen', () => {
  it('does not crash on an unknown exception type', () => {
    const lane = (t: string) => ({ vendor_id: 'V1', vendor_name: 'V', exception_type: t, level: 'locked', streak: 0, required_streak: 3, accepted: 0, overruled: 0, auto_resolved: 0, updated_at: null }) as unknown as Parameters<typeof sortLanes>[0][number]
    expect(() => sortLanes([lane('future_a'), lane('duplicate_invoice'), lane('future_b')])).not.toThrow()
  })
})
