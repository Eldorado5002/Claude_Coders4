"""Text formats the frontend parses. If one of these changes, frontend/src/lib/parse-rationale.ts must change too."""

import asyncio
import re
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.memory.store import citations_from, normalise_page, pending_text, strip_frontmatter

# the same patterns as frontend/src/lib/parse-rationale.ts
FORCED = re.compile(r"^Hard control: (.*?)\s*Action forced to (\w+)\.")
MEMORY_WOULD = re.compile(r"\(Memory alone would have suggested (\w+)\.\)")


@pytest.fixture
def client(env):
    from app.main import app

    with TestClient(app) as c:
        yield c


def test_hard_control_rationale_names_the_forced_action_and_what_memory_would_have_done(client, env):
    from app.db import get_engine
    from app.models import ExceptionCase
    from app.services.cases import get_cases
    from tests.conftest import wait_retained

    # teach the agent Balaji's freight habit
    first = client.get("/api/exceptions", params={"status": "open"}).json()["items"][0]
    assert first["vendor"]["id"] == "V001" and first["primary_type"] == "freight_charge"
    client.post(f"/api/exceptions/{first['id']}/resolve", json={"decision": "approve", "reason": "Freight under cap."})
    wait_retained(env.memory, first["id"])

    # the twist: a Balaji invoice with the usual freight line, but a new bank account
    svc = get_cases()
    for day in range(1, 57):
        svc.process_arrivals(day)
    with Session(get_engine()) as s:
        case = next(
            c
            for c in s.exec(select(ExceptionCase)).all()
            if c.vendor_id == "V001" and "bank_details_changed" in c.issue_types and "freight_charge" in c.issue_types
        )
        cid, message = case.id, next(i["message"] for i in case.issues if i["type"] == "bank_details_changed")

    rec = asyncio.run(svc.recommend_case(cid))
    m = FORCED.match(rec.rationale)
    assert m and m.group(1) == message and m.group(2) == "escalate"
    assert MEMORY_WOULD.search(rec.rationale).group(1) == "approve"
    assert rec.route == "guardrail" and rec.action.value == "escalate"


def test_wiki_pages_written_as_dict_literals_become_markdown():
    raw = (
        '---\ntitle: "Balaji"\n---\n'
        "{'level': 2, 'blocks': ['Balaji is subject to standard controls.'], 'heading': 'Overview'}\n\n"
        "{'blocks': ['- Freight up to Rs 5,000 per trip is approved.', '- Over that is held.'], "
        "'heading': 'Freight', 'level': 3}\n\n"
        "A plain paragraph stays as it is."
    )
    md = strip_frontmatter(raw)
    assert md.splitlines()[0] == "## Overview"
    assert "### Freight" in md and "- Over that is held." in md and "A plain paragraph stays as it is." in md
    assert "{'" not in md
    assert normalise_page("## Already markdown\n\nText.") == "## Already markdown\n\nText."
    assert normalise_page("{not: valid python, blocks}") == "{not: valid python, blocks}"


def test_unfinished_summaries_are_not_cited_as_evidence():
    assert pending_text("AP team exception policy: Generating content…")
    assert pending_text("") and pending_text(None)
    assert not pending_text("Freight up to Rs 5,000 per trip is approved.")
    resp = SimpleNamespace(
        based_on=SimpleNamespace(
            mental_models=[
                SimpleNamespace(id="mm-1", text="AP team exception policy: Generating content…"),
                SimpleNamespace(id="mm-2", text="Balaji freight is approved under Rs 5,000."),
            ],
            directives=[],
            memories=[],
        )
    )
    assert [c.id for c in citations_from(resp)] == ["mm-2"]


def test_health_is_down_when_hindsight_rejects_the_key():
    from app.memory.store import MemoryStore

    class Err(Exception):
        def __init__(self, status):
            super().__init__(f"HTTP {status}")
            self.status = status

    class Client:
        def __init__(self, status):
            self.status = status

        async def aget_bank_config(self, bank_id):
            if self.status:
                raise Err(self.status)
            return {}

        async def aget_version(self):  # answers without a key: must not count
            return {"version": "x"}

    store = MemoryStore()
    for status, up in ((None, True), (404, True), (401, False), (403, False), (500, False)):
        store._client = Client(status)
        assert asyncio.run(store.health("bank")) is up, status


def test_vendor_profile_says_when_memory_is_unavailable(client, env, monkeypatch):
    assert client.get("/api/vendors/V001").json()["memory"] == "ok"

    async def down(*_, **__):
        raise ConnectionError("hindsight down")

    monkeypatch.setattr(env.memory, "recall", down)
    profile = client.get("/api/vendors/V001").json()
    assert profile["memory"] == "unavailable" and profile["learned"] == []


def test_msme_status_only_on_open_cases_in_list_and_detail(client, env):
    from app.db import get_engine
    from app.models import ExceptionCase, Vendor
    from app.services.cases import get_cases

    svc = get_cases()
    with Session(get_engine()) as s:
        msme = {v.id for v in s.exec(select(Vendor)).all() if (v.profile or {}).get("msme")}
    case_id = None
    for day in range(1, 60):
        for cid in svc.process_arrivals(day):
            with Session(get_engine()) as s:
                c = s.get(ExceptionCase, cid)
                if c.vendor_id in msme and not c.blocking:
                    case_id = cid
        if case_id:
            break
    assert client.get(f"/api/exceptions/{case_id}").json()["compliance"]["msme"] is not None
    client.post(f"/api/exceptions/{case_id}/resolve", json={"decision": "approve", "reason": "Checked and fine."})
    detail = client.get(f"/api/exceptions/{case_id}").json()
    row = next(i for i in client.get("/api/exceptions", params={"status": "all"}).json()["items"] if i["id"] == case_id)
    assert detail["compliance"]["msme"] is None and row["msme_days_left"] is None
