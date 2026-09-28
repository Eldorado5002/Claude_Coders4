import { describe, expect, it } from 'vitest'
import { parseAmount, validateResolve } from './resolve-validation'

const base = { decision: 'approve' as const, reason: 'Freight within the ₹5,000 cap.', adjusted: '', blocking: false, callbackVerified: false }

describe('validateResolve', () => {
  it('needs a decision', () => {
    const r = validateResolve({ ...base, decision: null })
    expect(r.ok).toBe(false)
    expect(r.errors.decision).toBeTruthy()
  })

  it('needs a reason of at least 5 characters, because that is what the agent learns', () => {
    expect(validateResolve({ ...base, reason: ' ok  ' }).errors.reason).toMatch(/5 characters/)
    expect(validateResolve(base).ok).toBe(true)
  })

  it('needs a corrected amount for approve adjusted, and parses rupee formatting', () => {
    expect(validateResolve({ ...base, decision: 'approve_adjusted' }).errors.adjusted).toBeTruthy()
    const r = validateResolve({ ...base, decision: 'approve_adjusted', adjusted: '₹1,23,456.50' })
    expect(r.ok).toBe(true)
    expect(r.body).toEqual({ decision: 'approve_adjusted', reason: base.reason, adjusted_amount: 123456.5 })
  })

  it('drops any adjusted amount for other decisions', () => {
    expect(validateResolve({ ...base, adjusted: '999' }).body?.adjusted_amount).toBeNull()
  })

  it('makes the clerk confirm the callback before paying a blocked invoice', () => {
    const blocked = { ...base, blocking: true }
    expect(validateResolve(blocked).errors.callback).toBeTruthy()
    expect(validateResolve({ ...blocked, callbackVerified: true }).ok).toBe(true)
    expect(validateResolve({ ...blocked, decision: 'escalate' }).ok).toBe(true)
  })
})

describe('parseAmount', () => {
  it('reads Indian-formatted rupees', () => {
    expect(parseAmount('2,41,428')).toBe(241428)
    expect(parseAmount('Rs 4,956.00')).toBe(4956)
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('')).toBeNull()
  })
})
