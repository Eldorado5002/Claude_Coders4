"""Precedent API — run with: uv run fastapi dev app/main.py"""

import asyncio
import contextlib
import json
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from app.api.routes import router
from app.config import get_settings
from app.db import get_engine, get_state, init_db
from app.memory.store import get_memory
from app.models import Vendor
from app.services import demo, push
from app.services.events import bus
from app.services.sim import get_sim

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("precedent")


async def _bootstrap() -> None:
    """Fresh database -> seed it and open Day 1 (from snapshot if built, else simulate day 0 live)."""
    init_db()
    with Session(get_engine()) as s:
        empty = s.exec(select(Vendor)).first() is None
    if empty:
        from app.data.seed import seed

        log.info("empty database — seeding synthetic dataset")
        seed()
    with Session(get_engine()) as s:
        day = int(get_state(s, "sim_day", -1))
    if day < 0:
        if demo.has_snapshot("day1"):
            demo.restore("day1")
        else:
            log.info("no demo snapshot — simulating Day 1 live")
            await get_sim().advance_to(0)


async def _push_listener() -> None:
    """Forward the important live events to installed PWAs (throttled)."""
    q = bus.subscribe()
    last = 0.0
    try:
        while True:
            event, payload = await q.get()
            if not push.enabled() or get_sim().busy or time.time() - last < 5:
                continue
            data = json.loads(payload)
            if event == "exception.created" and data.get("blocking"):
                last = time.time()
                await push.notify(
                    "Hard control blocked an invoice",
                    f"{data['vendor']['name']} · {data['primary_type'].replace('_', ' ')} — needs review",
                    f"/exceptions/{data['id']}",
                )
            elif event == "exception.updated" and data.get("status") == "auto_resolved":
                last = time.time()
                await push.notify(
                    "Precedent auto-resolved an exception",
                    f"{data['vendor']['name']} · {data['primary_type'].replace('_', ' ')}",
                    f"/exceptions/{data['id']}",
                )
    finally:
        bus.unsubscribe(q)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _bootstrap()
    listener = asyncio.create_task(_push_listener())
    yield
    listener.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await listener
    await get_memory().close()


app = FastAPI(
    title="Precedent API",
    description="Accounts-payable exception agent that learns from every resolution (Hindsight memory).",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


API_INFO = {"name": "Precedent API", "docs": "/docs", "openapi": "/openapi.json"}
NO_CACHE = {"Cache-Control": "no-cache"}  # the service worker and index must never be stale
IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}  # hashed build assets


def _web_app() -> Path | None:
    dist = get_settings().frontend_dist
    return Path(dist).resolve() if dist and (Path(dist) / "index.html").is_file() else None


@app.get("/", include_in_schema=False, response_model=None)
def root() -> dict | FileResponse:
    web = _web_app()
    return FileResponse(web / "index.html", headers=NO_CACHE) if web else API_INFO


@app.get("/{path:path}", include_in_schema=False, response_model=None)
def web_app(path: str) -> FileResponse:
    """The built frontend, when FRONTEND_DIST is set: real files as they are, every other path gets index.html
    so deep links like /exceptions/EXC-0010 load the app. API routes are matched before this."""
    web = _web_app()
    if web is None or path == "api" or path.startswith("api/"):
        raise HTTPException(404, "Not found")
    f = (web / path).resolve()
    if web in f.parents and f.is_file():
        headers = IMMUTABLE if path.startswith("assets/") else NO_CACHE
        return FileResponse(f, headers=headers)
    return FileResponse(web / "index.html", headers=NO_CACHE)
