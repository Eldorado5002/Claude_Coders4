import { describe, expect, it } from 'vitest'
import type { ExceptionDetail, Recommendation } from '@/api/types'
import detailMock from '@mocks/exception-detail.json'
import { calibratedCopy, opinionMeta } from './opinion-meta'

const rec = (detailMock as unknown as ExceptionDetail).recommendation!

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
