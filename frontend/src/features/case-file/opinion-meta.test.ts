import { describe, expect, it } from 'vitest'
import type { ExceptionDetail, Recommendation } from '@/api/types'
import detailMock from '@mocks/exception-detail.json'
import { calibratedCopy, formatCost, opinionMeta } from './opinion-meta'

const rec = (detailMock as unknown as ExceptionDetail).recommendation!

describe('formatCost', () => {
  it('shows dollars to 3 decimals', () => {
    expect(formatCost(0.05)).toBe('$0.050')
    expect(formatCost(1.2345)).toBe('$1.234')
  })
  it('rounds the Week 3 fast-path cost to about a tenth of a cent', () => {
    expect(formatCost(0.000986)).toBe('$0.001')
    expect(formatCost(0.0005)).toBe('$0.001')
  })
  it('says "< $0.001" when 3 decimals would read as zero', () => {
    expect(formatCost(0.0004)).toBe('< $0.001')
    expect(formatCost(0.00001)).toBe('< $0.001')
  })
  it('shows a free recommendation as zero and omits an unknown cost', () => {
    expect(formatCost(0)).toBe('$0.000')
    expect(formatCost(null)).toBeNull()
    expect(formatCost(undefined)).toBeNull()
  })
})

describe('calibratedCopy', () => {
  it('turns calibrated confidence into a plain track record', () => {
    expect(calibratedCopy(0.667)).toBe('right 67% of the time at this confidence')
    expect(calibratedCopy(1)).toBe('right 100% of the time at this confidence')
  })
  it('is omitted early in the demo, before there is a track record', () => {
    expect(calibratedCopy(null)).toBeNull()
    expect(calibratedCopy(undefined)).toBeNull()
  })
})

describe('opinionMeta', () => {
  it('reads route · cost · latency · time for the Week 3 case', () => {
    expect(opinionMeta(rec)).toEqual(['Fast path', '$0.001', '2.0 s', '09:02'])
  })
  it('labels every route', () => {
    const at = (route: Recommendation['route']) => opinionMeta({ ...rec, route })[0]
    expect(at('reflect')).toBe('Deep reasoning')
    expect(at('guardrail')).toBe('Hard control')
    expect(at('no_memory')).toBe('No memory')
  })
  it('drops what the API did not send', () => {
    const old = { ...rec, cost_usd: null, route: undefined } as unknown as Recommendation
    expect(opinionMeta(old)).toEqual(['2.0 s', '09:02'])
  })
})
