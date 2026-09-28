import { describe, expect, it } from 'vitest'
import { gstinMatch, shortIrn } from './gst'

describe('shortIrn (the case file and capture show an IRN the same way)', () => {
  it('shows a 64-character IRN like a hash: first 8…last 6', () => {
    expect(shortIrn('2c7f2257cbb206bfcee0db8ca2b44a52d5ec60e713f6f2388e1a67e909c6ac5c')).toBe('2c7f2257…c6ac5c')
  })
  it('leaves short values alone, trims, and has nothing for an empty one', () => {
    expect(shortIrn('  ABC123  ')).toBe('ABC123')
    expect(shortIrn('0123456789abcdef')).toBe('0123456789abcdef')
    expect(shortIrn('  ')).toBeNull()
    expect(shortIrn(null)).toBeNull()
  })
})

describe('gstinMatch', () => {
  it('compares ignoring spaces and case', () => {
    expect(gstinMatch('36asics1238o1zx', '36ASICS1238O1ZX')).toBe('match')
    expect(gstinMatch('36 ASICS 1238O1ZX', '36ASICS1238O1ZX')).toBe('match')
    expect(gstinMatch('36ASICS1278O1ZX', '36ASICS1238O1ZX')).toBe('mismatch')
  })
  it('has nothing to compare when either side is missing', () => {
    expect(gstinMatch(null, '36ASICS1238O1ZX')).toBeNull()
    expect(gstinMatch('36ASICS1238O1ZX', undefined)).toBeNull()
  })
})
