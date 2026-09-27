"""Confidence calibration: turn the model's stated confidence into an honest probability.

Models say "1.00" far too often. We bin past memory-backed recommendations by stated
confidence and measure how often each bin actually matched the verified decision, with a
Beta(1,1) prior so small bins are not over-trusted. Expected calibration error (ECE) reports
how far stated confidence is from reality.
"""

from sqlmodel import Session

from app.agent.certify import verified_decisions
from app.schemas import Calibration, CalibrationBin

EDGES = (0.0, 0.5, 0.7, 0.85, 0.95, 1.01)
MIN_BIN = 5


def _bin(conf: float) -> int:
    return next(i for i in range(len(EDGES) - 1) if EDGES[i] <= conf < EDGES[i + 1])


def calibration(session: Session) -> Calibration:
    records = verified_decisions(session)
    n_all = len(records)
    pooled = (sum(r.correct for r in records) + 1) / (n_all + 2)
    bins = []
    ece = 0.0
    for i in range(len(EDGES) - 1):
        sel = [r for r in records if _bin(r.confidence) == i]
        n = len(sel)
        hits = sum(r.correct for r in sel)
        stated = sum(r.confidence for r in sel) / n if n else None
        actual = (hits + 1) / (n + 2) if n >= MIN_BIN else None
        if n:
            ece += n / n_all * abs((hits / n) - stated)
        bins.append(
            CalibrationBin(
                low=EDGES[i],
                high=min(EDGES[i + 1], 1.0),
                n=n,
                stated=round(stated, 3) if stated is not None else None,
                actual=round(actual, 3) if actual is not None else None,
            )
        )
    return Calibration(n=n_all, ece=round(ece, 4) if n_all else None, pooled_accuracy=round(pooled, 3), bins=bins)


def calibrate(conf: float, cal: Calibration) -> float:
    """Calibrated probability that this recommendation matches the clerk."""
    b = cal.bins[_bin(conf)]
    if b.actual is not None:
        return b.actual
    return cal.pooled_accuracy
