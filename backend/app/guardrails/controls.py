"""Hard financial controls. Pure Python, run before any LLM, never overridden by memory.

A blocking issue means the agent may never approve and the case is never auto-resolved.
"""

from dataclasses import dataclass, field
from datetime import date

from app.schemas import ExceptionType, Issue

NEW_VENDOR_WINDOW_DAYS = 60


@dataclass
class ControlInput:
    invoice: dict
    vendor: dict
    prior_invoices: list[dict] = field(default_factory=list)  # same vendor, arrived earlier
    threshold: float = 500_000.0


def _inr(x: float) -> str:
    return f"₹{x:,.2f}"


def check_controls(ci: ControlInput) -> list[Issue]:
    inv, vendor = ci.invoice, ci.vendor
    total = float(inv["total"])
    issues: list[Issue] = []

    number = str(inv["invoice_number"]).strip().upper()
    for prior in ci.prior_invoices:
        same_number = str(prior["invoice_number"]).strip().upper() == number
        same_amount_date = abs(float(prior["total"]) - total) < 0.01 and prior["invoice_date"] == inv["invoice_date"]
        if same_number or same_amount_date:
            why = f"invoice number {inv['invoice_number']}" if same_number else f"amount {_inr(total)} and date"
            issues.append(
                Issue(
                    type=ExceptionType.DUPLICATE_INVOICE,
                    message=f"Same {why} as {prior['id']} received on {_d(prior['arrival_date'])}.",
                    actual=total,
                    variance_amount=total,
                    blocking=True,
                )
            )
            break

    if (inv["account_number"], inv["ifsc"]) != (vendor["account_number"], vendor["ifsc"]):
        issues.append(
            Issue(
                type=ExceptionType.BANK_DETAILS_CHANGED,
                message=(
                    f"Pay-to account {inv['bank_name']} {inv['account_number']} ({inv['ifsc']}) differs from vendor "
                    f"master {vendor['bank_name']} {vendor['account_number']} ({vendor['ifsc']})."
                ),
                actual=total,
                variance_amount=total,
                blocking=True,
            )
        )

    if total > ci.threshold:
        issues.append(
            Issue(
                type=ExceptionType.OVER_THRESHOLD,
                message=f"Invoice total {_inr(total)} exceeds the {_inr(ci.threshold)} approval limit.",
                expected=ci.threshold,
                actual=total,
                variance_amount=total - ci.threshold,
                blocking=True,
            )
        )

    onboarded = vendor["onboarded_on"]
    arrival = inv["arrival_date"]
    if not ci.prior_invoices and (arrival - onboarded).days <= NEW_VENDOR_WINDOW_DAYS:
        issues.append(
            Issue(
                type=ExceptionType.NEW_VENDOR,
                message=f"First invoice from a vendor onboarded on {_d(onboarded)} — KYC and bank verification required.",
                actual=total,
                variance_amount=total,
                blocking=True,
            )
        )
    return issues


def _d(d: date) -> str:
    return d.strftime("%d %b %Y")
