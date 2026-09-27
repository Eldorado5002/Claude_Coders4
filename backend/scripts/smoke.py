"""Live smoke test: seed, simulate N days on a scratch bank, print what the agent did.

Run: uv run python -m scripts.smoke --days 10
"""

import argparse
import asyncio
import logging
import time

from sqlmodel import Session, col, select

from app.data.seed import seed
from app.db import get_engine, set_state
from app.memory.store import get_memory
from app.models import Autonomy, ExceptionCase, Invoice
from app.services.sim import get_sim


async def main(days: int, bank: str) -> None:
    logging.basicConfig(level=logging.WARNING)
    seed()
    mem = get_memory()
    await mem.delete_bank(bank)
    with Session(get_engine()) as s:
        set_state(s, "bank_id", bank)
    t0 = time.time()

    async def show(day: int):
        print(f"  day {day} done at {time.time() - t0:.0f}s")

    await get_sim().advance_to(days, leave_last_open=False, on_day=show)
    with Session(get_engine()) as s:
        cases = s.exec(select(ExceptionCase).order_by(col(ExceptionCase.id))).all()
        print(f"\n{len(cases)} cases in {time.time() - t0:.0f}s")
        for c in cases:
            inv = s.get(Invoice, c.invoice_id)
            rec = c.recommendation or {}
            res = c.resolution or {}
            mark = "OK" if rec.get("action") == inv.truth["decision"] else "XX"
            print(
                f"{c.id} {inv.arrival_date} {c.vendor_id} {c.primary_type:20} truth={inv.truth['decision']:16} "
                f"rec={rec.get('action', '-'):16} {mark} conf={rec.get('confidence', 0):.2f} src={rec.get('source')} "
                f"{c.status:13} by={res.get('resolved_by', '')}"
            )
            if c.vendor_id == "V001":
                print(f"      rationale: {rec.get('rationale', '')[:200]}")
                print(f"      citations: {[(x['kind'], x['text'][:70]) for x in rec.get('citations', [])][:3]}")
        for a in s.exec(select(Autonomy).where(Autonomy.accepted + Autonomy.overruled > 0)).all():
            print(
                f"autonomy {a.id:30} {a.level:8} streak={a.streak} acc={a.accepted} over={a.overruled} auto={a.auto_resolved}"
            )
    await mem.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=10)
    p.add_argument("--bank", default="precedent-dev")
    a = p.parse_args()
    asyncio.run(main(a.days, a.bank))
