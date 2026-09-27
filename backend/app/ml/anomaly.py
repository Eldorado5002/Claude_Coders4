"""Per-vendor anomaly score with IsolationForest.

Score = share of this vendor's past invoices that look *more normal* than this one,
so 0.95 reads as "more unusual than 95% of this vendor's history".
"""

import math
from statistics import median

import numpy as np
from sklearn.ensemble import IsolationForest

MIN_HISTORY = 5


def features(inv: dict, po_skus: set[str] | None = None) -> list[float]:
    lines = inv["lines"]
    off_po = [l for l in lines if not l.get("sku") or (po_skus is not None and l["sku"] not in po_skus)]
    sub = float(inv["subtotal"]) or 1.0
    return [
        math.log1p(float(inv["total"])),
        float(len(lines)),
        sum(float(l["amount"]) for l in off_po) / sub,
    ]


def anomaly_score(history: list[dict], current: dict) -> tuple[float | None, float | None]:
    """Return (score 0..1, median historical total). None when history is too short."""
    if len(history) < MIN_HISTORY:
        return None, (median(float(h["total"]) for h in history) if history else None)
    X = np.array([features(h) for h in history])
    x = np.array([features(current)])
    model = IsolationForest(n_estimators=100, contamination="auto", random_state=7).fit(X)
    hist_scores = model.score_samples(X)  # higher = more normal
    cur = model.score_samples(x)[0]
    score = float((hist_scores > cur).mean())
    return round(score, 3), median(float(h["total"]) for h in history)
