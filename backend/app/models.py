"""SQLite tables — the system of record. What the team *learned* lives in Hindsight."""

from datetime import date, datetime
from typing import Any

from pydantic import NaiveDatetime
from sqlmodel import JSON, Column, Field, SQLModel


class Vendor(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    gstin: str = Field(index=True)
    city: str
    state: str
    state_code: str
    category: str
    payment_terms_days: int
    bank_name: str
    account_number: str
    ifsc: str
    onboarded_on: date
    profile: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class PurchaseOrder(SQLModel, table=True):
    po_number: str = Field(primary_key=True)
    vendor_id: str = Field(index=True, foreign_key="vendor.id")
    po_date: date
    lines: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    subtotal: float
    tax_total: float
    total: float


class GoodsReceipt(SQLModel, table=True):
    grn_number: str = Field(primary_key=True)
    po_number: str = Field(index=True, foreign_key="purchaseorder.po_number")
    received_date: date
    lines: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))


class Invoice(SQLModel, table=True):
    id: str = Field(primary_key=True)
    invoice_number: str = Field(index=True)
    vendor_id: str = Field(index=True, foreign_key="vendor.id")
    po_number: str | None = Field(default=None, index=True)
    invoice_date: date
    due_date: date
    arrival_date: date = Field(index=True, description="Sim date the invoice reaches AP")
    lines: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    subtotal: float
    tax_total: float
    total: float
    bank_name: str
    account_number: str
    ifsc: str
    source: str = "erp"
    # pending → not arrived yet; matched → clean; exception → case opened; paid/held/rejected → closed
    status: str = Field(default="pending", index=True)
    # Ground truth for the simulated clerk + evaluation (never sent to the frontend)
    truth: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class ExceptionCase(SQLModel, table=True):
    id: str = Field(primary_key=True)
    invoice_id: str = Field(index=True, foreign_key="invoice.id")
    vendor_id: str = Field(index=True)
    status: str = Field(default="open", index=True)
    primary_type: str = Field(index=True)
    issue_types: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    issues: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    amount_at_risk: float = 0.0
    blocking: bool = False
    created_at: NaiveDatetime  # simulated clock is naive local time
    recommendation: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    rec_variants: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))  # "on"/"off" -> rec
    resolution: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    memory_enabled_at_rec: bool = True


class Autonomy(SQLModel, table=True):
    id: str = Field(primary_key=True, description="vendor_id:exception_type")
    vendor_id: str = Field(index=True)
    exception_type: str
    level: str = "suggest"
    streak: int = 0
    accepted: int = 0
    overruled: int = 0
    auto_resolved: int = 0
    updated_at: NaiveDatetime | None = None


class AppState(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: Any = Field(default=None, sa_column=Column(JSON))


class EvalPoint(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    memory_enabled: bool
    week: int
    week_start: date
    exceptions: int
    touchless: int
    accepted: int
    decided: int
    false_approvals: int


class PushSub(SQLModel, table=True):
    endpoint: str = Field(primary_key=True)
    keys: dict[str, str] = Field(default_factory=dict, sa_column=Column(JSON))


class LlmCache(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: NaiveDatetime = Field(default_factory=datetime.now)
