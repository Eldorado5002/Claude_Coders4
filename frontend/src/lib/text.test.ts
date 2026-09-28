import { describe, expect, it } from 'vitest'
import { firstSentence } from './text'

describe('firstSentence', () => {
  it('does not stop at company and currency abbreviations', () => {
    expect(
      firstSentence('Freight of Rs. 3,600 is under the cap agreed with Shree Balaji Steel Traders Pvt. Ltd. for each trip. Approve it.'),
    ).toBe('Freight of Rs. 3,600 is under the cap agreed with Shree Balaji Steel Traders Pvt. Ltd. for each trip.')
  })
  it('keeps decimals and rupee amounts intact', () => {
    expect(firstSentence('The ₹3,600.00 charge is below ₹5,000.00 per trip. Second.')).toBe(
      'The ₹3,600.00 charge is below ₹5,000.00 per trip.',
    )
  })
  it('returns the whole text when there is a single sentence', () => {
    expect(firstSentence('No precedent applies, e.g. a first invoice')).toBe('No precedent applies, e.g. a first invoice')
  })
})
