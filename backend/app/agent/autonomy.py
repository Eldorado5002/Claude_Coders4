"""Earned autonomy per vendor × exception type.

suggest → auto after `required_streak` consecutive accepted recommendations.
Any overrule drops it back to suggest. Hard-control types are locked forever.
"Accepted" means the same payment outcome: pay in full, pay a corrected amount, or don't
pay (hold / escalate / reject are all "don't pay" — they differ in workflow, not money).
Auto-resolution also needs: memory-grounded recommendation, high confidence, no
blocking control, a normal anomaly score, and (for money-out actions) an amount
inside the envelope humans have already approved for this vendor × type.
"""

from datetime import datetime

from sqlmodel import Session, select

from app.config import get_settings
from app.models import Autonomy, ExceptionCase
from app.schemas import HARD_CONTROL_TYPES, Action, AutonomyLevel, AutonomyState, ExceptionType, RecSource

AUTO_ACTIONS = {Action.APPROVE, Action.APPROVE_ADJUSTED, Action.HOLD}
MONEY_OUT = {Action.APPROVE, Action.APPROVE_ADJUSTED}
ANOMALY_BLOCK = 0.9
OUTCOME = {
    Action.APPROVE: "pay",
    Action.APPROVE_ADJUSTED: "pay_adjusted",
    Action.HOLD: "no_pay",
    Action.ESCALATE: "no_pay",
    Action.REJECT: "no_pay",
}


def same_outcome(a: str | None, b: str | None) -> bool:
    return a is not None and b is not None and OUTCOME[Action(a)] == OUTCOME[Action(b)]


def autonomy_id(vendor_id: str, exc_type: str) -> str:
    return f"{vendor_id}:{exc_type}"


def get_or_create(session: Session, vendor_id: str, exc_type: str) -> Autonomy:
    row = session.get(Autonomy, autonomy_id(vendor_id, exc_type))
    if row is None:
        locked = ExceptionType(exc_type) in HARD_CONTROL_TYPES
        row = Autonomy(
            id=autonomy_id(vendor_id, exc_type),
            vendor_id=vendor_id,
            exception_type=exc_type,
            level=AutonomyLevel.LOCKED if locked else AutonomyLevel.SUGGEST,
        )
        session.add(row)
        session.flush()
    return row


def approved_envelope(session: Session, vendor_id: str, exc_type: str) -> float:
    """Largest amount_at_risk a human has approved for this vendor × type."""
    rows = session.exec(
        select(ExceptionCase).where(
            ExceptionCase.vendor_id == vendor_id,
            ExceptionCase.primary_type == exc_type,
            ExceptionCase.status == "resolved",
        )
    ).all()
    amounts = [
        c.amount_at_risk
        for c in rows
        if c.resolution and c.resolution.get("decision") in (Action.APPROVE, Action.APPROVE_ADJUSTED)
    ]
    return max(amounts, default=0.0)


def can_auto_resolve(row: Autonomy, rec: dict, case: ExceptionCase, envelope: float) -> bool:
    s = get_settings()
    action = Action(rec["action"])
    if row.level != AutonomyLevel.AUTO or case.blocking:
        return False
    if rec.get("source") != RecSource.MEMORY or action not in AUTO_ACTIONS:
        return False
    if float(rec.get("confidence", 0)) < s.autonomy_min_confidence:
        return False
    if (rec.get("anomaly_score") or 0) >= ANOMALY_BLOCK:
        return False
    return not (action in MONEY_OUT and case.amount_at_risk > envelope + 0.5)


def record_outcome(row: Autonomy, agent_action: str | None, human_action: str, when: datetime) -> tuple[bool, bool]:
    """Update the ladder after a human decision. Returns (promoted, demoted)."""
    required = get_settings().autonomy_required_streak
    promoted = demoted = False
    row.updated_at = when
    if agent_action is None:
        return promoted, demoted
    if same_outcome(agent_action, human_action):
        row.accepted += 1
        row.streak += 1
        if row.level == AutonomyLevel.SUGGEST and row.streak >= required:
            row.level = AutonomyLevel.AUTO
            promoted = True
    else:
        row.overruled += 1
        row.streak = 0
        if row.level == AutonomyLevel.AUTO:
            row.level = AutonomyLevel.SUGGEST
            demoted = True
    return promoted, demoted


def to_state(row: Autonomy, vendor_name: str) -> AutonomyState:
    return AutonomyState(
        vendor_id=row.vendor_id,
        vendor_name=vendor_name,
        exception_type=ExceptionType(row.exception_type),
        level=AutonomyLevel(row.level),
        streak=row.streak,
        required_streak=get_settings().autonomy_required_streak,
        accepted=row.accepted,
        overruled=row.overruled,
        auto_resolved=row.auto_resolved,
        updated_at=row.updated_at,
    )
