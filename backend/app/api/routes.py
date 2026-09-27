import asyncio
import logging
import time
from collections.abc import AsyncIterable

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Response, UploadFile
from fastapi.sse import EventSourceResponse, ServerSentEvent
from sqlmodel import Session, col, func, select

from app.agent.autonomy import to_state
from app.config import get_settings
from app.db import get_engine, get_state, set_state
from app.memory.store import citations_from, get_memory
from app.models import Autonomy, ExceptionCase, Invoice, Vendor
from app.schemas import (
    AdvanceRequest,
    AutonomyLevel,
    AutonomyState,
    BenfordResult,
    CaptureResult,
    CaseStatus,
    Citation,
    CitationKind,
    CopilotAnswer,
    CopilotRequest,
    DemoState,
    ExceptionDetail,
    ExceptionSummary,
    ExceptionType,
    Health,
    Lesson,
    MemoryItem,
    Metrics,
    Page,
    PolicyDoc,
    PublicKey,
    PushSubscription,
    ResolveRequest,
    ResolveResult,
    RevokeRequest,
    RevokeResult,
    Settings,
    SettingsPatch,
    VendorProfile,
    VendorRisk,
    VendorRiskRow,
    VendorSummary,
)
from app.services import demo, push
from app.services.capture import capture_invoice
from app.services.cases import (
    active_bank,
    detail,
    get_cases,
    memory_enabled,
    sim_date,
    summary,
    to_lesson,
    vendor_bank,
    vendor_ref,
)
from app.services.events import bus
from app.services.metrics import compute_metrics
from app.services.risk import all_vendor_risk, portfolio_benford, portfolio_exception_rate, vendor_risk
from app.services.sim import get_sim

log = logging.getLogger("precedent.api")
router = APIRouter(prefix="/api")

_health_cache: dict[str, tuple[float, bool]] = {}
_inflight: set[str] = set()


async def hindsight_up(bank: str) -> bool:
    hit = _health_cache.get(bank)
    if hit and time.time() - hit[0] < 30:
        return hit[1]
    ok = await get_memory().health(bank)
    _health_cache[bank] = (time.time(), ok)
    return ok


# ---------------------------------------------------------------- health & settings


@router.get("/health", response_model=Health)
async def health() -> Health:
    with Session(get_engine()) as s:
        bank, mem_on, today = active_bank(s), memory_enabled(s), sim_date(s)
    up = await hindsight_up(bank)
    return Health(
        status="ok" if up else "degraded", hindsight="up" if up else "down", memory_enabled=mem_on, sim_date=today
    )


def _settings(s: Session) -> Settings:
    from app.llm.router import get_router

    return Settings(
        memory_enabled=memory_enabled(s),
        bank_id=active_bank(s),
        llm_chain=get_router().chain,
        sim_date=sim_date(s),
        stage=get_state(s, "stage", "day1"),
    )


@router.get("/settings", response_model=Settings)
def read_settings() -> Settings:
    with Session(get_engine()) as s:
        return _settings(s)


@router.patch("/settings", response_model=Settings)
def patch_settings(body: SettingsPatch) -> Settings:
    with Session(get_engine()) as s:
        if body.memory_enabled is not None:
            set_state(s, "memory_enabled", body.memory_enabled)
        return _settings(s)


# ---------------------------------------------------------------- exceptions


def _ensure_rec(background: BackgroundTasks, case: ExceptionCase, mem_on: bool) -> None:
    key = "on" if mem_on else "off"
    if case.status == CaseStatus.OPEN and not (case.rec_variants or {}).get(key) and case.id + key not in _inflight:
        _inflight.add(case.id + key)

        async def run():
            try:
                await get_cases().recommend_case(case.id, mem_on=mem_on)
            finally:
                _inflight.discard(case.id + key)

        background.add_task(run)


@router.get("/exceptions", response_model=Page[ExceptionSummary])
def list_exceptions(
    status: str = Query("open", pattern="^(open|auto_resolved|resolved|all)$"),
    vendor_id: str | None = None,
    type: ExceptionType | None = None,
    sort: str = Query("newest", pattern="^(newest|msme_deadline|amount)$"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> Page[ExceptionSummary]:
    with Session(get_engine()) as s:
        q = select(ExceptionCase)
        if status != "all":
            q = q.where(ExceptionCase.status == status)
        if vendor_id:
            q = q.where(ExceptionCase.vendor_id == vendor_id)
        if type:
            q = q.where(ExceptionCase.primary_type == type.value)
        total = s.exec(select(func.count()).select_from(q.subquery())).one()
        mem_on = memory_enabled(s)
        if sort == "newest":
            rows = s.exec(q.order_by(col(ExceptionCase.created_at).desc()).offset(offset).limit(limit)).all()
            return Page[ExceptionSummary](items=[summary(s, c, mem_on) for c in rows], total=total)
        items = [summary(s, c, mem_on) for c in s.exec(q).all()]
        if sort == "msme_deadline":
            items.sort(key=lambda x: (x.msme_days_left is None, x.msme_days_left or 0, -x.amount_at_risk))
        else:
            items.sort(key=lambda x: -x.amount_at_risk)
        return Page[ExceptionSummary](items=items[offset : offset + limit], total=total)


def _case_or_404(s: Session, case_id: str) -> ExceptionCase:
    case = s.get(ExceptionCase, case_id)
    if case is None:
        raise HTTPException(404, f"Exception {case_id} not found")
    return case


@router.get("/exceptions/{case_id}", response_model=ExceptionDetail)
def get_exception(case_id: str, background: BackgroundTasks) -> ExceptionDetail:
    with Session(get_engine()) as s:
        case = _case_or_404(s, case_id)
        _ensure_rec(background, case, memory_enabled(s))
        return detail(s, case)


@router.post("/exceptions/{case_id}/recommend", response_model=ExceptionDetail)
async def recommend(case_id: str) -> ExceptionDetail:
    with Session(get_engine()) as s:
        case = _case_or_404(s, case_id)
        if case.status != CaseStatus.OPEN:
            raise HTTPException(409, f"{case_id} is already {case.status}")
    await get_cases().recommend_case(case_id, force=True)
    with Session(get_engine()) as s:
        return detail(s, s.get(ExceptionCase, case_id))


@router.post("/exceptions/{case_id}/resolve", response_model=ResolveResult)
async def resolve(case_id: str, body: ResolveRequest) -> ResolveResult:
    try:
        return await get_cases().resolve(case_id, body)
    except KeyError as e:
        raise HTTPException(404, f"Exception {case_id} not found") from e
    except ValueError as e:
        raise HTTPException(409, str(e)) from e


# ---------------------------------------------------------------- vendors & autonomy


def _vendor_summary(s: Session, v: Vendor, risk: VendorRisk | None = None) -> VendorSummary:
    msme = (v.profile or {}).get("msme") or {}
    arrived = s.exec(select(Invoice).where(Invoice.vendor_id == v.id, Invoice.status != "pending")).all()
    cases = s.exec(select(ExceptionCase).where(ExceptionCase.vendor_id == v.id)).all()
    auto = sum(1 for c in cases if c.status == CaseStatus.AUTO_RESOLVED)
    return VendorSummary(
        id=v.id,
        name=v.name,
        gstin=v.gstin,
        city=v.city,
        category=v.category,
        state=v.state,
        payment_terms_days=v.payment_terms_days,
        invoices_count=len(arrived),
        exceptions_count=len(cases),
        open_exceptions=sum(1 for c in cases if c.status == CaseStatus.OPEN),
        touchless_rate=round(auto / len(cases), 3) if cases else None,
        msme_category=msme.get("category"),
        e_invoice_required=bool((v.profile or {}).get("e_invoice")),
        risk_score=risk.score if risk else None,
        risk_level=risk.level if risk else None,
    )


@router.get("/vendors", response_model=list[VendorSummary])
def list_vendors() -> list[VendorSummary]:
    with Session(get_engine()) as s:
        risks = {v.id: r for v, r in all_vendor_risk(s)}
        return [_vendor_summary(s, v, risks[v.id]) for v in s.exec(select(Vendor).order_by(col(Vendor.id))).all()]


@router.get("/vendors/{vendor_id}", response_model=VendorProfile)
async def vendor_profile(vendor_id: str) -> VendorProfile:
    with Session(get_engine()) as s:
        v = s.get(Vendor, vendor_id)
        if v is None:
            raise HTTPException(404, f"Vendor {vendor_id} not found")
        risk = vendor_risk(s, v, portfolio_exception_rate(s))
        base = _vendor_summary(s, v, risk)
        udyam = ((v.profile or {}).get("msme") or {}).get("udyam")
        bank = active_bank(s)
        mem_on = memory_enabled(s)
        recent = s.exec(
            select(ExceptionCase)
            .where(ExceptionCase.vendor_id == vendor_id)
            .order_by(col(ExceptionCase.created_at).desc())
            .limit(10)
        ).all()
        recent_summaries = [summary(s, c, mem_on) for c in recent]
        autonomy = [to_state(a, v.name) for a in s.exec(select(Autonomy).where(Autonomy.vendor_id == vendor_id)).all()]
        name = v.name
        bank_acct = vendor_bank(v)

    learned: list[Citation] = []
    playbook = None
    if base.exceptions_count:
        mem = get_memory()
        try:
            facts, playbook = await asyncio.gather(
                mem.recall(
                    bank,
                    f"How does the AP team handle invoices from {name}?",
                    vendor_id=vendor_id,
                    fact_types=["observation"],
                    strict=True,
                ),
                mem.playbook(bank, vendor_id, name),
            )
            learned = [Citation(id=str(f.id), kind=CitationKind.OBSERVATION, text=f.text) for f in facts[:8]]
        except Exception as e:  # noqa: BLE001
            log.warning("vendor memory unavailable: %s", e)
    return VendorProfile(
        **base.model_dump(),
        bank_account=bank_acct,
        learned=learned,
        playbook=playbook,
        recent=recent_summaries,
        autonomy=autonomy,
        risk=risk,
        udyam=udyam,
    )


@router.get("/risk", response_model=list[VendorRiskRow])
def risk_ranking() -> list[VendorRiskRow]:
    """Vendors ranked by fraud and control risk."""
    with Session(get_engine()) as s:
        return [VendorRiskRow(vendor=vendor_ref(v), risk=r) for v, r in all_vendor_risk(s)]


@router.get("/benford", response_model=BenfordResult)
def benford_portfolio() -> BenfordResult:
    """Benford first-digit test over every line amount received so far."""
    with Session(get_engine()) as s:
        return portfolio_benford(s)


@router.get("/autonomy", response_model=list[AutonomyState])
def autonomy() -> list[AutonomyState]:
    order = {AutonomyLevel.AUTO: 0, AutonomyLevel.SUGGEST: 1, AutonomyLevel.LOCKED: 2}
    with Session(get_engine()) as s:
        names = {v.id: v.name for v in s.exec(select(Vendor)).all()}
        rows = [to_state(a, names.get(a.vendor_id, a.vendor_id)) for a in s.exec(select(Autonomy)).all()]
    return sorted(rows, key=lambda r: (order[r.level], -(r.accepted + r.auto_resolved), r.vendor_id))


# ---------------------------------------------------------------- metrics & memory


_mem_count: tuple[float, int] = (0.0, 0)


@router.get("/metrics", response_model=Metrics)
async def metrics() -> Metrics:
    global _mem_count
    with Session(get_engine()) as s:
        bank = active_bank(s)
        resolved = s.exec(
            select(func.count()).select_from(ExceptionCase).where(ExceptionCase.status != CaseStatus.OPEN)
        ).one()
    count = resolved
    if time.time() - _mem_count[0] < 30:
        count = _mem_count[1]
    else:
        try:
            await get_memory().ensure_bank(bank)
            resp = await asyncio.wait_for(get_memory().client.alist_memories(bank, limit=1), timeout=6)
            count = int(resp.total or resolved)
            _mem_count = (time.time(), count)
        except Exception:  # noqa: BLE001
            pass
    with Session(get_engine()) as s:
        return compute_metrics(s, count)


def _memory_item(m) -> MemoryItem:
    tags = m.tags or []
    vendor = next((t.split(":", 1)[1] for t in tags if t.startswith("vendor:")), None)
    exc = next((t.split(":", 1)[1] for t in tags if t.startswith("exc:")), None)
    kind = m.fact_type if m.fact_type in CitationKind._value2member_map_ else "world"
    return MemoryItem(
        id=str(m.id),
        kind=kind,
        text=m.text,
        vendor_id=vendor,
        exception_type=exc if exc in ExceptionType._value2member_map_ else None,
        occurred_at=m.occurred_start or m.mentioned_at,
    )


@router.get("/memory/recent", response_model=list[MemoryItem])
async def recent_memory(limit: int = Query(20, ge=1, le=100)) -> list[MemoryItem]:
    with Session(get_engine()) as s:
        bank = active_bank(s)
    try:
        items = await get_memory().recent(bank, limit=limit)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"Hindsight unavailable: {e}") from e
    return [_memory_item(m) for m in items]


@router.post("/copilot/ask", response_model=CopilotAnswer)
async def copilot(body: CopilotRequest) -> CopilotAnswer:
    with Session(get_engine()) as s:
        bank = active_bank(s)
    try:
        resp, cites, ms = await get_memory().reflect(
            bank,
            f"{body.question}\n\nAnswer as Precedent for the AP team in a few short markdown sentences or bullets. "
            "Quote exact amounts, limits and dates from memory. Say so if memory has no answer.",
            vendor_id=body.vendor_id,
            budget="mid",
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"Hindsight unavailable: {e}") from e
    cites = [c for c in citations_from(resp) if c.kind != CitationKind.DIRECTIVE] or cites
    return CopilotAnswer(answer=resp.text or "", citations=cites, latency_ms=ms)


# ---------------------------------------------------------------- lessons (review what the agent learned)


@router.get("/lessons", response_model=list[Lesson])
def list_lessons(
    vendor_id: str | None = None,
    include_revoked: bool = True,
    limit: int = Query(50, ge=1, le=500),
) -> list[Lesson]:
    with Session(get_engine()) as s:
        q = select(ExceptionCase).where(ExceptionCase.status != CaseStatus.OPEN)
        if vendor_id:
            q = q.where(ExceptionCase.vendor_id == vendor_id)
        lessons = [to_lesson(s, c) for c in s.exec(q).all() if c.resolution]
    if not include_revoked:
        lessons = [l for l in lessons if not l.revoked]
    return sorted(lessons, key=lambda l: l.taught_at, reverse=True)[:limit]


@router.post("/lessons/{case_id}/revoke", response_model=RevokeResult)
async def revoke_lesson(case_id: str, body: RevokeRequest) -> RevokeResult:
    try:
        return await get_cases().revoke_lesson(case_id, body)
    except KeyError as e:
        raise HTTPException(404, f"No lesson for {case_id}") from e
    except ValueError as e:
        raise HTTPException(409, str(e)) from e


@router.get("/memory/policy", response_model=PolicyDoc)
async def team_policy() -> PolicyDoc:
    with Session(get_engine()) as s:
        bank = active_bank(s)
    try:
        content, refreshed = await get_memory().team_policy(bank)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"Hindsight unavailable: {e}") from e
    return PolicyDoc(content=content, refreshed_at=refreshed)


# ---------------------------------------------------------------- capture


@router.post("/invoices/capture", response_model=CaptureResult)
async def capture(file: UploadFile) -> CaptureResult:
    mime = file.content_type or "image/jpeg"
    if mime not in ("image/jpeg", "image/png", "image/webp", "application/pdf"):
        raise HTTPException(415, "Upload a JPG, PNG, WEBP or PDF")
    data = await file.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 12 MB)")
    try:
        return await capture_invoice(data, mime)
    except Exception as e:  # noqa: BLE001
        log.exception("capture failed")
        raise HTTPException(502, f"Could not read the invoice: {e}") from e


# ---------------------------------------------------------------- demo


@router.get("/demo/state", response_model=DemoState)
def get_demo_state() -> DemoState:
    return demo.demo_state(busy=get_sim().busy)


async def _goto(stage: str) -> DemoState:
    sim = get_sim()
    if sim.busy:
        raise HTTPException(409, "The simulator is busy — try again in a moment")
    if demo.has_snapshot(stage):
        demo.restore(stage)
    else:
        target = demo.STAGE_DAY[stage]
        current = sim.current_day()
        if target < current:
            raise HTTPException(409, "No snapshot to go back to — run scripts/build_demo.py, or reset")
        await sim.advance_to(target)
        with Session(get_engine()) as s:
            set_state(s, "stage", stage)
    state = demo.demo_state()
    bus.publish("sim.changed", state)
    return state


@router.post("/demo/advance", response_model=DemoState)
async def advance(body: AdvanceRequest) -> DemoState:
    return await _goto(body.stage)


@router.post("/demo/reset", response_model=DemoState)
async def reset() -> DemoState:
    if demo.has_snapshot("day1"):
        return await _goto("day1")
    from app.data.seed import seed

    seed()
    await get_memory().delete_bank(get_settings().hindsight_bank_id)
    return await _goto("day1")


# ---------------------------------------------------------------- events & push


@router.get("/events", response_class=EventSourceResponse)
async def events() -> AsyncIterable[ServerSentEvent]:
    q = bus.subscribe()
    try:
        yield ServerSentEvent(comment="connected", retry=3000)
        while True:
            event, payload = await q.get()
            yield ServerSentEvent(raw_data=payload, event=event)
    finally:
        bus.unsubscribe(q)


@router.get("/push/public-key", response_model=PublicKey)
def push_key() -> PublicKey:
    key = get_settings().vapid_public_key
    if not key:
        raise HTTPException(404, "Push is not configured")
    return PublicKey(key=key)


@router.post("/push/subscribe", status_code=204)
def push_subscribe(body: PushSubscription) -> Response:
    push.save_subscription(body.endpoint, body.keys)
    return Response(status_code=204)
