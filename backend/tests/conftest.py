"""Offline test harness: temp SQLite + fake Hindsight + fake LLM (no network, no cost)."""

import os
from types import SimpleNamespace

import pytest

from app.llm.router import LlmResult


class FakeMemory:
    """Remembers retained resolutions per vendor; 'reflects' by reusing the latest human decision."""

    def __init__(self):
        self.retained: list[dict] = []
        self.up = True
        self.settings = None

    async def ensure_bank(self, bank_id):
        return None

    async def health(self, bank_id):
        return self.up

    async def close(self):
        return None

    async def delete_bank(self, bank_id):
        self.retained.clear()

    async def retain_resolution(self, bank_id, *, content, case_id, vendor_id, types, decision, when, **_):
        self.retained.append(
            {
                "bank": bank_id,
                "case_id": case_id,
                "vendor_id": vendor_id,
                "types": types,
                "decision": decision,
                "content": content,
            }
        )
        return case_id

    async def reflect(self, bank_id, query, *, vendor_id=None, types=None, response_schema=None, budget="low"):
        from app.memory.store import citations_from

        if not self.up:
            raise ConnectionError("hindsight down")
        prior = [r for r in self.retained if r["vendor_id"] == vendor_id and set(r["types"]) & set(types or [])]
        if prior:
            last = prior[-1]
            out = {
                "action": last["decision"],
                "confidence": 0.92,
                "adjusted_amount": None,
                "rationale": f"Same as {last['case_id']}.",
                "precedent_found": True,
            }
            mems = [
                SimpleNamespace(
                    id=f"m-{last['case_id']}",
                    text=f"Case {last['case_id']}: {last['decision']}",
                    type="world",
                    context=None,
                    occurred_start=None,
                )
            ]
        else:
            out = {
                "action": "escalate",
                "confidence": 0.3,
                "adjusted_amount": "null",
                "rationale": "No precedent.",
                "precedent_found": "false",
            }
            mems = []
        directives = [SimpleNamespace(id="d1", name="Bank change", content="Never approve bank changes.")]
        resp = SimpleNamespace(
            structured_output=out,
            structured_output_error=None,
            text=out["rationale"],
            based_on=SimpleNamespace(memories=mems, mental_models=[], directives=directives),
        )
        return resp, citations_from(resp), 5

    async def recall(self, bank_id, query, **_):
        return []

    async def playbook(self, bank_id, vendor_id, vendor_name):
        return None

    async def recent(self, bank_id, limit=20):
        return []


class FakeRouter:
    chain = ["fake:model"]

    def __init__(self):
        self.calls = 0

    async def structured(self, system, user, schema, **_):
        self.calls += 1
        value = schema(
            action="hold",
            confidence=0.4,
            adjusted_amount=None,
            rationale="No history available; hold.",
            precedent_found=False,
        )
        return LlmResult(value, "fake:model", 1)


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Fresh DB + fakes wired into every singleton."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    monkeypatch.setenv("HINDSIGHT_BANK_ID", "test-bank")
    from app import config, db
    from app.agent import recommender
    from app.memory import store
    from app.services import cases, demo, sim

    config.get_settings.cache_clear()
    db._engine = None
    fake_mem, fake_router = FakeMemory(), FakeRouter()
    monkeypatch.setattr(store, "_store", fake_mem)
    monkeypatch.setattr(recommender, "get_router", lambda: fake_router)
    monkeypatch.setattr(cases, "_service", None)
    monkeypatch.setattr(sim, "_sim", None)
    monkeypatch.setattr(demo, "SNAP_DIR", tmp_path / "snapshots")
    from app.data.seed import seed

    seed()
    yield SimpleNamespace(memory=fake_mem, router=fake_router, tmp=tmp_path)
    config.get_settings.cache_clear()
    db._engine = None
    os.environ.pop("DATABASE_URL", None)
