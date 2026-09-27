"""Recommendation pipeline.

1. Hard controls (already computed by the matching engine) decide the action when they fire.
2. Memory ON  -> Hindsight reflect() over this vendor's + this exception type's precedents,
                 with directives and mental models, returning typed output + citations.
                 If reflect fails -> recall() + LLM router with the recalled precedents.
3. Memory OFF -> LLM router with only the documents (the stateless-assistant baseline).
4. The per-vendor anomaly score (IsolationForest) caps confidence on unusual invoices.
"""

import logging
import time
from dataclasses import dataclass, field
from datetime import date, datetime

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.config import get_settings
from app.llm.router import LlmUnavailable, get_router, strict_schema
from app.memory.store import DIRECTIVES, MemoryStore, get_memory
from app.schemas import Action, Citation, CitationKind, ExceptionType, Issue, Recommendation, RecSource
from app.services.compliance import msme_note

log = logging.getLogger("precedent.agent")

CONTROL_ACTION = {
    ExceptionType.DUPLICATE_INVOICE: Action.REJECT,
    ExceptionType.BANK_DETAILS_CHANGED: Action.ESCALATE,
    ExceptionType.OVER_THRESHOLD: Action.ESCALATE,
    ExceptionType.NEW_VENDOR: Action.ESCALATE,
    ExceptionType.INVALID_GSTIN: Action.ESCALATE,
    ExceptionType.EINVOICE_MISSING: Action.HOLD,
}
MEMORY_KINDS = {CitationKind.OBSERVATION, CitationKind.WORLD, CitationKind.EXPERIENCE, CitationKind.MENTAL_MODEL}
CONTROL_ORDER = [
    ExceptionType.DUPLICATE_INVOICE,
    ExceptionType.BANK_DETAILS_CHANGED,
    ExceptionType.INVALID_GSTIN,
    ExceptionType.OVER_THRESHOLD,
    ExceptionType.NEW_VENDOR,
    ExceptionType.EINVOICE_MISSING,
]
DIRECTIVE_FOR = {
    ExceptionType.BANK_DETAILS_CHANGED: DIRECTIVES[0],
    ExceptionType.DUPLICATE_INVOICE: DIRECTIVES[1],
    ExceptionType.NEW_VENDOR: DIRECTIVES[2],
    ExceptionType.OVER_THRESHOLD: DIRECTIVES[3],
    ExceptionType.EINVOICE_MISSING: DIRECTIVES[5],
    ExceptionType.INVALID_GSTIN: DIRECTIVES[6],
}
ANOMALY_CAP = 0.9
REFLECT_COST = 0.05  # Hindsight Cloud: flat price per reflect call
RECALL_COST = 0.0005  # recall is billed per output token; a typical call costs well under a tenth of a cent
FAST_MIN_ACCEPTED = 2  # routine = this vendor x type already has accepted precedents
NL = chr(10)


class RecDraft(BaseModel):
    """What the model must return."""

    action: Action = Field(description="One of approve, approve_adjusted, hold, reject, escalate")
    confidence: float = Field(ge=0, le=1, description="0-1. Low (<0.5) when no precedent applies.")
    adjusted_amount: float | None = Field(
        description="Only for approve_adjusted: the corrected total to pay in rupees. Otherwise null."
    )
    rationale: str = Field(description="One or two sentences. Name the precedent and the exact limit or condition.")
    precedent_found: bool = Field(description="True only if a past decision for this vendor or policy applies.")

    @field_validator("adjusted_amount", "confidence", mode="before")
    @classmethod
    def _numberish(cls, v):
        """Models sometimes send 'null', '₹4,200' or '0.9' as strings; anything else (e.g. '960 kg') -> None."""
        if isinstance(v, str):
            s = v.strip().lower().replace("₹", "").replace(",", "").replace("rs.", "").replace("rs", "").strip()
            if s in ("", "null", "none", "n/a", "na"):
                return None
            try:
                return float(s.rstrip("%")) / (100 if s.endswith("%") else 1)
            except ValueError:
                return None
        return v

    @field_validator("action", mode="before")
    @classmethod
    def _action(cls, v):
        if isinstance(v, str):
            s = v.strip().lower().replace(" ", "_").replace("-", "_")
            aliases = {
                "approved": "approve",
                "approve_with_adjustment": "approve_adjusted",
                "adjust": "approve_adjusted",
                "held": "hold",
                "rejected": "reject",
                "escalated": "escalate",
            }
            return aliases.get(s, s)
        return v

    @field_validator("precedent_found", mode="before")
    @classmethod
    def _boolish(cls, v):
        if isinstance(v, str):
            return v.strip().lower() in ("true", "yes", "1")
        return v


@dataclass
class CaseContext:
    case_id: str
    vendor: dict
    invoice: dict
    issues: list[Issue]
    types: list[str]
    primary_type: str
    blocking: bool
    amount_at_risk: float
    sim_date: date
    po: dict | None = None
    grn: dict | None = None
    anomaly: float | None = None
    typical_total: float | None = None
    history_count: int = 0
    extra: dict = field(default_factory=dict)


def inr(x: float | None) -> str:
    return "—" if x is None else f"₹{x:,.2f}"


ADJUSTABLE = {ExceptionType.QUANTITY_VARIANCE, ExceptionType.PRICE_VARIANCE, ExceptionType.TAX_MISMATCH}


def payable_amount(ctx: CaseContext) -> float:
    """Corrected amount to pay: invoice total minus the over-billing the 3-way match measured.
    Money math is done here, never by the LLM."""
    over = sum(max(0.0, i.variance_amount or 0.0) for i in ctx.issues if i.type in ADJUSTABLE and not i.blocking)
    return round(float(ctx.invoice["total"]) - over, 2)


def case_brief(ctx: CaseContext) -> str:
    inv, v = ctx.invoice, ctx.vendor
    lines = "\n".join(
        f"  {l['line_no']}. {l['description']} | qty {l['qty']:g} {l['uom']} @ {inr(l['unit_price'])} | GST "
        f"{l['tax_rate']:g}% | {inr(l['amount'])}"
        for l in inv["lines"]
    )
    issues = "\n".join(f"  - [{i.type.value}] {i.message}" for i in ctx.issues)
    anomaly = (
        "not enough history"
        if ctx.anomaly is None
        else f"{ctx.anomaly:.2f} (more unusual than {ctx.anomaly:.0%} of this vendor's past invoices)"
    )
    return (
        f"Date: {ctx.sim_date:%d %b %Y}\n"
        f"Vendor: {v['name']} ({v['id']}), {v['category'].replace('_', ' ')}, {v['city']}\n"
        f"Invoice {inv['invoice_number']} dated {inv['invoice_date']:%d %b %Y}, total {inr(inv['total'])}, "
        f"PO {inv.get('po_number') or 'none'}\n"
        f"Invoice lines:\n{lines}\n"
        f"Exceptions found by 3-way match:\n{issues}\n"
        f"Amount at risk: {inr(ctx.amount_at_risk)}\n"
        f"Typical invoice total for this vendor: {inr(ctx.typical_total)} | ML anomaly score: {anomaly}"
    )


QUESTION = (
    "How should the AP team resolve this exception? Use how the team resolved similar exceptions before — this "
    "vendor first, then the same exception type — and quote the exact limit or condition they applied. "
    "Actions: approve = pay as invoiced; approve_adjusted = pay a corrected amount (give it); hold = don't pay yet — "
    "send back to the vendor for justification, a revised invoice or missing goods (use this when a known limit or "
    "agreement is exceeded); reject = never pay (e.g. duplicate); escalate = needs a manager or treasury (bank "
    "changes, approval limits, new vendors, suspected fraud). If no precedent really applies, set "
    "precedent_found=false, choose hold or escalate, and keep confidence below 0.5."
)

NO_MEMORY_SYSTEM = (
    "You are an accounts-payable assistant at an Indian manufacturer. You have NO access to this company's history, "
    "vendor agreements, rate contracts or past decisions — judge only from the documents shown. Recommend the safest "
    "reasonable action and say what information is missing."
)

RECALL_SYSTEM = (
    "You are Precedent, a careful accounts-payable specialist. Recommend how to resolve an invoice exception using "
    "ONLY the team's past decisions listed below. Quote exact limits. If none apply, say so and choose hold or "
    "escalate with low confidence."
)


class Recommender:
    def __init__(self, memory: MemoryStore | None = None):
        self.memory = memory or get_memory()
        self.router = get_router()
        self.rag = None  # set only by the ablation study

    async def recommend(
        self, ctx: CaseContext, *, memory_enabled: bool, bank_id: str, now: datetime, mode: str | None = None
    ) -> Recommendation:
        """mode: hybrid (default) | reflect | recall | rag. Hybrid sends routine cases down the fast path."""
        mode = mode or get_settings().recommender_mode
        brief = case_brief(ctx)
        t0 = time.perf_counter()
        control = next((t for t in CONTROL_ORDER if t.value in ctx.types), None)
        citations: list[Citation] = []
        cost = 0.0

        if control is not None:
            # a hard control decides the action in code: no model call is needed
            forced = CONTROL_ACTION[control]
            msg = next(i.message for i in ctx.issues if i.type == control)
            citations = await self._control_citations(ctx, control, [], bank_id if memory_enabled else None)
            cost += RECALL_COST if memory_enabled else 0.0
            has_context = any(c.kind != CitationKind.DIRECTIVE for c in citations)
            context = (
                " Past decisions for this vendor are shown for context; they cannot override this rule."
                if has_context
                else ""
            )
            draft = RecDraft(
                action=forced,
                confidence=0.99,
                adjusted_amount=None,
                rationale=f"Hard control: {msg} Action: {forced.value}.{context}",
                precedent_found=False,
            )
            provider, route, source = "guardrail", "guardrail", RecSource.GUARDRAIL
        elif memory_enabled:
            draft = None
            route, provider = "reflect", ""
            if mode == "rag" and self.rag is not None:
                draft, citations, provider, cost = await self._rag_llm(ctx, brief)
                route = "fast"
            elif mode == "recall" or (mode == "hybrid" and ctx.extra.get("pair_accepted", 0) >= FAST_MIN_ACCEPTED):
                try:
                    fast = await self._recall_llm(ctx, brief, bank_id, require_observation=(mode == "hybrid"))
                except (LlmUnavailable, Exception) as e:  # noqa: BLE001 — fall through to reflect
                    log.warning("fast path failed for %s: %s", ctx.case_id, e)
                    fast = None
                if fast is not None:
                    draft, citations, provider, cost = fast
                    route = "fast"
            if draft is None:
                try:
                    resp, citations, _ = await self.memory.reflect(
                        bank_id,
                        "NEW INVOICE EXCEPTION" + NL + brief + NL + NL + QUESTION,
                        vendor_id=ctx.vendor["id"],
                        types=ctx.types,
                        response_schema=strict_schema(RecDraft),
                    )
                    draft = RecDraft.model_validate(resp.structured_output or {})
                    provider, cost = "hindsight-reflect", REFLECT_COST
                except (ValidationError, Exception) as e:  # noqa: BLE001 — any memory failure falls back
                    log.warning("reflect failed for %s, falling back to recall+LLM: %s", ctx.case_id, e)
                    cost += REFLECT_COST
                    try:
                        draft, citations, provider, extra_cost = await self._recall_llm(
                            ctx, brief, bank_id, require_observation=False
                        )
                        cost += extra_cost
                    except (LlmUnavailable, Exception) as e2:  # noqa: BLE001
                        log.error("recall fallback failed too: %s", e2)
                        draft = RecDraft(
                            action=Action.HOLD,
                            confidence=0.2,
                            adjusted_amount=None,
                            rationale="Memory and models unavailable — holding for manual review.",
                            precedent_found=False,
                        )
                        citations, provider = [], "rules"
            citations = [c for c in citations if c.kind != CitationKind.DIRECTIVE]
            evidence = any(c.kind in MEMORY_KINDS for c in citations)
            source = RecSource.MEMORY if (draft.precedent_found and evidence) else RecSource.NO_MEMORY
        else:
            route, source = "no_memory", RecSource.NO_MEMORY
            try:
                res = await self.router.structured(NO_MEMORY_SYSTEM, brief + NL + NL + QUESTION, RecDraft)
                draft, provider, cost = res.value, res.provider, res.cost_usd
            except LlmUnavailable as e:
                log.error("all LLMs unavailable: %s", e)
                draft = RecDraft(
                    action=Action.HOLD,
                    confidence=0.2,
                    adjusted_amount=None,
                    rationale="No model available — holding for manual review.",
                    precedent_found=False,
                )
                provider = "rules"

        action, confidence, rationale = draft.action, draft.confidence, draft.rationale.strip()
        adjusted = payable_amount(ctx) if action == Action.APPROVE_ADJUSTED else None

        msme = ctx.extra.get("msme")
        if msme is not None and action in (Action.HOLD, Action.ESCALATE):
            rationale += " " + msme_note(msme)

        if ctx.anomaly is not None and ctx.anomaly >= ANOMALY_CAP and control is None:
            confidence = min(confidence, 0.6)
            rationale += (
                f" ML check: this invoice is more unusual than {ctx.anomaly:.0%} of {ctx.vendor['name']}'s history "
                f"(typical total {inr(ctx.typical_total)})."
            )

        return Recommendation(
            action=action,
            confidence=round(float(confidence), 2),
            adjusted_amount=adjusted,
            rationale=rationale,
            citations=citations,
            source=source,
            anomaly_score=ctx.anomaly,
            auto_resolved=False,
            provider=provider,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            generated_at=now,
            route=route,
            cost_usd=round(cost, 6),
        )

    async def _control_citations(
        self, ctx: CaseContext, control: ExceptionType, citations: list[Citation], bank_id: str | None
    ) -> list[Citation]:
        """A hard control always shows the directive it enforces, plus the precedent it overrode."""
        name, content = DIRECTIVE_FOR[control]
        out = [c for c in citations if c.kind == CitationKind.DIRECTIVE and c.text.startswith(name)]
        if not out:
            out = [Citation(id=f"directive-{control.value}", kind=CitationKind.DIRECTIVE, text=f"{name}: {content}")]
        memory = [c for c in citations if c.kind != CitationKind.DIRECTIVE]
        other_types = [t for t in ctx.types if ExceptionType(t) not in CONTROL_ACTION] or [ctx.primary_type]
        if bank_id and not memory:
            try:
                facts = await self.memory.recall(
                    bank_id,
                    f"How does the AP team resolve {', '.join(other_types)} for {ctx.vendor['name']}?",
                    vendor_id=ctx.vendor["id"],
                    types=other_types,
                    strict=True,
                )
                memory = [
                    Citation(
                        id=str(f.id),
                        kind=CitationKind(f.type) if f.type in CitationKind._value2member_map_ else CitationKind.WORLD,
                        text=f.text,
                        exception_id=f.document_id,
                    )
                    for f in facts[:3]
                ]
            except Exception as e:  # noqa: BLE001
                log.warning("precedent recall for control case %s failed: %s", ctx.case_id, e)
        return out + memory

    async def _recall_llm(self, ctx: CaseContext, brief: str, bank_id: str, *, require_observation: bool):
        """Fast path: Hindsight recall (this vendor + exception type, anchored at the invoice date) + one LLM call.
        Returns None when there is no consolidated observation to lean on (the caller then uses reflect)."""
        kinds = " and ".join(t.replace("_", " ") for t in ctx.types)
        facts = await self.memory.recall(
            bank_id,
            f"How does the AP team resolve {kinds} for {ctx.vendor['name']}?",
            vendor_id=ctx.vendor["id"],
            types=ctx.types,
            query_timestamp=ctx.sim_date.isoformat(),
        )
        if require_observation and not any(getattr(f, "type", "") == "observation" for f in facts):
            return None
        citations = [
            Citation(
                id=str(f.id),
                kind=CitationKind(f.type) if f.type in CitationKind._value2member_map_ else CitationKind.WORLD,
                text=f.text,
                exception_id=f.document_id,
            )
            for f in facts[:8]
        ]
        return await self._decide_from(citations, brief, "hindsight-recall", RECALL_COST)

    async def _rag_llm(self, ctx: CaseContext, brief: str):
        """Ablation baseline: plain vector search over past resolutions (no Hindsight) + the same LLM."""
        hits = await self.rag.search(f"{ctx.vendor['name']} {' '.join(ctx.types)} {brief[:600]}", k=8)
        citations = [Citation(id=h["id"], kind=CitationKind.WORLD, text=h["text"], exception_id=h["id"]) for h in hits]
        return await self._decide_from(citations, brief, "rag", self.rag.last_cost)

    async def _decide_from(self, citations: list[Citation], brief: str, label: str, base_cost: float):
        precedents = NL.join(f"- {c.text}" for c in citations) or "- (no past decisions found)"
        prompt = "PAST DECISIONS:" + NL + precedents + NL + NL + "NEW EXCEPTION:" + NL + brief + NL + NL + QUESTION
        res = await self.router.structured(RECALL_SYSTEM, prompt, RecDraft)
        return res.value, citations, f"{label}+{res.provider}", base_cost + res.cost_usd
