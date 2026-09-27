import { describe, expect, it } from 'vitest'
import { inr, inrCompact, pct, simDate, simRelative, simTime } from './format'

describe('inr', () => {
  it('formats rupees with Indian digit grouping and paise', () => {
    expect(inr(241428)).toBe('₹2,41,428.00')
    expect(inr(4956.5)).toBe('₹4,956.50')
  })
  it('renders a dash for missing amounts', () => {
    expect(inr(null)).toBe('—')
    expect(inr(undefined)).toBe('—')
  })
})

describe('inrCompact', () => {
  it('keeps small amounts whole', () => {
    expect(inrCompact(4956)).toBe('₹4,956')
  })
  it('uses lakh and crore above one lakh', () => {
    expect(inrCompact(550000)).toBe('₹5.5L')
    expect(inrCompact(120000000)).toBe('₹12Cr')
  })
})

describe('pct', () => {
  it('rounds a 0-1 ratio to a whole percent', () => {
    expect(pct(0.955)).toBe('96%')
    expect(pct(0)).toBe('0%')
  })
  it('renders a dash for null', () => {
    expect(pct(null)).toBe('—')
  })
})

describe('sim clock', () => {
  it('formats a date-only value without a timezone shift', () => {
    expect(simDate('2026-03-18')).toBe('Wed, 18 Mar 2026')
  })
  it('formats a naive datetime', () => {
    expect(simDate('2026-03-18T09:30:00')).toBe('Wed, 18 Mar 2026')
    expect(simTime('2026-03-18T09:30:00')).toBe('09:30')
  })
  it('describes times relative to the simulated today, not the wall clock', () => {
    expect(simRelative('2026-03-18T09:30:00', '2026-03-18')).toBe('Today, 09:30')
    expect(simRelative('2026-03-17T16:15:00', '2026-03-18')).toBe('Yesterday, 16:15')
    expect(simRelative('2026-03-02T10:05:00', '2026-03-18')).toBe('2 Mar')
  })
})
