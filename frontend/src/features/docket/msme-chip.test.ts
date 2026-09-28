import { describe, expect, it } from 'vitest'
import { msmeChip } from './msme-chip'

describe('msmeChip', () => {
  it('shows nothing for a vendor that is not MSME (or a duplicate that will never be paid)', () => {
    expect(msmeChip(null)).toBeNull()
    expect(msmeChip(undefined)).toBeNull()
  })

  it('is neutral while the 43B(h) deadline is more than a week away', () => {
    expect(msmeChip(37)).toMatchObject({ label: 'MSME · 37d', tone: 'neutral' })
    expect(msmeChip(8)).toMatchObject({ label: 'MSME · 8d', tone: 'neutral' })
  })

  it('turns hold within 7 days', () => {
    expect(msmeChip(7)).toMatchObject({ label: 'MSME · 7d', tone: 'hold' })
    expect(msmeChip(5)).toMatchObject({ label: 'MSME · 5d', tone: 'hold' })
    expect(msmeChip(0)).toMatchObject({ label: 'MSME · today', tone: 'hold' })
  })

  it('turns reject and says overdue once the deadline has passed', () => {
    expect(msmeChip(-3)).toMatchObject({ label: 'MSME · 3d overdue', tone: 'reject' })
  })

  it('spells the deadline out for screen readers and hover', () => {
    expect(msmeChip(5)!.title).toBe('5 days to the MSME 43B(h) payment deadline')
    expect(msmeChip(1)!.title).toBe('1 day to the MSME 43B(h) payment deadline')
    expect(msmeChip(0)!.title).toBe('The MSME 43B(h) payment deadline is today')
    expect(msmeChip(-1)!.title).toBe('1 day past the MSME 43B(h) payment deadline')
  })
})
