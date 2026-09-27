"""Vendor risk score: fraud and control signals combined into one number a clerk can act on.

Signals (all computed from what has actually arrived so far):
  bank-account change attempts, duplicate submissions, GSTIN / e-invoice problems,
  invoices the anomaly model marked as unusual, an exception rate far above the portfolio,
  and a Benford first-digit test on the vendor's line amounts (only with enough data).
"""

from sqlmodel import Session, select

from app.ml.benford import benford
from app.models import ExceptionCase, Invoice, Vendor
from app.schemas import BenfordResult, VendorRisk

WEIGHTS = {"bank": 35, "duplicate": 25, "identity": 20, "anomaly": 15, "exceptions": 10, "benford": 10}


def vendor_risk(session: Session, vendor: Vendor, portfolio_exception_rate: float | None = None) -> VendorRisk:
    invoices = session.exec(select(Invoice).where(Invoice.vendor_id == vendor.id, Invoice.status != "pending")).all()
    cases = session.exec(select(ExceptionCase).where(ExceptionCase.vendor_id == vendor.id)).all()
    types = [t for c in cases for t in c.issue_types]
    score, reasons = 0.0, []

    bank = types.count("bank_details_changed")
    if bank:
        score += WEIGHTS["bank"] * min(1, bank)
        reasons.append(f"{bank} request(s) to pay a different bank account")
    dups = types.count("duplicate_invoice")
    if dups:
        score += WEIGHTS["duplicate"] * min(1, dups / 2)
        reasons.append(f"{dups} duplicate invoice submission(s)")
    identity = types.count("invalid_gstin") + types.count("einvoice_missing")
    if identity:
        score += WEIGHTS["identity"] * min(1, identity)
        reasons.append(f"{identity} invoice(s) with GSTIN or e-invoice problems")
    anomalous = sum(1 for c in cases if ((c.recommendation or {}).get("anomaly_score") or 0) >= 0.9)
    if invoices and anomalous:
        share = anomalous / len(invoices)
        score += WEIGHTS["anomaly"] * min(1, share * 5)
        reasons.append(f"{anomalous} invoice(s) unusual for this vendor (anomaly model)")
    if invoices and portfolio_exception_rate:
        rate = len(cases) / len(invoices)
        if rate > 2 * portfolio_exception_rate and len(invoices) >= 5:
            score += WEIGHTS["exceptions"]
            reasons.append(f"exception rate {rate:.0%} vs {portfolio_exception_rate:.0%} across all vendors")
    ben = benford([l["amount"] for inv in invoices for l in inv.lines])
    if ben["conformity"] == "nonconformity":
        score += WEIGHTS["benford"]
        reasons.append(f"line amounts deviate from Benford's law (MAD {ben['mad']})")
    elif ben["conformity"] == "marginal":
        score += WEIGHTS["benford"] / 2
        reasons.append(f"line amounts marginally deviate from Benford's law (MAD {ben['mad']})")

    score = int(round(min(100, score)))
    level = "high" if score >= 50 else "medium" if score >= 25 else "low"
    if not reasons:
        reasons.append("no fraud or control signals so far")
    return VendorRisk(score=score, level=level, reasons=reasons, benford=BenfordResult(**ben))


def portfolio_exception_rate(session: Session) -> float | None:
    arrived = session.exec(select(Invoice).where(Invoice.status != "pending")).all()
    cases = session.exec(select(ExceptionCase)).all()
    return len(cases) / len(arrived) if arrived else None


def all_vendor_risk(session: Session) -> list[tuple[Vendor, VendorRisk]]:
    rate = portfolio_exception_rate(session)
    rows = [(v, vendor_risk(session, v, rate)) for v in session.exec(select(Vendor)).all()]
    return sorted(rows, key=lambda r: -r[1].score)


def portfolio_benford(session: Session) -> BenfordResult:
    invoices = session.exec(select(Invoice).where(Invoice.status != "pending")).all()
    return BenfordResult(**benford([l["amount"] for inv in invoices for l in inv.lines]))
