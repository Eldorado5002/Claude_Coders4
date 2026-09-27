"""API contract. Every request/response shape the frontend sees is defined here.

The frontend generates its TypeScript types from FastAPI's /openapi.json, which is
built from these models, so renaming a field here is a breaking change for the PWA.
"""

from datetime import date, datetime
from enum import StrEnum
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ExceptionType(StrEnum):
    PRICE_VARIANCE = "price_variance"
    QUANTITY_VARIANCE = "quantity_variance"
    FREIGHT_CHARGE = "freight_charge"
    TAX_MISMATCH = "tax_mismatch"
    ROUNDING_DIFFERENCE = "rounding_difference"
    MISSING_PO = "missing_po"
    DUPLICATE_INVOICE = "duplicate_invoice"
    BANK_DETAILS_CHANGED = "bank_details_changed"
    NEW_VENDOR = "new_vendor"
    OVER_THRESHOLD = "over_threshold"
    EINVOICE_MISSING = "einvoice_missing"
    INVALID_GSTIN = "invalid_gstin"


# Hard financial controls: never auto-resolved, never approved by the agent.
HARD_CONTROL_TYPES = frozenset(
    {
        ExceptionType.DUPLICATE_INVOICE,
        ExceptionType.BANK_DETAILS_CHANGED,
        ExceptionType.NEW_VENDOR,
        ExceptionType.OVER_THRESHOLD,
        ExceptionType.EINVOICE_MISSING,
        ExceptionType.INVALID_GSTIN,
    }
)


class Action(StrEnum):
    APPROVE = "approve"
    APPROVE_ADJUSTED = "approve_adjusted"  # pay a corrected amount
    HOLD = "hold"  # send back to vendor / wait for info
    REJECT = "reject"
    ESCALATE = "escalate"  # manager or treasury review


class CaseStatus(StrEnum):
    OPEN = "open"  # waiting for a human decision
    AUTO_RESOLVED = "auto_resolved"  # resolved by the agent under earned autonomy
    RESOLVED = "resolved"  # decided by a human


class AutonomyLevel(StrEnum):
    SUGGEST = "suggest"  # agent recommends, human decides
    AUTO = "auto"  # agent resolves on its own
    LOCKED = "locked"  # hard-control type, always human


class RecSource(StrEnum):
    MEMORY = "memory"  # grounded in Hindsight precedents
    NO_MEMORY = "no_memory"  # memory switched off or no precedents yet
    GUARDRAIL = "guardrail"  # forced by a deterministic hard control


class CitationKind(StrEnum):
    WORLD = "world"
    EXPERIENCE = "experience"
    OBSERVATION = "observation"
    MENTAL_MODEL = "mental_model"
    DIRECTIVE = "directive"


# ---------------------------------------------------------------- documents


class LineItem(BaseModel):
    line_no: int
    sku: str | None = None
    description: str
    hsn: str | None = None
    qty: float
    uom: str
    unit_price: float
    tax_rate: float = Field(description="GST percent, e.g. 18")
    amount: float = Field(description="qty × unit_price, before tax")


class BankAccount(BaseModel):
    bank_name: str
    account_number: str = Field(description="Masked, e.g. XXXXXX4521")
    ifsc: str


class VendorRef(BaseModel):
    id: str
    name: str
    gstin: str
    city: str
    category: str


class InvoiceDoc(BaseModel):
    id: str
    invoice_number: str
    vendor_id: str
    po_number: str | None
    invoice_date: date
    due_date: date
    lines: list[LineItem]
    subtotal: float
    tax_total: float
    total: float
    currency: Literal["INR"] = "INR"
    bank_account: BankAccount
    supplier_gstin: str | None = Field(None, description="GSTIN printed on the invoice")
    irn: str | None = Field(None, description="GST e-invoice reference number (64 hex chars), when e-invoiced")
    source: Literal["erp", "capture"] = "erp"


class PurchaseOrderDoc(BaseModel):
    po_number: str
    vendor_id: str
    po_date: date
    lines: list[LineItem]
    subtotal: float
    tax_total: float
    total: float


class GrnLine(BaseModel):
    line_no: int
    sku: str | None = None
    description: str
    qty_received: float
    uom: str


class GoodsReceiptDoc(BaseModel):
    grn_number: str
    po_number: str
    received_date: date
    lines: list[GrnLine]


# ---------------------------------------------------------------- compliance & risk (India)


class MsmeStatus(BaseModel):
    """Income Tax Act Section 43B(h): pay micro/small suppliers within 15 days (45 with a written agreement)
    of accepting the goods, or the expense is disallowed as a deduction for the year."""

    category: Literal["micro", "small"]
    udyam: str
    limit_days: int
    accepted_on: date
    deadline: date
    days_left: int
    status: Literal["ok", "due_soon", "breached"]
    tax_at_risk: float = Field(description="Estimated tax cost if the deduction is disallowed (25.17% rate)")
    terms_exceed_limit: bool = Field(description="Vendor payment terms are longer than the statutory limit")


class EInvoiceStatus(BaseModel):
    required: bool = Field(description="Supplier turnover above Rs 5 crore: B2B invoices need an IRN")
    irn_present: bool


class Compliance(BaseModel):
    msme: MsmeStatus | None = None
    e_invoice: EInvoiceStatus


class BenfordResult(BaseModel):
    n: int
    mad: float | None = Field(None, description="Mean absolute deviation from Benford's first-digit law")
    conformity: str = Field(description="close / acceptable / marginal / nonconformity / insufficient data")
    observed: list[float]
    expected: list[float]


class VendorRisk(BaseModel):
    score: int = Field(ge=0, le=100)
    level: Literal["low", "medium", "high"]
    reasons: list[str]
    benford: BenfordResult


class VendorRiskRow(BaseModel):
    vendor: VendorRef
    risk: VendorRisk


# ---------------------------------------------------------------- exceptions


class Issue(BaseModel):
    type: ExceptionType
    message: str
    line_no: int | None = None
    expected: float | None = None
    actual: float | None = None
    variance_amount: float | None = None
    variance_pct: float | None = None
    blocking: bool = Field(description="True for hard controls")


class Citation(BaseModel):
    id: str
    kind: CitationKind
    text: str
    occurred_at: datetime | None = None
    exception_id: str | None = Field(None, description="Case the memory came from, when known")


class Recommendation(BaseModel):
    action: Action
    confidence: float = Field(ge=0, le=1)
    adjusted_amount: float | None = None
    rationale: str
    citations: list[Citation]
    source: RecSource
    anomaly_score: float | None = Field(None, ge=0, le=1, description="0 normal … 1 very unusual for this vendor")
    auto_resolved: bool
    provider: str = Field(description="What produced it, e.g. 'hindsight-reflect' or 'groq:openai/gpt-oss-120b'")
    latency_ms: int
    generated_at: datetime
    route: Literal["reflect", "fast", "guardrail", "no_memory"] = Field(
        "reflect", description="reflect = deep Hindsight reasoning; fast = recall + LLM for routine cases"
    )
    calibrated_confidence: float | None = Field(
        None, ge=0, le=1, description="How often past recommendations at this stated confidence were right"
    )
    cost_usd: float | None = Field(None, description="What this recommendation cost to produce")


class Resolution(BaseModel):
    decision: Action
    reason: str
    adjusted_amount: float | None = None
    resolved_by: str
    resolved_at: datetime
    agent_action: Action | None = None
    agreed_with_agent: bool | None = None
    redacted: list[str] = Field(default_factory=list, description="Kinds of personal data removed from the reason")
    revoked_at: datetime | None = None
    revoked_by: str | None = None
    revoke_reason: str | None = None


class AutonomyState(BaseModel):
    vendor_id: str
    vendor_name: str
    exception_type: ExceptionType
    level: AutonomyLevel
    streak: int = Field(description="Consecutive accepted recommendations")
    required_streak: int
    accepted: int
    overruled: int
    auto_resolved: int
    updated_at: datetime | None = None


class ExceptionSummary(BaseModel):
    id: str
    status: CaseStatus
    primary_type: ExceptionType
    issue_types: list[ExceptionType]
    vendor: VendorRef
    invoice_number: str
    invoice_total: float
    amount_at_risk: float = Field(description="Absolute money difference driving the exception")
    created_at: datetime
    recommended_action: Action | None = None
    confidence: float | None = None
    autonomy_level: AutonomyLevel
    blocking: bool = Field(description="At least one hard control fired")
    msme_days_left: int | None = Field(None, description="Days left before the MSME 43B(h) deadline, if MSME")


class ExceptionDetail(ExceptionSummary):
    invoice: InvoiceDoc
    purchase_order: PurchaseOrderDoc | None = None
    goods_receipt: GoodsReceiptDoc | None = None
    vendor_bank_on_file: BankAccount
    issues: list[Issue]
    recommendation: Recommendation | None = None
    resolution: Resolution | None = None
    autonomy: AutonomyState
    compliance: Compliance


class ResolveRequest(BaseModel):
    decision: Action
    reason: str = Field(min_length=5, description="Why — this is what the agent learns from")
    adjusted_amount: float | None = None
    resolved_by: str = "AP Clerk"


class ResolveResult(BaseModel):
    exception: ExceptionDetail
    memory_id: str | None = Field(None, description="Hindsight document id of the retained lesson")
    lesson: str = Field(description="What the agent learned, in one sentence")
    autonomy: AutonomyState
    promoted: bool
    demoted: bool


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int


# ---------------------------------------------------------------- lessons (memory review)


class Lesson(BaseModel):
    """One thing the agent learned: a resolved exception stored in Hindsight."""

    case_id: str = Field(description="Also the Hindsight document id")
    vendor: VendorRef
    exception_type: ExceptionType
    decision: Action
    reason: str
    taught_by: str
    taught_at: datetime
    auto: bool = Field(description="Resolved by the agent itself under earned autonomy")
    revoked: bool
    revoked_by: str | None = None
    revoke_reason: str | None = None


class RevokeRequest(BaseModel):
    reason: str = Field(min_length=5, description="Why this lesson is wrong")
    revoked_by: str = "AP Lead"


class RevokeResult(BaseModel):
    lesson: Lesson
    autonomy: AutonomyState
    memory_deleted: bool = Field(description="Hindsight document and its facts were deleted")
    invalidated_recommendations: int = Field(description="Open cases whose recommendation will be recomputed")


class PolicyDoc(BaseModel):
    content: str | None = Field(description="Team-wide AP policy learned from all resolutions (markdown)")
    refreshed_at: datetime | None = None


# ---------------------------------------------------------------- vendors


class VendorSummary(VendorRef):
    state: str
    payment_terms_days: int
    invoices_count: int
    exceptions_count: int
    open_exceptions: int
    touchless_rate: float | None = None
    msme_category: Literal["micro", "small"] | None = None
    e_invoice_required: bool = False
    risk_score: int | None = None
    risk_level: Literal["low", "medium", "high"] | None = None


class VendorProfile(VendorSummary):
    bank_account: BankAccount
    learned: list[Citation] = Field(description="Hindsight observations about this vendor")
    playbook: str | None = Field(None, description="Hindsight mental model (markdown)")
    recent: list[ExceptionSummary]
    autonomy: list[AutonomyState]
    risk: VendorRisk | None = None
    udyam: str | None = None


# ---------------------------------------------------------------- memory feed & copilot


class MemoryItem(BaseModel):
    id: str
    kind: CitationKind
    text: str
    vendor_id: str | None = None
    exception_type: ExceptionType | None = None
    occurred_at: datetime | None = None


class CopilotRequest(BaseModel):
    question: str = Field(min_length=3)
    vendor_id: str | None = None


class CopilotAnswer(BaseModel):
    answer: str = Field(description="Markdown")
    citations: list[Citation]
    latency_ms: int


# ---------------------------------------------------------------- certified autonomy & calibration


class CertificateRow(BaseModel):
    threshold: float
    decisions: int
    errors: int
    upper_bound: float = Field(description="95% Clopper-Pearson upper bound on the wrong-payment rate")
    certified: bool


class AutonomyCertificate(BaseModel):
    status: Literal["collecting", "certified", "paused"]
    target_error: float
    confidence_level: float
    threshold: float | None = Field(description="Minimum confidence for auto-approval (None when paused)")
    decisions: int
    errors: int
    error_upper_bound: float
    auto_resolutions: int
    auto_errors: int
    auto_error_upper_bound: float
    table: list[CertificateRow]
    explanation: str


class CalibrationBin(BaseModel):
    low: float
    high: float
    n: int
    stated: float | None = None
    actual: float | None = None


class Calibration(BaseModel):
    n: int
    ece: float | None = Field(description="Expected calibration error of stated confidence")
    pooled_accuracy: float
    bins: list[CalibrationBin]


class Performance(BaseModel):
    recommendations: int
    fast_share: float = Field(description="Share of recommendations served by the fast path")
    latency_p50_ms: int | None = None
    latency_p95_ms: int | None = None
    avg_cost_usd: float | None = None
    cost_per_1000_exceptions_usd: float | None = None


# ---------------------------------------------------------------- metrics


class WeeklyPoint(BaseModel):
    week: int
    week_start: date
    memory_on: float | None = None
    memory_off: float | None = None


class TypeBreakdown(BaseModel):
    type: ExceptionType
    count: int
    touchless_rate: float


class Kpis(BaseModel):
    touchless_rate: float
    acceptance_rate: float | None
    exceptions_total: int
    auto_resolved: int
    blocked_by_controls: int
    false_approvals: int
    memories: int
    minutes_saved: float = Field(description="Modelled estimate; see assumptions")
    citation_relevance: float | None = Field(
        None, description="Share of cited memories that refer to the same vendor or exception type"
    )
    lessons_revoked: int = 0
    msme_open_at_risk: int = Field(0, description="Open MSME cases due within 7 days or already past 43B(h)")
    msme_tax_at_risk: float = Field(0.0, description="Estimated tax at risk on those cases")


class Metrics(BaseModel):
    kpis: Kpis
    touchless_by_week: list[WeeklyPoint]
    acceptance_by_week: list[WeeklyPoint]
    by_type: list[TypeBreakdown]
    assumptions: list[str]
    certificate: AutonomyCertificate | None = None
    calibration: Calibration | None = None
    performance: Performance | None = None


# ---------------------------------------------------------------- settings, health, demo


class Settings(BaseModel):
    memory_enabled: bool
    bank_id: str
    llm_chain: list[str]
    sim_date: date
    stage: str


class SettingsPatch(BaseModel):
    memory_enabled: bool | None = None


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    hindsight: Literal["up", "down"]
    memory_enabled: bool
    sim_date: date


DemoStageId = Literal["day1", "week3", "week8", "twist"]


class DemoStage(BaseModel):
    id: DemoStageId
    label: str
    description: str
    sim_date: date
    reached: bool


class DemoState(BaseModel):
    stage: DemoStageId
    sim_date: date
    busy: bool
    stages: list[DemoStage]


class AdvanceRequest(BaseModel):
    stage: DemoStageId


class CaptureResult(BaseModel):
    status: Literal["matched", "exception", "unknown_vendor"]
    extracted: InvoiceDoc
    vendor: VendorRef | None = None
    exception_id: str | None = None


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict[str, str]


class PublicKey(BaseModel):
    key: str
