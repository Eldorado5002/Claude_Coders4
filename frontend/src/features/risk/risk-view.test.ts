import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { BenfordResult, VendorRiskRow } from '@/api/types'
import week3Benford from '@mocks/benford.json'
import week3Risk from '@mocks/risk.json'
import twistBenford from '@mocks/twist/benford.json'
import twistRisk from '@mocks/twist/risk.json'
import {
  CONFORMITY_SCALE,
  benfordAxis,
  benfordRows,
  benfordVerdict,
  levelMeta,
  pctFigure,
  rankingSummary,
  rankVendors,
  riskErrorCopy,
  riskSignals,
  scoreWidth,
  signedPts,
  splitRanking,
  tidyReason,
} from './risk-view'

const twist = twistRisk as VendorRiskRow[]
const week3 = week3Risk as VendorRiskRow[]

const benford = (over: Partial<BenfordResult> = {}): BenfordResult => ({
  n: 120,
  mad: 0.008,
  conformity: 'acceptable',
  observed: [0.3, 0.18, 0.12, 0.1, 0.08, 0.07, 0.06, 0.05, 0.04],
  expected: [0.301, 0.1761, 0.1249, 0.0969, 0.0792, 0.0669, 0.058, 0.0512, 0.0458],
  ...over,
})

const row = (id: string, score: number, level: 'low' | 'medium' | 'high', reasons: string[]): VendorRiskRow => ({
  vendor: { id, name: `Vendor ${id}`, gstin: '36AAAAA0000A1Z5', city: 'Hyderabad', category: 'raw_materials' },
  risk: { score, level, reasons, benford: benford({ n: 0, mad: null, conformity: 'insufficient data' }) },
})

describe('levelMeta', () => {
  it('names each level and gives it a tone: low muted, medium hold, high reject', () => {
    expect(levelMeta('low')).toEqual({ label: 'Low', tone: 'muted' })
    expect(levelMeta('medium')).toEqual({ label: 'Medium', tone: 'hold' })
    expect(levelMeta('high')).toEqual({ label: 'High', tone: 'reject' })
  })

  it('falls back to a muted, capitalised label for a level it does not know', () => {
    expect(levelMeta('severe')).toEqual({ label: 'Severe', tone: 'muted' })
  })
})

describe('scoreWidth', () => {
  it('maps a 0–100 score to a bar width in percent', () => {
    expect(scoreWidth(58)).toBe(58)
    expect(scoreWidth(0)).toBe(0)
    expect(scoreWidth(100)).toBe(100)
  })

  it('clamps out-of-range and missing scores', () => {
    expect(scoreWidth(140)).toBe(100)
    expect(scoreWidth(-5)).toBe(0)
    expect(scoreWidth(null)).toBe(0)
    expect(scoreWidth(undefined)).toBe(0)
    expect(scoreWidth(Number.NaN)).toBe(0)
  })
})

describe('tidyReason', () => {
  it('resolves "(s)" plurals against the leading count', () => {
    expect(tidyReason('1 request(s) to pay a different bank account')).toBe('1 request to pay a different bank account')
    expect(tidyReason('2 invoice(s) unusual for this vendor (anomaly model)')).toBe(
      '2 invoices unusual for this vendor (anomaly model)',
    )
    expect(tidyReason('1 duplicate invoice submission(s)')).toBe('1 duplicate invoice submission')
  })

  it('capitalises the first letter and leaves the rest alone', () => {
    expect(tidyReason('exception rate 91% vs 23% across all vendors')).toBe('Exception rate 91% vs 23% across all vendors')
    expect(tidyReason("line amounts deviate from Benford's law (MAD 0.0251)")).toBe(
      "Line amounts deviate from Benford's law (MAD 0.0251)",
    )
  })
})

describe('riskSignals', () => {
  it('returns the tidied reasons', () => {
    expect(riskSignals(twist[0].risk)).toEqual([
      '1 request to pay a different bank account',
      '1 duplicate invoice submission',
      'Exception rate 91% vs 23% across all vendors',
    ])
  })

  it('treats the backend placeholder and an empty list as no signals', () => {
    expect(riskSignals({ reasons: ['no fraud or control signals so far'] })).toEqual([])
    expect(riskSignals({ reasons: [] })).toEqual([])
  })
})

describe('rankVendors', () => {
  it('keeps the server order (highest first) and numbers it from 1', () => {
    const ranked = rankVendors(twist)
    expect(ranked).toHaveLength(25)
    expect(ranked.map((r) => [r.rank, r.vendor.id]).slice(0, 4)).toEqual([
      [1, 'V001'],
      [2, 'V005'],
      [3, 'V012'],
      [4, 'V002'],
    ])
    expect(ranked[0].signals).toHaveLength(3)
    expect(ranked[4].signals).toEqual([])
  })
})

describe('splitRanking', () => {
  it('lifts up to three vendors with signals to the top; the rest follow in order', () => {
    const { top, rest } = splitRanking(rankVendors(twist))
    expect(top.map((r) => r.vendor.id)).toEqual(['V001', 'V005', 'V012'])
    expect(rest[0]).toMatchObject({ rank: 4, vendor: { id: 'V002' } })
    expect(rest).toHaveLength(22)
  })

  it('lifts nobody when no vendor shows a signal (Week 3)', () => {
    const { top, rest } = splitRanking(rankVendors(week3))
    expect(top).toEqual([])
    expect(rest).toHaveLength(25)
  })

  it('lifts only the flagged vendors when fewer than three have signals', () => {
    const rows = [row('A', 40, 'medium', ['1 request(s) to pay a different bank account']), row('B', 0, 'low', [])]
    const { top, rest } = splitRanking(rankVendors(rows))
    expect(top.map((r) => r.vendor.id)).toEqual(['A'])
    expect(rest.map((r) => r.vendor.id)).toEqual(['B'])
  })
})

describe('rankingSummary', () => {
  it('counts vendors, high and medium levels and vendors with signals', () => {
    expect(rankingSummary(rankVendors(twist))).toBe('25 vendors · 1 high · 4 with signals')
  })

  it('says when nobody is flagged', () => {
    expect(rankingSummary(rankVendors(week3))).toBe('25 vendors · none flagged')
  })

  it('includes medium when present and uses the singular for one vendor', () => {
    const rows = [row('A', 30, 'medium', ['x'])]
    expect(rankingSummary(rankVendors(rows))).toBe('1 vendor · 1 medium · 1 with signals')
  })
})

describe('benfordRows', () => {
  it('builds one row per first digit with observed and expected in percent (1 decimal)', () => {
    const rows = benfordRows(twistBenford as BenfordResult)
    expect(rows).toHaveLength(9)
    expect(rows[0]).toEqual({ digit: 1, observed: 31.8, expected: 30.1, diff: 1.7 })
    expect(rows[1]).toEqual({ digit: 2, observed: 13.5, expected: 17.6, diff: -4.1 })
    expect(rows[8].digit).toBe(9)
  })

  it('fills missing values with 0 rather than breaking the chart', () => {
    const rows = benfordRows(benford({ observed: [0.5] }))
    expect(rows).toHaveLength(9)
    expect(rows[1].observed).toBe(0)
  })
})

describe('benfordAxis', () => {
  it('rounds the top of the axis up to the next 10% with a tick every 10%', () => {
    expect(benfordAxis(benfordRows(twistBenford as BenfordResult))).toEqual({ max: 40, ticks: [0, 10, 20, 30, 40] })
  })

  it('never goes below 10% and steps by 5 on short axes', () => {
    const flat = benfordAxis([{ digit: 1, observed: 3, expected: 4, diff: -1 }])
    expect(flat).toEqual({ max: 10, ticks: [0, 5, 10] })
  })
})

describe('benfordVerdict', () => {
  it('reads "MAD 0.0146 · marginal" in the hold tone at the Twist', () => {
    const v = benfordVerdict(twistBenford as BenfordResult)
    expect(v).toMatchObject({ text: 'MAD 0.0146 · marginal', conformity: 'marginal', tone: 'hold', mad: '0.0146' })
    expect(v.sentence).toMatch(/drift/)
  })

  it('uses the reject tone for nonconformity (Week 3)', () => {
    expect(benfordVerdict(week3Benford as BenfordResult)).toMatchObject({
      text: 'MAD 0.0251 · nonconformity',
      tone: 'reject',
    })
  })

  it('keeps close and acceptable neutral', () => {
    expect(benfordVerdict(benford({ mad: 0.004, conformity: 'close' })).tone).toBe('neutral')
    expect(benfordVerdict(benford({ mad: 0.008, conformity: 'acceptable' }))).toMatchObject({
      text: 'MAD 0.0080 · acceptable',
      tone: 'neutral',
    })
  })

  it('says insufficient data, muted, when MAD is null, whatever the conformity says', () => {
    const v = benfordVerdict(benford({ n: 28, mad: null, conformity: 'insufficient data' }))
    expect(v).toMatchObject({ text: 'Insufficient data', conformity: 'insufficient data', tone: 'muted', mad: null })
    expect(v.sentence).toBe('Only 28 amounts so far. The test needs at least 50.')
    expect(benfordVerdict(benford({ mad: null, conformity: 'close' })).conformity).toBe('insufficient data')
  })
})

describe('CONFORMITY_SCALE', () => {
  it('lists Nigrini’s four first-digit bands in order', () => {
    expect(CONFORMITY_SCALE.map((s) => s.conformity)).toEqual(['close', 'acceptable', 'marginal', 'nonconformity'])
  })
})

describe('formatting', () => {
  it('pctFigure shows one decimal', () => {
    expect(pctFigure(31.76)).toBe('31.8%')
    expect(pctFigure(0)).toBe('0.0%')
  })

  it('signedPts shows the direction with a real minus sign', () => {
    expect(signedPts(1.7)).toBe('+1.7 pts')
    expect(signedPts(-4.1)).toBe('−4.1 pts')
    expect(signedPts(0)).toBe('0.0 pts')
  })
})

describe('riskErrorCopy', () => {
  it('explains an unreachable API', () => {
    expect(riskErrorCopy(new ApiError(0, 'Cannot reach the Precedent API'), 'ranking').title).toBe(
      'Can’t reach the Precedent API.',
    )
  })

  it('doesn’t blame Hindsight for a 503: risk and Benford read only the database', () => {
    expect(riskErrorCopy(new ApiError(503, 'Service unavailable'), 'benford')).toEqual({
      title: 'The Benford test didn’t load.',
      body: 'Service unavailable',
    })
  })

  it('names what failed otherwise', () => {
    expect(riskErrorCopy(new Error('boom'), 'ranking')).toEqual({ title: 'The vendor ranking didn’t load.', body: 'boom' })
    expect(riskErrorCopy(new ApiError(500, 'oops'), 'benford')).toEqual({ title: 'The Benford test didn’t load.', body: 'oops' })
  })
})
