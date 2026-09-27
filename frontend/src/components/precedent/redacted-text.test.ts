import { describe, expect, it } from 'vitest'
import { splitRedacted } from './redacted'

describe('splitRedacted', () => {
  it('returns plain text untouched', () => {
    expect(splitRedacted('Freight under the cap.')).toEqual(['Freight under the cap.'])
  })
  it('turns each [REDACTED:kind] marker into a part', () => {
    expect(splitRedacted('Called [REDACTED:phone] to confirm; paid to [REDACTED:bank_account].')).toEqual([
      'Called ',
      { kind: 'phone' },
      ' to confirm; paid to ',
      { kind: 'bank_account' },
      '.',
    ])
  })
})
