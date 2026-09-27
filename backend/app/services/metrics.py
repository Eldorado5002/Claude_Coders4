"""Dashboard numbers. KPIs come from the live database; the learning curve comes from the
replay evaluation (full 26-week timeline, memory ON vs OFF) when it has been run."""

import json
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

from sqlmodel import Session, select

from app.agent.autonomy import same_outcome
from app.config import BACKEND_DIR, get_settings
from app.models import ExceptionCase, Invoice
from app.schemas import Action, ExceptionType, Kpis, Metrics, TypeBreakdown, WeeklyPoint

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
    return Metrics(
        kpis=kpis,
        touchless_by_week=touch_series,
        acceptance_by_week=acc_series,
        by_type=breakdown,
        assumptions=assumptions,
    )
