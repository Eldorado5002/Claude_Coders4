import { useQuery } from '@tanstack/react-query'
import { exceptionQ, settingsQ, vendorsQ } from '@/api/queries'
import type { CaptureResult } from '@/api/types'
import { captureControl, captureOutcome, caseOutcome, eInvoiceRequiredFor, needsEInvoiceFlag, type Outcome } from './capture-logic'

/**
 * What happened to a captured invoice. Once the opened case loads (a free GET: capture already wrote its
 * recommendation), the case says it: auto-resolved, or which hard control fired and what it forced. Until then,
 * or if it can't load, what was read names the GSTIN and e-invoice controls; the vendor list (a free call) is
 * only consulted when a case opened without a valid IRN, to say whether the vendor must e-invoice.
 */
export function useCaptureOutcome(result: CaptureResult): Outcome
export function useCaptureOutcome(result: CaptureResult | undefined): Outcome | null
export function useCaptureOutcome(result: CaptureResult | undefined): Outcome | null {
  const need = !!result && needsEInvoiceFlag(result)
  const vendorId = result?.vendor?.id
  const flag = useQuery({ ...vendorsQ(), enabled: need, select: (vs) => eInvoiceRequiredFor(vs, vendorId) })
  const memOn = useQuery(settingsQ()).data?.memory_enabled ?? true
  const caseId = result?.status === 'exception' ? result.exception_id : null
  const opened = useQuery({ ...exceptionQ(caseId ?? '', memOn), enabled: !!caseId })
  if (!result) return null
  const fromCase = opened.data ? caseOutcome(result, opened.data) : null
  return fromCase ?? captureOutcome(result, captureControl(result, { eInvoiceRequired: need ? flag.data : undefined }))
}
