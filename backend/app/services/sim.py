"""Simulated clock + simulated AP clerk.

Each simulated day: invoices arrive -> 3-way match -> recommendations (in parallel) ->
the clerk audits auto-resolutions and resolves open cases using the ground truth ->
memory writes finish before the next day starts, so tomorrow's agent knows today's lessons.
"""

import asyncio
import hashlib
import logging
from datetime import timedelta

from sqlmodel import Session, col, select

from app.agent.autonomy import same_outcome
from app.config import get_settings
from app.db import get_engine, get_state, set_state
from app.models import ExceptionCase, Invoice
from app.schemas import Action, CaseStatus, ResolveRequest
from app.services.cases import CaseService, get_cases
from app.services.events import bus

log = logging.getLogger("precedent.sim")


def _minutes(case_id: str, lo: int, hi: int) -> int:
    h = int(hashlib.md5(case_id.encode()).hexdigest(), 16)
    return lo + h % (hi - lo)


class Simulator:
    def __init__(self, cases: CaseService | None = None, concurrency: int = 4):
        self.cases = cases or get_cases()
        self.sem = asyncio.Semaphore(concurrency)
        self.busy = False

    def current_day(self) -> int:
        with Session(get_engine()) as session:
            return int(get_state(session, "sim_day", -1))

    async def _recommend(self, cid: str) -> None:
        async with self.sem:
            try:
                await self.cases.recommend_case(cid)
            except Exception as e:  # noqa: BLE001
                log.error("recommend %s failed: %s", cid, e)

    def _truth(self, session: Session, case: ExceptionCase) -> dict:
        return session.get(Invoice, case.invoice_id).truth

    async def clerk_resolve(self, case_ids: list[str] | None = None) -> int:
        """Resolve open cases the way the (simulated) clerk would. Also audits auto-resolutions."""
        with Session(get_engine()) as session:
            q = select(ExceptionCase).where(col(ExceptionCase.status).in_([CaseStatus.OPEN, CaseStatus.AUTO_RESOLVED]))
            if case_ids is not None:
                q = q.where(col(ExceptionCase.id).in_(case_ids))
            rows = session.exec(q.order_by(col(ExceptionCase.id))).all()
            todo = []
            for c in rows:
                truth = self._truth(session, c)
                if c.status == CaseStatus.AUTO_RESOLVED:
                    if c.resolution and same_outcome(c.resolution.get("decision"), truth["decision"]):
                        if not c.resolution.get("audited"):
                            c.resolution = {**c.resolution, "audited": True}
                            session.add(c)
                        continue  # audit passed
                    reason = f"Audit override: {truth['reason']}"
                else:
                    reason = truth["reason"]
                todo.append((c.id, c.created_at, truth, reason))
            session.commit()
        n = 0
        for cid, created, truth, reason in todo:
            req = ResolveRequest(
                decision=Action(truth["decision"]),
                reason=reason,
                adjusted_amount=truth.get("adjusted_amount"),
                resolved_by=truth.get("clerk") or "AP Clerk",
            )
            await self.cases.resolve(cid, req, now=created + timedelta(minutes=_minutes(cid, 25, 240)))
            n += 1
        return n

    async def run_day(self, day: int, *, clerk: bool) -> list[str]:
        ids = self.cases.process_arrivals(day)
        await asyncio.gather(*(self._recommend(cid) for cid in ids))
        if clerk and ids:
            await self.clerk_resolve(ids)
        await self.cases.drain()
        with Session(get_engine()) as session:
            set_state(session, "sim_day", day)
        return ids

    async def advance_to(self, target: int, *, clerk: bool = True, leave_last_open: bool = True, on_day=None) -> None:
        self.busy = True
        try:
            if clerk:
                await self.clerk_resolve()  # anything left open from the previous stage
                await self.cases.drain()
            start = self.current_day() + 1
            for day in range(start, target + 1):
                last = day == target
                await self.run_day(day, clerk=clerk and not (last and leave_last_open))
                if on_day:
                    await on_day(day)
        finally:
            self.busy = False
        bus.publish(
            "sim.changed", {"sim_day": target, "sim_date": str(get_settings().sim_start + timedelta(days=target))}
        )


_sim: Simulator | None = None


def get_sim() -> Simulator:
    global _sim
    if _sim is None:
        _sim = Simulator()
    return _sim
