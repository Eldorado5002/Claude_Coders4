import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { CaptureResult, ExceptionDetail, VendorSummary } from '@/api/types'
import vendorsMock from '@mocks/vendors.json'
import badGstinMock from '@mocks/twist/capture-bad-gstin.json'
import freightMock from '@mocks/twist/capture-freight.json'
import noIrnMock from '@mocks/twist/capture-no-irn.json'
import freightCaseMock from '@mocks/twist/capture-case-freight.json'
import noIrnCaseMock from '@mocks/twist/capture-case-no-irn.json'
import badGstinCaseMock from '@mocks/twist/capture-case-bad-gstin.json'
import {
  MAX_BYTES,
  PROCESS_STEPS,
  SAMPLES,
  captureControl,
  captureErrorView,
  captureOutcome,
  caseOutcome,
  eInvoiceRequiredFor,
  formatBytes,
  gstinCheck,
  isPdf,
  needsEInvoiceFlag,
  qtyText,
  rejectionSummary,
  rupees,
  sampleUrl,
  shortIrn,
  stepAt,
  validateFile,
} from './capture-logic'

const freight = freightMock as unknown as CaptureResult
const noIrn = noIrnMock as unknown as CaptureResult
const badGstin = badGstinMock as unknown as CaptureResult
const vendors = vendorsMock as unknown as VendorSummary[]

const file = (name: string, type: string, size = 1000) => ({ name, type, size })

describe('validateFile', () => {
  it('accepts JPG, PNG, WEBP and PDF up to 12 MB', () => {
    expect(validateFile(file('a.jpg', 'image/jpeg'))).toBeNull()
    expect(validateFile(file('a.png', 'image/png'))).toBeNull()
    expect(validateFile(file('a.webp', 'image/webp'))).toBeNull()
    expect(validateFile(file('a.pdf', 'application/pdf', MAX_BYTES))).toBeNull()
  })
  it('falls back to the extension when the browser gives no type', () => {
    expect(validateFile(file('scan.JPEG', ''))).toBeNull()
    expect(validateFile(file('scan.heic', ''))).toBe('Use a JPG, PNG, WEBP or PDF.')
  })
  it('rejects other formats, big files and empty files in plain words', () => {
    expect(validateFile(file('photo.heic', 'image/heic'))).toBe('Use a JPG, PNG, WEBP or PDF.')
    expect(validateFile(file('big.jpg', 'image/jpeg', MAX_BYTES + 1))).toBe('That file is over 12 MB.')
    expect(validateFile(file('zero.png', 'image/png', 0))).toBe('That file is empty.')
  })
})

describe('rejectionSummary (react-dropzone rejections)', () => {
  it('names the file and gives every reason once', () => {
    const s = rejectionSummary([
      {
        file: { name: 'scan.tiff' },
        errors: [
          { code: 'file-invalid-type', message: 'File type must be image/jpeg,…' },
          { code: 'file-too-large', message: 'File is larger than 12582912 bytes' },
        ],
      },
    ])
    expect(s).toEqual({ name: 'scan.tiff', reasons: ['Use a JPG, PNG, WEBP or PDF.', 'That file is over 12 MB.'] })
  })
  it('asks for one invoice at a time when several are dropped', () => {
    const tooMany = { code: 'too-many-files', message: 'Too many files' }
    const s = rejectionSummary([
      { file: { name: 'a.png' }, errors: [tooMany] },
      { file: { name: 'b.png' }, errors: [tooMany] },
    ])
    expect(s).toEqual({ name: null, reasons: ['Drop one invoice at a time.'] })
  })
  it('keeps the library message for unknown codes, and is null when nothing was rejected', () => {
    expect(rejectionSummary([{ file: { name: 'x.png' }, errors: [{ code: 'weird', message: 'Odd file' }] }])?.reasons).toEqual([
      'Odd file',
    ])
    expect(rejectionSummary([])).toBeNull()
  })
})

describe('captureErrorView', () => {
  it('413 and 415 get plain messages and no retry (the same file would fail again)', () => {
    expect(captureErrorView(new ApiError(413, 'File too large (max 12 MB)'))).toMatchObject({
      message: 'That file is over 12 MB.',
      retry: false,
    })
    expect(captureErrorView(new ApiError(415, 'Upload a JPG, PNG, WEBP or PDF'))).toMatchObject({
      message: 'Use a JPG, PNG, WEBP or PDF.',
      retry: false,
    })
  })
  it('502 shows what went wrong without repeating the backend prefix, and offers a retry', () => {
    const v = captureErrorView(new ApiError(502, 'Could not read the invoice: Gemini is required for invoice capture'))
    expect(v.message).toBe('Couldn’t read that invoice: Gemini is required for invoice capture')
    expect(v.retry).toBe(true)
  })
  it('other statuses and plain errors use the detail', () => {
    expect(captureErrorView(new ApiError(500, 'Internal Server Error')).message).toBe(
      'Couldn’t read that invoice: Internal Server Error',
    )
    expect(captureErrorView(new Error('boom')).message).toBe('Couldn’t read that invoice: boom')
    expect(captureErrorView(new ApiError(502, 'Could not read the invoice: ')).message).toBe('Couldn’t read that invoice.')
  })
  it('status 0 means the API is unreachable', () => {
    const v = captureErrorView(new ApiError(0, 'Cannot reach the Precedent API'))
    expect(v.message).toBe('Can’t reach the Precedent API.')
    expect(v.retry).toBe(true)
    expect(v.hint).toBeTruthy()
  })
})

describe('captureOutcome', () => {
  it('matched: approve tone, queued for payment, no case', () => {
    const o = captureOutcome({ status: 'matched', exception_id: null })
    expect(o).toMatchObject({ tone: 'approve', title: 'Clean 3-way match. Queued for payment.', caseId: null })
  })
  it('exception: hold tone and the new case id to open', () => {
    const o = captureOutcome({ status: 'exception', exception_id: 'EXC-0140' })
    expect(o).toMatchObject({ tone: 'hold', title: 'Opened EXC-0140', caseId: 'EXC-0140' })
  })
  it('exception without an id still reads sensibly and has nothing to open', () => {
    expect(captureOutcome({ status: 'exception' })).toMatchObject({ tone: 'hold', title: 'Opened a case', caseId: null })
  })
  it('unknown vendor: reject tone and tells the clerk to onboard first', () => {
    const o = captureOutcome({ status: 'unknown_vendor', exception_id: null })
    expect(o.tone).toBe('reject')
    expect(o.title).toBe('This vendor isn’t in the vendor master. Onboard them before paying.')
    expect(o.caseId).toBeNull()
  })
})

describe('SAMPLES', () => {
  it('offers the three bundled Balaji invoices, each saying what it shows', () => {
    expect(SAMPLES.map((s) => s.file)).toEqual([
      'invoice-balaji-freight.png',
      'invoice-balaji-no-irn.png',
      'invoice-balaji-bad-gstin.png',
    ])
    expect(SAMPLES.map((s) => `${s.label} · ${s.shows}`)).toEqual([
      'Freight · within the agreed cap',
      'No IRN · e-invoice control',
      'Bad GSTIN · GSTIN control',
    ])
    // the two that trip a hard control get the lock
    expect(SAMPLES.map((s) => s.hard)).toEqual([false, true, true])
  })
  it('serves them from public/samples under the app base', () => {
    expect(sampleUrl('invoice-balaji-no-irn.png')).toBe(`${import.meta.env.BASE_URL}samples/invoice-balaji-no-irn.png`)
    for (const s of SAMPLES) expect(s.url).toBe(sampleUrl(s.file))
  })
})

describe('shortIrn', () => {
  it('keeps the first 8 and last 6 characters, like a hash', () => {
    expect(shortIrn(freight.extracted.irn)).toBe('2c7f2257…c6ac5c')
  })
  it('leaves short values whole and trims spaces', () => {
    expect(shortIrn(' ABC123 ')).toBe('ABC123')
    expect(shortIrn('0123456789abcdef')).toBe('0123456789abcdef')
  })
  it('is null when no IRN was printed', () => {
    expect(shortIrn(null)).toBeNull()
    expect(shortIrn(undefined)).toBeNull()
    expect(shortIrn('  ')).toBeNull()
  })
})

describe('gstinCheck', () => {
  it('matches the vendor master, ignoring case and stray spaces', () => {
    expect(gstinCheck('36ASICS1238O1ZX', '36ASICS1238O1ZX')).toBe('match')
    expect(gstinCheck(' 36asics1238o1zx', '36ASICS1238O1ZX')).toBe('match')
  })
  it('flags a GSTIN that differs from the master', () => {
    expect(gstinCheck(badGstin.extracted.supplier_gstin, badGstin.vendor!.gstin)).toBe('mismatch')
  })
  it('has nothing to compare when either side is missing', () => {
    expect(gstinCheck(null, '36ASICS1238O1ZX')).toBeNull()
    expect(gstinCheck(undefined, '36ASICS1238O1ZX')).toBeNull()
    expect(gstinCheck('36ASICS1238O1ZX', null)).toBeNull()
  })
})

describe('e-invoice flag lookup', () => {
  it('reads e_invoice_required for the matched vendor from the vendor list', () => {
    expect(eInvoiceRequiredFor(vendors, 'V001')).toBe(true)
    expect(eInvoiceRequiredFor(vendors, 'V005')).toBe(false)
    expect(eInvoiceRequiredFor(vendors, 'V999')).toBeUndefined()
    expect(eInvoiceRequiredFor(undefined, 'V001')).toBeUndefined()
  })
  it('is only needed when a known vendor’s invoice opened a case without a valid IRN', () => {
    expect(needsEInvoiceFlag(noIrn)).toBe(true)
    expect(needsEInvoiceFlag({ ...freight, extracted: { ...freight.extracted, irn: 'not-an-irn' } })).toBe(true)
    expect(needsEInvoiceFlag(freight)).toBe(false)
    expect(needsEInvoiceFlag({ ...noIrn, status: 'matched', exception_id: null })).toBe(false)
    expect(needsEInvoiceFlag({ ...noIrn, status: 'unknown_vendor', vendor: null, exception_id: null })).toBe(false)
  })
})

describe('captureControl (which hard control fired, from what was read)', () => {
  it('none for the freight sample: GSTIN matches and the IRN is valid', () => {
    expect(captureControl(freight, { eInvoiceRequired: true })).toBeNull()
  })
  it('GSTIN control when the printed GSTIN differs from the vendor master: escalated', () => {
    expect(captureControl(badGstin, {})).toMatchObject({
      type: 'invalid_gstin',
      action: 'escalate',
      label: 'GSTIN control',
      headline: 'Escalated: the GSTIN doesn’t match the vendor master.',
    })
  })
  it('e-invoice control when the vendor must e-invoice and no IRN was printed: held', () => {
    expect(captureControl(noIrn, { eInvoiceRequired: true })).toMatchObject({
      type: 'einvoice_missing',
      action: 'hold',
      label: 'E-invoice control',
      headline: 'Held: no e-invoice IRN.',
    })
  })
  it('an IRN that isn’t 64 hex characters doesn’t count as one', () => {
    const bad = { ...freight, extracted: { ...freight.extracted, irn: 'IRN-12345' } }
    expect(captureControl(bad, { eInvoiceRequired: true })).toMatchObject({
      type: 'einvoice_missing',
      headline: 'Held: the e-invoice IRN isn’t valid.',
    })
  })
  it('makes no e-invoice claim when the vendor doesn’t e-invoice, or when that isn’t known yet', () => {
    expect(captureControl(noIrn, { eInvoiceRequired: false })).toBeNull()
    expect(captureControl(noIrn, {})).toBeNull()
    expect(captureControl(noIrn)).toBeNull()
  })
  it('GSTIN wins when both fire, as the backend checks it first', () => {
    const both = { ...badGstin, extracted: { ...badGstin.extracted, irn: null } }
    expect(captureControl(both, { eInvoiceRequired: true })?.type).toBe('invalid_gstin')
  })
  it('no GSTIN claim when no GSTIN could be read', () => {
    const unread = { ...badGstin, extracted: { ...badGstin.extracted, supplier_gstin: null } }
    expect(captureControl(unread, {})).toBeNull()
  })
  it('only for an opened case with a known vendor', () => {
    expect(captureControl({ ...badGstin, status: 'matched', exception_id: null }, {})).toBeNull()
    expect(captureControl({ ...noIrn, status: 'unknown_vendor', vendor: null, exception_id: null }, { eInvoiceRequired: true })).toBeNull()
  })
})

describe('captureOutcome with a hard control', () => {
  it('held by the e-invoice control: hold tone, says why, then which case it opened', () => {
    const o = captureOutcome(noIrn, captureControl(noIrn, { eInvoiceRequired: true }))
    expect(o).toMatchObject({ tone: 'hold', title: 'Held: no e-invoice IRN. Opened EXC-0044.', caseId: 'EXC-0044' })
    expect(o.control?.type).toBe('einvoice_missing')
  })
  it('escalated by the GSTIN control: escalate tone', () => {
    const o = captureOutcome(badGstin, captureControl(badGstin, {}))
    expect(o).toMatchObject({
      tone: 'escalate',
      title: 'Escalated: the GSTIN doesn’t match the vendor master. Opened EXC-0045.',
      caseId: 'EXC-0045',
    })
  })
  it('keeps the generic line when no control can be told from what was read', () => {
    expect(captureOutcome(freight, null)).toMatchObject({ tone: 'hold', title: 'Opened EXC-0043', control: null })
    expect(captureOutcome(freight)).toMatchObject({ title: 'Opened EXC-0043', control: null })
  })
})

describe('stepAt', () => {
  it('starts by reading, then runs the match once enough time has passed', () => {
    expect(PROCESS_STEPS[0].label).toBe('Reading the invoice…')
    expect(PROCESS_STEPS[1].label).toBe('Running the 3-way match…')
    expect(stepAt(0)).toBe(0)
    expect(stepAt(PROCESS_STEPS[1].at - 1)).toBe(0)
    expect(stepAt(PROCESS_STEPS[1].at)).toBe(1)
    expect(stepAt(10 * 60_000)).toBe(PROCESS_STEPS.length - 1)
  })
})

describe('small formatters', () => {
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })
  it('isPdf by type or extension', () => {
    expect(isPdf({ name: 'a.pdf', type: '' })).toBe(true)
    expect(isPdf({ name: 'a', type: 'application/pdf' })).toBe(true)
    expect(isPdf({ name: 'a.png', type: 'image/png' })).toBe(false)
  })
  it('qtyText trims trailing zeros and keeps the unit', () => {
    expect(qtyText(2, 'MT')).toBe('2 MT')
    expect(qtyText(1.5, 'MT')).toBe('1.5 MT')
    expect(qtyText(0.125, 'kg')).toBe('0.13 kg')
  })
  it('rupees: whole rupees without paise, otherwise two decimals', () => {
    expect(rupees(58000)).toBe('₹58,000')
    expect(rupees(3850.5)).toBe('₹3,850.50')
  })
})

describe('caseOutcome (what the opened case says happened)', () => {
  const freightCase = freightCaseMock as unknown as ExceptionDetail
  const noIrnCase = noIrnCaseMock as unknown as ExceptionDetail
  const badGstinCase = badGstinCaseMock as unknown as ExceptionDetail

  it('freight at the Twist: auto-resolved under earned autonomy, in the approve tone', () => {
    expect(caseOutcome(freight, freightCase)).toMatchObject({
      tone: 'approve',
      headline: 'Auto-resolved under earned autonomy.',
      caseId: 'EXC-0043',
      control: null,
    })
  })

  it('freight captured twice: the duplicate control rejects it, and says so', () => {
    const dup: ExceptionDetail = {
      ...freightCase,
      id: 'EXC-0046',
      status: 'open',
      blocking: true,
      issues: [{ type: 'duplicate_invoice', message: 'Invoice SBST/2627/0612 was already submitted.', blocking: true }, ...freightCase.issues],
      recommendation: { ...freightCase.recommendation!, action: 'reject', source: 'guardrail' },
    }
    expect(caseOutcome({ ...freight, exception_id: 'EXC-0046' }, dup)).toMatchObject({
      tone: 'reject',
      headline: 'Rejected: this invoice was already submitted.',
      caseId: 'EXC-0046',
      control: { type: 'duplicate_invoice', label: 'Duplicate control', action: 'reject' },
    })
  })

  it('names the e-invoice and GSTIN controls from the case’s own issues, with the backend’s verdict', () => {
    expect(caseOutcome(noIrn, noIrnCase)).toMatchObject({
      tone: 'hold',
      control: { type: 'einvoice_missing', label: 'E-invoice control', headline: 'Held: no e-invoice IRN.' },
    })
    expect(caseOutcome(badGstin, badGstinCase)).toMatchObject({
      tone: 'escalate',
      control: { type: 'invalid_gstin', label: 'GSTIN control' },
    })
  })

  it('any other hard control is still named, with its message as the detail', () => {
    const bank: ExceptionDetail = {
      ...noIrnCase,
      issues: [{ type: 'bank_details_changed', message: 'Pay-to account differs from vendor master.', blocking: true }],
      recommendation: { ...noIrnCase.recommendation!, action: 'escalate' },
    }
    expect(caseOutcome(noIrn, bank)).toMatchObject({
      tone: 'escalate',
      control: { type: 'bank_details_changed', label: 'Bank change control', detail: 'Pay-to account differs from vendor master.' },
    })
  })

  it('an open case with no hard control leaves the generic line (null)', () => {
    expect(caseOutcome(freight, { ...freightCase, status: 'open' })).toBeNull()
  })
})
