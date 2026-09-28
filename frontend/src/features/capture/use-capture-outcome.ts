import { useQuery } from '@tanstack/react-query'
import { vendorsQ } from '@/api/queries'
import type { CaptureResult } from '@/api/types'
import { captureControl, captureOutcome, eInvoiceRequiredFor, needsEInvoiceFlag, type Outcome } from './capture-logic'

/**
 * What happened to a captured invoice, naming the hard control when what was read proves it.
 * The vendor list (a free call, warmed by the page while Gemini reads) is only consulted when
 * a case opened without a valid IRN: it says whether the vendor must e-invoice.
 */
export function useCaptureOutcome(result: CaptureResult): Outcome
export function useCaptureOutcome(result: CaptureResult | undefined): Outcome | null
export function useCaptureOutcome(result: CaptureResult | undefined): Outcome | null {
  const need = !!result && needsEInvoiceFlag(result)
  const vendorId = result?.vendor?.id
  const flag = useQuery({ ...vendorsQ(), enabled: need, select: (vs) => eInvoiceRequiredFor(vs, vendorId) })
  if (!result) return null
  return captureOutcome(result, captureControl(result, { eInvoiceRequired: need ? flag.data : undefined }))
}
