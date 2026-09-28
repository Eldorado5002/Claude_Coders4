import { describe, expect, it } from 'vitest'
import type { GoodsReceiptDoc, InvoiceDoc, Issue, LineItem, PurchaseOrderDoc } from '@/api/types'
import { joinThreeWay } from './three-way'

const line = (n: number, sku: string | null, qty: number, price: number, tax = 18, desc = `Item ${n}`): LineItem => ({
  line_no: n,
  sku,
  description: desc,
  hsn: '7208',
  qty,
  uom: 'MT',
  unit_price: price,
  tax_rate: tax,
  amount: qty * price,
})

const invoice = (lines: LineItem[]): InvoiceDoc => ({
  id: 'INV-1',
  invoice_number: 'SBST/1',
  vendor_id: 'V001',
  po_number: 'PO-1',
  invoice_date: '2026-03-17',
  due_date: '2026-05-01',
  lines,
  subtotal: 0,
  tax_total: 0,
  total: 0,
  currency: 'INR',
  bank_account: { bank_name: 'HDFC', account_number: 'XXXXXX4521', ifsc: 'HDFC0001234' },
  source: 'erp',
})
const po = (lines: LineItem[]): PurchaseOrderDoc => ({
  po_number: 'PO-1',
  vendor_id: 'V001',
  po_date: '2026-03-09',
  lines,
  subtotal: 0,
  tax_total: 0,
  total: 0,
})
const grn = (qty: Record<string, number>): GoodsReceiptDoc => ({
  grn_number: 'GRN-1',
  po_number: 'PO-1',
  received_date: '2026-03-16',
  lines: Object.entries(qty).map(([sku, q], i) => ({
    line_no: i + 1,
    sku,
    description: sku,
    qty_received: q,
    uom: 'MT',
  })),
})
const freightIssue: Issue = {
  type: 'freight_charge',
  message: "Line 2 'Freight' is not on the purchase order.",
  line_no: 2,
  blocking: false,
}

describe('joinThreeWay', () => {
  it('matches invoice, PO and GRN lines by SKU', () => {
    const r = joinThreeWay(invoice([line(1, 'A', 2, 100)]), po([line(1, 'A', 2, 100)]), grn({ A: 2 }), [])
    expect(r.hasPo).toBe(true)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ sku: 'A', flags: { price: false, qty: false, tax: false, offPo: false } })
    expect(r.rows[0].po?.unit_price).toBe(100)
    expect(r.rows[0].grn?.qty_received).toBe(2)
  })

  it('gives an invoice line without a SKU its own off-PO row and attaches its issues', () => {
    const r = joinThreeWay(
      invoice([line(1, 'A', 2, 100), line(2, null, 1, 3850, 18, 'Freight')]),
      po([line(1, 'A', 2, 100)]),
      grn({ A: 2 }),
      [freightIssue],
    )
    const freight = r.rows.find((x) => x.lineNo === 2)!
    expect(freight.flags.offPo).toBe(true)
    expect(freight.po).toBeUndefined()
    expect(freight.issueTypes).toEqual(['freight_charge'])
  })

  it('flags price, tax and short-received quantity differences', () => {
    const r = joinThreeWay(invoice([line(1, 'A', 10, 105, 18)]), po([line(1, 'A', 10, 100, 5)]), grn({ A: 8 }), [])
    expect(r.rows[0].flags).toEqual({ price: true, qty: true, tax: true, offPo: false })
  })

  it('handles a missing PO and GRN (no-PO bills)', () => {
    const r = joinThreeWay(invoice([line(1, null, 1, 185000, 0)]), null, null, [])
    expect(r.hasPo).toBe(false)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].flags.offPo).toBe(false)
  })

  it('keeps PO lines that were not billed', () => {
    const r = joinThreeWay(invoice([line(1, 'A', 2, 100)]), po([line(1, 'A', 2, 100), line(2, 'B', 1, 50)]), grn({ A: 2, B: 1 }), [])
    const b = r.rows.find((x) => x.sku === 'B')!
    expect(b.invoice).toBeUndefined()
    expect(b.po?.qty).toBe(1)
  })
})
