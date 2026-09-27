"""India compliance: MSME Section 43B(h) payment deadlines and GST e-invoicing.

Section 43B(h) (from FY 2023-24): an expense owed to a micro or small enterprise is deductible
only in the year it is actually paid, unless it is paid within 15 days of accepting the goods,
or within the agreed period up to 45 days. Holding an MSME invoice can therefore cost tax.
"""

from datetime import date, timedelta

from app.schemas import EInvoiceStatus, MsmeStatus

CORPORATE_TAX_RATE = 0.2517  # Section 115BAA: 22% + 10% surcharge + 4% cess
DUE_SOON_DAYS = 7
NO_AGREEMENT_DAYS = 15
MAX_AGREED_DAYS = 45


def msme_status(profile: dict, invoice: dict, grn: dict | None, today: date, terms_days: int) -> MsmeStatus | None:
    m = (profile or {}).get("msme")
    if not m or m.get("category") not in ("micro", "small"):
        return None
    agreed = m.get("agreement_days")
    limit = min(MAX_AGREED_DAYS, agreed) if agreed else NO_AGREEMENT_DAYS
    accepted = grn["received_date"] if grn else invoice["invoice_date"]
    deadline = accepted + timedelta(days=limit)
    days_left = (deadline - today).days
    status = "breached" if days_left < 0 else "due_soon" if days_left <= DUE_SOON_DAYS else "ok"
    return MsmeStatus(
        category=m["category"],
        udyam=m.get("udyam", ""),
        limit_days=limit,
        accepted_on=accepted,
        deadline=deadline,
        days_left=days_left,
        status=status,
        tax_at_risk=round(float(invoice["subtotal"]) * CORPORATE_TAX_RATE, 2),
        terms_exceed_limit=terms_days > limit,
    )


def einvoice_status(profile: dict, invoice: dict) -> EInvoiceStatus:
    return EInvoiceStatus(required=bool((profile or {}).get("e_invoice")), irn_present=bool(invoice.get("irn")))


def msme_note(m: MsmeStatus) -> str:
    """One line for the recommendation when holding the invoice would cost tax."""
    when = f"{m.deadline:%d %b %Y}"
    if m.status == "breached":
        return (
            f"MSME supplier: the Section 43B(h) deadline ({when}) has already passed — pay promptly once "
            f"resolved; ₹{m.tax_at_risk:,.0f} of tax deduction is deferred to the year of payment."
        )
    return (
        f"MSME supplier: holding this risks the Section 43B(h) deadline on {when} ({m.days_left} days left) "
        f"and about ₹{m.tax_at_risk:,.0f} of tax deduction."
    )
