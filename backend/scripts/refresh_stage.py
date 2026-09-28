"""Recompute the open cases' recommendations for a demo stage and re-save its snapshot.

Use after changing recommendation logic, without re-running the whole build.
Run: uv run python -m scripts.refresh_stage twist [week8 ...]

--text-only rewrites stored recommendations to the current text formats without any model or
memory call, so the stage's story and costs don't change: hard-control wording ("Action forced to
X." plus what memory alone would have suggested), and no citations of unfinished Hindsight
summaries ("Generating content…").
"""

import argparse
import asyncio
import re

from sqlmodel import Session, col, select

from app.db import get_engine, get_state
from app.memory.store import get_memory, pending_text
from app.models import ExceptionCase
from app.services import demo
from app.services.cases import get_cases, precedent_decision

OLD_GUARDRAIL = re.compile(r"^Hard control: (?P<msg>.*?) Action: (?P<forced>\w+)\.(?P<rest>.*)$", re.S)


def drop_pending(rec: dict | None) -> dict | None:
    """An unfinished summary ('Generating content…') is not evidence."""
    if not rec:
        return rec
    cites = [
        c for c in rec.get("citations") or [] if not (c.get("kind") == "mental_model" and pending_text(c.get("text")))
    ]
    return rec if len(cites) == len(rec.get("citations") or []) else {**rec, "citations": cites}


def guardrail_text(rec: dict | None, said: str | None) -> dict | None:
    """Old 'Action: X.' wording -> 'Action forced to X.' (+ what memory alone would have suggested)."""
    rec = drop_pending(rec)
    if not rec or rec.get("source") != "guardrail":
        return rec
    m = OLD_GUARDRAIL.match(rec.get("rationale", ""))
    if not m:
        return rec
    forced = m["forced"]
    overridden = f" (Memory alone would have suggested {said}.)" if said and said != forced else ""
    return {**rec, "rationale": f"Hard control: {m['msg']} Action forced to {forced}.{overridden}{m['rest']}"}


def rewrite_text(stage: str) -> None:
    demo.restore(stage)
    n = 0
    with Session(get_engine()) as s:
        bank = get_state(s, "bank_id")
        for c in s.exec(select(ExceptionCase)).all():
            said = precedent_decision(s, c)
            variants = dict(c.rec_variants or {})
            new = {k: guardrail_text(v, said if k == "on" else None) for k, v in variants.items()}
            rec = guardrail_text(c.recommendation, said if c.memory_enabled_at_rec is not False else None)
            if new != variants or rec != c.recommendation:
                c.rec_variants, c.recommendation = new, rec
                s.add(c)
                n += 1
        s.commit()
    demo.snapshot(stage, bank)
    print(f"{stage}: rewrote {n} cases' recommendations, snapshot saved")


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


async def main(stages: list[str], text_only: bool) -> None:
    for st in stages:
        if text_only:
            rewrite_text(st)
        else:
            await refresh(st)
    demo.restore("day1")
    await get_memory().close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("stages", nargs="+", choices=[s for s, *_ in demo.STAGES])
    p.add_argument("--text-only", action="store_true", help="only rewrite hard-control wording; no API calls")
    a = p.parse_args()
    asyncio.run(main(a.stages, a.text_only))
