import { describe, expect, it } from 'vitest'
import { tidyReason } from './risk'

describe('tidyReason (the /risk page and the vendor hover say it the same way)', () => {
  it('drops "(s)" for one and pluralises otherwise, capitalised', () => {
    expect(tidyReason('1 request(s) to pay a different bank account')).toBe('1 request to pay a different bank account')
    expect(tidyReason('2 duplicate invoice submission(s)')).toBe('2 duplicate invoice submissions')
    expect(tidyReason('exception rate 91% vs 23% across all vendors')).toBe('Exception rate 91% vs 23% across all vendors')
  })
})
