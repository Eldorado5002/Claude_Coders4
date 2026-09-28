import { describe, expect, it } from 'vitest'
import type { Metrics, WeeklyPoint } from '@/api/types'
import metricsMock from '@mocks/metrics.json'
import { findReplaySummary, footnoteFor, hasBaseline, headline, lastPoint, spreadLabels } from './learning-view'

const wk = (week: number, on: number | null, off: number | null): WeeklyPoint => ({
  week,
  week_start: `2026-03-${String(week).padStart(2, '0')}`,
  memory_on: on,
  memory_off: off,
})

const base = (over: Partial<Metrics> = {}): Metrics => ({
  kpis: {
    touchless_rate: 0.1,
    acceptance_rate: 0.7,
    exceptions_total: 40,
    auto_resolved: 4,
    blocked_by_controls: 3,
    false_approvals: 0,
    memories: 100,
    minutes_saved: 120,
    citation_relevance: 0.9,
    lessons_revoked: 0,
    msme_open_at_risk: 0,
    msme_tax_at_risk: 0,
  },
  touchless_by_week: [],
  acceptance_by_week: [],
  by_type: [],
  assumptions: ['Touchless = exceptions the agent resolved on its own.'],
  ...over,
})

describe('findReplaySummary', () => {
  it('parses the backend replay sentence and remembers which footnote it came from', () => {
    const found = findReplaySummary(metricsMock.assumptions)
    expect(found).toEqual({
      index: 4,
      from: 5,
      to: 6,
      correctOn: 98,
      correctOff: 50,
      touchlessOn: 54,
      touchlessOff: 0,
      falseApprovals: 0,
    })
  })
  it('accepts an en dash and a single month', () => {
    expect(
      findReplaySummary(['Month 6: agent correct 90% with memory vs 40% without; touchless 50% vs 1%; false approvals 2.'])
        ?.from,
    ).toBe(6)
    expect(
      findReplaySummary(['Months 5–6: agent correct 90% with memory vs 40% without; touchless 50% vs 1%; false approvals 2.'])
        ?.to,
    ).toBe(6)
  })
  it('returns null when no sentence matches', () => {
    expect(findReplaySummary(['Minutes saved assumes 7 min per manual exception.'])).toBeNull()
  })
})

describe('headline', () => {
  it('prefers the replay summary sentence from the assumptions', () => {
    expect(headline(metricsMock as Metrics)).toBe(
      'In months 5–6, Precedent was right 98% of the time with memory, 50% without. It resolved 54% of exceptions on its own, with zero false approvals.',
    )
  })

  it('names non-zero false approvals plainly', () => {
    const m = base({
      assumptions: ['Months 5-6: agent correct 90% with memory vs 40% without; touchless 50% vs 0%; false approvals 1.'],
    })
    expect(headline(m)).toBe(
      'In months 5–6, Precedent was right 90% of the time with memory, 40% without. It resolved 50% of exceptions on its own, with one false approval.',
    )
  })

  it('falls back to the last 9 weeks with data, skipping nulls', () => {
    // weeks 1-2 fall outside the window; week 12 has no data at all; week 8 has no baseline
    const acceptance = [
      wk(1, 0, 0),
      wk(2, 0, 0),
      wk(3, 0, 0),
      wk(4, 1, 0.5),
      wk(5, 1, 0.5),
      wk(6, 0.9, 0.3),
      wk(7, 0.9, 0.3),
      wk(8, 0.8, null),
      wk(9, 1, 0.3),
      wk(10, 0.9, 0.5),
      wk(11, 1, 0.3),
      wk(12, null, null),
    ]
    const touchless = [wk(1, 0, 0), wk(2, 0.5, 0), wk(3, 0.5, 0), wk(4, 0.5, 0), wk(5, 0.5, 0), wk(6, 0.5, 0), wk(7, 0.5, 0), wk(8, 0.5, 0), wk(9, 0.5, 0), wk(10, 0.5, 0)]
    const m = base({ acceptance_by_week: acceptance, touchless_by_week: touchless })
    // accuracy window = weeks 3-11 (9 weeks with memory_on data):
    //   on  = (0 + 1 + 1 + .9 + .9 + .8 + 1 + .9 + 1) / 9 = 0.8333 → 83%
    //   off = (0 + .5 + .5 + .3 + .3 + .3 + .5 + .3) / 8 = 0.3375 → 34%
    // touchless window = weeks 2-10: all 0.5 → 50%
    expect(headline(m)).toBe(
      'Over the last 9 weeks, Precedent was right 83% of the time with memory, 34% without. It resolved 50% of exceptions on its own, with zero false approvals.',
    )
  })

  it('says only the memory-on figures when there is no baseline', () => {
    const acceptance = [wk(1, 0.5, null), wk(2, 0.7, null), wk(3, 0.9, null)]
    const m = base({ acceptance_by_week: acceptance, kpis: { ...base().kpis, false_approvals: 3 } })
    expect(headline(m)).toBe('Over the last 3 weeks, Precedent was right 70% of the time with memory. It made 3 false approvals.')
  })

  it('handles a single week of history', () => {
    const m = base({ acceptance_by_week: [wk(1, 0.5, null)], touchless_by_week: [wk(1, 0.25, null)] })
    expect(headline(m)).toBe(
      'In the last week, Precedent was right 50% of the time with memory. It resolved 25% of exceptions on its own, with zero false approvals.',
    )
  })

  it('says plainly when there is nothing to compare yet', () => {
    expect(headline(base())).toBe('Not enough history yet to say how memory changes the agent’s decisions.')
  })
})

describe('footnoteFor', () => {
  it('returns the 1-based footnote number of the first assumption that matches', () => {
    expect(footnoteFor(metricsMock.assumptions, /^minutes saved/i)).toBe(3)
    expect(footnoteFor(metricsMock.assumptions, /^touchless/i)).toBe(1)
    expect(footnoteFor(metricsMock.assumptions, /^nothing like this/i)).toBeNull()
  })
})

describe('hasBaseline', () => {
  it('is false when every memory_off is null', () => {
    expect(hasBaseline([wk(1, 0.5, null), wk(2, 0.6, null)])).toBe(false)
    expect(hasBaseline([wk(1, 0.5, null), wk(2, 0.6, 0)])).toBe(true)
    expect(hasBaseline([])).toBe(false)
  })
})

describe('lastPoint', () => {
  it('finds the last week with a value for the series', () => {
    const pts = [wk(1, 0.5, 0.1), wk(2, 0.6, null), wk(3, null, null)]
    expect(lastPoint(pts, 'memory_on')).toEqual({ week: 2, value: 0.6 })
    expect(lastPoint(pts, 'memory_off')).toEqual({ week: 1, value: 0.1 })
    expect(lastPoint([wk(1, null, null)], 'memory_on')).toBeNull()
  })
})

describe('spreadLabels', () => {
  it('leaves labels alone when they are far enough apart', () => {
    expect(spreadLabels([20, 100], 14, 0, 200)).toEqual([20, 100])
  })
  it('pushes colliding labels apart around their midpoint, keeping order', () => {
    expect(spreadLabels([100, 104], 14, 0, 200)).toEqual([95, 109])
    expect(spreadLabels([104, 100], 14, 0, 200)).toEqual([109, 95])
  })
  it('keeps both labels inside the plot', () => {
    expect(spreadLabels([199, 199], 14, 0, 200)).toEqual([186, 200])
    expect(spreadLabels([0, 2], 14, 0, 200)).toEqual([0, 14])
  })
})
