import type { EInvoiceStatus, MsmeStatus } from '@/api/types'
import { inrCompact, simDay } from '@/lib/format'
import { gstinMatch, shortIrn } from '@/lib/gst'

/** Section 43B(h) in one sentence, for the hover on the MSME line. */
export const MSME_43BH_TIP =
  'Section 43B(h): pay micro and small suppliers within 15 days of accepting the goods, or 45 with a written agreement, or lose the tax deduction for that year.'

export type StatusTone = 'neutral' | 'hold' | 'reject'

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

export type MsmeLine = {
  tone: StatusTone
  category: MsmeStatus['category']
  /** the emphasised part: "5 days", "Due today", "Overdue by 3 days" */
  strong: string
  /** follows `strong` directly (carries its own leading space or colon) */
  rest: string
  tax: string
  udyam: string
  detail: string
}

const MSME_TONE: Record<MsmeStatus['status'], StatusTone> = { ok: 'neutral', due_soon: 'hold', breached: 'reject' }

/**
 * "MSME · micro · **5 days** to the 43B(h) deadline (2 May) · ₹46,476 tax deduction at stake".
 * Once the case is decided nothing waits on the clerk any more: the deadline stays as a plain fact, with no countdown.
 */
export function msmeLine(m: MsmeStatus, { decided = false }: { decided?: boolean } = {}): MsmeLine {
  const day = simDay(m.deadline)
  let strong: string
  let rest: string
  if (decided) {
    strong = ''
    rest = `43B(h) deadline ${day}`
  } else if (m.days_left > 0) {
    strong = days(m.days_left)
    rest = ` to the 43B(h) deadline (${day})`
  } else if (m.days_left === 0) {
    strong = 'Due today'
    rest = `: the 43B(h) deadline is ${day}`
  } else {
    strong = `Overdue by ${days(-m.days_left)}`
    rest = `: the 43B(h) deadline was ${day}`
  }
  const detail = [`Goods accepted ${simDay(m.accepted_on)}`, `${m.limit_days}-day limit`]
  if (m.terms_exceed_limit) detail.push('this vendor’s payment terms are longer than the limit')
  return {
    tone: decided ? 'neutral' : MSME_TONE[m.status],
    category: m.category,
    strong,
    rest,
    tax: decided ? '' : `${inrCompact(m.tax_at_risk)} tax deduction at stake`,
    udyam: m.udyam,
    detail: detail.join(' · '),
  }
}

export type EInvoiceCheck = { status: 'not_required' | 'present' | 'missing'; irn: string | null }

/** Only suppliers above ₹5 crore turnover must e-invoice; for them the IRN makes it a valid tax invoice. */
export function eInvoiceCheck(e: EInvoiceStatus | null | undefined, irn: string | null | undefined): EInvoiceCheck {
  if (!e?.required) return { status: 'not_required', irn: null }
  if (!e.irn_present) return { status: 'missing', irn: null }
  return { status: 'present', irn: irn ? shortIrn(irn) : null }
}

export type GstinCheck = { status: 'match' | 'mismatch' | 'missing'; onInvoice: string | null; master: string }

/** The GSTIN printed on the invoice against the vendor master. */
export function gstinCheck(onInvoice: string | null | undefined, master: string): GstinCheck {
  const printed = onInvoice?.trim() ? onInvoice.trim() : null
  if (!printed) return { status: 'missing', onInvoice: null, master }
  return { status: gstinMatch(printed, master) ?? 'mismatch', onInvoice: printed, master }
}
