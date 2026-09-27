# Precedent API contract

Base URL: `http://localhost:8000` (set `VITE_API_BASE_URL` in the frontend).
Source of truth: [`backend/app/schemas.py`](../backend/app/schemas.py). Interactive docs at `/docs` when the backend runs.
Every endpoint has a matching mock in [`docs/mocks/`](mocks/): real responses captured from the running app
at the Week 8 and Twist demo stages by [`scripts/make_mocks.py`](../backend/scripts/make_mocks.py), so they
cannot drift from the API.

Generate TypeScript types once the backend runs:

```bash
npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts
```

## Conventions

- Money: INR numbers (rupees, 2 decimals). Format with `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` → ₹2,41,428.00
- Dates: ISO 8601. The app runs on a **simulated clock**; show `sim_date` from `/api/settings`, never `Date.now()`.
- Errors: FastAPI default `{"detail": "..."}` with 4xx/5xx status. 422 = validation error.

## Endpoints

| Method | Path | Body | Returns | Mock |
|---|---|---|---|---|
| GET | `/api/health` | — | `Health` | `health.json` |
| GET | `/api/settings` | — | `Settings` | `settings.json` |
| PATCH | `/api/settings` | `SettingsPatch` `{memory_enabled}` | `Settings` | `settings.json` |
| GET | `/api/exceptions?status=open\|auto_resolved\|resolved\|all&vendor_id=&type=&sort=newest\|msme_deadline\|amount&limit=50&offset=0` | — | `Page<ExceptionSummary>` | `exceptions.json` |
| GET | `/api/exceptions/{id}` | — | `ExceptionDetail` | `exception-detail.json` |
| POST | `/api/exceptions/{id}/recommend` | — | `ExceptionDetail` (fresh recommendation) | `exception-detail.json` |
| POST | `/api/exceptions/{id}/resolve` | `ResolveRequest` | `ResolveResult` | `resolve-result.json` |
| GET | `/api/vendors` | — | `VendorSummary[]` | `vendors.json` |
| GET | `/api/vendors/{id}` | — | `VendorProfile` (learned observations, wiki playbook, risk, MSME / e-invoice status) | `vendor-profile.json` |
| GET | `/api/vendors/{id}/beliefs` | — | `Belief[]` (what the agent believes about the vendor, the evidence count, and how each belief changed) | `beliefs.json` |
| GET | `/api/knowledge` | — | `KnowledgePageSummary[]` (the vendor wiki) | `knowledge.json` |
| GET | `/api/knowledge/{page_id}` | — | `KnowledgePage` (`markdown` is null while Hindsight is still writing it) | `knowledge-page.json` |
| GET | `/api/risk` | — | `VendorRiskRow[]` (vendors ranked by fraud and control risk) | `risk.json` |
| GET | `/api/benford` | — | `BenfordResult` (first-digit test over every line amount so far) | `benford.json` |
| GET | `/api/autonomy` | — | `AutonomyState[]` | `autonomy.json` |
| GET | `/api/autonomy/certificate` | — | `AutonomyCertificate` (statistical guarantee behind auto-approval) | `certificate.json` |
| GET | `/api/metrics` | — | `Metrics` | `metrics.json` |
| GET | `/api/memory/recent?limit=20` | — | `MemoryItem[]` | `memory-recent.json` |
| GET | `/api/memory/policy` | — | `PolicyDoc` (team-wide policy learned from all resolutions, markdown) | `policy.json` |
| GET | `/api/lessons?vendor_id=&include_revoked=true&limit=50` | — | `Lesson[]` (what the agent learned, who taught it) | `lessons.json` |
| POST | `/api/lessons/{case_id}/revoke` | `RevokeRequest` `{reason, revoked_by}` | `RevokeResult` (404 unknown, 409 already revoked) | `revoke-result.json` |
| POST | `/api/copilot/ask` | `CopilotRequest` `{question, vendor_id?}` | `CopilotAnswer` | `copilot-answer.json` |
| POST | `/api/invoices/capture` | `multipart/form-data` field `file` (jpg/png/pdf) | `CaptureResult` | `capture-result.json` |
| GET | `/api/demo/state` | — | `DemoState` | `demo-state.json` |
| POST | `/api/demo/advance` | `AdvanceRequest` `{stage}` | `DemoState` | `demo-state.json` |
| POST | `/api/demo/reset` | — | `DemoState` | `demo-state.json` |
| GET | `/api/events` | — | SSE stream (below) | `events.json` |
| GET | `/api/push/public-key` | — | `PublicKey` `{key}` | — |
| POST | `/api/push/subscribe` | `PushSubscription` (from `PushManager.subscribe().toJSON()`) | `204` | — |

## Live events (SSE)

```ts
const es = new EventSource(`${API}/api/events`);
es.addEventListener('exception.created', e => { const data = JSON.parse(e.data); /* ExceptionSummary */ });
```

| Event | `data` | Frontend reaction |
|---|---|---|
| `exception.created` | `ExceptionSummary` | Add to queue, toast |
| `exception.updated` | `ExceptionSummary` | Update row (e.g. auto-resolved) |
| `memory.retained` | `MemoryItem` | "Agent learned…" feed |
| `autonomy.changed` | `AutonomyState` | Update ladder, celebrate promotion |
| `sim.changed` | `DemoState` | Update clock / stage bar |
| `memory.revoked` | `Lesson` | Strike the lesson through, show the ladder reset |

Tip: on any event, `queryClient.invalidateQueries()` for the affected keys is enough.

## Key enums

- `ExceptionType`: `price_variance` `quantity_variance` `freight_charge` `tax_mismatch` `rounding_difference` `missing_po` `duplicate_invoice` `bank_details_changed` `new_vendor` `over_threshold` `einvoice_missing` `invalid_gstin`
- Hard controls (always `blocking: true`, autonomy `locked`): `duplicate_invoice` `bank_details_changed` `new_vendor` `over_threshold` `einvoice_missing` `invalid_gstin`
- `Action`: `approve` `approve_adjusted` `hold` `reject` `escalate`
- `CaseStatus`: `open` `auto_resolved` `resolved`
- `AutonomyLevel`: `suggest` `auto` `locked`
- `RecSource`: `memory` (grounded in Hindsight) · `no_memory` (memory off / no precedents) · `guardrail` (forced by a hard control)
- `Recommendation.route`: `reflect` (Hindsight reflect) · `fast` (Hindsight recall + one LLM call, for routine vendor × type pairs) · `guardrail` (hard control, no model call) · `no_memory`
- `AutonomyCertificate.status`: `collecting` (fewer than 30 verified pay decisions; strict provisional threshold 0.95) · `certified` · `paused` (circuit breaker: auto-approval off)
- `MsmeStatus.status`: `ok` · `due_soon` (7 days or fewer) · `breached`
- `VendorRisk.level`: `low` · `medium` · `high`
- `CitationKind`: `world` `experience` `observation` `mental_model` `directive`

## Screens → endpoints

| Screen | Uses |
|---|---|
| Exception queue | `GET /api/exceptions`, SSE |
| Exception detail (3-way match side by side, recommendation, memories-used panel, approve/correct with reason) | `GET /api/exceptions/{id}`, `POST …/resolve`, `POST …/recommend` |
| Memory ON/OFF toggle (global) | `GET/PATCH /api/settings` |
| Vendor profile (learned observations + playbook) | `GET /api/vendors/{id}` |
| Autonomy ladder | `GET /api/autonomy`, SSE `autonomy.changed` |
| Metrics dashboard (touchless rate, memory on vs off, certificate, calibration, cost and latency) | `GET /api/metrics`, `GET /api/autonomy/certificate` |
| Vendor beliefs timeline (how a belief changed, with the evidence) | `GET /api/vendors/{id}/beliefs` |
| Vendor wiki | `GET /api/knowledge`, `GET /api/knowledge/{page_id}` |
| Fraud and risk (vendor ranking, Benford) | `GET /api/risk`, `GET /api/benford` |
| MSME deadlines (queue sorted by statutory deadline) | `GET /api/exceptions?sort=msme_deadline` |
| Ask Precedent (copilot) | `POST /api/copilot/ask` |
| Capture invoice (camera / upload) | `POST /api/invoices/capture` |
| Demo controls (Day 1 → Week 3 → Week 8 → Twist) | `GET /api/demo/state`, `POST /api/demo/advance`, `POST /api/demo/reset` |
| Hindsight-down banner | `GET /api/health` → `hindsight: "down"` |
| Push notifications | `GET /api/push/public-key`, `POST /api/push/subscribe` |
| Lessons / memory review (who taught what; revoke a wrong lesson) | `GET /api/lessons`, `POST /api/lessons/{id}/revoke`, SSE `memory.revoked` |
| Team policy (what the whole team has learned) | `GET /api/memory/policy` |

## Notes on newer fields

- `Resolution.redacted`: kinds of personal data removed from the clerk's reason before storage (e.g. `["phone"]`). Show a small "PII redacted" badge. `Resolution.revoked_at/by/revoke_reason` are set when a lesson is revoked.
- `Kpis.citation_relevance`: share of cited memories that refer to the same vendor or exception type. `Kpis.lessons_revoked`: count of revoked lessons.
- `ExceptionSummary.msme_days_left`: days before the Section 43B(h) payment deadline (MSME vendors only; negative = breached). `ExceptionDetail.compliance`: `{msme: MsmeStatus | null, e_invoice: {required, irn_present}}`.
- `InvoiceDoc.supplier_gstin` / `InvoiceDoc.irn`: the GSTIN printed on the invoice and its e-invoice IRN (64 hex characters) when there is one.
- `VendorSummary.msme_category`, `e_invoice_required`, `risk_score`, `risk_level`; `VendorProfile.risk` (score, level, reasons, the vendor's Benford result) and `udyam`.
- `Recommendation.route`, `calibrated_confidence` (how often past recommendations at this stated confidence were right) and `cost_usd` (what producing it cost).
- `Metrics.certificate`, `Metrics.calibration` (`ece` = expected calibration error; bins of stated vs actual accuracy) and `Metrics.performance` (fast-path share, p50/p95 latency, cost per 1,000 exceptions). `Kpis.msme_open_at_risk` / `msme_tax_at_risk`: open MSME cases due soon or breached, and the tax deduction at stake.
