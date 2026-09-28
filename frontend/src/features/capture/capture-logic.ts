import { ApiError } from '@/api/client'
import type { CaptureResult, ExceptionType, VendorSummary } from '@/api/types'
import { inr } from '@/lib/format'

/** Same limits the backend enforces (415 / 413). */
export const MAX_BYTES = 12 * 1024 * 1024
export const ACCEPT: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
}
/** A bundled demo invoice (frontend/public/samples) and what it demonstrates at the Twist. */
export type Sample = { file: string; label: string; shows: string; url: string; /** trips a hard control */ hard: boolean }

export const sampleUrl = (file: string) => `${import.meta.env.BASE_URL}samples/${file}`

const sample = (file: string, label: string, shows: string, hard: boolean): Sample => ({
  file,
  label,
  shows,
  url: sampleUrl(file),
  hard,
})

export const SAMPLES: readonly Sample[] = [
  sample('invoice-balaji-freight.png', 'Freight', 'within the agreed cap', false),
  sample('invoice-balaji-no-irn.png', 'No IRN', 'e-invoice control', true),
  sample('invoice-balaji-bad-gstin.png', 'Bad GSTIN', 'GSTIN control', true),
]

const MSG = {
  badType: 'Use a JPG, PNG, WEBP or PDF.',
  tooLarge: 'That file is over 12 MB.',
  empty: 'That file is empty.',
  tooMany: 'Drop one invoice at a time.',
}

type FileLike = { name: string; type: string; size: number }

const extOf = (name: string) => {
  const m = /\.[^.]+$/.exec(name)
  return m ? m[0].toLowerCase() : ''
}

function typeOk(f: Pick<FileLike, 'name' | 'type'>): boolean {
  if (f.type) return f.type in ACCEPT
  const ext = extOf(f.name)
  return Object.values(ACCEPT).some((exts) => exts.includes(ext))
}

/** For files that don't come through the dropzone (the camera input). null = fine. */
export function validateFile(f: FileLike): string | null {
  if (!typeOk(f)) return MSG.badType
  if (f.size > MAX_BYTES) return MSG.tooLarge
  if (f.size <= 0) return MSG.empty
  return null
}

type Rejection = { file: { name: string }; errors: readonly { code: string; message: string }[] }

const CODE_MSG: Record<string, string> = {
  'file-invalid-type': MSG.badType,
  'file-too-large': MSG.tooLarge,
  'file-too-small': MSG.empty,
  'too-many-files': MSG.tooMany,
}

/** react-dropzone rejections → one file name and plain reasons. */
export function rejectionSummary(rejections: readonly Rejection[]): { name: string | null; reasons: string[] } | null {
  if (!rejections.length) return null
  if (rejections.some((r) => r.errors.some((e) => e.code === 'too-many-files'))) return { name: null, reasons: [MSG.tooMany] }
  const first = rejections[0]
  const reasons = [...new Set(first.errors.map((e) => CODE_MSG[e.code] ?? e.message))]
  return { name: first.file.name, reasons }
}

export type ErrorView = { message: string; hint?: string; retry: boolean }

const READ_PREFIX = /^could not read the invoice:?\s*/i

function couldNotRead(detail: string): string {
  const d = detail.replace(READ_PREFIX, '').trim()
  return d ? `Couldn’t read that invoice: ${d}` : 'Couldn’t read that invoice.'
}

/** What went wrong with a capture, in plain words, and whether trying the same file again makes sense. */
export function captureErrorView(err: unknown): ErrorView {
  if (err instanceof ApiError) {
    if (err.status === 413)
      return { message: MSG.tooLarge, hint: 'Retake the photo at a lower resolution, or export a smaller PDF.', retry: false }
    if (err.status === 415) return { message: MSG.badType, hint: 'Save or export the invoice in one of those formats.', retry: false }
    if (err.status === 0)
      return { message: 'Can’t reach the Precedent API.', hint: 'Check that the backend is running, then try again.', retry: true }
    return { message: couldNotRead(err.detail), retry: true }
  }
  return { message: couldNotRead(err instanceof Error ? err.message : ''), retry: true }
}

// ---------------------------------------------------------------- what was read: GSTIN and IRN

const HEAD = 8
const TAIL = 6

/** An IRN is a 64-character hash: show it like one (first 8…last 6). null when none was printed. */
export function shortIrn(irn: string | null | undefined): string | null {
  const v = irn?.trim()
  if (!v) return null
  return v.length > HEAD + TAIL + 2 ? `${v.slice(0, HEAD)}…${v.slice(-TAIL)}` : v
}

/** Same test the backend applies: 64 lowercase hex characters. */
const IRN_FORMAT = /^[0-9a-f]{64}$/
const irnValid = (irn: string | null | undefined) => IRN_FORMAT.test(irn?.trim() ?? '')

const normGstin = (g: string | null | undefined) => (g ?? '').replace(/\s+/g, '').toUpperCase()

/** The GSTIN printed on the invoice vs the vendor master's. null = nothing to compare. */
export function gstinCheck(printed: string | null | undefined, master: string | null | undefined): 'match' | 'mismatch' | null {
  const p = normGstin(printed)
  const m = normGstin(master)
  if (!p || !m) return null
  return p === m ? 'match' : 'mismatch'
}

/** VendorRef doesn't say whether the vendor must e-invoice; the vendor list does. undefined = not known. */
export function eInvoiceRequiredFor(vendors: readonly VendorSummary[] | undefined, vendorId: string | null | undefined) {
  return vendors?.find((v) => v.id === vendorId)?.e_invoice_required
}

/** Worth looking up the vendor's e-invoice flag only when a known vendor's invoice opened a case without a valid IRN. */
export const needsEInvoiceFlag = (r: CaptureResult) => r.status === 'exception' && !!r.vendor && !irnValid(r.extracted.irn)

// ---------------------------------------------------------------- outcome

export type CaptureControl = {
  type: Extract<ExceptionType, 'invalid_gstin' | 'einvoice_missing'>
  action: 'hold' | 'escalate'
  /** "GSTIN control" */
  label: string
  /** "Escalated: the GSTIN doesn't match the vendor master." */
  headline: string
  /** Why the rule exists, in plain words. */
  detail: string
}

/**
 * Which hard control fired, told from what was read. CaptureResult carries no issue list, so this only names the two
 * controls the extraction itself proves (GSTIN first, as the backend orders them); anything else stays generic.
 */
export function captureControl(r: CaptureResult, ctx: { eInvoiceRequired?: boolean } = {}): CaptureControl | null {
  if (r.status !== 'exception' || !r.vendor) return null
  if (gstinCheck(r.extracted.supplier_gstin, r.vendor.gstin) === 'mismatch')
    return {
      type: 'invalid_gstin',
      action: 'escalate',
      label: 'GSTIN control',
      headline: 'Escalated: the GSTIN doesn’t match the vendor master.',
      detail: 'That can mean someone is posing as the vendor, so a hard control escalates it. Past decisions can’t override it.',
    }
  if (ctx.eInvoiceRequired && !irnValid(r.extracted.irn))
    return {
      type: 'einvoice_missing',
      action: 'hold',
      label: 'E-invoice control',
      headline: shortIrn(r.extracted.irn) ? 'Held: the e-invoice IRN isn’t valid.' : 'Held: no e-invoice IRN.',
      detail:
        'This vendor must issue e-invoices, so without a valid IRN it isn’t a valid tax invoice. A hard control holds it; past decisions can’t override it.',
    }
  return null
}

export type OutcomeTone = 'approve' | 'hold' | 'reject' | 'escalate'
export type Outcome = {
  tone: OutcomeTone
  title: string
  body: string
  caseId: string | null
  control: CaptureControl | null
}

/** The one line that says what happened to the invoice (and which hard control fired, when that can be told). */
export function captureOutcome(r: Pick<CaptureResult, 'status' | 'exception_id'>, control: CaptureControl | null = null): Outcome {
  switch (r.status) {
    case 'matched':
      return {
        tone: 'approve',
        title: 'Clean 3-way match. Queued for payment.',
        body: 'Invoice, purchase order and goods receipt agree, so no case was opened.',
        caseId: null,
        control: null,
      }
    case 'exception': {
      const id = r.exception_id ?? null
      if (control)
        return {
          tone: control.action,
          title: id ? `${control.headline} Opened ${id}.` : control.headline,
          body: control.detail,
          caseId: id,
          control,
        }
      return {
        tone: 'hold',
        title: id ? `Opened ${id}` : 'Opened a case',
        body: 'The 3-way match found something off. Precedent has written its opinion on the case.',
        caseId: id,
        control: null,
      }
    }
    case 'unknown_vendor':
      return {
        tone: 'reject',
        title: 'This vendor isn’t in the vendor master. Onboard them before paying.',
        body: 'The invoice wasn’t filed, so nothing will be paid.',
        caseId: null,
        control: null,
      }
  }
}

/** Timed captions while the request runs (the API doesn't stream progress). */
export const PROCESS_STEPS: readonly { label: string; at: number }[] = [
  { label: 'Reading the invoice…', at: 0 },
  { label: 'Running the 3-way match…', at: 4000 },
  { label: 'Writing an opinion if anything is off…', at: 9000 },
]

export function stepAt(ms: number): number {
  let i = 0
  PROCESS_STEPS.forEach((s, n) => {
    if (ms >= s.at) i = n
  })
  return i
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}

export const isPdf = (f: { name: string; type: string }) => f.type === 'application/pdf' || extOf(f.name) === '.pdf'

/** 2 MT · 1.5 MT · 0.13 kg */
export const qtyText = (q: number, uom: string) =>
  `${Number.isInteger(q) ? q : q.toFixed(2).replace(/\.?0+$/, '')} ${uom}`

/** ₹58,000 for whole rupees, ₹3,850.50 otherwise. */
export const rupees = (n: number) => (Number.isInteger(n) ? `₹${n.toLocaleString('en-IN')}` : inr(n))
