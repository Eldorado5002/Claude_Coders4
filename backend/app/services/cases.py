"""Case lifecycle: arrival -> 3-way match -> exception -> recommendation -> (auto-)resolution -> memory."""

import asyncio
import logging
from datetime import date, datetime, time, timedelta

from sqlmodel import Session, col, select

from app.agent.autonomy import (
    approved_envelope,
    can_auto_resolve,
    get_or_create,
    record_outcome,
    same_outcome,
    to_state,
)
from app.agent.recommender import CaseContext, Recommender, inr
from app.config import get_settings
from app.db import get_engine, get_state, set_state
from app.matching.engine import MatchInput, match_invoice
from app.memory.store import MemoryStore, get_memory
from app.ml.anomaly import anomaly_score
from app.models import Autonomy, ExceptionCase, GoodsReceipt, Invoice, PurchaseOrder, Vendor
from app.schemas import (
    Action,
    AutonomyLevel,
    BankAccount,
    CaseStatus,
    ExceptionDetail,
    ExceptionSummary,
    ExceptionType,
    GoodsReceiptDoc,
    GrnLine,
    InvoiceDoc,
    Issue,
    LineItem,
    MemoryItem,
    PurchaseOrderDoc,
    Recommendation,
    Resolution,
    ResolveRequest,
    ResolveResult,
    VendorRef,
)
from app.services.events import bus

log = logging.getLogger("precedent.cases")

INVOICE_STATUS = {
    Action.APPROVE: "paid",
    Action.APPROVE_ADJUSTED: "paid",
    Action.HOLD: "held",
    Action.REJECT: "rejected",
    Action.ESCALATE: "escalated",
}
DECISION_WORDS = {
    Action.APPROVE: "APPROVE (pay as invoiced)",
    Action.APPROVE_ADJUSTED: "APPROVE WITH ADJUSTMENT",
    Action.HOLD: "HOLD (sent back / waiting)",
    Action.REJECT: "REJECT",
    Action.ESCALATE: "ESCALATE",
}


# ---------------------------------------------------------------- state helpers


def sim_date(session: Session) -> date:
    s = get_settings()
    return s.sim_start + timedelta(days=max(0, int(get_state(session, "sim_day", 0))))


def memory_enabled(session: Session) -> bool:
    return bool(get_state(session, "memory_enabled", True))


def active_bank(session: Session) -> str:
    return get_state(session, "bank_id", None) or get_settings().hindsight_bank_id


def sim_now(session: Session) -> datetime:
    wall = datetime.now().time()
    return datetime.combine(sim_date(session), time(max(9, min(wall.hour, 18)), wall.minute))


# ---------------------------------------------------------------- converters


def row_dict(obj) -> dict:
    return obj.model_dump()


def vendor_ref(v: Vendor) -> VendorRef:
    return VendorRef(id=v.id, name=v.name, gstin=v.gstin, city=v.city, category=v.category)


def vendor_bank(v: Vendor) -> BankAccount:
    return BankAccount(bank_name=v.bank_name, account_number=v.account_number, ifsc=v.ifsc)


def invoice_doc(i: Invoice) -> InvoiceDoc:
    return InvoiceDoc(
        id=i.id,
        invoice_number=i.invoice_number,
        vendor_id=i.vendor_id,
        po_number=i.po_number,
        invoice_date=i.invoice_date,
        due_date=i.due_date,
        lines=[LineItem(**l) for l in i.lines],
        subtotal=i.subtotal,
        tax_total=i.tax_total,
        total=i.total,
        bank_account=BankAccount(bank_name=i.bank_name, account_number=i.account_number, ifsc=i.ifsc),
        source=i.source,  # type: ignore[arg-type]
    )


def po_doc(p: PurchaseOrder | None) -> PurchaseOrderDoc | None:
    if p is None:
        return None
    return PurchaseOrderDoc(
        po_number=p.po_number,
        vendor_id=p.vendor_id,
        po_date=p.po_date,
        lines=[LineItem(**l) for l in p.lines],
        subtotal=p.subtotal,
        tax_total=p.tax_total,
        total=p.total,
    )


def grn_doc(g: GoodsReceipt | None) -> GoodsReceiptDoc | None:
    if g is None:
        return None
    return GoodsReceiptDoc(
        grn_number=g.grn_number,
        po_number=g.po_number,
        received_date=g.received_date,
        lines=[GrnLine(**l) for l in g.lines],
    )


def current_rec(case: ExceptionCase, mem_on: bool) -> dict | None:
    if case.status != CaseStatus.OPEN and case.recommendation:
        return case.recommendation
    return (case.rec_variants or {}).get("on" if mem_on else "off") or None


def summary(session: Session, case: ExceptionCase, mem_on: bool | None = None) -> ExceptionSummary:
    mem_on = memory_enabled(session) if mem_on is None else mem_on
    v = session.get(Vendor, case.vendor_id)
    inv = session.get(Invoice, case.invoice_id)
    auto = session.get(Autonomy, f"{case.vendor_id}:{case.primary_type}")
    rec = current_rec(case, mem_on)
    level = AutonomyLevel(auto.level) if auto else (AutonomyLevel.LOCKED if case.blocking else AutonomyLevel.SUGGEST)
    return ExceptionSummary(
        id=case.id,
        status=CaseStatus(case.status),
        primary_type=ExceptionType(case.primary_type),
        issue_types=[ExceptionType(t) for t in case.issue_types],
        vendor=vendor_ref(v),
        invoice_number=inv.invoice_number,
        invoice_total=inv.total,
        amount_at_risk=case.amount_at_risk,
        created_at=case.created_at,
        recommended_action=Action(rec["action"]) if rec else None,
        confidence=rec["confidence"] if rec else None,
        autonomy_level=level,
        blocking=case.blocking,
    )


def detail(session: Session, case: ExceptionCase) -> ExceptionDetail:
    mem_on = memory_enabled(session)
    base = summary(session, case, mem_on)
    v = session.get(Vendor, case.vendor_id)
    inv = session.get(Invoice, case.invoice_id)
    po = session.get(PurchaseOrder, inv.po_number) if inv.po_number else None
    grn = (
        session.exec(select(GoodsReceipt).where(GoodsReceipt.po_number == inv.po_number)).first()
        if inv.po_number
        else None
    )
    auto = get_or_create(session, case.vendor_id, case.primary_type)
    rec = current_rec(case, mem_on)
    return ExceptionDetail(
        **base.model_dump(),
        invoice=invoice_doc(inv),
        purchase_order=po_doc(po),
        goods_receipt=grn_doc(grn),
        vendor_bank_on_file=vendor_bank(v),
        issues=[Issue(**i) for i in case.issues],
        recommendation=Recommendation(**rec) if rec else None,
        resolution=Resolution(**case.resolution) if case.resolution else None,
        autonomy=to_state(auto, v.name),
    )


# ---------------------------------------------------------------- memory text


def resolution_text(case: ExceptionCase, v: Vendor, inv: Invoice, res: dict, rec: dict | None) -> str:
    issues = " ".join(i["message"] for i in case.issues)
    decision = DECISION_WORDS[Action(res["decision"])]
    if res.get("adjusted_amount"):
        decision += f" — pay {inr(res['adjusted_amount'])}"
    when = res["resolved_at"]
    when = when if isinstance(when, datetime) else datetime.fromisoformat(str(when))
    parts = [
        f"Case {case.id} on {when:%d %b %Y}: {res['resolved_by']} resolved an invoice exception for vendor "
        f"{v.name} ({v.id}).",
        f"Invoice {inv.invoice_number}, total {inr(inv.total)}, PO {inv.po_number or 'none'}.",
        f"Exception type: {', '.join(case.issue_types)}. Details: {issues}",
        f'Decision: {decision}. Reason: "{res["reason"]}"',
    ]
    if res.get("resolved_by", "").startswith("Precedent"):
        parts.append("This was resolved automatically by Precedent (the AP agent) under earned autonomy.")
    elif rec:
        verdict = "the clerk agreed" if res.get("agreed_with_agent") else "the clerk overruled it"
        parts.append(
            f"Precedent (the AP agent) had recommended {Action(rec['action']).value.upper()} "
            f"with {float(rec['confidence']):.0%} confidence; {verdict}."
        )
    return "\n".join(parts)


def lesson_line(v: Vendor, case: ExceptionCase, res: dict) -> str:
    kind = case.primary_type.replace("_", " ")
    return f"{v.name} · {kind}: {Action(res['decision']).value.replace('_', ' ')} — “{res['reason']}”"


# ---------------------------------------------------------------- service


class CaseService:
    def __init__(self, memory: MemoryStore | None = None):
        self.memory = memory or get_memory()
        self.recommender = Recommender(self.memory)
        self.write_lock = asyncio.Lock()
        self.retain_enabled = True
        self._bg: set[asyncio.Task] = set()

    # ------------------------------------------------------------ arrivals

    def process_arrivals(self, day: int) -> list[str]:
        """3-way match every invoice arriving on `day`; open cases for exceptions. Returns new case ids."""
        s = get_settings()
        the_date = s.sim_start + timedelta(days=day)
        new_ids: list[str] = []
        with Session(get_engine()) as session:
            arrivals = session.exec(
                select(Invoice)
                .where(Invoice.arrival_date == the_date, Invoice.status == "pending")
                .order_by(col(Invoice.id))
            ).all()
            seq = int(get_state(session, "exception_seq", 0))
            for idx, inv in enumerate(arrivals):
                vendor = session.get(Vendor, inv.vendor_id)
                prior = session.exec(
                    select(Invoice).where(
                        Invoice.vendor_id == inv.vendor_id, Invoice.status != "pending", Invoice.id != inv.id
                    )
                ).all()
                po = session.get(PurchaseOrder, inv.po_number) if inv.po_number else None
                grn = (
                    session.exec(select(GoodsReceipt).where(GoodsReceipt.po_number == inv.po_number)).first()
                    if inv.po_number
                    else None
                )
                result = match_invoice(
                    MatchInput(
                        invoice=row_dict(inv),
                        vendor=row_dict(vendor),
                        po=row_dict(po) if po else None,
                        grn=row_dict(grn) if grn else None,
                        prior_invoices=[row_dict(p) for p in prior],
                        threshold=s.approval_threshold,
                    )
                )
                if not result.is_exception:
                    inv.status = "paid"
                    session.add(inv)
                    continue
                seq += 1
                case = ExceptionCase(
                    id=f"EXC-{seq:04d}",
                    invoice_id=inv.id,
                    vendor_id=inv.vendor_id,
                    status=CaseStatus.OPEN,
                    primary_type=result.primary_type.value,
                    issue_types=[t.value for t in result.types],
                    issues=[i.model_dump(mode="json") for i in result.issues],
                    amount_at_risk=result.amount_at_risk,
                    blocking=result.blocking,
                    created_at=datetime.combine(the_date, time(9, 0)) + timedelta(minutes=7 * idx),
                )
                inv.status = "exception"
                session.add(inv)
                session.add(case)
                get_or_create(session, case.vendor_id, case.primary_type)
                new_ids.append(case.id)
            session.commit()
            set_state(session, "exception_seq", seq)
            for cid in new_ids:
                bus.publish("exception.created", summary(session, session.get(ExceptionCase, cid)))
        return new_ids

    # ------------------------------------------------------------ recommendation

    def build_context(self, session: Session, case: ExceptionCase) -> CaseContext:
        v = session.get(Vendor, case.vendor_id)
        inv = session.get(Invoice, case.invoice_id)
        history = session.exec(
            select(Invoice).where(
                Invoice.vendor_id == v.id,
                Invoice.arrival_date < inv.arrival_date,
                Invoice.status != "pending",
            )
        ).all()
        score, typical = anomaly_score([row_dict(h) for h in history], row_dict(inv))
        return CaseContext(
            case_id=case.id,
            vendor=row_dict(v),
            invoice=row_dict(inv),
            issues=[Issue(**i) for i in case.issues],
            types=list(case.issue_types),
            primary_type=case.primary_type,
            blocking=case.blocking,
            amount_at_risk=case.amount_at_risk,
            sim_date=inv.arrival_date,
            anomaly=score,
            typical_total=typical,
            history_count=len(history),
        )

    async def recommend_case(self, case_id: str, *, force: bool = False, mem_on: bool | None = None) -> Recommendation:
        with Session(get_engine()) as session:
            case = session.get(ExceptionCase, case_id)
            if case is None:
                raise KeyError(case_id)
            mem_on = memory_enabled(session) if mem_on is None else mem_on
            key = "on" if mem_on else "off"
            if not force and (case.rec_variants or {}).get(key):
                return Recommendation(**case.rec_variants[key])
            ctx = self.build_context(session, case)
            bank = active_bank(session)
            now = case.created_at + timedelta(minutes=2)

        rec = await self.recommender.recommend(ctx, memory_enabled=mem_on, bank_id=bank, now=now)

        async with self.write_lock:
            with Session(get_engine()) as session:
                case = session.get(ExceptionCase, case_id)
                variants = dict(case.rec_variants or {})
                variants[key] = rec.model_dump(mode="json")
                case.rec_variants = variants
                if case.status == CaseStatus.OPEN:
                    case.recommendation = variants[key]
                    case.memory_enabled_at_rec = mem_on
                session.add(case)
                session.commit()

                auto_row = get_or_create(session, case.vendor_id, case.primary_type)
                envelope = approved_envelope(session, case.vendor_id, case.primary_type)
                if (
                    mem_on
                    and case.status == CaseStatus.OPEN
                    and can_auto_resolve(auto_row, variants[key], case, envelope)
                ):
                    rec = await self._auto_resolve(session, case, rec)
                else:
                    session.commit()
                    bus.publish("exception.updated", summary(session, case, mem_on))
        return rec

    async def _auto_resolve(self, session: Session, case: ExceptionCase, rec: Recommendation) -> Recommendation:
        rec = rec.model_copy(update={"auto_resolved": True})
        resolved_at = rec.generated_at + timedelta(seconds=5)
        res = Resolution(
            decision=rec.action,
            reason=f"Auto-resolved under earned autonomy. {rec.rationale}",
            adjusted_amount=rec.adjusted_amount,
            resolved_by="Precedent (auto)",
            resolved_at=resolved_at,
            agent_action=rec.action,
            agreed_with_agent=True,
        ).model_dump(mode="json")
        case.recommendation = rec.model_dump(mode="json")
        case.rec_variants = {**(case.rec_variants or {}), "on": case.recommendation}
        case.resolution = res
        case.status = CaseStatus.AUTO_RESOLVED
        inv = session.get(Invoice, case.invoice_id)
        inv.status = INVOICE_STATUS[rec.action]
        row = get_or_create(session, case.vendor_id, case.primary_type)
        row.auto_resolved += 1
        row.updated_at = resolved_at
        session.add_all([case, inv, row])
        session.commit()
        v = session.get(Vendor, case.vendor_id)
        self._retain(session, case, v, inv, res, case.recommendation)
        bus.publish("exception.updated", summary(session, case, True))
        return rec

    # ------------------------------------------------------------ resolution

    async def resolve(
        self, case_id: str, req: ResolveRequest, *, now: datetime | None = None, wait_retain: bool = False
    ) -> ResolveResult:
        async with self.write_lock:
            with Session(get_engine()) as session:
                case = session.get(ExceptionCase, case_id)
                if case is None:
                    raise KeyError(case_id)
                if case.status == CaseStatus.RESOLVED:
                    raise ValueError(f"{case_id} is already resolved")
                mem_on = memory_enabled(session)
                was_auto = case.status == CaseStatus.AUTO_RESOLVED
                # judge the agent on the recommendation the clerk actually saw (current memory mode)
                rec = case.recommendation if was_auto else (current_rec(case, mem_on) or case.recommendation)
                rec_mem_on = True if was_auto else (mem_on if current_rec(case, mem_on) else case.memory_enabled_at_rec)
                agent_action = rec["action"] if rec else None
                when = now or sim_now(session)
                if when < case.created_at:
                    when = case.created_at + timedelta(minutes=5)
                res = Resolution(
                    decision=req.decision,
                    reason=req.reason.strip(),
                    adjusted_amount=req.adjusted_amount if req.decision == Action.APPROVE_ADJUSTED else None,
                    resolved_by=req.resolved_by,
                    resolved_at=when,
                    agent_action=Action(agent_action) if agent_action else None,
                    agreed_with_agent=same_outcome(agent_action, req.decision) if agent_action else None,
                ).model_dump(mode="json")

                row = get_or_create(session, case.vendor_id, case.primary_type)
                # only memory-backed recommendations move the autonomy ladder
                counts = rec_mem_on and rec is not None
                promoted, demoted = record_outcome(row, agent_action if counts else None, req.decision, when)

                case.recommendation = rec
                case.memory_enabled_at_rec = rec_mem_on
                case.resolution = res
                case.status = CaseStatus.RESOLVED
                inv = session.get(Invoice, case.invoice_id)
                inv.status = INVOICE_STATUS[req.decision]
                session.add_all([case, inv, row])
                session.commit()

                v = session.get(Vendor, case.vendor_id)
                task = self._retain(session, case, v, inv, res, rec)
                result = ResolveResult(
                    exception=detail(session, case),
                    memory_id=case.id if self.retain_enabled else None,
                    lesson=lesson_line(v, case, res),
                    autonomy=to_state(row, v.name),
                    promoted=promoted,
                    demoted=demoted,
                )
                bus.publish("exception.updated", summary(session, case, mem_on))
                bus.publish("autonomy.changed", result.autonomy)
        if wait_retain and task is not None:
            await task
        return result

    def _retain(self, session: Session, case, v, inv, res: dict, rec: dict | None) -> asyncio.Task | None:
        if not self.retain_enabled:
            return None
        # capture plain values now: ORM objects expire once the session closes
        content = resolution_text(case, v, inv, res, rec)
        bank = active_bank(session)
        case_id, vendor_id = case.id, v.id
        types, primary = list(case.issue_types), case.primary_type
        lesson = lesson_line(v, case, res)
        when = res["resolved_at"]
        when = when if isinstance(when, datetime) else datetime.fromisoformat(str(when))

        async def run():
            try:
                await self.memory.retain_resolution(
                    bank,
                    content=content,
                    case_id=case_id,
                    vendor_id=vendor_id,
                    types=types,
                    decision=res["decision"],
                    when=when,
                )
                bus.publish(
                    "memory.retained",
                    MemoryItem(
                        id=case_id,
                        kind="world",
                        text=lesson,
                        vendor_id=vendor_id,
                        exception_type=ExceptionType(primary),
                        occurred_at=when,
                    ),
                )
            except Exception as e:  # noqa: BLE001
                log.error("retain failed for %s: %s", case_id, e)

        task = asyncio.create_task(run())
        self._bg.add(task)
        task.add_done_callback(self._bg.discard)
        return task

    async def drain(self) -> None:
        """Wait for pending memory writes (used by the simulator between days)."""
        while self._bg:
            await asyncio.gather(*list(self._bg), return_exceptions=True)


_service: CaseService | None = None


def get_cases() -> CaseService:
    global _service
    if _service is None:
        _service = CaseService()
    return _service
