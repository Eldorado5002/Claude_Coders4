"""Hard financial controls. Pure Python, run before any LLM, never overridden by memory.

A blocking issue means the agent may never approve and the case is never auto-resolved.
"""

import re
from dataclasses import dataclass, field
from datetime import date

from app.schemas import ExceptionType, Issue

NEW_VENDOR_WINDOW_DAYS = 60
FUZZY_WINDOW_DAYS = 45
IRN = re.compile(r"^[0-9a-f]{64}$")
GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
GSTIN_FORMAT = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


@dataclass
class ControlInput:
    invoice: dict
    vendor: dict
    prior_invoices: list[dict] = field(default_factory=list)  # same vendor, arrived earlier
    threshold: float = 500_000.0


def _inr(x: float) -> str:
    return f"₹{x:,.2f}"


def _d(d: date) -> str:
    return d.strftime("%d %b %Y")


def normalize_invoice_number(number: str) -> str:
    """Uppercase, drop separators and leading zeros in each digit run: 'CIS/2526/0423' == 'cis-2526-423'."""
    s = re.sub(r"[^0-9A-Z]+", " ", str(number).upper()).split()
    return "".join(part.lstrip("0") or "0" if part.isdigit() else part for part in s)


def gstin_valid(gstin: str) -> bool:
    g = str(gstin or "").strip().upper()
    if not GSTIN_FORMAT.match(g):
        return False
    total = 0
    for i, ch in enumerate(g[:14]):
        product = GSTIN_CHARS.index(ch) * (1 if i % 2 == 0 else 2)
        total += product // 36 + product % 36
    return GSTIN_CHARS[(36 - total % 36) % 36] == g[14]


def invoice_digits(number: str) -> str:
    """Digit content of an invoice number, leading zeros removed per group: 'ILW/2627/0820-R' -> '2627820'."""
    return "".join(g.lstrip("0") or "0" for g in re.findall(r"\d+", str(number)))


def _transposed(a: str, b: str) -> bool:
    """Exactly two positions swapped (a common typo / evasion: 0820 -> 0802)."""
    if len(a) != len(b) or a == b or sorted(a) != sorted(b):
        return False
    diff = [i for i, (x, y) in enumerate(zip(a, b, strict=True)) if x != y]
    return len(diff) == 2 and a[diff[0]] == b[diff[1]] and a[diff[1]] == b[diff[0]]


def find_duplicate(inv: dict, prior_invoices: list[dict]) -> tuple[dict, str] | None:
    """Exact number, or the same number written differently, always counts. Otherwise a duplicate must bill the
    same purchase order (or both have none) for the same amount, and either share the invoice date or carry a
    number with the same digits / two digits swapped within 45 days. Recurring fixed-price invoices with a new
    sequence number, or against a different PO, are not flagged."""
    number = str(inv["invoice_number"]).strip().upper()
    norm = normalize_invoice_number(number)
    digits = invoice_digits(number)
    total = float(inv["total"])
    for prior in prior_invoices:
        p_number = str(prior["invoice_number"]).strip().upper()
        same_amount = abs(float(prior["total"]) - total) < 1.0 and prior.get("po_number") == inv.get("po_number")
        if p_number == number:
            return prior, f"invoice number {inv['invoice_number']}"
        if normalize_invoice_number(p_number) == norm:
            return prior, f"invoice number ({inv['invoice_number']} is {prior['invoice_number']} written differently)"
        if same_amount and prior["invoice_date"] == inv["invoice_date"]:
            return prior, f"amount {_inr(total)} and date"
        close_in_time = abs((inv["invoice_date"] - prior["invoice_date"]).days) <= FUZZY_WINDOW_DAYS
        p_digits = invoice_digits(p_number)
        if same_amount and close_in_time and digits and (p_digits == digits or _transposed(p_digits, digits)):
            how = "the same digits" if p_digits == digits else "two digits swapped"
            return prior, (
                f"amount {_inr(total)} and an invoice number with {how} ({inv['invoice_number']} vs "
                f"{prior['invoice_number']})"
            )
    return None


def check_controls(ci: ControlInput) -> list[Issue]:
    inv, vendor = ci.invoice, ci.vendor
    profile = vendor.get("profile") or {}
    total = float(inv["total"])
    issues: list[Issue] = []

    dup = find_duplicate(inv, ci.prior_invoices)
    if dup:
        prior, why = dup
        issues.append(
            Issue(
                type=ExceptionType.DUPLICATE_INVOICE,
                message=f"Same {why} as {prior['id']} received on {_d(prior['arrival_date'])}.",
                actual=total,
                variance_amount=total,
                blocking=True,
            )
        )

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

    printed = str(inv.get("supplier_gstin") or "").strip().upper()
    if printed and (printed != vendor["gstin"] or not gstin_valid(printed)):
        why = (
            "fails the GSTIN checksum" if not gstin_valid(printed) else f"differs from vendor master {vendor['gstin']}"
        )
        issues.append(
            Issue(
                type=ExceptionType.INVALID_GSTIN,
                message=f"Supplier GSTIN on the invoice ({printed}) {why}.",
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

    if profile.get("e_invoice") and not IRN.match(str(inv.get("irn") or "")):
        issues.append(
            Issue(
                type=ExceptionType.EINVOICE_MISSING,
                message=(
                    "Supplier must issue GST e-invoices (turnover above ₹5 crore), but this invoice has no valid IRN — "
                    "it is not a valid tax invoice and input tax credit would be lost."
                ),
                actual=total,
                variance_amount=total,
                blocking=True,
            )
        )
    return issues
