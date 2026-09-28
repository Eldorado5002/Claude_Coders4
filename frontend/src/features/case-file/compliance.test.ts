import { describe, expect, it } from 'vitest'
import type { ExceptionDetail, MsmeStatus } from '@/api/types'
import msmeMock from '@mocks/twist/exception-detail-msme.json'
import { eInvoiceCheck, gstinCheck, msmeLine, shortIrn } from './compliance'

const msmeCase = msmeMock as unknown as ExceptionDetail
const msme = msmeCase.compliance.msme!

const text = (l: { strong: string; rest: string }) => `${l.strong}${l.rest}`

describe('shortIrn', () => {
  it('shortens a 64-hex IRN like a hash: first 8 … last 6', () => {
    expect(shortIrn('1a9d7bc45699b8a8c24791bc16073a2a98508167eec94d39a65ae3832afbac44')).toBe('1a9d7bc4…fbac44')
  })
  it('leaves short values alone and trims whitespace', () => {
    expect(shortIrn('  ABC123  ')).toBe('ABC123')
    expect(shortIrn('0123456789abcdef')).toBe('0123456789abcdef')
  })
})

describe('msmeLine', () => {
  it('reads the Twist case: micro, 5 days to 2 May, ₹46,476 at stake, hold tone', () => {
    const l = msmeLine(msme)
    expect(l.tone).toBe('hold')
    expect(l.category).toBe('micro')
    expect(l.strong).toBe('5 days')
    expect(text(l)).toBe('5 days to the 43B(h) deadline (2 May)')
    expect(l.tax).toBe('₹46,476 tax deduction at stake')
    expect(l.udyam).toBe('UDYAM-TS-22-0009561')
  })

  it('is neutral while the deadline is comfortably away', () => {
    const l = msmeLine({ ...msme, status: 'ok', days_left: 30 })
    expect(l.tone).toBe('neutral')
    expect(text(l)).toBe('30 days to the 43B(h) deadline (2 May)')
  })

  it('says one day, not one days', () => {
    expect(msmeLine({ ...msme, days_left: 1 }).strong).toBe('1 day')
  })

  it('calls out the deadline day itself', () => {
    const l = msmeLine({ ...msme, days_left: 0 })
    expect(l.tone).toBe('hold')
    expect(text(l)).toBe('Due today: the 43B(h) deadline is 2 May')
  })

  it('turns reject and counts the overdue days once breached', () => {
    const breached: MsmeStatus = { ...msme, status: 'breached', days_left: -3 }
    const l = msmeLine(breached)
    expect(l.tone).toBe('reject')
    expect(l.strong).toBe('Overdue by 3 days')
    expect(text(l)).toBe('Overdue by 3 days: the 43B(h) deadline was 2 May')
    expect(msmeLine({ ...breached, days_left: -1 }).strong).toBe('Overdue by 1 day')
  })

  it('explains where the deadline comes from', () => {
    expect(msmeLine(msme).detail).toBe('Goods accepted 18 Mar · 45-day limit')
    expect(msmeLine({ ...msme, terms_exceed_limit: true }).detail).toBe(
      'Goods accepted 18 Mar · 45-day limit · this vendor’s payment terms are longer than the limit',
    )
  })
})

describe('eInvoiceCheck', () => {
  const irn = '1a9d7bc45699b8a8c24791bc16073a2a98508167eec94d39a65ae3832afbac44'
  it('stays silent when the supplier does not have to e-invoice', () => {
    expect(eInvoiceCheck({ required: false, irn_present: false }, null).status).toBe('not_required')
    expect(eInvoiceCheck(undefined, irn).status).toBe('not_required')
  })
  it('shows the IRN shortened when present', () => {
    expect(eInvoiceCheck({ required: true, irn_present: true }, irn)).toEqual({ status: 'present', irn: '1a9d7bc4…fbac44' })
    expect(eInvoiceCheck({ required: true, irn_present: true }, null)).toEqual({ status: 'present', irn: null })
  })
  it('flags a missing IRN when e-invoicing is required', () => {
    expect(eInvoiceCheck({ required: true, irn_present: false }, null)).toEqual({ status: 'missing', irn: null })
  })
})

describe('gstinCheck', () => {
  it('matches the vendor master, ignoring case and spaces', () => {
    expect(gstinCheck('36asics1238o1zx ', '36ASICS1238O1ZX').status).toBe('match')
  })
  it('flags a GSTIN that differs from the master', () => {
    expect(gstinCheck('36ASICS1278O1ZX', '36ASICS1238O1ZX')).toEqual({
      status: 'mismatch',
      onInvoice: '36ASICS1278O1ZX',
      master: '36ASICS1238O1ZX',
    })
  })
  it('says so when the invoice prints no GSTIN', () => {
    expect(gstinCheck(null, '36ASICS1238O1ZX').status).toBe('missing')
    expect(gstinCheck(undefined, '36ASICS1238O1ZX').status).toBe('missing')
    expect(gstinCheck('  ', '36ASICS1238O1ZX').status).toBe('missing')
  })
})
