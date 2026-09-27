"""Build the demo + evaluation (live Hindsight + LLMs; takes a while, run once).

  1. Memory ON: simulate the 26-week timeline with a fresh bank. At each demo stage
     (Day 1, Week 3, Week 8, Twist) snapshot the database and clone the bank.
  2. Memory OFF: replay the same timeline with the same LLMs and no memory.
  3. Write data/eval.json (weekly learning curve) and restore the Day 1 snapshot.

Run: uv run python -m scripts.build_demo [--skip-off]
"""

import argparse
import asyncio
import logging
import time
from datetime import datetime, timedelta

from sqlmodel import Session, col, select

from app.config import get_settings
from app.data.seed import seed
from app.db import get_engine, set_state
from app.memory.store import get_memory
from app.models import ExceptionCase
from app.services import demo
from app.services.cases import get_cases
from app.services.metrics import save_eval, weekly
from app.services.sim import get_sim

log = logging.getLogger("build")
T0 = time.time()


def say(msg: str) -> None:
    print(f"[{time.time() - T0:6.0f}s] {msg}", flush=True)


async def wait_clone(src: str, dst: str, timeout: float = 300) -> None:
    mem = get_memory()
    want = (await mem.client.alist_memories(src, limit=1)).total or 0
    deadline = time.time() + timeout
    while time.time() < deadline:
        await asyncio.sleep(5)
        try:
            got = (await mem.client.alist_memories(dst, limit=1)).total or 0
            if got >= want:
                say(f"  clone {dst} ready ({got} memories)")
                return
        except Exception:  # noqa: BLE001 — bank not created yet
            pass
    say(f"  WARNING clone {dst} not confirmed within {timeout:.0f}s")


def open_ids() -> list[str]:
    with Session(get_engine()) as s:
        return [
            c.id
            for c in s.exec(
                select(ExceptionCase).where(ExceptionCase.status == "open").order_by(col(ExceptionCase.id))
            ).all()
        ]


async def memory_on_run() -> dict[int, dict]:
    s = get_settings()
    mem, cases, sim = get_memory(), get_cases(), get_sim()
    main = s.hindsight_bank_id
    seed()
    for bank in [main, *(demo.stage_bank(st) for st, *_ in demo.STAGES)]:
        await mem.delete_bank(bank)
    with Session(get_engine()) as session:
        set_state(session, "bank_id", main)
        set_state(session, "memory_enabled", True)
    await mem.ensure_bank(main)

    async def progress(day: int) -> None:
        if day % 7 == 0:
            say(f"  day {day:3d} ({s.sim_start + timedelta(days=day)})")

    for stage, day, label, _ in demo.STAGES:
        say(f"memory ON -> {label} (day {day})")
        await sim.advance_to(day, on_day=progress)
        for cid in open_ids():  # memory-off variant so the live toggle is instant
            await cases.recommend_case(cid, mem_on=False)
        bank = demo.stage_bank(stage)
        if day == 0:
            await mem.ensure_bank(bank)
        else:
            await mem.client.aclone_bank(main, bank, include_data=True, include_bank_config=True)
            await wait_clone(main, bank)
        with Session(get_engine()) as session:
            set_state(session, "stage", stage)
        demo.snapshot(stage, bank)
        say(f"  snapshot {stage} saved -> bank {bank}")

    say("memory ON -> rest of timeline")
    await sim.advance_to(s.sim_days - 1, leave_last_open=False, on_day=progress)
    with Session(get_engine()) as session:
        return dict(weekly(session))


async def memory_off_run() -> dict[int, dict]:
    s = get_settings()
    cases, sim = get_cases(), get_sim()
    seed()
    with Session(get_engine()) as session:
        set_state(session, "memory_enabled", False)
    cases.retain_enabled = False
    try:
        say("memory OFF -> full timeline (same LLMs, no Hindsight)")
        await sim.advance_to(s.sim_days - 1, leave_last_open=False)
    finally:
        cases.retain_enabled = True
    with Session(get_engine()) as session:
        return dict(weekly(session))


def summarise(on: dict, off: dict) -> dict:
    s = get_settings()
    weeks = []
    for w in range(1, s.sim_days // 7 + 1):
        a, b = on.get(w, {"n": 0}), off.get(w, {"n": 0})
        weeks.append(
            {
                "week": w,
                "week_start": str(s.sim_start + timedelta(weeks=w - 1)),
                "exceptions": a["n"],
                "touchless_on": round(a["touchless"] / a["n"], 3) if a["n"] else None,
                "touchless_off": round(b["touchless"] / b["n"], 3) if b.get("n") else (0.0 if off else None),
                "correct_on": round(a["correct"] / a["n"], 3) if a["n"] else None,
                "correct_off": round(b["correct"] / b["n"], 3) if b.get("n") else None,
                "false_approvals_on": a.get("false", 0),
            }
        )

    def window(d: dict, lo: int, hi: int, key: str) -> float | None:
        n = sum(d.get(w, {}).get("n", 0) for w in range(lo, hi + 1))
        k = sum(d.get(w, {}).get(key, 0) for w in range(lo, hi + 1))
        return round(k / n, 3) if n else None

    # months 1-4 build memory, months 5-6 (weeks 18-26) are the measurement window
    m56 = {
        "touchless_on": window(on, 18, 26, "touchless"),
        "touchless_off": window(off, 18, 26, "touchless") if off else None,
        "correct_on": window(on, 18, 26, "correct"),
        "correct_off": window(off, 18, 26, "correct") if off else None,
        "false_approvals_on": sum(on.get(w, {}).get("false", 0) for w in range(1, 27)),
    }
    summary = (
        f"Months 5-6: agent correct {m56['correct_on']:.0%} with memory vs "
        f"{m56['correct_off']:.0%} without; touchless {m56['touchless_on']:.0%} vs {m56['touchless_off'] or 0:.0%}; "
        f"false approvals {m56['false_approvals_on']}."
        if off and m56["correct_on"] is not None and m56["correct_off"] is not None
        else f"Months 5-6 with memory: correct {m56['correct_on']}, touchless {m56['touchless_on']}."
    )
    return {"generated_at": datetime.now().isoformat(), "weeks": weeks, "months_5_6": m56, "summary": summary}


async def main(skip_off: bool) -> None:
    logging.basicConfig(level=logging.WARNING)
    on = await memory_on_run()
    off = {} if skip_off else await memory_off_run()
    ev = summarise(on, off)
    save_eval(ev)
    say(ev["summary"])
    demo.restore("day1")
    with Session(get_engine()) as session:
        set_state(session, "memory_enabled", True)
    say("restored Day 1 — demo ready")
    await get_memory().close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--skip-off", action="store_true", help="skip the memory-OFF baseline run")
    asyncio.run(main(p.parse_args().skip_off))
