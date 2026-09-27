"""Recompute the open cases' recommendations for a demo stage and re-save its snapshot.

Use after changing recommendation logic, without re-running the whole build.
Run: uv run python -m scripts.refresh_stage twist [week8 ...]
"""

import argparse
import asyncio

from sqlmodel import Session, col, select

from app.db import get_engine, get_state
from app.memory.store import get_memory
from app.models import ExceptionCase
from app.services import demo
from app.services.cases import get_cases


async def refresh(stage: str) -> None:
    demo.restore(stage)
    with Session(get_engine()) as s:
        bank = get_state(s, "bank_id")
        ids = [
            c.id
            for c in s.exec(
                select(ExceptionCase).where(ExceptionCase.status == "open").order_by(col(ExceptionCase.id))
            ).all()
        ]
    for cid in ids:
        on = await get_cases().recommend_case(cid, force=True, mem_on=True)
        await get_cases().recommend_case(cid, force=True, mem_on=False)
        print(
            f"  {cid}: {on.action.value} {on.confidence} {on.source.value} cites={[c.kind.value for c in on.citations]}"
        )
    await get_cases().drain()
    demo.snapshot(stage, bank)
    print(f"{stage}: refreshed {len(ids)} open cases, snapshot saved")


async def main(stages: list[str]) -> None:
    for st in stages:
        await refresh(st)
    demo.restore("day1")
    await get_memory().close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("stages", nargs="+", choices=[s for s, *_ in demo.STAGES])
    asyncio.run(main(p.parse_args().stages))
