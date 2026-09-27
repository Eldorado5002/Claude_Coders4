import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.agent import calibration as cal_mod
from app.agent import certify
from app.agent.certify import Verified, cp_upper

# ---------------------------------------------------------------- the statistics


def test_clopper_pearson_upper_bound():
    # zero errors: the bound has the closed form 1 - delta^(1/n) ("rule of three" territory)
    for n in (10, 59, 200):
        assert cp_upper(0, n) == pytest.approx(1 - 0.05 ** (1 / n), rel=1e-6)
    assert cp_upper(0, 59) < 0.05 < cp_upper(0, 58)  # 59 clean decisions certify a 5% target
    assert cp_upper(1, 100) > cp_upper(0, 100)  # more errors -> looser bound
    assert cp_upper(0, 0) == 1.0 and cp_upper(5, 5) == 1.0


def _records(monkeypatch, recs):
    monkeypatch.setattr(certify, "verified_decisions", lambda session: recs)
    monkeypatch.setattr(cal_mod, "verified_decisions", lambda session: recs)


def test_certificate_statuses(monkeypatch):
    few = [Verified(0.99, "approve", True, False) for _ in range(10)]
    _records(monkeypatch, few)
    c = certify.certificate(None)
    assert c.status == "collecting" and c.threshold == certify.PROVISIONAL

    clean = [Verified(0.99, "approve", True, False) for _ in range(80)]
    clean += [Verified(0.9, "approve", True, True) for _ in range(40)]
    _records(monkeypatch, clean)
    c = certify.certificate(None)
    assert c.status == "certified" and c.threshold <= 0.9 and c.error_upper_bound <= certify.TARGET

    risky = [Verified(0.99, "approve", i % 4 != 0, False) for i in range(80)]  # 25% wrong
    _records(monkeypatch, risky)
    c = certify.certificate(None)
    assert c.status == "paused" and c.threshold is None

    holds_only = [Verified(0.99, "hold", False, False) for _ in range(80)]  # certificate is about payments
    _records(monkeypatch, holds_only)
    assert certify.certificate(None).status == "collecting"


def test_calibration_measures_overconfidence(monkeypatch):
    recs = [Verified(1.0, "approve", i % 5 != 0, False) for i in range(50)]  # says 1.00, right 80% of the time
    _records(monkeypatch, recs)
    cal = cal_mod.calibration(None)
    top = cal.bins[-1]
    assert top.n == 50 and top.stated == 1.0 and top.actual == pytest.approx(41 / 52, abs=1e-3)
    assert cal.ece == pytest.approx(0.2, abs=1e-3)
    assert cal_mod.calibrate(1.0, cal) == pytest.approx(41 / 52, abs=1e-3)
    assert cal_mod.calibrate(0.3, cal) == cal.pooled_accuracy  # empty bin -> pooled estimate


# ---------------------------------------------------------------- the three routes


@pytest.fixture
def client(env):
    from app.main import app

    with TestClient(app) as c:
        yield c


def test_guardrail_route_needs_no_model(client, env):
    from app.db import get_engine
    from app.models import ExceptionCase
    from app.services.cases import get_cases

    svc = get_cases()
    before = env.memory.reflect_calls
    for day in range(1, 57):
        for cid in svc.process_arrivals(day):
            asyncio.run(svc.recommend_case(cid))
    with Session(get_engine()) as s:
        control_cases = [c for c in s.exec(select(ExceptionCase)).all() if c.blocking]
        assert control_cases
        for c in control_cases:
            assert c.recommendation["route"] == "guardrail"
            assert c.recommendation["cost_usd"] < 0.001
    assert env.memory.reflect_calls - before < 80  # only non-control cases ever reflect


def test_fast_path_for_routine_cases(client, env):
    from app.db import get_engine
    from app.models import Autonomy, ExceptionCase
    from app.services.cases import get_cases

    svc = get_cases()
    cid = client.get("/api/exceptions", params={"status": "open"}).json()["items"][0]["id"]
    client.post(f"/api/exceptions/{cid}/resolve", json={"decision": "approve", "reason": "Freight within the cap."})
    from tests.conftest import wait_retained

    wait_retained(env.memory, cid)
    with Session(get_engine()) as s:
        row = s.get(Autonomy, "V001:freight_charge")
        row.accepted = 2
        s.add(row)
        s.commit()
    new = next(
        i for i in svc.process_arrivals(5) if client.get(f"/api/exceptions/{i}").json()["vendor"]["id"] == "V001"
    )
    reflects = env.memory.reflect_calls
    rec = asyncio.run(svc.recommend_case(new))
    assert rec.route == "fast" and rec.action.value == "approve" and rec.source.value == "memory"
    assert env.memory.reflect_calls == reflects  # no paid reflect call
    assert rec.calibrated_confidence is not None and rec.cost_usd is not None
    with Session(get_engine()) as s:
        assert s.get(ExceptionCase, new).recommendation["route"] == "fast"


def test_certificate_endpoint_and_metrics(client):
    cert = client.get("/api/autonomy/certificate").json()
    assert cert["status"] in ("collecting", "certified", "paused") and cert["table"]
    m = client.get("/api/metrics").json()
    assert m["certificate"]["target_error"] == 0.05
    assert "ece" in m["calibration"] and "latency_p50_ms" in m["performance"]


def test_beliefs_and_knowledge_endpoints(client):
    beliefs = client.get("/api/vendors/V001/beliefs").json()
    assert beliefs[0]["evidence_count"] == 4 and beliefs[0]["versions"][0]["new_evidence"]
    assert client.get("/api/vendors/V999/beliefs").status_code == 404
    pages = client.get("/api/knowledge").json()
    assert pages == [{"id": "kp-1", "name": "Shree Balaji Steel Traders", "vendor_id": "V001", "stale": False}]
    assert "5,000" in client.get("/api/knowledge/kp-1").json()["markdown"]
    assert client.get("/api/knowledge/nope").status_code == 404
    profile = client.get("/api/vendors/V001").json()
    assert profile["playbook"].startswith("## Freight")  # the vendor wiki page is the playbook
