from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.agent.autonomy import can_auto_resolve, record_outcome
from app.agent.recommender import RecDraft
from app.llm.router import strict_schema
from app.models import Autonomy, ExceptionCase
from app.schemas import Action, AutonomyLevel, CaseStatus

# ---------------------------------------------------------------- pure logic


def test_strict_schema_is_closed_and_fully_required():
    js = strict_schema(RecDraft)
    assert js["additionalProperties"] is False
    assert set(js["required"]) == set(js["properties"])
    assert "$defs" not in str(js) and "$ref" not in str(js)
    assert set(js["properties"]["action"]["enum"]) == {a.value for a in Action}


def test_recdraft_tolerates_sloppy_model_output():
    d = RecDraft.model_validate(
        {
            "action": "Approved",
            "confidence": "92%",
            "adjusted_amount": "null",
            "rationale": "ok",
            "precedent_found": "true",
        }
    )
    assert d.action == Action.APPROVE and d.confidence == pytest.approx(0.92)
    assert d.adjusted_amount is None and d.precedent_found is True


def test_autonomy_promotes_after_streak_and_demotes_on_overrule():
    row = Autonomy(id="V1:freight_charge", vendor_id="V1", exception_type="freight_charge")
    now = datetime(2026, 3, 2, 10)
    assert record_outcome(row, "escalate", "approve", now) == (False, False)  # overruled
    assert record_outcome(row, "approve", "approve", now) == (False, False)
    assert record_outcome(row, "approve", "approve", now) == (False, False)
    assert record_outcome(row, "approve", "approve", now) == (True, False)
    assert row.level == AutonomyLevel.AUTO and row.streak == 3 and row.overruled == 1
    assert record_outcome(row, "approve", "hold", now) == (False, True)
    assert row.level == AutonomyLevel.SUGGEST and row.streak == 0


def test_auto_resolve_respects_envelope_blocking_and_anomaly():
    row = Autonomy(id="V1:freight_charge", vendor_id="V1", exception_type="freight_charge", level="auto")
    case = ExceptionCase(
        id="E1",
        invoice_id="I1",
        vendor_id="V1",
        primary_type="freight_charge",
        amount_at_risk=4000,
        created_at=datetime(2026, 3, 2),
    )
    rec = {"action": "approve", "confidence": 0.9, "source": "memory", "anomaly_score": 0.2}
    assert can_auto_resolve(row, rec, case, envelope=4500)
    assert not can_auto_resolve(row, rec, case, envelope=3000)  # above what humans approved before
    assert can_auto_resolve(row, {**rec, "action": "hold"}, case, envelope=0)  # holding moves no money
    assert not can_auto_resolve(row, {**rec, "anomaly_score": 0.95}, case, envelope=4500)
    assert not can_auto_resolve(row, {**rec, "source": "no_memory"}, case, envelope=4500)
    case.blocking = True
    assert not can_auto_resolve(row, rec, case, envelope=4500)


# ---------------------------------------------------------------- service + API with fakes


@pytest.fixture
def client(env):
    from app.main import app

    with TestClient(app) as c:
        yield c


def test_day1_case_then_learning_then_promotion(client, env):
    q = client.get("/api/exceptions", params={"status": "open"}).json()
    assert q["total"] == 1
    day0 = q["items"][0]
    assert day0["vendor"]["id"] == "V001" and day0["primary_type"] == "freight_charge"
    detail = client.get(f"/api/exceptions/{day0['id']}").json()
    assert detail["recommendation"]["action"] == "escalate"  # no memory yet
    assert detail["recommendation"]["source"] == "no_memory"
    assert all(c["kind"] != "directive" for c in detail["recommendation"]["citations"])

    r = client.post(
        f"/api/exceptions/{day0['id']}/resolve",
        json={"decision": "approve", "reason": "Freight under the Rs 5,000 agreement."},
    ).json()
    assert r["exception"]["status"] == "resolved" and r["autonomy"]["overruled"] == 1
    assert "Shree Balaji" in r["lesson"]
    assert env.memory.retained and env.memory.retained[-1]["decision"] == "approve"


def test_memory_toggle_regression_promotion_uses_visible_recommendation(client, env):
    """Toggling memory OFF then ON must not make resolve() judge the agent on the stale OFF recommendation."""
    from app.services.cases import get_cases

    with Session(__import__("app.db", fromlist=["get_engine"]).get_engine()) as s:
        case = s.exec(select(ExceptionCase)).first()
    cid = case.id
    # three prior accepted memory-backed decisions for V001 freight
    row_id = "V001:freight_charge"
    client.post(f"/api/exceptions/{cid}/resolve", json={"decision": "approve", "reason": "Freight under cap."})
    from app.db import get_engine

    with Session(get_engine()) as s:
        row = s.get(Autonomy, row_id)
        row.streak, row.accepted = 2, 2
        s.add(row)
        s.commit()

    # a new V001 freight case arrives
    ids = get_cases().process_arrivals(5)
    new = next(i for i in ids if client.get(f"/api/exceptions/{i}").json()["vendor"]["id"] == "V001")
    import asyncio

    asyncio.run(get_cases().recommend_case(new))
    assert client.get(f"/api/exceptions/{new}").json()["recommendation"]["action"] == "approve"

    client.patch("/api/settings", json={"memory_enabled": False})
    off = client.post(f"/api/exceptions/{new}/recommend").json()["recommendation"]
    assert off["action"] == "hold" and off["source"] == "no_memory"
    client.patch("/api/settings", json={"memory_enabled": True})
    assert client.get(f"/api/exceptions/{new}").json()["recommendation"]["action"] == "approve"

    r = client.post(f"/api/exceptions/{new}/resolve", json={"decision": "approve", "reason": "Within cap again."})
    body = r.json()
    assert body["promoted"] is True and body["autonomy"]["level"] == "auto"


def test_hard_control_forces_action_and_locks_autonomy(env):
    import asyncio

    from app.db import get_engine
    from app.services.cases import get_cases

    svc = get_cases()
    for day in range(0, 57):
        for cid in svc.process_arrivals(day):
            asyncio.run(svc.recommend_case(cid))
    with Session(get_engine()) as s:
        bank_case = next(c for c in s.exec(select(ExceptionCase)).all() if "bank_details_changed" in c.issue_types)
        rec = bank_case.recommendation
        assert rec["action"] == "escalate" and rec["source"] == "guardrail" and rec["confidence"] >= 0.99
        assert any(c["kind"] == "directive" for c in rec["citations"])
        row = s.get(Autonomy, f"{bank_case.vendor_id}:bank_details_changed")
        assert row.level == AutonomyLevel.LOCKED
        dup = next(c for c in s.exec(select(ExceptionCase)).all() if c.primary_type == "duplicate_invoice")
        assert dup.recommendation["action"] == "reject"


def test_hindsight_down_falls_back_without_crashing(client, env):
    env.memory.up = False
    case_id = client.get("/api/exceptions", params={"status": "open"}).json()["items"][0]["id"]
    rec = client.post(f"/api/exceptions/{case_id}/recommend").json()["recommendation"]
    assert rec["provider"].startswith("recall+") and rec["action"] in {a.value for a in Action}
    assert client.get("/api/health").json()["hindsight"] == "down"


def test_api_errors_and_listing(client):
    assert client.get("/api/exceptions/EXC-9999").status_code == 404
    assert (
        client.post("/api/exceptions/EXC-0001/resolve", json={"decision": "approve", "reason": "x"}).status_code == 422
    )
    assert client.get("/api/exceptions", params={"status": "bogus"}).status_code == 422
    vendors = client.get("/api/vendors").json()
    assert len(vendors) == 25 and vendors[0]["id"] == "V001"
    assert client.get("/api/metrics").json()["kpis"]["exceptions_total"] >= 1
    state = client.get("/api/demo/state").json()
    assert state["sim_date"] == str(date(2026, 3, 2)) and [s["id"] for s in state["stages"]][0] == "day1"


def test_resolve_twice_conflicts(client):
    cid = client.get("/api/exceptions", params={"status": "open"}).json()["items"][0]["id"]
    ok = client.post(
        f"/api/exceptions/{cid}/resolve", json={"decision": "hold", "reason": "Need vendor clarification."}
    )
    assert ok.status_code == 200
    again = client.post(f"/api/exceptions/{cid}/resolve", json={"decision": "approve", "reason": "Changed my mind."})
    assert again.status_code == 409
    assert client.get(f"/api/exceptions/{cid}").json()["status"] == CaseStatus.RESOLVED


def test_demo_snapshot_restore_roundtrip(client, env):
    from app.services import demo

    open_before = client.get("/api/exceptions", params={"status": "open"}).json()
    cid = open_before["items"][0]["id"]
    demo.snapshot("day1", "test-bank-day1")
    client.post(f"/api/exceptions/{cid}/resolve", json={"decision": "approve", "reason": "Freight within the cap."})
    assert client.get("/api/exceptions", params={"status": "open"}).json()["total"] == 0

    state = client.post("/api/demo/reset").json()
    assert state["stage"] == "day1"
    after = client.get("/api/exceptions", params={"status": "open"}).json()
    assert [x["id"] for x in after["items"]] == [cid]
    assert client.get("/api/settings").json()["bank_id"] == "test-bank-day1"
    row = client.get("/api/autonomy").json()
    assert all(r["accepted"] == 0 and r["overruled"] == 0 for r in row)


def test_hold_and_escalate_count_as_the_same_no_pay_outcome():
    from app.agent.autonomy import same_outcome

    row = Autonomy(id="V1:freight_charge", vendor_id="V1", exception_type="freight_charge", level="auto", streak=3)
    assert same_outcome("escalate", "hold") and same_outcome("reject", "hold")
    assert not same_outcome("approve", "approve_adjusted") and not same_outcome("approve", "hold")
    assert record_outcome(row, "escalate", "hold", datetime(2026, 3, 25)) == (False, False)
    assert row.level == AutonomyLevel.AUTO and row.streak == 4


def test_payable_amount_is_computed_by_code_and_matches_ground_truth():
    """approve_adjusted amounts come from the 3-way match, not the LLM — and equal what a clerk would pay."""
    from app.agent.recommender import CaseContext, payable_amount
    from app.data.generator import generate
    from app.matching.engine import MatchInput, match_invoice

    ds = generate(20260302, date(2026, 3, 2), 182)
    vendors = {v["id"]: v for v in ds.vendors}
    pos = {p["po_number"]: p for p in ds.pos}
    grns = {g["po_number"]: g for g in ds.grns}
    checked = 0
    for inv in ds.invoices:
        t = inv["truth"]
        if t["decision"] != "approve_adjusted" or t.get("adjusted_amount") is None:
            continue
        res = match_invoice(
            MatchInput(
                invoice=inv,
                vendor=vendors[inv["vendor_id"]],
                po=pos.get(inv["po_number"]),
                grn=grns.get(inv["po_number"]),
            )
        )
        ctx = CaseContext(
            case_id="x",
            vendor=vendors[inv["vendor_id"]],
            invoice=inv,
            issues=res.issues,
            types=[x.value for x in res.types],
            primary_type=res.primary_type.value,
            blocking=res.blocking,
            amount_at_risk=res.amount_at_risk,
            sim_date=inv["arrival_date"],
        )
        assert payable_amount(ctx) == pytest.approx(t["adjusted_amount"], abs=1.0), inv["id"]
        checked += 1
    assert checked >= 10


def test_recdraft_drops_unparseable_amounts():
    d = RecDraft.model_validate(
        {
            "action": "approve_adjusted",
            "confidence": 0.8,
            "adjusted_amount": "960 Kg",
            "rationale": "pay received qty",
            "precedent_found": True,
        }
    )
    assert d.adjusted_amount is None


def test_restore_removes_invoices_captured_during_rehearsal(client, env):
    from app.db import get_engine
    from app.models import Invoice
    from app.services import demo

    demo.snapshot("day1", "test-bank-day1")
    with Session(get_engine()) as s:
        base = s.get(Invoice, "INV-0001")
        extra = Invoice(**{**base.model_dump(), "id": "INV-C001", "source": "capture", "status": "exception"})
        s.add(extra)
        s.commit()
    demo.restore("day1")
    with Session(get_engine()) as s:
        assert s.get(Invoice, "INV-C001") is None
        assert s.get(Invoice, "INV-0001") is not None


def test_revoke_lesson_forgets_it_and_resets_the_ladder(client, env):
    from app.db import get_engine

    cid = client.get("/api/exceptions", params={"status": "open"}).json()["items"][0]["id"]
    client.post(f"/api/exceptions/{cid}/resolve", json={"decision": "approve", "reason": "Pay any freight, always."})
    assert any(r["case_id"] == cid for r in env.memory.retained)
    with Session(get_engine()) as s:  # pretend the pair had already earned autonomy
        row = s.get(Autonomy, "V001:freight_charge")
        row.level, row.streak = "auto", 4
        s.add(row)
        s.commit()

    lessons = client.get("/api/lessons").json()
    assert lessons[0]["case_id"] == cid and lessons[0]["taught_by"] == "AP Clerk" and not lessons[0]["revoked"]

    r = client.post(f"/api/lessons/{cid}/revoke", json={"reason": "Wrong: freight is capped at Rs 5,000."})
    body = r.json()
    assert r.status_code == 200 and body["memory_deleted"] is True
    assert body["lesson"]["revoked"] and body["autonomy"]["level"] == "suggest" and body["autonomy"]["streak"] == 0
    assert not any(x["case_id"] == cid for x in env.memory.retained)
    assert client.post(f"/api/lessons/{cid}/revoke", json={"reason": "again please"}).status_code == 409
    assert client.post("/api/lessons/EXC-9999/revoke", json={"reason": "nope nope"}).status_code == 404
    assert client.get("/api/lessons", params={"include_revoked": False}).json() == []
    assert client.get("/api/metrics").json()["kpis"]["lessons_revoked"] == 1


def test_personal_data_never_reaches_memory(client, env):
    cid = client.get("/api/exceptions", params={"status": "open"}).json()["items"][0]["id"]
    reason = "Vendor asked to call 9876543210 and pay a/c 50200011223344, PAN ABCDE1234F. Freight under cap."
    res = client.post(f"/api/exceptions/{cid}/resolve", json={"decision": "approve", "reason": reason}).json()
    stored = res["exception"]["resolution"]
    assert "9876543210" not in stored["reason"] and "50200011223344" not in stored["reason"]
    assert set(stored["redacted"]) >= {"phone", "bank_account", "pan"}
    memory_text = env.memory.retained[-1]["content"]
    assert "9876543210" not in memory_text and "ABCDE1234F" not in memory_text and "[REDACTED:phone]" in memory_text


def test_citation_relevance_metric():
    from app.services.metrics import citation_relevance

    def case(vid, types, cites, source="memory"):
        return ExceptionCase(
            id="E",
            invoice_id="I",
            vendor_id=vid,
            primary_type=types[0],
            issue_types=types,
            created_at=datetime(2026, 3, 2),
            recommendation={"source": source, "citations": [{"kind": k, "text": t} for k, t in cites]},
        )

    cases = [
        case(
            "V001",
            ["freight_charge"],
            [
                ("observation", "Shree Balaji Steel freight is approved under Rs 5,000"),
                ("world", "Indus Logistics fuel surcharge within 6%"),
                ("world", "Kaveri charged 18% GST on boxes"),
                ("directive", "ignored"),
            ],
        ),
        case("V005", ["rounding_difference"], [("world", "Priya approved a Rs 3 rounding gap")], source="guardrail"),
    ]
    assert citation_relevance(cases, {"V001": "Shree Balaji Steel Traders Pvt Ltd"}) == pytest.approx(2 / 3, abs=1e-3)


def test_team_policy_endpoint(client):
    body = client.get("/api/memory/policy").json()
    assert "5,000" in body["content"]
