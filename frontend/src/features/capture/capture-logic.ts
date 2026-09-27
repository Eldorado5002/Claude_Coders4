import { ApiError } from '@/api/client'
import type { CaptureResult } from '@/api/types'
import { inr } from '@/lib/format'

/** Same limits the backend enforces (415 / 413). */
export const MAX_BYTES = 12 * 1024 * 1024
export const ACCEPT: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
}
/** The bundled demo invoice (frontend/public/samples). */
export const SAMPLE_NAME = 'invoice-balaji-freight.png'
export const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/${SAMPLE_NAME}`

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

export type OutcomeTone = 'approve' | 'hold' | 'reject'
export type Outcome = { tone: OutcomeTone; title: string; body: string; caseId: string | null }

/** The one line that says what happened to the invoice. */
export function captureOutcome(r: Pick<CaptureResult, 'status' | 'exception_id'>): Outcome {
  switch (r.status) {
    case 'matched':
      return {
        tone: 'approve',
        title: 'Clean 3-way match. Queued for payment.',
        body: 'Invoice, purchase order and goods receipt agree, so no case was opened.',
        caseId: null,
      }
    case 'exception': {
      const id = r.exception_id ?? null
      return {
        tone: 'hold',
        title: id ? `Opened ${id}` : 'Opened a case',
        body: 'The 3-way match found something off. Precedent has written its opinion on the case.',
        caseId: id,
      }
    }
    case 'unknown_vendor':
      return {
        tone: 'reject',
        title: 'This vendor isn’t in the vendor master. Onboard them before paying.',
        body: 'The invoice wasn’t filed, so nothing will be paid.',
        caseId: null,
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
