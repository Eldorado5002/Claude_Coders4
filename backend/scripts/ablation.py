"""Ablation study: which part of the memory actually does the work?

Twelve simulated weeks (60 exceptions). The live agent runs in hybrid mode exactly as in the
product: it recommends, earns autonomy, and the simulated clerk resolves or audits every case,
so the Hindsight bank fills with the same lessons a real team would teach. For every exception
we also ask five shadow variants, all reading the same bank at the same moment and all using
the same LLM, so the only thing that differs is how past decisions are retrieved:

  no_memory     the LLM alone, no past decisions
  rag           plain vector search over past resolution texts (Gemini embeddings)
  recall_facts  Hindsight recall, raw facts only
  recall        Hindsight recall, facts + consolidated observations
  reflect       Hindsight reflect (agentic reasoning over memory, directives, mental models)
  hybrid        the product: recall fast path for routine pairs, reflect otherwise (live)

Shadow variants never write anything, so they cannot influence the memory being measured.
Hard-control cases (duplicates, bank changes, ...) are decided in code for every variant; we
report them but compare the variants on judgement cases, where memory is what matters.

Run: uv run python -m scripts.ablation            (separate DB and bank; the demo is untouched)
Writes: data/ablation.json
"""

import os

from app.config import BACKEND_DIR

os.environ["DATABASE_URL"] = f"sqlite:///{(BACKEND_DIR / 'data' / 'ablation.db').as_posix()}"
os.environ["LLM_ORDER"] = "gemini,groq,nvidia"  # one model for every variant, so only retrieval differs

import asyncio  # noqa: E402
import copy  # noqa: E402
import json  # noqa: E402
import logging  # noqa: E402
import time  # noqa: E402
from collections import Counter, defaultdict  # noqa: E402
from datetime import datetime, timedelta  # noqa: E402

from sqlmodel import Session  # noqa: E402

from app.agent.autonomy import MONEY_OUT, same_outcome  # noqa: E402
from app.agent.rag import VectorRag  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.data.seed import seed  # noqa: E402
from app.db import get_engine, set_state  # noqa: E402
from app.memory.store import get_memory  # noqa: E402
from app.models import ExceptionCase, Invoice  # noqa: E402
from app.schemas import Action  # noqa: E402
from app.services.cases import get_cases  # noqa: E402
from app.services.sim import get_sim  # noqa: E402

BANK = "precedent-ablation"
DAYS = 84
SHADOW = ("no_memory", "rag", "recall_facts", "recall", "reflect")
VARIANTS = (*SHADOW, "hybrid")
WINDOWS = {"weeks_1_12": (1, 12), "weeks_5_12": (5, 12), "weeks_9_12": (9, 12)}
OUT = BACKEND_DIR / "data" / "ablation.json"
T0 = time.time()


def say(msg: str) -> None:
    print(f"[{time.time() - T0:6.0f}s] {msg}", flush=True)


def record(variant: str, rec, truth: dict, week: int, case_id: str) -> dict:
    action, want = rec.action.value, truth["decision"]
    return {
        "variant": variant,
        "case": case_id,
        "week": week,
        "route": rec.route,
        "action": action,
        "truth": want,
        "correct": same_outcome(action, want),
        "exact": action == want,
        "false_pay": Action(action) in MONEY_OUT and Action(want) not in MONEY_OUT,
        "needless_hold": Action(action) not in MONEY_OUT and Action(want) in MONEY_OUT,
        "confidence": rec.confidence,
        "grounded": rec.source.value == "memory",
        "auto": bool(rec.auto_resolved),
        "latency_ms": rec.latency_ms,
        "cost_usd": rec.cost_usd or 0.0,
        "provider": rec.provider,
    }


def pct(xs: list[float], q: float) -> int | None:
    if not xs:
        return None
    xs = sorted(xs)
    return int(xs[min(len(xs) - 1, int(q * len(xs)))])


def stats(rows: list[dict]) -> dict:
    n = len(rows)
    if not n:
        return {"n": 0}
    confident = [r for r in rows if r["confidence"] >= 0.95]
    return {
        "n": n,
        "accuracy": round(sum(r["correct"] for r in rows) / n, 4),
        "exact_action": round(sum(r["exact"] for r in rows) / n, 4),
        "false_pay": sum(r["false_pay"] for r in rows),
        "needless_holds": sum(r["needless_hold"] for r in rows),
        "grounded_in_memory": round(sum(r["grounded"] for r in rows) / n, 4),
        "confident": len(confident),
        "confident_wrong": sum(not r["correct"] for r in confident),
        "latency_p50_ms": pct([r["latency_ms"] for r in rows], 0.5),
        "latency_p95_ms": pct([r["latency_ms"] for r in rows], 0.95),
        "cost_per_case_usd": round(sum(r["cost_usd"] for r in rows) / n, 5),
        "cost_total_usd": round(sum(r["cost_usd"] for r in rows), 4),
        "touchless": sum(r["auto"] for r in rows),
        "routes": dict(Counter(r["route"] for r in rows)),
        "providers": dict(Counter(r["provider"].split("+")[-1] for r in rows)),
    }


async def main(days: int) -> None:
    logging.basicConfig(level=logging.WARNING)
    s = get_settings()
    mem, cases, sim = get_memory(), get_cases(), get_sim()
    say(f"LLM chain: {cases.recommender.router.chain}")
    seed()
    await mem.delete_bank(BANK)
    with Session(get_engine()) as session:
        set_state(session, "bank_id", BANK)
        set_state(session, "memory_enabled", True)
    await mem.ensure_bank(BANK)

    # the RAG baseline indexes exactly the texts Hindsight retains, at the same moment
    rag = VectorRag()
    cases.recommender.rag = rag
    retain = mem.retain_resolution

    async def retain_and_index(bank_id, *, content, case_id, **kw):
        await asyncio.gather(retain(bank_id, content=content, case_id=case_id, **kw), rag.add(case_id, content))

    mem.retain_resolution = retain_and_index
    cases.mode = "hybrid"
    rows: list[dict] = []
    sem = asyncio.Semaphore(3)

    async def shadows(cid: str) -> tuple[str, dict, int, list]:
        async with sem:
            with Session(get_engine()) as session:
                case = session.get(ExceptionCase, cid)
                truth = session.get(Invoice, case.invoice_id).truth
                ctx = cases.build_context(session, case)
                now = case.created_at + timedelta(minutes=2)
                week = (ctx.sim_date - s.sim_start).days // 7 + 1

            async def one(variant: str):
                try:
                    return variant, await cases.recommender.recommend(
                        copy.deepcopy(ctx),
                        memory_enabled=variant != "no_memory",
                        bank_id=BANK,
                        now=now,
                        mode=None if variant == "no_memory" else variant,
                    )
                except Exception as e:  # noqa: BLE001
                    say(f"  {cid} {variant} failed: {e}")
                    return variant, None

            return cid, truth, week, list(await asyncio.gather(*(one(v) for v in SHADOW)))

    async def live(cid: str):
        async with sem:
            return await cases.recommend_case(cid)

    for day in range(days):
        ids = cases.process_arrivals(day)
        # shadows first, for the whole day: they see the memory exactly as the live agent is about to
        shadowed = await asyncio.gather(*(shadows(cid) for cid in ids))
        lives = await asyncio.gather(*(live(cid) for cid in ids))
        for (cid, truth, week, results), rec in zip(shadowed, lives, strict=True):
            both = [*results, ("hybrid", rec)]
            for variant, r in both:
                if r is not None:
                    rows.append(record(variant, r, truth, week, cid))
            marks = " ".join(
                f"{v[:6]}:{'+' if r and same_outcome(r.action.value, truth['decision']) else '-'}" for v, r in both
            )
            say(f"  {cid} wk{week:02d} {truth['decision']:<16} {marks}")
        if ids:
            await sim.clerk_resolve(ids)
        await cases.drain()
        with Session(get_engine()) as session:
            set_state(session, "sim_day", day)
        if day % 7 == 6:
            say(f"week {day // 7 + 1} done ({len({r['case'] for r in rows})} exceptions so far)")
            OUT.with_suffix(".partial.json").write_text(json.dumps(rows, default=str), encoding="utf-8")

    judgement = [r for r in rows if r["route"] != "guardrail"]
    control = [r for r in rows if r["route"] == "guardrail"]
    report = {
        "generated_at": datetime.now().isoformat(),
        "design": __doc__.split("Run:")[0].strip(),
        "timeline_days": days,
        "bank": BANK,
        "llm": cases.recommender.router.chain[0],
        "exceptions": len({r["case"] for r in rows}),
        "judgement_cases": len({r["case"] for r in judgement}),
        "control_cases": len({r["case"] for r in control}),
        "control_accuracy": stats([r for r in control if r["variant"] == "hybrid"]).get("accuracy"),
        "rag_embedding_cost_usd": round(rag.total_cost, 5),
        "windows": {
            name: {v: stats([r for r in judgement if r["variant"] == v and lo <= r["week"] <= hi]) for v in VARIANTS}
            for name, (lo, hi) in WINDOWS.items()
        },
        "weekly_accuracy": {
            v: {
                w: round(sum(r["correct"] for r in rs) / len(rs), 3)
                for w, rs in sorted(_by_week([r for r in judgement if r["variant"] == v]).items())
            }
            for v in VARIANTS
        },
        "rows": rows,
    }
    OUT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    OUT.with_suffix(".partial.json").unlink(missing_ok=True)
    say("done")
    for name in WINDOWS:
        say(name)
        for v in VARIANTS:
            st = report["windows"][name][v]
            if st["n"]:
                say(
                    f"  {v:<13} acc {st['accuracy']:.0%}  false pay {st['false_pay']}  grounded "
                    f"{st['grounded_in_memory']:.0%}  p50 {st['latency_p50_ms']} ms  ${st['cost_per_case_usd']:.4f}/case"
                )
    await mem.close()


def _by_week(rows: list[dict]) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        out[r["week"]].append(r)
    return out


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=DAYS, help="shorter runs are for smoke tests only")
    days = p.parse_args().days
    if days != DAYS:
        OUT = OUT.with_name(f"ablation-{days}d.json")
    asyncio.run(main(days))
