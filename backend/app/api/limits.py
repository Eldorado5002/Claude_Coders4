"""Spend guards for the public demo.

Three actions cost money: asking the copilot (a Hindsight reflect, about $0.05), capturing an invoice (Gemini
vision), and re-running a recommendation (can be a reflect). On a public link each gets a daily cap, and every
visitor gets a small per-minute burst limit across them. Browsing, stage switches, resolving and revoking are free
and never limited.

All limits are 0 (off) by default, so local development and tests are unaffected; the hosted demo turns them on
with environment variables (see docs/DEPLOY.md). Counters live in memory, which is correct for the single
Cloud Run instance the demo runs on, and they reset at midnight UTC or on a restart.
"""

import time
from collections import defaultdict, deque
from datetime import UTC, date, datetime

from fastapi import HTTPException, Request

from app.config import get_settings

WHAT = {"ask": "questions to Precedent", "capture": "invoice captures", "rerun": "re-run recommendations"}

_day: date | None = None
_used: dict[str, int] = defaultdict(int)
_recent: dict[str, deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    """The visitor's address (Cloud Run puts it first in X-Forwarded-For)."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def reset() -> None:
    global _day
    _day = None
    _used.clear()
    _recent.clear()


def spend(kind: str):
    """FastAPI dependency: allow one paid action of `kind`, or answer 429 with a plain explanation."""

    async def guard(request: Request) -> None:
        global _day
        s = get_settings()
        cap = {"ask": s.daily_cap_ask, "capture": s.daily_cap_capture, "rerun": s.daily_cap_rerun}[kind]
        today = datetime.now(UTC).date()
        if _day != today:
            _day = today
            _used.clear()
        now = time.monotonic()
        recent = _recent[client_ip(request)]
        if s.per_visitor_per_minute:
            while recent and now - recent[0] > 60:
                recent.popleft()
            if len(recent) >= s.per_visitor_per_minute:
                raise HTTPException(429, "Easy there: please wait a minute before the next paid demo action.")
        if cap and _used[kind] >= cap:
            raise HTTPException(
                429,
                f"Demo limit reached for today: {cap} {WHAT[kind]}. Everything else still works, "
                "and the limit resets at midnight UTC.",
            )
        _used[kind] += 1
        if s.per_visitor_per_minute:
            recent.append(now)

    return guard
