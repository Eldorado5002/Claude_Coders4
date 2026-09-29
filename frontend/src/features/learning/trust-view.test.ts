import { describe, expect, it } from 'vitest'
import type { AutonomyCertificate, Calibration, CalibrationBin } from '@/api/types'
import collectingMock from '@mocks/certificate.json'
import certifiedMock from '@mocks/replay-end/certificate.json'
import calibrationMock from '@mocks/replay-end/calibration.json'
import performanceMock from '@mocks/replay-end/performance.json'
import {
  allowance,
  autoRecord,
  binLabel,
  boundPct,
  boundSentence,
  calibrationPoints,
  calibrationSummary,
  certificateProgress,
  eceText,
  hasTrustData,
  ladderRows,
  latencyLine,
  plain,
  plainPct,
  record,
  sealFor,
  seconds,
  secondsDigits,
  showLadder,
  usdDigits,
  usdPer1000,
  usdPerRec,
} from './trust-view'

const certified = certifiedMock as AutonomyCertificate
const collecting = collectingMock as AutonomyCertificate
const paused: AutonomyCertificate = {
  ...certified,
  status: 'paused',
  threshold: null,
  decisions: 73,
  errors: 5,
  error_upper_bound: 0.1403,
  auto_resolutions: 46,
  auto_errors: 1,
  table: [{ threshold: 0.95, decisions: 66, errors: 5, upper_bound: 0.1553, certified: false }],
  explanation: 'Too many wrong payments: auto-approval is paused.',
}

const bin = (over: Partial<CalibrationBin>): CalibrationBin => ({ low: 0, high: 0.5, n: 10, stated: 0.4, actual: 0.4, ...over })

describe('sealFor', () => {
  it('maps each certificate status to its seal', () => {
    expect(sealFor('certified')).toEqual({ label: 'Certified', variant: 'solid' })
    expect(sealFor('collecting')).toEqual({ label: 'Collecting', variant: 'outline' })
    expect(sealFor('paused')).toEqual({ label: 'Paused', variant: 'reject' })
  })
  it('treats an unknown status as still collecting', () => {
    expect(sealFor('surprise' as AutonomyCertificate['status'])).toEqual({ label: 'Collecting', variant: 'outline' })
  })
})

describe('percent formatting', () => {
  it('shows upper bounds with one decimal', () => {
    expect(boundPct(0.0402)).toBe('4.0%')
    expect(boundPct(0.0444)).toBe('4.4%')
    expect(boundPct(0.7764)).toBe('77.6%')
    expect(boundPct(0.181)).toBe('18.1%')
    expect(boundPct(1)).toBe('100%')
  })
  it('shows round targets without a trailing .0', () => {
    expect(plainPct(0.05)).toBe('5%')
    expect(plainPct(0.95)).toBe('95%')
    expect(plainPct(0.025)).toBe('2.5%')
  })
})

describe('certificate headline', () => {
  it('says the certified threshold, with the figure emphasised', () => {
    const segs = allowance(certified)
    expect(plain(segs)).toBe('Auto-pay allowed at confidence ≥ 0.75')
    expect(segs).toContainEqual({ b: '0.75' })
  })
  it('names the provisional threshold while collecting', () => {
    expect(plain(allowance(collecting))).toBe('Provisional: auto-pay only at confidence ≥ 0.95')
  })
  it('says auto-pay is paused when there is no threshold', () => {
    expect(plain(allowance(paused))).toBe('Auto-pay is paused')
  })

  it('counts verified decisions and wrong ones, singular and plural', () => {
    expect(plain(record(certified))).toBe('73 verified payment decisions · 0 wrong')
    expect(record(certified)).toContainEqual({ b: '73' })
    expect(plain(record({ ...certified, decisions: 1, errors: 1 }))).toBe('1 verified payment decision · 1 wrong')
    expect(plain(record({ ...certified, decisions: 0, errors: 0 }))).toBe('No verified payment decisions yet')
  })

  it('states the statistical bound against the target', () => {
    const segs = boundSentence(certified)
    expect(plain(segs)).toBe('With 95% confidence, at most 4.0% of automatic payments are wrong (target 5%)')
    expect(segs).toContainEqual({ b: '4.0%' })
    expect(plain(boundSentence(collecting))).toBe(
      'With 95% confidence, at most 77.6% of automatic payments are wrong (target 5%)',
    )
  })

  it('counts what was actually paid automatically', () => {
    expect(plain(autoRecord(certified))).toBe('46 paid automatically · 0 wrong')
    expect(plain(autoRecord({ ...certified, auto_resolutions: 1, auto_errors: 0 }))).toBe('1 paid automatically · 0 wrong')
    expect(plain(autoRecord(collecting))).toBe('Nothing paid automatically yet')
  })
})

describe('certificateProgress', () => {
  it('shows how far collecting has got toward certification', () => {
    expect(certificateProgress(collecting)).toEqual({ have: 2, need: 59, text: '2 of 59 verified decisions' })
    expect(certificateProgress({ ...collecting, decisions: 15 })?.text).toBe('15 of 59 verified decisions')
  })
  it('is null once certified or paused', () => {
    expect(certificateProgress(certified)).toBeNull()
    expect(certificateProgress(paused)).toBeNull()
  })
})

describe('ladderRows', () => {
  it('lists thresholds strictest first, formats bounds and marks the one in force', () => {
    const rows = ladderRows(certified)
    expect(rows.map((r) => r.threshold)).toEqual(['0.95', '0.90', '0.85', '0.80', '0.75'])
    expect(rows[0]).toEqual({ key: '0.95', threshold: '0.95', decisions: 66, errors: 0, bound: '4.4%', certified: true, current: false })
    expect(rows.filter((r) => r.current).map((r) => r.threshold)).toEqual(['0.75'])
  })
  it('is only worth drawing with more than one threshold; one row repeats the headline', () => {
    expect(showLadder(certified)).toBe(true)
    expect(showLadder(collecting)).toBe(false)
    expect(showLadder({ ...collecting, table: [] })).toBe(false)
  })
  it('sorts an unordered table and marks nothing when paused', () => {
    const rows = ladderRows({
      ...paused,
      table: [
        { threshold: 0.8, decisions: 3, errors: 0, upper_bound: 0.63, certified: false },
        { threshold: 0.9, decisions: 2, errors: 0, upper_bound: 0.7764, certified: false },
      ],
    })
    expect(rows.map((r) => r.threshold)).toEqual(['0.90', '0.80'])
    expect(rows.some((r) => r.current)).toBe(false)
  })
})

describe('calibrationPoints', () => {
  it('skips bins without an actual rate', () => {
    const pts = calibrationPoints((calibrationMock as Calibration).bins)
    expect(pts.map((p) => p.stated)).toEqual([0.406, 0.6, 0.891, 0.955])
    expect(pts.map((p) => p.n)).toEqual([9, 11, 17, 85])
  })
  it('skips empty bins and bins without a stated rate', () => {
    expect(calibrationPoints([bin({ n: 0 }), bin({ stated: null }), bin({ actual: undefined })])).toEqual([])
  })
  it('sizes dots by n on an area scale, largest bin at the max radius', () => {
    const pts = calibrationPoints([bin({ n: 100 }), bin({ n: 25, low: 0.5, high: 0.7 }), bin({ n: 1, low: 0.7, high: 0.85 })], {
      minR: 4,
      maxR: 14,
    })
    expect(pts[0].r).toBe(14)
    expect(pts[1].r).toBe(9) // 4 + 10·√(25/100)
    expect(pts[2].r).toBe(5) // 4 + 10·√(1/100)
  })
  it('never draws a dot smaller than the minimum', () => {
    const pts = calibrationPoints([bin({ n: 1000 }), bin({ n: 1 })], { minR: 4, maxR: 14 })
    expect(pts[1].r).toBeGreaterThanOrEqual(4)
  })
  it('labels each bin by its confidence range', () => {
    expect(binLabel({ low: 0.95, high: 1 })).toBe('95–100%')
    expect(binLabel({ low: 0, high: 0.5 })).toBe('0–50%')
  })
})

describe('calibration text', () => {
  it('rounds the expected calibration error to two decimals', () => {
    expect(eceText(0.0715)).toBe('Expected calibration error 0.07')
    expect(eceText(null)).toBeNull()
    expect(eceText(undefined)).toBeNull()
  })
  it('summarises pooled accuracy over the scored recommendations', () => {
    expect(calibrationSummary(calibrationMock as Calibration)).toBe('Right 90% of the time across 123 scored recommendations')
    expect(calibrationSummary({ n: 1, ece: null, pooled_accuracy: 1, bins: [] })).toBe(
      'Right 100% of the time across 1 scored recommendation',
    )
  })
  it('says nothing before any recommendation is scored (Day 1), instead of a smoothed 50% over none', () => {
    expect(calibrationSummary({ n: 0, ece: null, pooled_accuracy: 0.5, bins: [] })).toBeNull()
  })
})

describe('cost and speed formatting', () => {
  it('shows the per-1,000 cost in whole dollars', () => {
    expect(usdPer1000(performanceMock.cost_per_1000_exceptions_usd)).toBe('$17')
    expect(usdPer1000(45.03)).toBe('$45')
    expect(usdPer1000(1234.5)).toBe('$1,235')
    expect(usdPer1000(null)).toBe('—')
  })
  it('keeps cents only when the per-1,000 cost is under a dollar', () => {
    expect(usdDigits(17.3)).toBe(0)
    expect(usdDigits(0.45)).toBe(2)
    expect(usdPer1000(0.45)).toBe('$0.45')
  })
  it('shows per-recommendation cost like the case file does (the shared rule in lib/format)', () => {
    expect(usdPerRec(0.0173)).toBe('$0.017')
    expect(usdPerRec(0.04503)).toBe('$0.045')
    expect(usdPerRec(0.000986)).toBe('$0.001')
    expect(usdPerRec(0.0004)).toBe('< $0.001')
    expect(usdPerRec(null)).toBe('—')
  })
  it('turns milliseconds into readable seconds', () => {
    expect(seconds(2653)).toBe('2.7 s')
    expect(seconds(9443)).toBe('9.4 s')
    expect(seconds(11498)).toBe('11 s')
    expect(seconds(850)).toBe('850 ms')
    expect(seconds(null)).toBe('—')
  })
  it('keeps one decimal on the seconds figure under 10 s', () => {
    expect(secondsDigits(2653)).toBe(1)
    expect(secondsDigits(850)).toBe(1)
    expect(secondsDigits(11498)).toBe(0)
  })
  it('writes the latency line from median and p95', () => {
    expect(latencyLine(performanceMock)).toBe('2.7 s median · 9.4 s p95')
    expect(latencyLine({ ...performanceMock, latency_p95_ms: null })).toBe('2.7 s median')
    expect(latencyLine({ ...performanceMock, latency_p50_ms: null, latency_p95_ms: null })).toBeNull()
  })
})

describe('hasTrustData', () => {
  it('is true when any trust block has data', () => {
    expect(hasTrustData({ certificate: null, calibration: null, performance: null })).toBe(false)
    expect(hasTrustData({})).toBe(false)
    expect(hasTrustData({ certificate: certified })).toBe(true)
    expect(hasTrustData({ performance: performanceMock })).toBe(true)
  })
})
