"""3-way match: invoice vs purchase order vs goods receipt, plus hard controls."""

import re
from dataclasses import dataclass, field

from app.guardrails.controls import ControlInput, check_controls
from app.schemas import HARD_CONTROL_TYPES, ExceptionType, Issue

PRICE_TOLERANCE_PCT = 0.5
ROUNDING_TOLERANCE = 10.0
FREIGHT_WORDS = re.compile(r"freight|surcharge|transport|cartage|delivery charge", re.I)
CONTROL_ORDER = [
    ExceptionType.DUPLICATE_INVOICE,
    ExceptionType.BANK_DETAILS_CHANGED,
    ExceptionType.OVER_THRESHOLD,
    ExceptionType.NEW_VENDOR,
]


@dataclass
class MatchInput:
    invoice: dict
    vendor: dict
    po: dict | None = None
    grn: dict | None = None
    prior_invoices: list[dict] = field(default_factory=list)
    threshold: float = 500_000.0


@dataclass
class MatchResult:
    issues: list[Issue]

    @property
    def is_exception(self) -> bool:
        return bool(self.issues)

    @property
    def blocking(self) -> bool:
        return any(i.blocking for i in self.issues)

    @property
    def types(self) -> list[ExceptionType]:
        seen: list[ExceptionType] = []
        for i in self.issues:
            if i.type not in seen:
                seen.append(i.type)
        return seen

    @property
    def primary_type(self) -> ExceptionType | None:
        if not self.issues:
            return None
        for t in CONTROL_ORDER:
            if t in self.types:
                return t
        return max(self.issues, key=lambda i: abs(i.variance_amount or 0)).type

    @property
    def amount_at_risk(self) -> float:
        if self.blocking:
            return float(max(abs(i.variance_amount or 0) for i in self.issues if i.type in HARD_CONTROL_TYPES))
        return round(sum(abs(i.variance_amount or 0) for i in self.issues), 2)


def _money(x: float) -> float:
    return round(x + 1e-9, 2)


def _is_freight(line: dict) -> bool:
    return str(line.get("hsn") or "").startswith("9965") or bool(FREIGHT_WORDS.search(line["description"]))


def match_invoice(mi: MatchInput) -> MatchResult:
    inv = mi.invoice
    issues = check_controls(
        ControlInput(invoice=inv, vendor=mi.vendor, prior_invoices=mi.prior_invoices, threshold=mi.threshold)
    )

    if mi.po is None:
        issues.append(
            Issue(
                type=ExceptionType.MISSING_PO,
                message="No purchase order referenced — cannot 3-way match.",
                actual=float(inv["total"]),
                variance_amount=float(inv["total"]),
                blocking=False,
            )
        )
    else:
        po_lines = {l["sku"]: l for l in mi.po["lines"] if l.get("sku")}
        received = {l["sku"]: float(l["qty_received"]) for l in (mi.grn or {}).get("lines", []) if l.get("sku")}
        po_sub = float(mi.po["subtotal"]) or 1.0
        for line in inv["lines"]:
            sku = line.get("sku")
            tax = float(line["tax_rate"])
            if sku and sku in po_lines:
                pl = po_lines[sku]
                price_pct = (float(line["unit_price"]) - float(pl["unit_price"])) / float(pl["unit_price"]) * 100
                if abs(price_pct) > PRICE_TOLERANCE_PCT:
                    issues.append(
                        Issue(
                            type=ExceptionType.PRICE_VARIANCE,
                            message=(
                                f"Line {line['line_no']} {line['description']}: unit price ₹{line['unit_price']:,} "
                                f"vs PO ₹{pl['unit_price']:,} ({price_pct:+.1f}%)."
                            ),
                            line_no=line["line_no"],
                            expected=float(pl["unit_price"]),
                            actual=float(line["unit_price"]),
                            variance_amount=_money(
                                (float(line["unit_price"]) - float(pl["unit_price"]))
                                * float(line["qty"])
                                * (1 + tax / 100)
                            ),
                            variance_pct=round(price_pct, 2),
                            blocking=False,
                        )
                    )
                if tax != float(pl["tax_rate"]):
                    issues.append(
                        Issue(
                            type=ExceptionType.TAX_MISMATCH,
                            message=(
                                f"Line {line['line_no']} {line['description']} (HSN {line.get('hsn')}): GST {tax:g}% "
                                f"charged vs {float(pl['tax_rate']):g}% on the PO."
                            ),
                            line_no=line["line_no"],
                            expected=float(pl["tax_rate"]),
                            actual=tax,
                            variance_amount=_money(float(line["amount"]) * (tax - float(pl["tax_rate"])) / 100),
                            blocking=False,
                        )
                    )
                got = received.get(sku, 0.0) if mi.grn else float(pl["qty"])
                expected_qty = min(float(pl["qty"]), got)
                if float(line["qty"]) > expected_qty + 1e-6:
                    basis = "received" if got < float(pl["qty"]) else "ordered"
                    issues.append(
                        Issue(
                            type=ExceptionType.QUANTITY_VARIANCE,
                            message=(
                                f"Line {line['line_no']} {line['description']}: billed {line['qty']:g} {line['uom']} "
                                f"but {expected_qty:g} {basis} (PO {pl['qty']:g}, GRN {got:g})."
                            ),
                            line_no=line["line_no"],
                            expected=expected_qty,
                            actual=float(line["qty"]),
                            variance_amount=_money(
                                (float(line["qty"]) - expected_qty) * float(line["unit_price"]) * (1 + tax / 100)
                            ),
                            variance_pct=round((float(line["qty"]) - expected_qty) / max(expected_qty, 1e-9) * 100, 2),
                            blocking=False,
                        )
                    )
            else:
                amount_with_tax = _money(float(line["amount"]) * (1 + tax / 100))
                freight = _is_freight(line)
                issues.append(
                    Issue(
                        type=ExceptionType.FREIGHT_CHARGE if freight else ExceptionType.PRICE_VARIANCE,
                        message=(
                            f"Line {line['line_no']} '{line['description']}' (₹{float(line['amount']):,.2f} + GST) "
                            "is not on the purchase order."
                        ),
                        line_no=line["line_no"],
                        expected=0.0,
                        actual=float(line["amount"]),
                        variance_amount=amount_with_tax,
                        variance_pct=round(float(line["amount"]) / po_sub * 100, 2),
                        blocking=False,
                    )
                )

    computed = _money(
        sum(float(l["amount"]) for l in inv["lines"])
        + _money(sum(float(l["amount"]) * float(l["tax_rate"]) / 100 for l in inv["lines"]))
    )
    diff = _money(float(inv["total"]) - computed)
    if 0.5 < abs(diff) <= ROUNDING_TOLERANCE:
        issues.append(
            Issue(
                type=ExceptionType.ROUNDING_DIFFERENCE,
                message=f"Invoice total is ₹{diff:+,.2f} off the sum of its lines + GST.",
                expected=computed,
                actual=float(inv["total"]),
                variance_amount=abs(diff),
                blocking=False,
            )
        )
    elif abs(diff) > ROUNDING_TOLERANCE:
        issues.append(
            Issue(
                type=ExceptionType.PRICE_VARIANCE,
                message=f"Invoice total does not add up: ₹{diff:+,.2f} vs sum of lines + GST.",
                expected=computed,
                actual=float(inv["total"]),
                variance_amount=abs(diff),
                blocking=False,
            )
        )
    return MatchResult(issues=issues)
