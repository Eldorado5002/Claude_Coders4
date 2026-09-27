"""Benford's-law first-digit screening (forensic accounting).

Naturally occurring transaction amounts have leading digit d with probability log10(1 + 1/d).
Fabricated amounts drift away from it. We score conformity with the mean absolute deviation
(MAD) and Nigrini's first-digit thresholds. It is a screening signal, never proof, and needs
enough amounts to mean anything.
"""

import math
from collections import Counter

EXPECTED = [math.log10(1 + 1 / d) for d in range(1, 10)]
# Nigrini (2012), first-digit test
THRESHOLDS = [(0.006, "close"), (0.012, "acceptable"), (0.015, "marginal"), (math.inf, "nonconformity")]
MIN_N = 50


def first_digit(x: float) -> int | None:
    x = abs(float(x))
    if x < 1:
        return None
    while x >= 10:
        x /= 10
    return int(x)


def benford(amounts: list[float], min_n: int = MIN_N) -> dict:
    digits = [d for d in (first_digit(a) for a in amounts) if d]
    n = len(digits)
    counts = Counter(digits)
    observed = [round(counts[d] / n, 4) if n else 0.0 for d in range(1, 10)]
    result = {
        "n": n,
        "mad": None,
        "conformity": "insufficient data",
        "observed": observed,
        "expected": [round(e, 4) for e in EXPECTED],
    }
    if n >= min_n:
        mad = sum(abs(o - e) for o, e in zip(observed, EXPECTED, strict=True)) / 9
        result["mad"] = round(mad, 4)
        result["conformity"] = next(label for limit, label in THRESHOLDS if mad <= limit)
    return result
