"""Certified autonomy: a statistical guarantee on wrong payments, not a rule of thumb.

Among memory-backed recommendations to PAY (approve / approve_adjusted) that a human has
verified, we measure how often paying was wrong. The exact Clopper-Pearson upper bound turns
k mistakes in n verified decisions into a guarantee: "the true wrong-payment rate is at most U
with 95% confidence". We pick the auto-approval confidence threshold with a fixed-sequence
("learn then test") search: start at the strictest threshold and relax it only while the bound
stays under the target, so testing several thresholds does not inflate the error rate.

Status
  collecting  not enough verified decisions yet -> strict provisional threshold (0.95) + per-pair ladder
  certified   a threshold passed -> auto-approve only at or above it
  paused      enough evidence but even the strictest threshold fails -> autonomy switched off (circuit breaker)
"""

from dataclasses import dataclass

from scipy.stats import beta
from sqlmodel import Session, select

from app.agent.autonomy import MONEY_OUT, same_outcome
from app.models import ExceptionCase
from app.schemas import Action, AutonomyCertificate, CertificateRow

TARGET = 0.05  # maximum acceptable wrong-payment rate
DELTA = 0.05  # 95% confidence
N_MIN = 30  # never certify on fewer verified decisions
GRID = (0.99, 0.95, 0.9, 0.85, 0.8, 0.75)
PROVISIONAL = 0.95


@dataclass
class Verified:
    confidence: float
    action: str
    correct: bool
    auto: bool


def cp_upper(k: int, n: int, delta: float = DELTA) -> float:
    """Exact one-sided Clopper-Pearson upper bound for a binomial proportion."""
    if n == 0 or k >= n:
        return 1.0
    return float(beta.ppf(1 - delta, k + 1, n - k))


def verified_decisions(session: Session) -> list[Verified]:
    out = []
    for c in session.exec(select(ExceptionCase)).all():
        rec, res = c.recommendation or {}, c.resolution or {}
        if rec.get("source") != "memory" or not res or res.get("revoked_at"):
            continue
        auto = bool(rec.get("auto_resolved"))
        by_human = not str(res.get("resolved_by", "")).startswith("Precedent")
        if not (by_human or res.get("audited")):  # an unaudited auto-resolution is not evidence
            continue
        out.append(
            Verified(float(rec.get("confidence", 0)), rec["action"], same_outcome(rec["action"], res["decision"]), auto)
        )
    return out


def certificate(session: Session) -> AutonomyCertificate:
    records = verified_decisions(session)
    pays = [r for r in records if Action(r.action) in MONEY_OUT]
    rows, certified = [], None
    for tau in GRID:
        sel = [r for r in pays if r.confidence >= tau]
        n, k = len(sel), sum(not r.correct for r in sel)
        ucb = cp_upper(k, n)
        ok = n >= N_MIN and ucb <= TARGET
        rows.append(CertificateRow(threshold=tau, decisions=n, errors=k, upper_bound=round(ucb, 4), certified=ok))
        if not ok:
            break
        certified = tau

    strict = next((r for r in rows if r.threshold == PROVISIONAL), rows[0])
    if certified is not None:
        status, threshold = "certified", certified
    elif strict.decisions >= N_MIN:
        status, threshold = "paused", None
    else:
        status, threshold = "collecting", PROVISIONAL

    autos = [r for r in records if r.auto]
    k_auto = sum(not r.correct for r in autos)
    head = next((r for r in rows if r.threshold == threshold), strict)
    if status == "certified":
        explain = (
            f"Of {head.decisions} verified pay recommendations at confidence ≥ {threshold:.2f}, {head.errors} were "
            f"wrong. With 95% confidence the true wrong-payment rate is at most {head.upper_bound:.1%} "
            f"(target {TARGET:.0%}), so auto-approval is allowed at or above {threshold:.2f}."
        )
    elif status == "collecting":
        explain = (
            f"{strict.decisions} verified pay recommendations so far; {N_MIN} are needed before the bound can be "
            f"certified. Until then autonomy runs in strict provisional mode (confidence ≥ {PROVISIONAL:.2f} and an "
            "earned per-vendor streak)."
        )
    else:
        explain = (
            f"Even at confidence ≥ {PROVISIONAL:.2f} the wrong-payment bound is {strict.upper_bound:.1%}, above the "
            f"{TARGET:.0%} target. Auto-approval is paused until the evidence improves."
        )
    return AutonomyCertificate(
        status=status,
        target_error=TARGET,
        confidence_level=1 - DELTA,
        threshold=threshold,
        decisions=head.decisions,
        errors=head.errors,
        error_upper_bound=head.upper_bound,
        auto_resolutions=len(autos),
        auto_errors=k_auto,
        auto_error_upper_bound=round(cp_upper(k_auto, len(autos)), 4),
        table=rows,
        explanation=explain,
    )
