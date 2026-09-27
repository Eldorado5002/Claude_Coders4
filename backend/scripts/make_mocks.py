"""Write docs/mocks/*.json from the real Pydantic schemas so mocks can never drift from the API.

Run: uv run python scripts/make_mocks.py
"""

import json
import math
from datetime import date, datetime, timedelta
from pathlib import Path

from app import schemas as s

OUT = Path(__file__).resolve().parents[2] / "docs" / "mocks"

BUYER_BANK = s.BankAccount(bank_name="HDFC Bank", account_number="XXXXXX4521", ifsc="HDFC0001234")
BALAJI = s.VendorRef(
    id="V001",
    name="Shree Balaji Steel Traders Pvt Ltd",
    gstin="36AAECS4821K1Z3",
    city="Hyderabad",
    category="raw_materials",
)
KAVERI = s.VendorRef(
    id="V004", name="Kaveri Packaging Industries", gstin="29AAFFK7310M1ZP", city="Bengaluru", category="packaging"
)
GODAVARI = s.VendorRef(
    id="V003", name="Godavari Polymers LLP", gstin="37AAKFG2294Q1Z8", city="Rajahmundry", category="raw_materials"
)
DECCAN = s.VendorRef(
    id="V005", name="Deccan Freight Carriers", gstin="36AAJFD8812L1Z6", city="Hyderabad", category="logistics"
)


def line(no, sku, desc, hsn, qty, uom, price, tax):
    return s.LineItem(
        line_no=no,
        sku=sku,
        description=desc,
        hsn=hsn,
        qty=qty,
        uom=uom,
        unit_price=price,
        tax_rate=tax,
        amount=round(qty * price, 2),
    )


def totals(lines):
    sub = round(sum(l.amount for l in lines), 2)
    tax = round(sum(l.amount * l.tax_rate / 100 for l in lines), 2)
    return sub, tax, round(sub + tax, 2)


po_lines = [
    line(1, "MS-PL-10", "MS Plate 10mm IS2062 E250", "7208", 2.0, "MT", 58000, 18),
    line(2, "MS-ANG-50", "MS Angle 50x50x6mm", "7216", 1.5, "MT", 56500, 18),
]
inv_lines = [*po_lines, line(3, None, "Freight charges - Medchal to Unit 2", "996511", 1, "trip", 3850, 18)]
po_sub, po_tax, po_total = totals(po_lines)
inv_sub, inv_tax, inv_total = totals(inv_lines)

citations = [
    s.Citation(
        id="mem_7f3a91",
        kind=s.CitationKind.OBSERVATION,
        text="Shree Balaji Steel bills freight separately on the last invoice line; the AP team approves it when freight is under ₹5,000 per trip.",
        occurred_at=datetime(2026, 3, 12, 11, 20),
        exception_id="EXC-0007",
    ),
    s.Citation(
        id="mem_2c18e0",
        kind=s.CitationKind.WORLD,
        text="On 2 Mar 2026 Priya approved invoice SBST/2526/1184 from Shree Balaji Steel with a ₹3,850 freight line: 'standing agreement allows freight up to ₹5,000 per trip'.",
        occurred_at=datetime(2026, 3, 2, 10, 5),
        exception_id="EXC-0001",
    ),
    s.Citation(
        id="dir_bank_change",
        kind=s.CitationKind.DIRECTIVE,
        text="Never recommend approving an invoice whose bank account differs from the vendor master; escalate for callback verification.",
    ),
]

autonomy_v001 = s.AutonomyState(
    vendor_id="V001",
    vendor_name=BALAJI.name,
    exception_type=s.ExceptionType.FREIGHT_CHARGE,
    level=s.AutonomyLevel.SUGGEST,
    streak=2,
    required_streak=3,
    accepted=2,
    overruled=1,
    auto_resolved=0,
    updated_at=datetime(2026, 3, 12, 11, 20),
)

rec = s.Recommendation(
    action=s.Action.APPROVE,
    confidence=0.91,
    adjusted_amount=None,
    rationale="Freight of ₹4,200 is on the last line and under the ₹5,000 per-trip cap this vendor has always been approved for (3 precedents). Materials match PO and GRN exactly.",
    citations=citations[:2],
    source=s.RecSource.MEMORY,
    anomaly_score=0.12,
    auto_resolved=False,
    provider="hindsight-reflect",
    latency_ms=2140,
    generated_at=datetime(2026, 3, 18, 9, 30),
)

detail = s.ExceptionDetail(
    id="EXC-0012",
    status=s.CaseStatus.OPEN,
    primary_type=s.ExceptionType.FREIGHT_CHARGE,
    issue_types=[s.ExceptionType.FREIGHT_CHARGE],
    vendor=BALAJI,
    invoice_number="SBST/2526/1231",
    invoice_total=inv_total,
    amount_at_risk=4543.0,
    created_at=datetime(2026, 3, 18, 9, 30),
    recommended_action=s.Action.APPROVE,
    confidence=0.91,
    autonomy_level=s.AutonomyLevel.SUGGEST,
    blocking=False,
    invoice=s.InvoiceDoc(
        id="INV-0094",
        invoice_number="SBST/2526/1231",
        vendor_id="V001",
        po_number="PO-2026-0081",
        invoice_date=date(2026, 3, 17),
        due_date=date(2026, 5, 1),
        lines=inv_lines,
        subtotal=inv_sub,
        tax_total=inv_tax,
        total=inv_total,
        bank_account=BUYER_BANK,
    ),
    purchase_order=s.PurchaseOrderDoc(
        po_number="PO-2026-0081",
        vendor_id="V001",
        po_date=date(2026, 3, 9),
        lines=po_lines,
        subtotal=po_sub,
        tax_total=po_tax,
        total=po_total,
    ),
    goods_receipt=s.GoodsReceiptDoc(
        grn_number="GRN-2026-0077",
        po_number="PO-2026-0081",
        received_date=date(2026, 3, 16),
        lines=[
            s.GrnLine(line_no=1, sku="MS-PL-10", description="MS Plate 10mm IS2062 E250", qty_received=2.0, uom="MT"),
            s.GrnLine(line_no=2, sku="MS-ANG-50", description="MS Angle 50x50x6mm", qty_received=1.5, uom="MT"),
        ],
    ),
    vendor_bank_on_file=BUYER_BANK,
    issues=[
        s.Issue(
            type=s.ExceptionType.FREIGHT_CHARGE,
            message="Line 3 'Freight charges' (₹3,850 + GST) is not on the purchase order.",
            line_no=3,
            expected=0,
            actual=3850,
            variance_amount=4543.0,
            variance_pct=2.06,
            blocking=False,
        )
    ],
    recommendation=rec,
    resolution=None,
    autonomy=autonomy_v001,
)


def summary(d: s.ExceptionDetail) -> s.ExceptionSummary:
    return s.ExceptionSummary(**d.model_dump(include=set(s.ExceptionSummary.model_fields)))


queue = [
    summary(detail),
    s.ExceptionSummary(
        id="EXC-0013",
        status=s.CaseStatus.OPEN,
        primary_type=s.ExceptionType.TAX_MISMATCH,
        issue_types=[s.ExceptionType.TAX_MISMATCH],
        vendor=KAVERI,
        invoice_number="KPI/26/0419",
        invoice_total=96_180.0,
        amount_at_risk=10_530.0,
        created_at=datetime(2026, 3, 18, 10, 2),
        recommended_action=s.Action.HOLD,
        confidence=0.88,
        autonomy_level=s.AutonomyLevel.SUGGEST,
        blocking=False,
    ),
    s.ExceptionSummary(
        id="EXC-0014",
        status=s.CaseStatus.OPEN,
        primary_type=s.ExceptionType.BANK_DETAILS_CHANGED,
        issue_types=[s.ExceptionType.BANK_DETAILS_CHANGED],
        vendor=DECCAN,
        invoice_number="DFC/0932",
        invoice_total=44_625.0,
        amount_at_risk=44_625.0,
        created_at=datetime(2026, 3, 18, 11, 40),
        recommended_action=s.Action.ESCALATE,
        confidence=0.99,
        autonomy_level=s.AutonomyLevel.LOCKED,
        blocking=True,
    ),
    s.ExceptionSummary(
        id="EXC-0011",
        status=s.CaseStatus.AUTO_RESOLVED,
        primary_type=s.ExceptionType.ROUNDING_DIFFERENCE,
        issue_types=[s.ExceptionType.ROUNDING_DIFFERENCE],
        vendor=DECCAN,
        invoice_number="DFC/0927",
        invoice_total=31_864.0,
        amount_at_risk=4.0,
        created_at=datetime(2026, 3, 17, 16, 15),
        recommended_action=s.Action.APPROVE,
        confidence=0.95,
        autonomy_level=s.AutonomyLevel.AUTO,
        blocking=False,
    ),
    s.ExceptionSummary(
        id="EXC-0010",
        status=s.CaseStatus.RESOLVED,
        primary_type=s.ExceptionType.QUANTITY_VARIANCE,
        issue_types=[s.ExceptionType.QUANTITY_VARIANCE],
        vendor=GODAVARI,
        invoice_number="GP/1123",
        invoice_total=2_31_520.0,
        amount_at_risk=6_945.6,
        created_at=datetime(2026, 3, 16, 14, 0),
        recommended_action=s.Action.APPROVE_ADJUSTED,
        confidence=0.82,
        autonomy_level=s.AutonomyLevel.SUGGEST,
        blocking=False,
    ),
]

resolve_result = s.ResolveResult(
    exception=detail.model_copy(
        update={
            "status": s.CaseStatus.RESOLVED,
            "resolution": s.Resolution(
                decision=s.Action.APPROVE,
                reason="Freight under ₹5,000 as per standing agreement with Balaji.",
                resolved_by="Priya (AP)",
                resolved_at=datetime(2026, 3, 18, 9, 34),
                agent_action=s.Action.APPROVE,
                agreed_with_agent=True,
            ),
        }
    ),
    memory_id="EXC-0012",
    lesson="Shree Balaji Steel: freight up to ₹5,000 per trip on the last line is approved.",
    autonomy=autonomy_v001.model_copy(update={"streak": 3, "accepted": 3, "level": s.AutonomyLevel.AUTO}),
    promoted=True,
    demoted=False,
)

vendors = [
    s.VendorSummary(
        **BALAJI.model_dump(),
        state="Telangana",
        payment_terms_days=45,
        invoices_count=14,
        exceptions_count=11,
        open_exceptions=1,
        touchless_rate=0.45,
    ),
    s.VendorSummary(
        **GODAVARI.model_dump(),
        state="Andhra Pradesh",
        payment_terms_days=45,
        invoices_count=12,
        exceptions_count=5,
        open_exceptions=0,
        touchless_rate=0.2,
    ),
    s.VendorSummary(
        **KAVERI.model_dump(),
        state="Karnataka",
        payment_terms_days=30,
        invoices_count=10,
        exceptions_count=6,
        open_exceptions=1,
        touchless_rate=0.0,
    ),
    s.VendorSummary(
        **DECCAN.model_dump(),
        state="Telangana",
        payment_terms_days=15,
        invoices_count=18,
        exceptions_count=7,
        open_exceptions=1,
        touchless_rate=0.57,
    ),
]

profile = s.VendorProfile(
    **vendors[0].model_dump(),
    bank_account=BUYER_BANK,
    learned=citations[:1],
    playbook=(
        "### Shree Balaji Steel — AP playbook\n"
        "- **Freight** is billed on a separate last line. Approve when ≤ ₹5,000 per trip; hold above that.\n"
        "- Materials are usually billed exactly at PO price.\n"
        "- Bank details on file: HDFC Bank XXXXXX4521. Any change needs a callback on the registered number."
    ),
    recent=[queue[0]],
    autonomy=[autonomy_v001],
)

start = date(2026, 3, 2)
weeks = []
accept = []
for w in range(1, 27):
    on = round(min(0.78, 0.05 + 0.73 * (1 - math.exp(-(w - 1) / 6.5))), 3)
    off = round(0.08 + 0.01 * math.sin(w), 3)
    weeks.append(s.WeeklyPoint(week=w, week_start=start + timedelta(weeks=w - 1), memory_on=on, memory_off=off))
    accept.append(
        s.WeeklyPoint(
            week=w,
            week_start=start + timedelta(weeks=w - 1),
            memory_on=round(min(0.95, 0.3 + 0.65 * (1 - math.exp(-(w - 1) / 5))), 3),
            memory_off=round(0.28 + 0.02 * math.cos(w), 3),
        )
    )

metrics = s.Metrics(
    kpis=s.Kpis(
        touchless_rate=0.62,
        acceptance_rate=0.9,
        exceptions_total=131,
        auto_resolved=58,
        blocked_by_controls=9,
        false_approvals=0,
        memories=412,
        minutes_saved=1310.0,
    ),
    touchless_by_week=weeks,
    acceptance_by_week=accept,
    by_type=[
        s.TypeBreakdown(type=s.ExceptionType.FREIGHT_CHARGE, count=34, touchless_rate=0.74),
        s.TypeBreakdown(type=s.ExceptionType.PRICE_VARIANCE, count=27, touchless_rate=0.52),
        s.TypeBreakdown(type=s.ExceptionType.QUANTITY_VARIANCE, count=22, touchless_rate=0.55),
        s.TypeBreakdown(type=s.ExceptionType.ROUNDING_DIFFERENCE, count=19, touchless_rate=0.95),
        s.TypeBreakdown(type=s.ExceptionType.TAX_MISMATCH, count=12, touchless_rate=0.0),
        s.TypeBreakdown(type=s.ExceptionType.MISSING_PO, count=8, touchless_rate=0.63),
        s.TypeBreakdown(type=s.ExceptionType.BANK_DETAILS_CHANGED, count=3, touchless_rate=0.0),
        s.TypeBreakdown(type=s.ExceptionType.DUPLICATE_INVOICE, count=3, touchless_rate=0.0),
        s.TypeBreakdown(type=s.ExceptionType.NEW_VENDOR, count=1, touchless_rate=0.0),
        s.TypeBreakdown(type=s.ExceptionType.OVER_THRESHOLD, count=2, touchless_rate=0.0),
    ],
    assumptions=[
        "Touchless = exceptions resolved by the agent with no human action.",
        "Minutes saved assumes 7 min per manual exception, 1 min to confirm an accepted recommendation.",
    ],
)

stages = [
    s.DemoStage(id="day1", label="Day 1", description="Fresh agent, no memory", sim_date=start, reached=True),
    s.DemoStage(
        id="week3",
        label="Week 3",
        description="Agent recalls precedents",
        sim_date=start + timedelta(days=16),
        reached=True,
    ),
    s.DemoStage(
        id="week8", label="Week 8", description="Earned autonomy", sim_date=start + timedelta(days=51), reached=False
    ),
    s.DemoStage(
        id="twist", label="The twist", description="Controls hold", sim_date=start + timedelta(days=56), reached=False
    ),
]

MOCKS = {
    "health.json": s.Health(status="ok", hindsight="up", memory_enabled=True, sim_date=date(2026, 3, 18)),
    "settings.json": s.Settings(
        memory_enabled=True,
        bank_id="precedent-ap",
        llm_chain=[
            "groq:openai/gpt-oss-120b",
            "gemini:gemini-3.1-flash-lite",
            "nvidia:nvidia/nemotron-3-super-120b-a12b",
        ],
        sim_date=date(2026, 3, 18),
        stage="week3",
    ),
    "exceptions.json": s.Page[s.ExceptionSummary](items=queue, total=len(queue)),
    "exception-detail.json": detail,
    "resolve-result.json": resolve_result,
    "vendors.json": vendors,
    "vendor-profile.json": profile,
    "autonomy.json": [
        autonomy_v001,
        s.AutonomyState(
            vendor_id="V005",
            vendor_name=DECCAN.name,
            exception_type=s.ExceptionType.ROUNDING_DIFFERENCE,
            level=s.AutonomyLevel.AUTO,
            streak=4,
            required_streak=3,
            accepted=4,
            overruled=0,
            auto_resolved=2,
            updated_at=datetime(2026, 3, 17, 16, 15),
        ),
        s.AutonomyState(
            vendor_id="V004",
            vendor_name=KAVERI.name,
            exception_type=s.ExceptionType.TAX_MISMATCH,
            level=s.AutonomyLevel.SUGGEST,
            streak=1,
            required_streak=3,
            accepted=1,
            overruled=1,
            auto_resolved=0,
            updated_at=datetime(2026, 3, 11, 12, 0),
        ),
        s.AutonomyState(
            vendor_id="V005",
            vendor_name=DECCAN.name,
            exception_type=s.ExceptionType.BANK_DETAILS_CHANGED,
            level=s.AutonomyLevel.LOCKED,
            streak=0,
            required_streak=3,
            accepted=0,
            overruled=0,
            auto_resolved=0,
        ),
    ],
    "metrics.json": metrics,
    "memory-recent.json": [
        s.MemoryItem(
            id=c.id,
            kind=c.kind,
            text=c.text,
            vendor_id="V001",
            exception_type=s.ExceptionType.FREIGHT_CHARGE,
            occurred_at=c.occurred_at,
        )
        for c in citations[:2]
    ],
    "copilot-answer.json": s.CopilotAnswer(
        answer=(
            "We approve Shree Balaji Steel's freight line when it is **under ₹5,000 per trip** — this comes from the "
            "standing agreement Priya cited on 2 Mar. The one freight charge above the cap (₹7,400 on 30 Mar) was held."
        ),
        citations=citations[:2],
        latency_ms=3120,
    ),
    "demo-state.json": s.DemoState(stage="week3", sim_date=start + timedelta(days=16), busy=False, stages=stages),
    "capture-result.json": s.CaptureResult(
        status="exception",
        extracted=detail.invoice.model_copy(update={"source": "capture", "id": "INV-0301"}),
        vendor=BALAJI,
        exception_id="EXC-0140",
    ),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, obj in MOCKS.items():
        data = [o.model_dump(mode="json") for o in obj] if isinstance(obj, list) else obj.model_dump(mode="json")
        (OUT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    events = [
        {"event": "exception.created", "data": queue[0].model_dump(mode="json")},
        {"event": "exception.updated", "data": queue[3].model_dump(mode="json")},
        {"event": "memory.retained", "data": MOCKS["memory-recent.json"][0].model_dump(mode="json")},
        {"event": "autonomy.changed", "data": autonomy_v001.model_dump(mode="json")},
        {"event": "sim.changed", "data": MOCKS["demo-state.json"].model_dump(mode="json")},
    ]
    (OUT / "events.json").write_text(json.dumps(events, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(MOCKS) + 1} mocks to {OUT}")


if __name__ == "__main__":
    main()
