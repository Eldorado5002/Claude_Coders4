"""Dashboard numbers. KPIs come from the live database; the learning curve comes from the
replay evaluation (full 26-week timeline, memory ON vs OFF) when it has been run."""

import json
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

from sqlmodel import Session, select

from app.agent.autonomy import same_outcome
from app.config import BACKEND_DIR, get_settings
from app.models import ExceptionCase, Invoice, Vendor
from app.schemas import Action, ExceptionType, Kpis, Metrics, Performance, TypeBreakdown, WeeklyPoint

EVAL_FILE = BACKEND_DIR / "data" / "eval.json"
MANUAL_MIN, CONFIRM_MIN = 7.0, 1.0
MONEY_OUT = {Action.APPROVE.value, Action.APPROVE_ADJUSTED.value}


def case_outcome(case: ExceptionCase, truth: dict) -> dict:
    rec = case.recommendation or {}
    was_auto = bool(rec.get("auto_resolved"))
    touchless = case.status == "auto_resolved"
    res = case.resolution or {}
    decided = case.status == "resolved" and bool(rec) and res.get("resolved_by", "") != "Precedent (auto)"
    agreed = decided and same_outcome(rec.get("action"), res.get("decision"))
    false_approval = was_auto and rec.get("action") in MONEY_OUT and truth.get("decision") not in MONEY_OUT
    correct = same_outcome(rec.get("action"), truth.get("decision"))
    return {
        "touchless": touchless,
        "was_auto": was_auto,
        "decided": decided,
        "agreed": agreed,
        "false_approval": false_approval,
        "correct": correct,
    }


TYPE_WORDS = {
    "freight_charge": ("freight", "surcharge"),
    "price_variance": ("price", "rate", "escalation"),
    "quantity_variance": ("quantity", "qty", "short", "received", "shipped", "dispatch"),
    "tax_mismatch": ("gst", "tax"),
    "rounding_difference": ("rounding",),
    "missing_po": ("purchase order", "no po", "no-po", "without a po", "utility", "monthly bill"),
    "duplicate_invoice": ("duplicate",),
    "bank_details_changed": ("bank",),
    "new_vendor": ("new vendor", "kyc", "onboard"),
    "over_threshold": ("5,00,000", "approval limit", "controller"),
}
MEMORY_KINDS = {"world", "experience", "observation"}


def citation_relevance(cases: list[ExceptionCase], vendor_names: dict[str, str]) -> float | None:
    """Share of cited memories that refer to the same vendor or the same exception type."""
    total = hits = 0
    for c in cases:
        rec = c.recommendation or {}
        if rec.get("source") != "memory":
            continue
        name = " ".join(vendor_names.get(c.vendor_id, "").lower().split()[:2])
        words = [w for t in c.issue_types for w in TYPE_WORDS.get(t, ())]
        for cit in rec.get("citations", []):
            if cit.get("kind") not in MEMORY_KINDS:
                continue
            total += 1
            text = cit.get("text", "").lower()
            if (name and name in text) or c.vendor_id.lower() in text or any(w in text for w in words):
                hits += 1
    return round(hits / total, 3) if total else None


def weekly(session: Session) -> dict[int, dict]:
    s = get_settings()
    out: dict[int, dict] = defaultdict(lambda: {"n": 0, "touchless": 0, "correct": 0, "false": 0})
    for case in session.exec(select(ExceptionCase)).all():
        inv = session.get(Invoice, case.invoice_id)
        o = case_outcome(case, inv.truth)
        week = (inv.arrival_date - s.sim_start).days // 7 + 1
        w = out[week]
        w["n"] += 1
        w["touchless"] += o["touchless"]
        w["correct"] += o["correct"]
        w["false"] += o["false_approval"]
    return out


def load_eval() -> dict | None:
    if EVAL_FILE.exists():
        return json.loads(EVAL_FILE.read_text(encoding="utf-8"))
    return None


def save_eval(data: dict) -> None:
    Path(EVAL_FILE).parent.mkdir(parents=True, exist_ok=True)
    EVAL_FILE.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")


def open_msme_at_risk(session: Session, cases: list[ExceptionCase]) -> list:
    from app.services.cases import case_msme, sim_date

    today = sim_date(session)
    out = []
    for c in cases:
        if c.status != "open":
            continue
        m = case_msme(session, c, today)
        if m and m.status != "ok":
            out.append(m)
    return out


def performance(cases: list[ExceptionCase]) -> Performance:
    recs = [c.recommendation for c in cases if c.recommendation]
    lat = sorted(int(r.get("latency_ms") or 0) for r in recs if r.get("latency_ms"))
    costs = [float(r["cost_usd"]) for r in recs if r.get("cost_usd") is not None]

    def pct(p: float) -> int | None:
        return lat[min(len(lat) - 1, int(round(p * (len(lat) - 1))))] if lat else None

    avg = sum(costs) / len(costs) if costs else None
    return Performance(
        recommendations=len(recs),
        fast_share=round(sum(1 for r in recs if r.get("route") == "fast") / len(recs), 3) if recs else 0.0,
        latency_p50_ms=pct(0.5),
        latency_p95_ms=pct(0.95),
        avg_cost_usd=round(avg, 5) if avg is not None else None,
        cost_per_1000_exceptions_usd=round(avg * 1000, 2) if avg is not None else None,
    )


def compute_metrics(session: Session, memories: int) -> Metrics:
    s = get_settings()
    cases = session.exec(select(ExceptionCase)).all()
    outcomes = []
    by_type: dict[str, list[dict]] = defaultdict(list)
    for c in cases:
        o = case_outcome(c, session.get(Invoice, c.invoice_id).truth)
        outcomes.append((c, o))
        by_type[c.primary_type].append(o)

    total = len(cases)
    touchless = sum(o["touchless"] for _, o in outcomes)
    msme_risky = open_msme_at_risk(session, cases)
    decided = [o for _, o in outcomes if o["decided"]]
    accepted = sum(o["agreed"] for o in decided)
    kpis = Kpis(
        touchless_rate=round(touchless / total, 3) if total else 0.0,
        acceptance_rate=round(accepted / len(decided), 3) if decided else None,
        exceptions_total=total,
        auto_resolved=touchless,
        blocked_by_controls=sum(1 for c, _ in outcomes if c.blocking),
        false_approvals=sum(o["false_approval"] for _, o in outcomes),
        memories=memories,
        minutes_saved=round(touchless * MANUAL_MIN + accepted * (MANUAL_MIN - CONFIRM_MIN), 1),
        citation_relevance=citation_relevance(cases, {v.id: v.name for v in session.exec(select(Vendor)).all()}),
        lessons_revoked=sum(1 for c in cases if (c.resolution or {}).get("revoked_at")),
        msme_open_at_risk=len(msme_risky),
        msme_tax_at_risk=round(sum(m.tax_at_risk for m in msme_risky), 2),
    )

    ev = load_eval()
    touch_series: list[WeeklyPoint] = []
    acc_series: list[WeeklyPoint] = []
    if ev:
        for row in ev["weeks"]:
            touch_series.append(
                WeeklyPoint(
                    week=row["week"],
                    week_start=row["week_start"],
                    memory_on=row.get("touchless_on"),
                    memory_off=row.get("touchless_off"),
                )
            )
            acc_series.append(
                WeeklyPoint(
                    week=row["week"],
                    week_start=row["week_start"],
                    memory_on=row.get("correct_on"),
                    memory_off=row.get("correct_off"),
                )
            )
    else:
        for week, w in sorted(weekly(session).items()):
            start = s.sim_start + timedelta(weeks=week - 1)
            touch_series.append(
                WeeklyPoint(
                    week=week, week_start=start, memory_on=round(w["touchless"] / w["n"], 3) if w["n"] else None
                )
            )
            acc_series.append(
                WeeklyPoint(week=week, week_start=start, memory_on=round(w["correct"] / w["n"], 3) if w["n"] else None)
            )

    breakdown = [
        TypeBreakdown(
            type=ExceptionType(t), count=len(os), touchless_rate=round(sum(o["touchless"] for o in os) / len(os), 3)
        )
        for t, os in sorted(by_type.items(), key=lambda kv: -len(kv[1]))
    ]
    assumptions = [
        "Touchless = exceptions the agent resolved on its own under earned autonomy (no human action).",
        "Acceptance = the clerk's decision had the same payment outcome as the agent's recommendation (pay in full / pay adjusted / don't pay).",
        f"Minutes saved assumes {MANUAL_MIN:g} min per manual exception and {CONFIRM_MIN:g} min to confirm an "
        "accepted recommendation.",
        "Learning curve: replay of the full 26-week timeline; 'correct' = recommendation matched the ground-truth "
        "payment outcome. Memory OFF uses the same LLM with no Hindsight memory.",
    ]
    if ev:
        assumptions.append(f"Replay evaluation run on {ev.get('generated_at', '')[:10]}: {ev.get('summary', '')}")
    from app.agent.calibration import calibration
    from app.agent.certify import certificate

    return Metrics(
        certificate=certificate(session),
        calibration=calibration(session),
        performance=performance(cases),
        kpis=kpis,
        touchless_by_week=touch_series,
        acceptance_by_week=acc_series,
        by_type=breakdown,
        assumptions=assumptions,
    )
