"""Write docs/mocks/*.json from the app's real responses, so the mocks can never drift from the API.

It drives the real FastAPI app in-process against the demo database and Hindsight banks that
scripts/build_demo.py builds. Read-only endpoints are captured at the Week 8 stage (a rich,
mid-story state). Endpoints that change state are exercised at the Twist stage, and the Day 1
snapshot is restored afterwards. The one exception is revoking a lesson: that would delete a
memory from a demo bank, so its mock is assembled from real lesson and autonomy objects.

Costs a few cents (one copilot answer, one invoice capture).
Run (after build_demo): uv run python -m scripts.make_mocks
"""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

OUT = Path(__file__).resolve().parents[2] / "docs" / "mocks"
SAMPLE = Path(__file__).resolve().parents[2] / "docs" / "samples" / "invoice-balaji-freight.png"
STORY_VENDOR = "V001"


def write(name: str, data) -> None:
    (OUT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  {name}")


def ok(r):
    assert r.status_code < 300, f"{r.request.method} {r.request.url} -> {r.status_code}: {r.text[:300]}"
    return r.json()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with TestClient(app) as c:
        # ---------------------------------------------------------- read-only, at Week 8
        ok(c.post("/api/demo/advance", json={"stage": "week8"}))
        get = lambda path, **params: ok(c.get(f"/api/{path}", params=params))  # noqa: E731
        write("health.json", get("health"))
        write("settings.json", get("settings"))
        write("demo-state.json", get("demo/state"))
        queue = get("exceptions", status="all", limit=10)
        write("exceptions.json", queue)
        story = get("exceptions", status="all", vendor_id=STORY_VENDOR, limit=50)["items"]
        detail = None
        for item in story:  # a Balaji case whose recommendation cites memory: the most telling example
            d = get(f"exceptions/{item['id']}")
            if (d.get("recommendation") or {}).get("source") == "memory" and d["recommendation"]["citations"]:
                detail = d
                break
        write("exception-detail.json", detail or get(f"exceptions/{story[0]['id']}"))
        write("vendors.json", get("vendors"))
        write("vendor-profile.json", get(f"vendors/{STORY_VENDOR}"))
        write("beliefs.json", get(f"vendors/{STORY_VENDOR}/beliefs"))
        pages = get("knowledge")
        write("knowledge.json", pages)
        page = next((p for p in pages if p["vendor_id"] == STORY_VENDOR), pages[0] if pages else None)
        if page:
            write("knowledge-page.json", get(f"knowledge/{page['id']}"))
        write("risk.json", get("risk"))
        write("benford.json", get("benford"))
        write("certificate.json", get("autonomy/certificate"))
        autonomy = get("autonomy")
        write("autonomy.json", autonomy)
        write("metrics.json", get("metrics"))
        recent = get("memory/recent", limit=10)
        write("memory-recent.json", recent)
        lessons = get("lessons", limit=10)
        write("lessons.json", lessons)
        write("policy.json", get("memory/policy"))

        auto = next((i for i in queue["items"] if i["status"] == "auto_resolved"), queue["items"][0])
        row = next((a for a in autonomy if a["vendor_id"] == STORY_VENDOR), autonomy[0])
        lesson = lessons[0]
        write(
            "revoke-result.json",
            {
                "lesson": {
                    **lesson,
                    "revoked": True,
                    "revoked_by": "Meera (AP lead)",
                    "revoke_reason": "Agreement ended in June; freight now needs a PO line.",
                },
                "autonomy": {**row, "level": "suggest", "streak": 0},
                "memory_deleted": True,
                "invalidated_recommendations": 1,
            },
        )

        # ---------------------------------------------------------- state-changing, at the Twist
        ok(c.post("/api/demo/advance", json={"stage": "twist"}))
        open_items = get("exceptions", status="open", limit=50)["items"]
        blocked = next((i for i in open_items if i["blocking"]), open_items[0])
        write(
            "resolve-result.json",
            ok(
                c.post(
                    f"/api/exceptions/{blocked['id']}/resolve",
                    json={
                        "decision": "escalate",
                        "reason": "Called the vendor on the number in our master record: they never changed banks.",
                        "resolved_by": "Priya",
                    },
                )
            ),
        )
        write(
            "copilot-answer.json",
            ok(
                c.post(
                    "/api/copilot/ask",
                    json={"question": "What did we agree with Balaji about freight?", "vendor_id": STORY_VENDOR},
                )
            ),
        )
        with SAMPLE.open("rb") as f:
            write(
                "capture-result.json",
                ok(c.post("/api/invoices/capture", files={"file": (SAMPLE.name, f, "image/png")})),
            )
        write(
            "events.json",
            [
                {"event": "exception.created", "data": queue["items"][0]},
                {"event": "exception.updated", "data": auto},
                {"event": "memory.retained", "data": recent[0] if recent else None},
                {"event": "autonomy.changed", "data": row},
                {"event": "sim.changed", "data": get("demo/state")},
                {"event": "memory.revoked", "data": {**lesson, "revoked": True, "revoked_by": "Meera (AP lead)"}},
            ],
        )
        ok(c.post("/api/demo/reset"))
        ok(c.patch("/api/settings", json={"memory_enabled": True}))
    print(f"mocks written to {OUT}; demo reset to Day 1")


if __name__ == "__main__":
    main()
