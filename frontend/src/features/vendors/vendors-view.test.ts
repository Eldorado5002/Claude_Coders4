import { describe, expect, it } from 'vitest'
import type { AutonomyState, Belief, Citation, VendorProfile, VendorSummary } from '@/api/types'
import twistProfile from '@mocks/twist/vendor-profile.json'
import twistVendors from '@mocks/twist/vendors.json'
import {
  benfordLine,
  categoryLabel,
  complianceBadges,
  formatSort,
  learnedBeyondBeliefs,
  lessonReason,
  matchesVendor,
  msmeLabel,
  parseSort,
  placeholderProfile,
  profileRisk,
  riskFigure,
  riskReason,
  riskSortValue,
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
  it('accepts sorting by risk', () => {
    expect(parseSort('risk.desc')).toEqual([{ id: 'risk', desc: true }])
    expect(formatSort([{ id: 'risk', desc: false }])).toBe('risk.asc')
  })
})

describe('riskFigure', () => {
  it('maps each level to a tone and a word', () => {
    expect(riskFigure(3, 'low')).toEqual({ score: 3, level: 'low', label: 'Low', tone: 'muted' })
    expect(riskFigure(34, 'medium')).toEqual({ score: 34, level: 'medium', label: 'Medium', tone: 'hold' })
    expect(riskFigure(58, 'high')).toEqual({ score: 58, level: 'high', label: 'High', tone: 'reject' })
  })
  it('rounds the score for display and keeps it within 0–100', () => {
    expect(riskFigure(57.6, 'high')?.score).toBe(58)
    expect(riskFigure(140, 'high')?.score).toBe(100)
    expect(riskFigure(-2, 'low')?.score).toBe(0)
  })
  it('has nothing to show without both a score and a level', () => {
    expect(riskFigure(null, 'low')).toBeNull()
    expect(riskFigure(12, null)).toBeNull()
    expect(riskFigure(undefined, undefined)).toBeNull()
    expect(riskFigure(Number.NaN, 'low')).toBeNull()
  })
})

describe('profileRisk', () => {
  const twist = twistProfile as unknown as VendorProfile
  it('reads Balaji at the Twist as 58 · high, with the reasons', () => {
    expect(profileRisk(twist)).toMatchObject({
      score: 58,
      level: 'high',
      label: 'High',
      tone: 'reject',
      reasons: [
        '1 request(s) to pay a different bank account',
        '1 duplicate invoice submission(s)',
        'exception rate 91% vs 23% across all vendors',
      ],
    })
    expect(profileRisk(twist)?.benford?.conformity).toBe('insufficient data')
  })
  it('hides risk when the profile says there is none', () => {
    expect(profileRisk({ ...twist, risk: null })).toBeNull()
  })
  it('falls back to the index row while the profile is still loading', () => {
    const p = placeholderProfile([v('V001', { risk_score: 58, risk_level: 'high' })], 'V001')!
    expect(profileRisk(p)).toEqual({ score: 58, level: 'high', label: 'High', tone: 'reject', reasons: [], benford: null })
    expect(profileRisk(placeholderProfile([v('V001')], 'V001')!)).toBeNull()
  })
})

describe('riskReason', () => {
  it('starts each reason with a capital, leaving the rest as the backend wrote it', () => {
    expect(riskReason('exception rate 91% vs 23% across all vendors')).toBe('Exception rate 91% vs 23% across all vendors')
    expect(riskReason('1 duplicate invoice submission(s)')).toBe('1 duplicate invoice submission')
    expect(riskReason('')).toBe('')
  })
})

describe('benfordLine', () => {
  const b = (over: object) => ({ n: 28, mad: null, conformity: 'insufficient data', observed: [], expected: [], ...over })
  it('states the first-digit verdict and how many amounts it rests on', () => {
    expect(benfordLine(b({}))).toBe('First digits (Benford): insufficient data · 28 amounts')
    expect(benfordLine(b({ n: 212, mad: 0.01462, conformity: 'marginal' }))).toBe(
      'First digits (Benford): marginal · MAD 0.0146 · 212 amounts',
    )
  })
  it('has nothing without a result', () => {
    expect(benfordLine(null)).toBeNull()
    expect(benfordLine(undefined)).toBeNull()
  })
})

describe('riskSortValue', () => {
  it('sorts on the score, with no score as undefined so it always sorts last', () => {
    expect(riskSortValue(v('A', { risk_score: 58 }))).toBe(58)
    expect(riskSortValue(v('A', { risk_score: 0 }))).toBe(0)
    expect(riskSortValue(v('A', { risk_score: null }))).toBeUndefined()
    expect(riskSortValue(v('A'))).toBeUndefined()
  })
  it('puts Balaji first at the Twist', () => {
    const list = twistVendors as VendorSummary[]
    const top = [...list].sort((a, b) => (riskSortValue(b) ?? -1) - (riskSortValue(a) ?? -1)).slice(0, 3)
    expect(top.map((x) => x.id)).toEqual(['V001', 'V005', 'V012'])
  })
})

describe('msmeLabel and complianceBadges', () => {
  it('names the MSME category', () => {
    expect(msmeLabel('micro')).toBe('Micro')
    expect(msmeLabel('small')).toBe('Small')
    expect(msmeLabel(null)).toBeNull()
    expect(msmeLabel(undefined)).toBeNull()
  })
  it('badges MSME suppliers and e-invoice requirements, MSME first', () => {
    expect(complianceBadges(v('A', { msme_category: 'micro', e_invoice_required: true }))).toEqual([
      { id: 'msme', label: 'MSME · Micro', hint: 'Micro enterprise: pay on time or lose the tax deduction (section 43B(h)).' },
      { id: 'einvoice', label: 'E-invoice', hint: 'E-invoicing required: every invoice needs an IRN.' },
    ])
    expect(complianceBadges(v('A', { msme_category: 'small' })).map((b) => b.label)).toEqual(['MSME · Small'])
    expect(complianceBadges(v('A', { e_invoice_required: true })).map((b) => b.id)).toEqual(['einvoice'])
  })
  it('has no badges for an ordinary supplier', () => {
    expect(complianceBadges(v('A'))).toEqual([])
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

describe('learnedBeyondBeliefs', () => {
  const cite = (id: string, text: string): Citation => ({ id, kind: 'observation', text }) as Citation
  const belief = (id: string, text: string): Belief => ({ id, text, evidence_count: 3, versions: [] }) as Belief
  const learned = [
    cite('obs-1', 'Balaji freight up to ₹5,000 per trip is approved.'),
    cite('obs-2', 'Balaji   freight over ₹5,000 is held.'),
    cite('obs-3', 'Balaji bills fuel surcharge separately.'),
  ]
  const loaded = (data: Belief[]) => ({ data, isPending: false, isError: false })

  it('drops what the beliefs already show, by id or by the same sentence', () => {
    const out = learnedBeyondBeliefs(learned, loaded([belief('obs-1', 'x'), belief('b-9', 'Balaji freight over ₹5,000 is held.')]))
    expect(out?.map((c) => c.id)).toEqual(['obs-3'])
  })

  it('shows nothing extra when the beliefs cover it all', () => {
    expect(learnedBeyondBeliefs(learned.slice(0, 1), loaded([belief('obs-1', 'x')]))).toEqual([])
  })

  it('waits for the beliefs instead of flashing the list', () => {
    expect(learnedBeyondBeliefs(learned, { isPending: true, isError: false })).toBeNull()
  })

  it('falls back to the full list when the beliefs could not load', () => {
    expect(learnedBeyondBeliefs(learned, { isPending: false, isError: true })).toEqual(learned)
  })
})

