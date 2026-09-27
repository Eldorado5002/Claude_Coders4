import type { ExceptionType, GoodsReceiptDoc, GrnLine, InvoiceDoc, Issue, LineItem, PurchaseOrderDoc } from '@/api/types'

export type ThreeWayRow = {
  key: string
  /** invoice line number, null for a PO line that was not billed */
  lineNo: number | null
  sku: string | null
  description: string
  invoice?: LineItem
  po?: LineItem
  grn?: GrnLine
  flags: { price: boolean; qty: boolean; tax: boolean; offPo: boolean }
  issueTypes: ExceptionType[]
}

// Same tolerance as the backend matching engine.
const PRICE_TOLERANCE = 0.005

/** Join invoice, PO and GRN lines by SKU for the side-by-side 3-way match. */
export function joinThreeWay(
  invoice: InvoiceDoc,
  po: PurchaseOrderDoc | null | undefined,
  grn: GoodsReceiptDoc | null | undefined,
  issues: Issue[],
): { rows: ThreeWayRow[]; hasPo: boolean } {
  const hasPo = !!po
  const poBySku = new Map((po?.lines ?? []).filter((l) => l.sku).map((l) => [l.sku as string, l]))
  const grnBySku = new Map((grn?.lines ?? []).filter((l) => l.sku).map((l) => [l.sku as string, l]))
  const billed = new Set<string>()

  const rows: ThreeWayRow[] = invoice.lines.map((line) => {
    const p = line.sku ? poBySku.get(line.sku) : undefined
    const g = line.sku ? grnBySku.get(line.sku) : undefined
    if (line.sku) billed.add(line.sku)
    const received = p ? (grn ? (g?.qty_received ?? 0) : p.qty) : 0
    const expectedQty = p ? Math.min(p.qty, received) : 0
    return {
      key: `inv-${line.line_no}`,
      lineNo: line.line_no,
      sku: line.sku ?? null,
      description: line.description,
      invoice: line,
      po: p,
      grn: g,
      flags: {
        price: !!p && Math.abs(line.unit_price - p.unit_price) / p.unit_price > PRICE_TOLERANCE,
        qty: !!p && line.qty > expectedQty + 1e-6,
        tax: !!p && line.tax_rate !== p.tax_rate,
        offPo: hasPo && !p,
      },
      issueTypes: [...new Set(issues.filter((i) => i.line_no === line.line_no).map((i) => i.type))],
    }
  })

  for (const p of po?.lines ?? []) {
    if (!p.sku || billed.has(p.sku)) continue
    rows.push({
      key: `po-${p.sku}`,
      lineNo: null,
      sku: p.sku,
      description: p.description,
      po: p,
      grn: grnBySku.get(p.sku),
      flags: { price: false, qty: false, tax: false, offPo: false },
      issueTypes: [],
    })
  }
  return { rows, hasPo }
}
