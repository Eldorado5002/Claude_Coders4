const HEAD = 8
const TAIL = 6

/** A GST e-invoice IRN is a 64-character hash: show it like one (first 8…last 6). null when there is none. */
export function shortIrn(irn: string | null | undefined): string | null {
  const v = irn?.trim()
  if (!v) return null
  return v.length > HEAD + TAIL + 2 ? `${v.slice(0, HEAD)}…${v.slice(-TAIL)}` : v
}

const normGstin = (g: string | null | undefined) => (g ?? '').replace(/\s+/g, '').toUpperCase()

/** The GSTIN printed on an invoice against the vendor master's, ignoring spaces and case. null = nothing to compare. */
export function gstinMatch(printed: string | null | undefined, master: string | null | undefined): 'match' | 'mismatch' | null {
  const p = normGstin(printed)
  const m = normGstin(master)
  if (!p || !m) return null
  return p === m ? 'match' : 'mismatch'
}
