"""Write docs/mocks/ from the app's real responses, so the mocks can never drift from the API.

It drives the real FastAPI app in-process against the demo database and Hindsight banks that
scripts/build_demo.py builds, and writes three sets:

  docs/mocks/*.json              Week 3: the frontend's fixture mode. One open case (Balaji freight,
                                 recommended with memory), plus the state-changing calls made at
                                 that stage: accepting it promotes the lane to auto, the copilot
                                 answers, and the sample invoice is captured.
  docs/mocks/twist/*.json        The Twist: hard controls, MSME deadlines, vendor risk, and the three
                                 sample invoices captured (auto-resolved, held, escalated).
  docs/mocks/replay-end/*.json   End of the 26-week replay (from data/eval.json): the certified
                                 autonomy certificate, calibration and cost, for designing those states.

Every lesson these calls write into a stage's memory bank is deleted again afterwards, so the
demo banks stay exactly as build_demo left them. Revoking a lesson would delete a memory from a
demo bank, so that one mock is assembled from real lesson and autonomy objects.

Costs about $0.06 (one copilot answer and four invoice captures).
Run (after build_demo): uv run python -m scripts.make_mocks
"""

import asyncio
import json
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.memory.store import get_memory
from app.services.demo import stage_bank
from app.services.metrics import load_eval

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "mocks"
SAMPLES = ROOT / "docs" / "samples"
STORY_VENDOR = "V001"
TOUCHED: dict[str, list[str]] = {}  # stage -> case ids whose lessons we must forget


def write(name: str, data, folder: Path = OUT) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  {folder.relative_to(ROOT).as_posix()}/{name}")


def ok(r):
    assert r.status_code < 300, f"{r.request.method} {r.request.url} -> {r.status_code}: {r.text[:300]}"
    return r.json()


def capture(c, name: str) -> dict:
    with (SAMPLES / name).open("rb") as f:
        return ok(c.post("/api/invoices/capture", files={"file": (name, f, "image/png")}))


def week3(c) -> None:
    ok(c.post("/api/demo/advance", json={"stage": "week3"}))
    get = lambda path, **params: ok(c.get(f"/api/{path}", params=params))  # noqa: E731
    write("health.json", get("health"))
    write("settings.json", get("settings"))
    write("demo-state.json", get("demo/state"))
    queue = get("exceptions", status="all", limit=100)
    write("exceptions.json", queue)
    open_case = next(i for i in queue["items"] if i["status"] == "open")
    write("exception-detail.json", get(f"exceptions/{open_case['id']}"))
    # the same case with memory switched off: powers "Memory changed this verdict"
    ok(c.patch("/api/settings", json={"memory_enabled": False}))
    write("exception-detail-memory-off.json", get(f"exceptions/{open_case['id']}"))
    ok(c.patch("/api/settings", json={"memory_enabled": True}))
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

    row = next((a for a in autonomy if a["vendor_id"] == STORY_VENDOR), autonomy[0])
    lesson = lessons[0]
    write(
        "revoke-result.json",
        {
            "lesson": {
                **lesson,
                "revoked": True,
                "revoked_by": "Sneha (AP Lead)",
                "revoke_reason": "Agreement ended in June; freight now needs a PO line.",
            },
            "autonomy": {**row, "level": "suggest", "streak": 0},
            "memory_deleted": True,
            "invalidated_recommendations": 1,
        },
    )

    # state-changing calls: accept the open case (third in a row, so the lane is promoted), ask, capture
    resolved = ok(
        c.post(
            f"/api/exceptions/{open_case['id']}/resolve",
            json={
                "decision": "approve",
                "reason": "Freight within the ₹5,000 per-trip agreement with Balaji.",
                "resolved_by": "Priya (AP)",
            },
        )
    )
    write("resolve-result.json", resolved)
    write(
        "copilot-answer.json",
        ok(
            c.post(
                "/api/copilot/ask",
                json={"question": "What did we agree with Balaji about freight?", "vendor_id": STORY_VENDOR},
            )
        ),
    )
    captured = capture(c, "invoice-balaji-freight.png")
    write("capture-result.json", captured)
    TOUCHED["week3"] = [open_case["id"], captured.get("exception_id")]
    write(
        "events.json",
        [
            {"event": "exception.created", "data": open_case},
            {"event": "exception.updated", "data": {**open_case, "status": "resolved"}},
            {"event": "memory.retained", "data": recent[0] if recent else None},
            {"event": "autonomy.changed", "data": resolved["autonomy"]},
            {"event": "sim.changed", "data": get("demo/state")},
            {"event": "memory.revoked", "data": {**lesson, "revoked": True, "revoked_by": "Sneha (AP Lead)"}},
        ],
    )


def twist(c) -> None:
    folder = OUT / "twist"
    ok(c.post("/api/demo/advance", json={"stage": "twist"}))
    get = lambda path, **params: ok(c.get(f"/api/{path}", params=params))  # noqa: E731
    queue = get("exceptions", status="open", sort="msme_deadline")
    write("exceptions-by-msme-deadline.json", queue, folder)
    control = next(i for i in queue["items"] if "bank_details_changed" in i["issue_types"])
    write("exception-detail-hard-control.json", get(f"exceptions/{control['id']}"), folder)
    msme = next(i for i in queue["items"] if i["msme_days_left"] is not None and not i["blocking"])
    write("exception-detail-msme.json", get(f"exceptions/{msme['id']}"), folder)
    write("vendor-profile.json", get(f"vendors/{STORY_VENDOR}"), folder)
    write("beliefs.json", get(f"vendors/{STORY_VENDOR}/beliefs"), folder)
    write("vendors.json", get("vendors"), folder)
    write("risk.json", get("risk"), folder)
    write("benford.json", get("benford"), folder)
    write("certificate.json", get("autonomy/certificate"), folder)
    write("metrics.json", get("metrics"), folder)
    write("autonomy.json", get("autonomy"), folder)
    touched = []
    for name, out in (
        ("invoice-balaji-freight.png", "capture-freight.json"),  # auto-resolved: the lane is on auto
        ("invoice-balaji-no-irn.png", "capture-no-irn.json"),  # held: e-invoice control
        ("invoice-balaji-bad-gstin.png", "capture-bad-gstin.json"),  # escalated: GSTIN control
    ):
        result = capture(c, name)
        write(out, result, folder)
        if result.get("exception_id"):
            touched.append(result["exception_id"])
            write(out.replace("capture-", "capture-case-"), get(f"exceptions/{result['exception_id']}"), folder)
    TOUCHED["twist"] = touched


def replay_end() -> None:
    folder = OUT / "replay-end"
    ev = load_eval() or {}
    end = (ev.get("end_of_timeline") or {}).get("on") or {}
    for key in ("certificate", "calibration", "performance", "kpis"):
        if key in end:
            write(f"{key}.json", end[key], folder)


async def forget() -> None:
    """Remove the lessons this script taught the demo banks (a missing document is fine)."""
    mem = get_memory()
    for stage, ids in TOUCHED.items():
        for cid in filter(None, ids):
            await mem.delete_document(stage_bank(stage), cid)
    await mem.close()


def main() -> None:
    with TestClient(app) as c:
        week3(c)
        time.sleep(10)  # let the background memory writes land, so we can remove them
        twist(c)
        time.sleep(10)
        ok(c.post("/api/demo/reset"))
        ok(c.patch("/api/settings", json={"memory_enabled": True}))
    asyncio.run(forget())
    replay_end()
    print(f"mocks written to {OUT}; demo reset to Day 1; demo banks cleaned")


if __name__ == "__main__":
    main()
