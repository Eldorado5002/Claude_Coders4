import { queryOptions } from '@tanstack/react-query'
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaptureResult, ExceptionDetail, VendorSummary } from '@/api/types'
import captureMock from '@mocks/capture-result.json'
import badGstinMock from '@mocks/twist/capture-bad-gstin.json'
import freightMock from '@mocks/twist/capture-freight.json'
import noIrnMock from '@mocks/twist/capture-no-irn.json'
import vendorsMock from '@mocks/vendors.json'
import badGstinCaseMock from '@mocks/twist/capture-case-bad-gstin.json'
import freightCaseMock from '@mocks/twist/capture-case-freight.json'
import noIrnCaseMock from '@mocks/twist/capture-case-no-irn.json'
import { renderApp } from '@/test/render'
import { CaptureResultView } from './capture-result'

const freightCase = freightCaseMock as unknown as ExceptionDetail
// freight captured a second time: the duplicate control rejects it (as the backend did at the Twist, EXC-0046)
const dupCase: ExceptionDetail = {
  ...freightCase,
  id: 'EXC-0046',
  status: 'open',
  blocking: true,
  issues: [{ type: 'duplicate_invoice', message: 'Invoice SBST/2627/0612 was already submitted.', blocking: true }],
  recommendation: { ...freightCase.recommendation!, action: 'reject', source: 'guardrail' },
}
const CASES: Record<string, ExceptionDetail> = {
  'EXC-0043': freightCase,
  'EXC-0044': noIrnCaseMock as unknown as ExceptionDetail,
  'EXC-0045': badGstinCaseMock as unknown as ExceptionDetail,
  'EXC-0046': dupCase,
}

// the vendor list says whether the vendor must e-invoice (VendorRef doesn't); the opened case says what happened
vi.mock('@/api/queries', async (orig) => ({
  ...(await orig<typeof import('@/api/queries')>()),
  vendorsQ: () => queryOptions({ queryKey: ['vendors'], queryFn: async () => vendorsMock as unknown as VendorSummary[] }),
  settingsQ: () => queryOptions({ queryKey: ['settings'], queryFn: async () => ({ memory_enabled: true }) }),
  exceptionQ: (id: string, memOn: boolean) =>
    queryOptions({
      queryKey: ['exception', id, memOn],
      queryFn: async () => {
        if (!CASES[id]) throw new Error('not found')
        return CASES[id]
      },
      retry: false,
    }),
}))

const result = captureMock as unknown as CaptureResult
const freight = freightMock as unknown as CaptureResult
const noIrn = noIrnMock as unknown as CaptureResult
const badGstin = badGstinMock as unknown as CaptureResult

afterEach(cleanup)

describe('CaptureResultView', () => {
  it('opens the new case and shows what was read, matched to the vendor master', () => {
    renderApp(<CaptureResultView result={result} onReset={() => {}} />)
    expect(screen.getByRole('link', { name: /open case/i })).toHaveAttribute('href', `/exceptions/${result.exception_id}`)
    expect(screen.getByText('Shree Balaji Steel Traders Pvt Ltd')).toBeInTheDocument()
    expect(screen.getByText(result.vendor!.gstin)).toBeInTheDocument()
    expect(screen.getByText(/Matched to vendor master/)).toBeInTheDocument()
    expect(screen.getByText(result.extracted.invoice_number)).toBeInTheDocument()
    expect(screen.getByText(result.extracted.po_number!)).toBeInTheDocument()
    expect(screen.getByText(result.extracted.lines[0].description)).toBeInTheDocument()
    expect(screen.getByText(result.extracted.bank_account.account_number)).toBeInTheDocument()
    expect(screen.getByText('HDFC0001234')).toBeInTheDocument()
  })

  it('says a clean match is queued for payment, with no case to open', () => {
    renderApp(<CaptureResultView result={{ ...result, status: 'matched', exception_id: null }} onReset={() => {}} />)
    expect(screen.getByText('Clean 3-way match. Queued for payment.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /open case/i })).toBeNull()
  })

  it('flags an unknown vendor and a missing PO', () => {
    renderApp(
      <CaptureResultView
        result={{ ...result, status: 'unknown_vendor', vendor: null, exception_id: null, extracted: { ...result.extracted, po_number: null } }}
        onReset={() => {}}
      />,
    )
    expect(screen.getByText(/This vendor isn’t in the vendor master/)).toBeInTheDocument()
    expect(screen.queryByText(/Matched to vendor master/)).toBeNull()
    expect(screen.getByText('No PO')).toBeInTheDocument()
  })

  it('resets for another capture', () => {
    const onReset = vi.fn()
    renderApp(<CaptureResultView result={result} onReset={onReset} />)
    screen.getByRole('button', { name: /capture another/i }).click()
    expect(onReset).toHaveBeenCalledOnce()
  })
})

describe('CaptureResultView: GSTIN, IRN and hard controls', () => {
  it('freight: the IRN shortened like a hash, the GSTIN matching the master, and the case it opened', () => {
    renderApp(<CaptureResultView result={freight} onReset={() => {}} />)
    // the full IRN is one hover away
    expect(screen.getByText('2c7f2257…c6ac5c').closest('abbr')).toHaveAttribute('title', freight.extracted.irn)
    expect(screen.getByText(freight.extracted.supplier_gstin!)).toBeInTheDocument()
    expect(screen.getByText('Matches vendor master')).toBeInTheDocument()
    expect(screen.getByText('Opened')).toBeInTheDocument()
    expect(screen.getByText('EXC-0043')).toBeInTheDocument()
    expect(screen.queryByText(/hard control/i)).toBeNull()
  })

  it('no IRN: held by the e-invoice control, which it names', async () => {
    renderApp(<CaptureResultView result={noIrn} onReset={() => {}} />)
    expect(await screen.findByText('Held: no e-invoice IRN.')).toBeInTheDocument()
    expect(screen.getByText('E-invoice control')).toBeInTheDocument()
    expect(screen.getByText('EXC-0044')).toBeInTheDocument()
    expect(screen.getByText('No IRN printed')).toBeInTheDocument()
    expect(screen.getByText('Required for this vendor')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open case/i })).toHaveAttribute('href', '/exceptions/EXC-0044')
  })

  it('bad GSTIN: escalated by the GSTIN control, with both GSTINs side by side', () => {
    renderApp(<CaptureResultView result={badGstin} onReset={() => {}} />)
    expect(screen.getByText('Escalated: the GSTIN doesn’t match the vendor master.')).toBeInTheDocument()
    expect(screen.getByText('GSTIN control')).toBeInTheDocument()
    expect(screen.getByText('36ASICS1278O1ZX')).toBeInTheDocument()
    expect(screen.getByText('36ASICS1238O1ZX')).toBeInTheDocument()
    expect(screen.getByText('Doesn’t match vendor master')).toBeInTheDocument()
    expect(screen.getByText(/Matched to vendor master by name/)).toBeInTheDocument()
    expect(screen.getByText('4a7e2de5…0dd6c2')).toBeInTheDocument()
  })

  it('unknown vendor: the GSTIN read, with nothing to compare it to', () => {
    renderApp(<CaptureResultView result={{ ...badGstin, status: 'unknown_vendor', vendor: null, exception_id: null }} onReset={() => {}} />)
    expect(screen.getByText('36ASICS1278O1ZX')).toBeInTheDocument()
    expect(screen.queryByText(/vendor master$/)).toBeNull()
    expect(screen.queryByText(/hard control/i)).toBeNull()
  })

  it('says so when no GSTIN could be read', () => {
    renderApp(<CaptureResultView result={{ ...freight, extracted: { ...freight.extracted, supplier_gstin: null } }} onReset={() => {}} />)
    expect(screen.getByText('Not printed')).toBeInTheDocument()
    expect(screen.getByText(freight.vendor!.gstin)).toBeInTheDocument()
  })
})

describe('CaptureResultView: what the opened case says happened', () => {
  it('freight at the Twist reads as auto-resolved under earned autonomy, not held', async () => {
    renderApp(<CaptureResultView result={freight} onReset={() => {}} />)
    expect(await screen.findByText('Auto-resolved under earned autonomy.')).toBeInTheDocument()
    expect(screen.getByText('EXC-0043')).toBeInTheDocument()
    expect(screen.queryByText(/something off/)).toBeNull()
  })

  it('freight captured twice is rejected by the duplicate control, which it names', async () => {
    renderApp(<CaptureResultView result={{ ...freight, exception_id: 'EXC-0046' }} onReset={() => {}} />)
    expect(await screen.findByText('Rejected: this invoice was already submitted.')).toBeInTheDocument()
    expect(screen.getByText('Duplicate control')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open case/i })).toHaveAttribute('href', '/exceptions/EXC-0046')
  })

  it('keeps what was read when the case can’t be loaded', async () => {
    renderApp(<CaptureResultView result={{ ...freight, exception_id: 'EXC-9999' }} onReset={() => {}} />)
    expect(await screen.findByText('EXC-9999')).toBeInTheDocument()
    expect(screen.getByText(/something off/)).toBeInTheDocument()
  })
})
