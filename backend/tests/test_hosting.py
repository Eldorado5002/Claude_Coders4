"""The hosted demo: spend caps on paid actions, and the web app served from the API."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(env):
    from app.api import limits
    from app.main import app

    limits.reset()
    with TestClient(app) as c:
        yield c
    limits.reset()


def test_paid_actions_stop_at_the_daily_cap(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "daily_cap_rerun", 2)
    cid = client.get("/api/exceptions", params={"status": "open"}).json()["items"][0]["id"]
    assert client.post(f"/api/exceptions/{cid}/recommend").status_code == 200
    assert client.post(f"/api/exceptions/{cid}/recommend").status_code == 200
    blocked = client.post(f"/api/exceptions/{cid}/recommend")
    assert blocked.status_code == 429 and "Demo limit reached" in blocked.json()["detail"]
    assert client.get(f"/api/exceptions/{cid}").status_code == 200  # reading is never limited


def test_each_visitor_gets_a_burst_limit(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "per_visitor_per_minute", 1)
    cid = client.get("/api/exceptions", params={"status": "open"}).json()["items"][0]["id"]
    a = {"x-forwarded-for": "203.0.113.7"}
    assert client.post(f"/api/exceptions/{cid}/recommend", headers=a).status_code == 200
    assert client.post(f"/api/exceptions/{cid}/recommend", headers=a).status_code == 429
    other = {"x-forwarded-for": "198.51.100.9"}  # someone else is not blocked
    assert client.post(f"/api/exceptions/{cid}/recommend", headers=other).status_code == 200


def test_limits_are_off_by_default(client):
    cid = client.get("/api/exceptions", params={"status": "open"}).json()["items"][0]["id"]
    for _ in range(5):
        assert client.post(f"/api/exceptions/{cid}/recommend").status_code == 200


def test_serves_the_web_app_with_deep_links(client, env, monkeypatch):
    from app.config import get_settings

    assert client.get("/").json()["docs"] == "/docs"  # no web app configured: API info
    dist = env.tmp / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>precedent</html>", encoding="utf-8")
    (dist / "sw.js").write_text("// worker", encoding="utf-8")
    (dist / "assets" / "app-abc123.js").write_text("console.log(1)", encoding="utf-8")
    monkeypatch.setattr(get_settings(), "frontend_dist", str(dist))

    assert "precedent" in client.get("/").text
    deep = client.get("/exceptions/EXC-0010")
    assert deep.status_code == 200 and "precedent" in deep.text and deep.headers["cache-control"] == "no-cache"
    assert client.get("/sw.js").headers["cache-control"] == "no-cache"
    assert "immutable" in client.get("/assets/app-abc123.js").headers["cache-control"]
    assert client.get("/api/health").json()["status"] in ("ok", "degraded")  # the API still wins
    assert client.get("/api/nope").status_code == 404
    assert (
        client.get("/../backend/.env").status_code in (200, 404) and ".env" not in client.get("/../backend/.env").text
    )
