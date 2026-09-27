"""Invoice capture: photo/PDF -> Gemini vision -> structured invoice -> 3-way match."""

import re
from datetime import date, timedelta
from difflib import SequenceMatcher

from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from app.config import get_settings
from app.data.generator import totals
from app.db import get_engine
from app.llm.router import get_router
from app.models import Invoice, PurchaseOrder, Vendor
from app.schemas import CaptureResult
from app.services.cases import get_cases, invoice_doc, sim_date, vendor_ref


class CapturedLine(BaseModel):
    description: str
    hsn: str | None = Field(description="HSN/SAC code if printed, else null")
    qty: float
    uom: str
    unit_price: float
    tax_rate: float = Field(description="GST percent for the line, e.g. 18")


class CapturedInvoice(BaseModel):
    vendor_name: str
    vendor_gstin: str | None = Field(description="Supplier GSTIN (15 chars) if printed, else null")
    invoice_number: str
    invoice_date_printed: str | None = Field(description="The invoice date exactly as printed, e.g. 04/11/2026")
    invoice_date: str = Field(description="ISO date YYYY-MM-DD")
    po_number: str | None = Field(description="Buyer PO number if printed, else null")
    lines: list[CapturedLine]
    total: float = Field(description="Grand total payable in rupees")
    bank_name: str | None
    account_number: str | None = Field(description="Bank account number as printed, else null")
    ifsc: str | None
    irn: str | None = Field(description="e-invoice IRN (64 hex characters) if printed, else null")


SYSTEM = (
    "You extract data from Indian GST tax invoices. Read the document carefully and return every field exactly as "
    "printed. Amounts are in rupees without symbols or commas. If a field is not printed, use null."
)


DAY_FIRST = True  # Indian invoices print DD/MM/YYYY
NUMERIC_DATE = re.compile(r"^\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\s*$")


def parse_invoice_date(printed: str | None, iso: str, *, day_first: bool = DAY_FIRST) -> date | None:
    """The model reads the date; code decides what it means. An all-numeric date such as 04/11/2026 is
    ambiguous and vision models apply whichever order they favour, whatever the prompt says, so we parse
    it with the locale. Anything else (e.g. '4 Nov 2026') falls back to the model's ISO reading."""
    m = NUMERIC_DATE.match(printed or "")
    if m:
        a, b, y = (int(g) for g in m.groups())
        day, month = (a, b) if day_first else (b, a)
        if month > 12 >= day:  # the printed numbers themselves settle it
            day, month = month, day
        try:
            return date(y + 2000 if y < 100 else y, month, day)
        except ValueError:
            pass
    try:
        return date.fromisoformat(iso[:10])
    except ValueError:
        return None


def _match_vendor(session: Session, cap: CapturedInvoice) -> Vendor | None:
    vendors = session.exec(select(Vendor)).all()
    if cap.vendor_gstin:
        g = re.sub(r"\s", "", cap.vendor_gstin).upper()
        for v in vendors:
            if v.gstin == g:
                return v
    best, score = None, 0.0
    for v in vendors:
        r = SequenceMatcher(None, v.name.lower(), cap.vendor_name.lower()).ratio()
        if r > score:
            best, score = v, r
    return best if score >= 0.72 else None


def _mask(acct: str | None) -> str:
    digits = re.sub(r"\D", "", acct or "")
    return f"XXXXXX{digits[-4:]}" if len(digits) >= 4 else (acct or "unknown")


async def capture_invoice(data: bytes, mime: str) -> CaptureResult:
    res = await get_router().vision(SYSTEM, "Extract this invoice.", data, mime, CapturedInvoice)
    cap = res.value
    with Session(get_engine()) as session:
        vendor = _match_vendor(session, cap)
        today = sim_date(session)
        lines = [
            {
                "line_no": i,
                "sku": None,
                "description": l.description,
                "hsn": l.hsn,
                "qty": l.qty,
                "uom": l.uom,
                "unit_price": l.unit_price,
                "tax_rate": l.tax_rate,
                "amount": round(l.qty * l.unit_price, 2),
            }
            for i, l in enumerate(cap.lines, start=1)
        ]
        po = session.get(PurchaseOrder, cap.po_number) if cap.po_number else None
        if po is not None:
            # align captured lines to PO SKUs by description so the 3-way match can compare them
            for l in lines:
                best = max(
                    po.lines,
                    key=lambda p: SequenceMatcher(None, p["description"].lower(), l["description"].lower()).ratio(),
                )
                if SequenceMatcher(None, best["description"].lower(), l["description"].lower()).ratio() > 0.6:
                    l["sku"] = best["sku"]
        sub, tax, _ = totals(lines)
        inv_date = parse_invoice_date(cap.invoice_date_printed, cap.invoice_date) or today
        count = len(session.exec(select(Invoice).where(col(Invoice.id).like("INV-C%"))).all())
        inv = Invoice(
            id=f"INV-C{count + 1:03d}",
            invoice_number=cap.invoice_number,
            vendor_id=vendor.id if vendor else "UNKNOWN",
            po_number=po.po_number if po else None,
            invoice_date=inv_date,
            due_date=inv_date + timedelta(days=vendor.payment_terms_days if vendor else 30),
            arrival_date=today,
            lines=lines,
            subtotal=sub,
            tax_total=tax,
            total=cap.total,
            bank_name=cap.bank_name or (vendor.bank_name if vendor else ""),
            account_number=_mask(cap.account_number)
            if cap.account_number
            else (vendor.account_number if vendor else ""),
            ifsc=(cap.ifsc or (vendor.ifsc if vendor else "")).upper(),
            supplier_gstin=(cap.vendor_gstin or "").replace(" ", "").upper() or None,
            irn=(cap.irn or "").strip().lower() or None,
            source="capture",
            status="pending",
            truth={"expected_types": [], "decision": "approve", "reason": "", "scenario": "captured"},
        )
        doc = invoice_doc(inv)
        if vendor is None:
            return CaptureResult(status="unknown_vendor", extracted=doc, vendor=None, exception_id=None)
        inv_id = inv.id  # plain value: the ORM object expires after commit/close
        session.add(inv)
        session.commit()
        ref = vendor_ref(vendor)

    day = (today - get_settings().sim_start).days
    new_ids = get_cases().process_arrivals(day)
    case_id = next((cid for cid in new_ids if _case_invoice(cid) == inv_id), None)
    if case_id:
        await get_cases().recommend_case(case_id)
    return CaptureResult(status="exception" if case_id else "matched", extracted=doc, vendor=ref, exception_id=case_id)


def _case_invoice(case_id: str) -> str | None:
    from app.models import ExceptionCase

    with Session(get_engine()) as session:
        c = session.get(ExceptionCase, case_id)
        return c.invoice_id if c else None
