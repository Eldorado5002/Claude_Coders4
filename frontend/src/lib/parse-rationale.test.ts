import { describe, expect, it } from 'vitest'
import { parseRationale } from './parse-rationale'

const BANK_MSG =
  'Pay-to account Yes Bank XXXXXX9083 (YESB0000871) differs from vendor master HDFC Bank XXXXXX4521 (HDFC0001234).'

describe('parseRationale', () => {
  it('passes a plain rationale through untouched', () => {
    const text = 'Freight ₹4,200 is under the ₹5,000 per-trip cap agreed with Balaji.'
    expect(parseRationale(text)).toEqual({ body: text })
  })

  it('splits a forced hard control and what memory alone would have done', () => {
    const text = `Hard control: ${BANK_MSG} Action forced to escalate. (Memory alone would have suggested approve.)`
    expect(parseRationale(text, [BANK_MSG])).toEqual({
      control: { message: BANK_MSG, forced: 'escalate' },
      memoryWouldHave: 'approve',
      body: '',
    })
  })

  it('finds the forced action even when the control message is not supplied', () => {
    const text = `Hard control: ${BANK_MSG} Action forced to escalate. `
    const r = parseRationale(text)
    expect(r.control).toEqual({ message: BANK_MSG, forced: 'escalate' })
    expect(r.memoryWouldHave).toBeUndefined()
  })

  it('keeps the agent reasoning when the model already agreed with the control', () => {
    const dup = 'Same invoice number SBST/2526/1231 as INV-0094 received on 18 Mar 2026.'
    const text = `Hard control: ${dup} Duplicate of an approved invoice; reject.`
    expect(parseRationale(text, [dup])).toEqual({
      control: { message: dup },
      body: 'Duplicate of an approved invoice; reject.',
    })
  })

  it('pulls the ML check note out of the body', () => {
    const text =
      "Precedents allow freight under ₹5,000. ML check: this invoice is more unusual than 95% of Shree Balaji Steel Traders Pvt Ltd's history (typical total ₹2,36,000.00)."
    expect(parseRationale(text)).toEqual({
      body: 'Precedents allow freight under ₹5,000.',
      ml: "this invoice is more unusual than 95% of Shree Balaji Steel Traders Pvt Ltd's history (typical total ₹2,36,000.00).",
    })
  })
})
