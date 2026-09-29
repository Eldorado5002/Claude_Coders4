import { describe, expect, it } from 'vitest'
import type { AutonomyCertificate } from '@/api/types'
import collectingMock from '@mocks/certificate.json'
import { decisionsNeeded } from './certificate'

const collecting = collectingMock as unknown as AutonomyCertificate
const cert = (over: Partial<AutonomyCertificate>) => ({ ...collecting, explanation: 'Collecting.', ...over })

describe('decisionsNeeded (one answer for the Trust map chip and the Learning card)', () => {
  it('takes the backend’s own number when its explanation states it', () => {
    expect(decisionsNeeded({ ...collecting, explanation: 'Certifying … takes 59 of them if no more are wrong.' })).toBe(59)
  })
  it('otherwise works out the exact Clopper–Pearson count, errors or not', () => {
    expect(decisionsNeeded(cert({ errors: 0, target_error: 0.05, confidence_level: 0.95 }))).toBe(59)
    expect(decisionsNeeded(cert({ errors: 1, target_error: 0.05, confidence_level: 0.95 }))).toBe(93)
    expect(decisionsNeeded(cert({ errors: 2, target_error: 0.05, confidence_level: 0.95 }))).toBe(124)
    expect(decisionsNeeded(cert({ errors: 0, target_error: 0.05, confidence_level: 0.99 }))).toBe(90)
  })
})
