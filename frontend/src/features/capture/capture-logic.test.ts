import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import {
  MAX_BYTES,
  PROCESS_STEPS,
  captureErrorView,
  captureOutcome,
  formatBytes,
  isPdf,
  qtyText,
  rejectionSummary,
  rupees,
  stepAt,
  validateFile,
} from './capture-logic'

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
