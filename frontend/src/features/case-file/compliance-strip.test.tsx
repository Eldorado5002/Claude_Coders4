import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ExceptionDetail } from '@/api/types'
import week3Mock from '@mocks/exception-detail.json'
import badGstinMock from '@mocks/twist/capture-case-bad-gstin.json'
import noIrnMock from '@mocks/twist/capture-case-no-irn.json'
import msmeMock from '@mocks/twist/exception-detail-msme.json'
import { renderApp } from '@/test/render'
import { CaseHeader } from './case-header'
import { ComplianceStrip } from './compliance-strip'

const week3 = week3Mock as unknown as ExceptionDetail
const msme = msmeMock as unknown as ExceptionDetail
const noIrn = noIrnMock as unknown as ExceptionDetail
const badGstin = badGstinMock as unknown as ExceptionDetail

const strip = () => screen.getByRole('list', { name: 'Compliance checks' })
const item = (label: RegExp) =>
  within(strip())
    .getAllByRole('listitem')
    .find((li) => label.test(li.textContent ?? ''))!

describe('ComplianceStrip', () => {
  it('shows the MSME 43B(h) deadline in hold tone, with the tax at stake and the Udyam number', () => {
    renderApp(<ComplianceStrip c={msme} />)
    const m = item(/^MSME/)
    expect(m).toHaveAttribute('data-tone', 'hold')
    expect(m).toHaveTextContent('MSMEmicro·5 days to the 43B(h) deadline (2 May)·₹46,476 tax deduction at stake·UDYAM-TS-22-0009561')
    expect(within(m).getByText('UDYAM-TS-22-0009561')).toHaveClass('font-mono')
    // Ananth is not an e-invoicer: no IRN line, and its GSTIN matches the master
    expect(screen.queryByText(/IRN/)).not.toBeInTheDocument()
    expect(item(/^GSTIN/)).toHaveTextContent('on invoice matches master')
  })

  it('explains 43B(h) in one sentence on hover', async () => {
    const user = userEvent.setup()
    renderApp(<ComplianceStrip c={msme} />)
    await user.hover(screen.getByRole('button', { name: /5 days to the 43B\(h\) deadline/ }))
    const tip = await screen.findByRole('dialog')
    expect(tip).toHaveTextContent(/within 15 days of accepting the goods, or 45 with a written agreement/)
  })

  it('explains 43B(h) on a tap too, where there is no hover, with the goods-accepted date and the limit', async () => {
    const real = window.matchMedia
    window.matchMedia = ((media: string) => ({
      media,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    try {
      const user = userEvent.setup()
      renderApp(<ComplianceStrip c={msme} />)
      await user.click(screen.getByRole('button', { name: /5 days to the 43B\(h\) deadline/ }))
      const tip = await screen.findByRole('dialog')
      expect(tip).toHaveTextContent(/Section 43B\(h\)/)
      expect(tip).toHaveTextContent('Goods accepted 18 Mar · 45-day limit')
    } finally {
      window.matchMedia = real
    }
  })

  it('drops the countdown once the case is decided: the invoice no longer waits on anyone', () => {
    renderApp(<ComplianceStrip c={{ ...msme, status: 'resolved' }} />)
    const m = item(/^MSME/)
    expect(m).toHaveAttribute('data-tone', 'neutral')
    expect(m).toHaveTextContent('MSMEmicro·43B(h) deadline 2 May·UDYAM-TS-22-0009561')
    expect(m).not.toHaveTextContent(/at stake|days to/)
  })

  it('turns reject and counts the days once the deadline has passed', () => {
    const late = { ...msme, compliance: { ...msme.compliance, msme: { ...msme.compliance.msme!, status: 'breached' as const, days_left: -4 } } }
    renderApp(<ComplianceStrip c={late} />)
    const m = item(/^MSME/)
    expect(m).toHaveAttribute('data-tone', 'reject')
    expect(m).toHaveTextContent('Overdue by 4 days: the 43B(h) deadline was 2 May')
  })

  it('shows the IRN shortened like a hash and the GSTIN matching the master (Week 3)', () => {
    renderApp(<ComplianceStrip c={week3} />)
    expect(screen.queryByText(/^MSME/)).not.toBeInTheDocument()
    const e = item(/^E-invoice/)
    expect(e).toHaveAttribute('data-tone', 'ok')
    expect(within(e).getByText('1a9d7bc4…fbac44')).toHaveAttribute('title', week3.invoice.irn)
    expect(item(/^GSTIN/)).toHaveTextContent('GSTINon invoice matches master36ASICS1238O1ZX')
  })

  it('flags a missing IRN as not a valid tax invoice, locked', () => {
    renderApp(<ComplianceStrip c={noIrn} />)
    const e = item(/^E-invoice/)
    expect(e).toHaveAttribute('data-tone', 'reject')
    expect(e).toHaveTextContent('IRN missing: not a valid tax invoice')
    expect(within(e).getByLabelText('Hard control')).toBeInTheDocument()
  })

  it('shows a GSTIN mismatch against the vendor master, locked', () => {
    renderApp(<ComplianceStrip c={badGstin} />)
    const g = item(/^GSTIN/)
    expect(g).toHaveAttribute('data-tone', 'reject')
    expect(g).toHaveTextContent('on invoice 36ASICS1278O1ZX ≠ master 36ASICS1238O1ZX')
    expect(within(g).getByLabelText('Hard control')).toBeInTheDocument()
    expect(item(/^E-invoice/)).toHaveTextContent('IRN4a7e2de5…0dd6c2')
  })

  it('says so, quietly, when the invoice prints no GSTIN', () => {
    renderApp(<ComplianceStrip c={{ ...week3, invoice: { ...week3.invoice, supplier_gstin: null } }} />)
    const g = item(/^GSTIN/)
    expect(g).toHaveAttribute('data-tone', 'muted')
    expect(g).toHaveTextContent('GSTINnot printed·master 36ASICS1238O1ZX')
  })
})

describe('CaseHeader', () => {
  it('puts the compliance strip directly under the issue strip', () => {
    renderApp(<CaseHeader c={msme} />)
    const issues = screen.getByRole('list', { name: /Issues found/ })
    expect(issues.nextElementSibling).toBe(strip())
  })
})
