"""Seeded synthetic AP dataset: POs, GRNs and invoices over a 26-week timeline.

Every invoice carries `truth`: the exception types the matching engine must raise and
the decision a careful AP clerk would take (with a realistic reason). The simulated
clerk and the evaluation harness use it; the frontend never sees it.
"""

import random
import string
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from app.data.catalog import CLERKS, VENDORS

LETTERS = string.ascii_uppercase
HARD = {"duplicate_invoice", "bank_details_changed", "new_vendor", "over_threshold"}
GSTIN_CHARS = string.digits + string.ascii_uppercase


# ---------------------------------------------------------------- helpers


def gstin_checksum(first14: str) -> str:
    total = 0
    for i, ch in enumerate(first14):
        product = GSTIN_CHARS.index(ch) * (1 if i % 2 == 0 else 2)
        total += product // 36 + product % 36
    return GSTIN_CHARS[(36 - total % 36) % 36]


def make_gstin(rng: random.Random, state_code: str, name: str, entity: str) -> str:
    pan = "".join(rng.choice(LETTERS) for _ in range(3)) + entity + name[0].upper()
    pan += f"{rng.randint(1000, 9999)}{rng.choice(LETTERS)}"
    first14 = f"{state_code}{pan}1Z"
    return first14 + gstin_checksum(first14)


def masked_account(rng: random.Random) -> str:
    return f"XXXXXX{rng.randint(1000, 9999)}"


def fy(d: date) -> str:
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start % 100:02d}{(start + 1) % 100:02d}"


def money(x: float) -> float:
    return round(x + 1e-9, 2)


def make_line(no: int, sku, desc, hsn, qty, uom, price, tax) -> dict:
    return {
        "line_no": no,
        "sku": sku,
        "description": desc,
        "hsn": hsn,
        "qty": qty,
        "uom": uom,
        "unit_price": price,
        "tax_rate": tax,
        "amount": money(qty * price),
    }


def totals(lines: list[dict]) -> tuple[float, float, float]:
    sub = money(sum(l["amount"] for l in lines))
    tax = money(sum(l["amount"] * l["tax_rate"] / 100 for l in lines))
    return sub, tax, money(sub + tax)


def weekday_on_or_after(d: date) -> date:
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def snap(qty: float, step: float) -> float:
    return max(step, round(round(qty / step) * step, 3))


# ---------------------------------------------------------------- dataset


@dataclass
class Dataset:
    vendors: list[dict] = field(default_factory=list)
    pos: list[dict] = field(default_factory=list)
    grns: list[dict] = field(default_factory=list)
    invoices: list[dict] = field(default_factory=list)


@dataclass
class Draft:
    """One invoice being built, with its PO and GRN."""

    vendor: dict
    arrival: date
    po_lines: list[dict] | None
    grn_qty: dict[int, float] | None  # line_no -> qty received
    inv_lines: list[dict]
    bank: tuple[str, str, str] | None = None  # override (bank_name, account, ifsc)
    total_delta: float = 0.0
    invoice_number: str | None = None
    invoice_date: date | None = None
    truth: dict = field(default_factory=dict)


class Generator:
    def __init__(self, seed: int, start: date, days: int):
        self.rng = random.Random(seed)
        self.start = start
        self.days = days
        self.ds = Dataset()
        self.po_seq = 0
        self.grn_seq = 0
        self.inv_seq: dict[str, int] = {}
        self.vendor_by_id: dict[str, dict] = {}
        self.drafts: list[Draft] = []
        self.issued: dict[str, list[dict]] = {}  # vendor -> invoices already issued (for duplicates)

    # ------------------------------------------------------------ vendors

    def build_vendors(self) -> None:
        for spec in VENDORS:
            onboard_day = spec.get("onboard_day")
            onboarded = (
                self.start + timedelta(days=onboard_day)
                if onboard_day is not None
                else self.start - timedelta(days=self.rng.randint(400, 2200))
            )
            v = {
                "id": spec["id"],
                "name": spec["name"],
                "gstin": make_gstin(self.rng, spec["state_code"], spec["name"], spec["entity"]),
                "city": spec["city"],
                "state": spec["state"],
                "state_code": spec["state_code"],
                "category": spec["category"],
                "payment_terms_days": spec["terms"],
                "bank_name": spec["bank"][0],
                "account_number": masked_account(self.rng),
                "ifsc": spec["bank"][1],
                "onboarded_on": onboarded,
                "profile": {
                    k: spec[k]
                    for k in ("quirks", "freight_cap", "escalation_cap", "surcharge_cap", "no_po_limit", "prefix")
                    if k in spec
                },
            }
            self.ds.vendors.append(v)
            self.vendor_by_id[v["id"]] = v

    # ------------------------------------------------------------ document builders

    def spec(self, vid: str) -> dict:
        return next(s for s in VENDORS if s["id"] == vid)

    def pick_lines(self, spec: dict, n: int | None = None) -> list[dict]:
        items = spec["items"]
        n = n or self.rng.randint(1, min(3, len(items)))
        chosen = self.rng.sample(items, n)
        lines = []
        for i, (sku, desc, hsn, uom, price, tax, (lo, hi), step) in enumerate(chosen, start=1):
            qty = snap(self.rng.uniform(lo, hi), step)
            lines.append(make_line(i, sku, desc, hsn, qty, uom, price, tax))
        return lines

    def next_invoice_number(self, spec: dict, d: date) -> str:
        key = f"{spec['id']}{fy(d)}"
        self.inv_seq[key] = self.inv_seq.get(key, self.rng.randint(180, 1400)) + self.rng.randint(1, 9)
        return f"{spec['prefix']}/{fy(d)}/{self.inv_seq[key]:04d}"

    @staticmethod
    def cap_total(lines: list[dict], items: list, limit: float = 400_000) -> None:
        total = totals(lines)[2]
        if total <= limit:
            return
        steps = {i[0]: i[7] for i in items}
        factor = limit / total
        for l in lines:
            step = steps.get(l["sku"], 1)
            l["qty"] = max(step, snap(l["qty"] * factor, step))
            l["amount"] = money(l["qty"] * l["unit_price"])

    def draft_standard(self, spec: dict, arrival: date, n_lines: int | None = None) -> Draft:
        po_lines = self.pick_lines(spec, n_lines)
        self.cap_total(po_lines, spec["items"])
        return Draft(
            vendor=spec,
            arrival=arrival,
            po_lines=po_lines,
            grn_qty={l["line_no"]: l["qty"] for l in po_lines},
            inv_lines=[dict(l) for l in po_lines],
        )

    def draft_no_po(self, spec: dict, arrival: date, scale: float = 1.0) -> Draft:
        lines = self.pick_lines(spec)
        for l in lines:
            l["unit_price"] = money(l["unit_price"] * scale)
            l["amount"] = money(l["qty"] * l["unit_price"])
        return Draft(vendor=spec, arrival=arrival, po_lines=None, grn_qty=None, inv_lines=lines)

    # ------------------------------------------------------------ truth helpers

    def clerk(self) -> str:
        return self.rng.choice(CLERKS)

    def truth(self, types: list[str], decision: str, reason: str, scenario: str, adjusted: float | None = None) -> dict:
        return {
            "expected_types": types,
            "decision": decision,
            "reason": reason,
            "adjusted_amount": adjusted,
            "clerk": self.clerk(),
            "scenario": scenario,
        }

    @staticmethod
    def payable_for(lines: list[dict], qty_by_line: dict[int, float]) -> float:
        adjusted = []
        for l in lines:
            q = qty_by_line.get(l["line_no"], l["qty"])
            adjusted.append(
                make_line(
                    l["line_no"], l["sku"], l["description"], l["hsn"], q, l["uom"], l["unit_price"], l["tax_rate"]
                )
            )
        return totals(adjusted)[2]

    # ------------------------------------------------------------ scenarios per quirk

    def scenario(self, d: Draft, idx: int) -> None:
        spec = d.vendor
        quirks = spec.get("quirks", [])
        r = self.rng.random()
        name = spec["name"]

        if "price_escalation" in quirks:
            cap = spec["escalation_cap"]
            if spec["id"] == "V002" and idx in (5, 13):
                line = d.po_lines[0]
                target = self.rng.uniform(520_000, 610_000) / 1.18
                line["qty"] = snap(target / line["unit_price"], 1)
                line["amount"] = money(line["qty"] * line["unit_price"])
                d.po_lines = [line]
                d.grn_qty = {1: line["qty"]}
                d.inv_lines = [dict(line)]
                d.truth = self.truth(
                    ["over_threshold"],
                    "escalate",
                    "Invoice above ₹5,00,000 — needs Finance Controller approval before payment.",
                    "over_threshold",
                )
                return
            line = self.rng.choice(d.inv_lines)
            if r < 0.55:
                pct = self.rng.uniform(1.0, cap - 0.3)
                line["unit_price"] = money(line["unit_price"] * (1 + pct / 100))
                line["amount"] = money(line["qty"] * line["unit_price"])
                d.truth = self.truth(
                    ["price_variance"],
                    "approve",
                    f"Rate contract with {name} has a raw-material escalation clause up to {cap:g}%; "
                    f"this {pct:.1f}% increase is within it.",
                    "escalation_within_cap",
                )
            elif r < 0.67:
                pct = self.rng.uniform(cap + 1.5, cap + 7)
                line["unit_price"] = money(line["unit_price"] * (1 + pct / 100))
                line["amount"] = money(line["qty"] * line["unit_price"])
                d.truth = self.truth(
                    ["price_variance"],
                    "hold",
                    f"{pct:.1f}% price increase exceeds the {cap:g}% escalation clause; "
                    "asked the vendor for a revised invoice at contract rate.",
                    "escalation_over_cap",
                )
            return

        if "monsoon_shortfall" in quirks:
            monsoon = d.arrival.month in (6, 7, 8, 9)
            if (monsoon and r < 0.7) or (not monsoon and r < 0.12):
                line = self.rng.choice(d.inv_lines)
                short = self.rng.uniform(2, 5) if monsoon else self.rng.uniform(8, 15)
                received = snap(line["qty"] * (1 - short / 100), 5)
                d.grn_qty[line["line_no"]] = received
                if monsoon:
                    d.truth = self.truth(
                        ["quantity_variance"],
                        "approve_adjusted",
                        f"Monsoon transit and moisture loss of about {short:.0f}% is normal for {name}; "
                        "pay for the received quantity only.",
                        "monsoon_shortfall",
                        self.payable_for(d.inv_lines, d.grn_qty),
                    )
                else:
                    d.truth = self.truth(
                        ["quantity_variance"],
                        "hold",
                        f"Short delivery of {short:.0f}% is not normal; raised a debit note and holding until the "
                        "balance quantity arrives.",
                        "short_delivery",
                    )
            return

        if "gst_rate_error" in quirks:
            error_rate = 0.6 if d.arrival.month <= 5 else 0.25
            box_lines = [l for l in d.inv_lines if l["hsn"] == "4819"]
            if box_lines and r < error_rate:
                for l in box_lines:
                    l["tax_rate"] = 18
                d.truth = self.truth(
                    ["tax_mismatch"],
                    "hold",
                    "GST on corrugated boxes (HSN 4819) is 5% after GST 2.0 but Kaveri charged 18%; "
                    "sent back for a revised invoice — do not pay excess GST.",
                    "gst_rate_error",
                )
            return

        if "rounding" in quirks:
            if r < 0.4:
                delta = self.rng.choice([-1, 1]) * self.rng.randint(1, 9)
                d.total_delta = float(delta)
                d.truth = self.truth(
                    ["rounding_difference"],
                    "approve",
                    f"₹{abs(delta)} rounding difference from {name}'s billing software — within the ₹10 tolerance.",
                    "rounding",
                )
            return

        if "partial_ship_full_bill" in quirks:
            if r < 0.45:
                line = self.rng.choice(d.inv_lines)
                step = 50
                received = snap(line["qty"] * self.rng.uniform(0.6, 0.9), step)
                if received >= line["qty"]:
                    received = line["qty"] - step
                d.grn_qty[line["line_no"]] = received
                d.truth = self.truth(
                    ["quantity_variance"],
                    "approve_adjusted",
                    f"{name} bills the full PO quantity on partial dispatch; pay for received quantity, "
                    "balance will be billed on the next shipment.",
                    "partial_ship",
                    self.payable_for(d.inv_lines, d.grn_qty),
                )
            return

        if "over_shipment" in quirks:
            if r < 0.4:
                line = self.rng.choice(d.inv_lines)
                extra = snap(line["qty"] * self.rng.uniform(1.05, 1.12), 10)
                if extra <= line["qty"]:
                    extra = line["qty"] + 10
                po_qty = {l["line_no"]: l["qty"] for l in d.inv_lines}
                line["qty"] = extra
                line["amount"] = money(line["qty"] * line["unit_price"])
                d.grn_qty[line["line_no"]] = extra
                d.truth = self.truth(
                    ["quantity_variance"],
                    "approve_adjusted",
                    f"{name} shipped more than ordered; policy is to pay the PO quantity only and "
                    "return or adjust the excess on the next PO.",
                    "over_shipment",
                    self.payable_for(d.inv_lines, po_qty),
                )
            return

        if "fuel_surcharge" in quirks:
            cap = spec["surcharge_cap"]
            if r < 0.65:
                sub = sum(l["amount"] for l in d.inv_lines)
                over = r >= 0.55
                pct = self.rng.uniform(cap + 3, cap + 6) if over else self.rng.uniform(2.5, cap - 0.5)
                n = len(d.inv_lines) + 1
                d.inv_lines.append(
                    make_line(
                        n, None, "Fuel surcharge (diesel price revision)", "996511", 1, "Lot", money(sub * pct / 100), 5
                    )
                )
                if over:
                    d.truth = self.truth(
                        ["freight_charge"],
                        "hold",
                        f"Fuel surcharge of {pct:.1f}% is above the {cap:g}% cap in the rate "
                        "contract; asked Indus to justify the diesel revision.",
                        "surcharge_over_cap",
                    )
                else:
                    d.truth = self.truth(
                        ["freight_charge"],
                        "approve",
                        f"Fuel surcharge of {pct:.1f}% is within the {cap:g}% allowed in the Indus rate contract.",
                        "surcharge_within_cap",
                    )
            return

        if "genuine_errors" in quirks:
            if r < 0.28:
                line = self.rng.choice(d.inv_lines)
                pct = self.rng.uniform(3, 12)
                line["unit_price"] = money(line["unit_price"] * (1 + pct / 100))
                line["amount"] = money(line["qty"] * line["unit_price"])
                d.truth = self.truth(
                    ["price_variance"],
                    "hold",
                    f"Unit price {pct:.1f}% above PO with no agreed revision; asked {name} for a revised invoice.",
                    "genuine_price_error",
                )
            return

        # vendors without quirks: occasional genuine error
        if r < 0.06:
            line = self.rng.choice(d.inv_lines)
            pct = self.rng.uniform(4, 10)
            line["unit_price"] = money(line["unit_price"] * (1 + pct / 100))
            line["amount"] = money(line["qty"] * line["unit_price"])
            d.truth = self.truth(
                ["price_variance"],
                "hold",
                f"Price {pct:.1f}% above PO; no revision agreed with {name}. Requested credit note.",
                "genuine_price_error",
            )

    def scenario_no_po(self, d: Draft, history: list[float]) -> None:
        spec = d.vendor
        total = totals(d.inv_lines)[2]
        if "no_po_utility" in spec["quirks"]:
            if history and self.rng.random() < 0.14:
                factor = self.rng.uniform(1.35, 1.6)
                for l in d.inv_lines:
                    l["unit_price"] = money(l["unit_price"] * factor)
                    l["amount"] = money(l["qty"] * l["unit_price"])
                d.truth = self.truth(
                    ["missing_po"],
                    "hold",
                    f"Bill is about {(factor - 1) * 100:.0f}% above the usual monthly amount; "
                    "holding until facilities confirms the meter reading / usage.",
                    "utility_spike",
                )
            else:
                d.truth = self.truth(
                    ["missing_po"],
                    "approve",
                    f"Monthly {spec['category'].replace('_', ' ')} bill from {spec['name']} — no PO by "
                    "design and the amount is in the usual range.",
                    "utility_normal",
                )
            return
        limit = spec["no_po_limit"]
        if total <= limit:
            d.truth = self.truth(
                ["missing_po"],
                "approve",
                f"No-PO spend with {spec['name']} is allowed up to ₹{limit:,}; this bill is within it.",
                "no_po_within_limit",
            )
        else:
            d.truth = self.truth(
                ["missing_po"],
                "hold",
                f"No-PO spend above ₹{limit:,} needs a purchase order; asked the requester to raise one.",
                "no_po_over_limit",
            )

    # ------------------------------------------------------------ scripted demo vendor

    def v001_script(self) -> list[Draft]:
        """Shree Balaji Steel — the demo storyline. (day, freight, kind)."""
        spec = self.spec("V001")
        cap = spec["freight_cap"]
        plan = [
            (0, 3850, "freight"),
            (5, 4100, "freight"),
            (10, 2900, "freight"),
            (16, 4200, "freight"),  # week 3 demo case
            (23, 7400, "freight"),  # over the cap -> hold
            (30, 3300, "freight"),
            (37, 0, "clean"),
            (44, 4650, "freight"),
            (51, 3600, "freight"),  # week 8 demo case -> auto-resolved
            (56, 3900, "bank_change"),  # twist
            (56, 0, "duplicate"),  # twist: resubmits the week-3 invoice
        ]
        day = 65
        while day < self.days:
            plan.append((day, self.rng.choice([2500, 3100, 3400, 3900, 4300, 4800]), "freight"))
            day += self.rng.randint(6, 9)
        plan.append((100, 8200, "freight"))
        plan.sort(key=lambda p: p[0])

        drafts: list[Draft] = []
        week3: Draft | None = None
        for day, freight, kind in plan:
            arrival = self.start + timedelta(days=day)
            if kind == "duplicate" and week3 is not None:
                dup = Draft(
                    vendor=spec,
                    arrival=arrival,
                    po_lines=None,
                    grn_qty=None,
                    inv_lines=[dict(l) for l in week3.inv_lines],
                )
                dup.duplicate_of = week3  # type: ignore[attr-defined]
                dup.truth = self.truth(
                    ["duplicate_invoice"],
                    "reject",
                    f"Duplicate of {week3.invoice_number}, already approved on {week3.arrival:%d %b}. Rejected.",
                    "duplicate",
                )
                drafts.append(dup)
                continue
            d = self.draft_standard(spec, arrival, n_lines=2 if day % 2 == 0 else 1)
            if kind in ("freight", "bank_change"):
                n = len(d.inv_lines) + 1
                d.inv_lines.append(
                    make_line(n, None, "Freight charges - Medchal to Unit 2", "996511", 1, "Trip", float(freight), 18)
                )
            if kind == "freight":
                if freight <= cap:
                    reason = self.rng.choice(
                        [
                            f"Balaji bills freight separately on the last line — our standing agreement covers freight up "
                            f"to ₹{cap:,} per trip. ₹{freight:,} is fine.",
                            f"Freight ₹{freight:,} on the last line is within the ₹{cap:,} per-trip freight agreement with "
                            "Balaji. Approved.",
                            f"Usual Balaji freight line (₹{freight:,}); under the ₹{cap:,} cap, so approve.",
                        ]
                    )
                    d.truth = self.truth(["freight_charge"], "approve", reason, "freight_within_cap")
                else:
                    d.truth = self.truth(
                        ["freight_charge"],
                        "hold",
                        f"Freight ₹{freight:,} exceeds the ₹{cap:,} per-trip cap agreed with Balaji; asked them to "
                        "justify or revise before we pay.",
                        "freight_over_cap",
                    )
                if day == 0:
                    d.truth["clerk"] = "Priya (AP)"
            elif kind == "bank_change":
                d.bank = ("Yes Bank", "XXXXXX9083", "YESB0000871")
                d.truth = self.truth(
                    ["bank_details_changed", "freight_charge"],
                    "escalate",
                    "Bank account on the invoice differs from the vendor master (request came only by email). "
                    "Blocked — treasury to verify by callback on the registered number before any payment.",
                    "bank_change",
                )
            else:
                d.truth = self.truth([], "approve", "", "clean")
            if day == 16:
                week3 = d
            drafts.append(d)
        return drafts

    # ------------------------------------------------------------ schedule

    def arrivals(self, spec: dict) -> list[date]:
        n = round(spec["per_month"] * self.days / 30.4)
        first = max(1, spec.get("onboard_day", 1))
        span = self.days - first
        n = max(1, round(n * span / self.days)) if spec.get("onboard_day") else n
        out = []
        for i in range(n):
            base = first + (i + self.rng.uniform(0.1, 0.9)) * span / n
            d = weekday_on_or_after(self.start + timedelta(days=int(base)))
            if (d - self.start).days < self.days:
                out.append(d)
        return out

    def build_drafts(self) -> None:
        self.drafts.extend(self.v001_script())
        for spec in VENDORS:
            if spec["id"] == "V001":
                continue
            history: list[float] = []
            for idx, arrival in enumerate(self.arrivals(spec)):
                if "no_po_utility" in spec["quirks"] or "no_po_small" in spec["quirks"]:
                    scale = self.rng.uniform(0.92, 1.08) if "no_po_utility" in spec["quirks"] else 1.0
                    if spec["id"] == "V024":
                        scale = self.rng.uniform(0.9, 1.2)
                    d = self.draft_no_po(spec, arrival, scale)
                    self.scenario_no_po(d, history)
                    history.append(totals(d.inv_lines)[2])
                else:
                    d = self.draft_standard(spec, arrival)
                    d.truth = {}
                    self.scenario(d, idx)
                if not d.truth:
                    d.truth = self.truth([], "approve", "", "clean")
                if spec.get("onboard_day") is not None and idx == 0:
                    d.truth = self.truth(
                        ["new_vendor", *d.truth["expected_types"]],
                        "escalate",
                        f"First invoice from newly onboarded vendor {spec['name']} — KYC and bank verification must "
                        "complete before the first payment.",
                        "new_vendor",
                    )
                self.drafts.append(d)
        self.add_traps()

    def add_traps(self) -> None:
        by_vendor: dict[str, list[Draft]] = {}
        for d in self.drafts:
            by_vendor.setdefault(d.vendor["id"], []).append(d)

        # Duplicates: vendor resubmits an earlier invoice
        for vid, idx, gap in (("V005", 3, 18), ("V021", 4, 12)):
            orig = sorted(by_vendor[vid], key=lambda x: x.arrival)[idx]
            dup = Draft(
                vendor=orig.vendor,
                arrival=weekday_on_or_after(orig.arrival + timedelta(days=gap)),
                po_lines=None,
                grn_qty=None,
                inv_lines=[dict(l) for l in orig.inv_lines],
            )
            dup.duplicate_of = orig  # type: ignore[attr-defined]
            dup.total_delta = orig.total_delta
            dup.truth = self.truth(
                ["duplicate_invoice"],
                "reject",
                "Same invoice number was already received and processed earlier — duplicate submission, rejected.",
                "duplicate",
            )
            self.drafts.append(dup)

        # Bank-detail changes (fraud attempts)
        for vid, idx in (("V013", 2), ("V005", 13)):
            target = sorted(by_vendor[vid], key=lambda x: x.arrival)[idx]
            target.bank = (
                self.rng.choice(["Yes Bank", "RBL Bank", "IndusInd Bank"]),
                masked_account(self.rng),
                self.rng.choice(["YESB0000514", "RATN0000231", "INDB0000901"]),
            )
            carried = [x for x in target.truth.get("expected_types", []) if x not in HARD]
            target.truth = self.truth(
                ["bank_details_changed", *carried],
                "escalate",
                "Invoice asks for payment to a new bank account. Not in vendor master — blocked until treasury "
                "verifies by phone callback.",
                "bank_change",
            )

    # ------------------------------------------------------------ materialise

    def materialise(self) -> None:
        self.drafts.sort(key=lambda d: (d.arrival, d.vendor["id"]))
        for seq, d in enumerate(self.drafts, start=1):
            spec = d.vendor
            vendor = self.vendor_by_id[spec["id"]]
            po_number = None
            if d.po_lines is not None:
                self.po_seq += 1
                self.grn_seq += 1
                po_number = f"PO-2026-{self.po_seq:04d}"
                grn_date = d.arrival - timedelta(days=self.rng.randint(1, 4))
                po_date = grn_date - timedelta(days=self.rng.randint(5, 14))
                sub, tax, tot = totals(d.po_lines)
                self.ds.pos.append(
                    {
                        "po_number": po_number,
                        "vendor_id": vendor["id"],
                        "po_date": po_date,
                        "lines": d.po_lines,
                        "subtotal": sub,
                        "tax_total": tax,
                        "total": tot,
                    }
                )
                self.ds.grns.append(
                    {
                        "grn_number": f"GRN-2026-{self.grn_seq:04d}",
                        "po_number": po_number,
                        "received_date": grn_date,
                        "lines": [
                            {
                                "line_no": l["line_no"],
                                "sku": l["sku"],
                                "description": l["description"],
                                "qty_received": d.grn_qty.get(l["line_no"], l["qty"]),
                                "uom": l["uom"],
                            }
                            for l in d.po_lines
                        ],
                    }
                )

            dup_of = getattr(d, "duplicate_of", None)
            if dup_of is not None:
                carried = [x for x in dup_of.truth["expected_types"] if x not in HARD]
                d.truth["expected_types"] = ["duplicate_invoice", *carried]
                invoice_number = dup_of.invoice_number
                invoice_date = dup_of.invoice_date if spec["id"] != "V021" else d.arrival - timedelta(days=1)
                po_number = dup_of.po_number
            else:
                invoice_date = d.arrival - timedelta(days=self.rng.randint(0, 2))
                invoice_number = self.next_invoice_number(spec, invoice_date)
            d.invoice_number, d.invoice_date, d.po_number = invoice_number, invoice_date, po_number  # type: ignore[attr-defined]

            sub, tax, tot = totals(d.inv_lines)
            bank = d.bank or (vendor["bank_name"], vendor["account_number"], vendor["ifsc"])
            crosses = d.truth.get("scenario") == "over_threshold" or tot > 500_000
            if crosses and "over_threshold" not in d.truth["expected_types"]:
                d.truth["expected_types"] = ["over_threshold", *d.truth["expected_types"]]
                d.truth.update(
                    decision="escalate",
                    scenario="over_threshold",
                    reason="Invoice above ₹5,00,000 — needs Finance Controller approval before payment.",
                )
            self.ds.invoices.append(
                {
                    "id": f"INV-{seq:04d}",
                    "invoice_number": invoice_number,
                    "vendor_id": vendor["id"],
                    "po_number": po_number,
                    "invoice_date": invoice_date,
                    "due_date": invoice_date + timedelta(days=spec["terms"]),
                    "arrival_date": d.arrival,
                    "lines": d.inv_lines,
                    "subtotal": sub,
                    "tax_total": tax,
                    "total": money(tot + d.total_delta),
                    "bank_name": bank[0],
                    "account_number": bank[1],
                    "ifsc": bank[2],
                    "source": "erp",
                    "status": "pending",
                    "truth": d.truth,
                }
            )

    def run(self) -> Dataset:
        self.build_vendors()
        self.build_drafts()
        self.materialise()
        return self.ds


def generate(seed: int, start: date, days: int) -> Dataset:
    return Generator(seed, start, days).run()


def arrival_datetime(d: date, index: int) -> datetime:
    return datetime.combine(d, time(9, 0)) + timedelta(minutes=7 * index)
