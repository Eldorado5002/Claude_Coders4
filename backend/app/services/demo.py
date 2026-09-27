"""Demo stages: Day 1 -> Week 3 -> Week 8 -> The twist.

`scripts/build_demo.py` simulates the timeline once and snapshots the database state and
a clone of the Hindsight bank at every stage. Switching stages then restores a snapshot
instantly. Without snapshots, advancing falls back to simulating live (slower).
"""

import json
from datetime import timedelta
from pathlib import Path

from sqlmodel import Session, delete, select

from app.config import BACKEND_DIR, get_settings
from app.db import get_engine, get_state, set_state
from app.models import AppState, Autonomy, ExceptionCase, Invoice
from app.schemas import DemoStage, DemoState

SNAP_DIR = BACKEND_DIR / "data" / "snapshots"

STAGES = [
    ("day1", 0, "Day 1", "Fresh agent, no memory"),
    ("week3", 16, "Week 3", "Agent recalls precedents"),
    ("week8", 51, "Week 8", "Earned autonomy"),
    ("twist", 56, "The twist", "Controls hold"),
]
STAGE_DAY = {sid: day for sid, day, _, _ in STAGES}


def stage_bank(stage: str) -> str:
    return f"{get_settings().hindsight_bank_id}-{stage}"


def snapshot_path(stage: str) -> Path:
    return SNAP_DIR / f"{stage}.json"


def has_snapshot(stage: str) -> bool:
    return snapshot_path(stage).exists()


def snapshot(stage: str, bank_id: str) -> None:
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    with Session(get_engine()) as s:
        data = {
            "stage": stage,
            "bank_id": bank_id,
            "invoices": {i.id: i.status for i in s.exec(select(Invoice)).all()},
            "cases": [c.model_dump(mode="json") for c in s.exec(select(ExceptionCase)).all()],
            "autonomy": [a.model_dump(mode="json") for a in s.exec(select(Autonomy)).all()],
            "state": {r.key: r.value for r in s.exec(select(AppState)).all()},
        }
    snapshot_path(stage).write_text(json.dumps(data, default=str), encoding="utf-8")


def restore(stage: str) -> None:
    data = json.loads(snapshot_path(stage).read_text(encoding="utf-8"))
    with Session(get_engine()) as s:
        s.exec(delete(ExceptionCase))
        s.flush()
        for inv in s.exec(select(Invoice)).all():
            if inv.id not in data["invoices"]:
                s.delete(inv)  # e.g. invoices captured live during a rehearsal
                continue
            inv.status = data["invoices"][inv.id]
            s.add(inv)
        s.exec(delete(Autonomy))
        s.flush()
        for c in data["cases"]:
            s.add(ExceptionCase.model_validate(c))
        for a in data["autonomy"]:
            s.add(Autonomy.model_validate(a))
        keep_memory_toggle = get_state(s, "memory_enabled", True)
        s.commit()
        for k, v in data["state"].items():
            set_state(s, k, v)
        set_state(s, "bank_id", data["bank_id"])
        set_state(s, "stage", stage)
        set_state(s, "memory_enabled", keep_memory_toggle)


def demo_state(busy: bool = False) -> DemoState:
    s = get_settings()
    with Session(get_engine()) as session:
        day = int(get_state(session, "sim_day", -1))
        stage = get_state(session, "stage", "day1")
    return DemoState(
        stage=stage,
        sim_date=s.sim_start + timedelta(days=max(day, 0)),
        busy=busy,
        stages=[
            DemoStage(id=sid, label=label, description=desc, sim_date=s.sim_start + timedelta(days=d), reached=day >= d)
            for sid, d, label, desc in STAGES
        ],
    )
