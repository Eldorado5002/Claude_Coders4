# Precedent API contract

Base URL: `http://localhost:8000` (set `VITE_API_BASE_URL` in the frontend).
Source of truth: [`backend/app/schemas.py`](../backend/app/schemas.py). Interactive docs at `/docs` when the backend runs.

Generate the frontend's types from the running backend:

```bash
cd frontend && npm run gen:api     # writes src/api/schema.d.ts from http://localhost:8000/openapi.json
```

For step-by-step frontend work on the newer features, see [`frontend-integration.md`](frontend-integration.md).

## Mocks

Every response in [`docs/mocks/`](mocks/) is a real response captured from the running app by
[`scripts/make_mocks.py`](../backend/scripts/make_mocks.py), so the mocks cannot drift from the API. There are
three sets:

| Folder | Demo state | Use it for |
|---|---|---|
| `docs/mocks/*.json` | **Week 3**: one open case (Balaji freight, recommended from memory) | The frontend's fixture mode (`?fixtures=1`) and unit tests |
| `docs/mocks/twist/` | **The Twist**: hard controls, MSME deadlines, vendor risk, the three sample invoices captured | Designing and testing the hard-control, compliance, risk and capture screens |
| `docs/mocks/replay-end/` | **End of the 26-week replay**: certified certificate, calibration, cost | Designing the "certified" state of the certificate and the trust figures |

The Week 3 set also includes `exception-detail-memory-off.json` (the same case with memory switched off, for the
"Memory changed this verdict" diff), and its state-changing mocks tell the Week 3 story: `resolve-result.json`
accepts the open case, which is the third accepted recommendation in a row, so `promoted` is `true`.

## Conventions

- Money: INR numbers (rupees, 2 decimals). Format with `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` → ₹2,41,428.00
- Dates: ISO 8601. The app runs on a **simulated clock**; show `sim_date` from `/api/settings`, never `Date.now()`.
- Errors: FastAPI default `{"detail": "..."}` with 4xx/5xx status. 422 = validation error.

## Endpoints

| Method | Path | Body | Returns | Mock |
|---|---|---|---|---|
| GET | `/api/health` | — | `Health` | `health.json` |
| GET | `/api/settings` | — | `Settings` (includes `bank_id`, `llm_chain`, `sim_date`) | `settings.json` |
| PATCH | `/api/settings` | `SettingsPatch` `{memory_enabled}` | `Settings` | `settings.json` |
| GET | `/api/exceptions?status=open\|auto_resolved\|resolved\|all&vendor_id=&type=&sort=newest\|msme_deadline\|amount&limit=50&offset=0` | — | `Page<ExceptionSummary>` | `exceptions.json`, `twist/exceptions-by-msme-deadline.json` |
| GET | `/api/exceptions/{id}` | — | `ExceptionDetail` | `exception-detail.json`, `twist/exception-detail-hard-control.json`, `twist/exception-detail-msme.json` |
| POST | `/api/exceptions/{id}/recommend` | — | `ExceptionDetail` (fresh recommendation) | `exception-detail.json` |
| POST | `/api/exceptions/{id}/resolve` | `ResolveRequest` | `ResolveResult` | `resolve-result.json` |
| GET | `/api/vendors` | — | `VendorSummary[]` | `vendors.json`, `twist/vendors.json` |
| GET | `/api/vendors/{id}` | — | `VendorProfile` (learned observations, wiki page as `playbook`, risk, MSME / e-invoice status) | `vendor-profile.json`, `twist/vendor-profile.json` |
| GET | `/api/vendors/{id}/beliefs` | — | `Belief[]` (what the agent believes about the vendor, the evidence count, and how each belief changed) | `beliefs.json`, `twist/beliefs.json` |
| GET | `/api/knowledge` | — | `KnowledgePageSummary[]` (the vendor wiki) | `knowledge.json` |
| GET | `/api/knowledge/{page_id}` | — | `KnowledgePage` (`markdown` is null while Hindsight is still writing it) | `knowledge-page.json` |
| GET | `/api/risk` | — | `VendorRiskRow[]` (vendors ranked by fraud and control risk, highest first) | `risk.json`, `twist/risk.json` |
| GET | `/api/benford` | — | `BenfordResult` (first-digit test over every line amount so far) | `benford.json` |
| GET | `/api/autonomy` | — | `AutonomyState[]` | `autonomy.json` |
| GET | `/api/autonomy/certificate` | — | `AutonomyCertificate` (statistical guarantee behind auto-approval) | `certificate.json`, `replay-end/certificate.json` |
| GET | `/api/metrics` | — | `Metrics` (KPIs, weekly curves, certificate, calibration, performance) | `metrics.json`, `twist/metrics.json` |
| GET | `/api/memory/recent?limit=20` | — | `MemoryItem[]` | `memory-recent.json` |
| GET | `/api/memory/policy` | — | `PolicyDoc` (team-wide policy learned from all resolutions, markdown) | `policy.json` |
| GET | `/api/lessons?vendor_id=&include_revoked=true&limit=50` | — | `Lesson[]` (what the agent learned, who taught it) | `lessons.json` |
| POST | `/api/lessons/{case_id}/revoke` | `RevokeRequest` `{reason, revoked_by}` | `RevokeResult` (404 unknown, 409 already revoked) | `revoke-result.json` |
| POST | `/api/copilot/ask` | `CopilotRequest` `{question, vendor_id?}` | `CopilotAnswer` | `copilot-answer.json` |
| POST | `/api/invoices/capture` | `multipart/form-data` field `file` (jpg/png/webp/pdf, max 12 MB; 415 wrong type, 413 too large, 502 unreadable) | `CaptureResult` | `capture-result.json`, `twist/capture-*.json` |
| GET | `/api/demo/state` | — | `DemoState` | `demo-state.json` |
| POST | `/api/demo/advance` | `AdvanceRequest` `{stage}` | `DemoState` (409 while the simulator is busy) | `demo-state.json` |
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
| `sim.changed` | `DemoState` (always this one shape) | Update clock / stage bar |
| `memory.revoked` | `Lesson` | Strike the lesson through, show the ladder reset |

Tip: on any event, `queryClient.invalidateQueries()` for the affected keys is enough.

## Text formats inside a recommendation

`Recommendation.rationale` is plain text, but the backend writes a few fixed sentences into it that the UI splits
out with `frontend/src/lib/parse-rationale.ts`; change both together. The hard-control sentences are pinned by
[`tests/test_frontend_contract.py`](../backend/tests/test_frontend_contract.py).

| Where | Format | Example |
|---|---|---|
| Hard control (`source: guardrail`) | `Hard control: {issue message} Action forced to {action}.` | `Hard control: Pay-to account Yes Bank XXXXXX9083 (YESB0000871) differs from vendor master HDFC Bank XXXXXX2071 (HDFC0001234). Action forced to escalate.` |
| …what memory alone would have done | ` (Memory alone would have suggested {action}.)` right after it, when the team's last decision on the invoice's other issue differs | `(Memory alone would have suggested approve.)` |
| …context | ` Past decisions for this vendor are shown for context; they cannot override this rule.` | |
| Anomaly note | ` ML check: this invoice is more unusual than {n}% of {vendor}'s history (typical total ₹…).` at the end | |
| MSME note (on hold / escalate) | ` MSME supplier: holding this risks the Section 43B(h) deadline on {date} ({n} days left) and about ₹… of tax deduction.` Once breached: ` MSME supplier: the Section 43B(h) deadline ({date}) has already passed — pay promptly once resolved; ₹… of tax deduction is deferred to the year of payment.` | |

`{issue message}` is exactly the `message` of the blocking `Issue`, so the UI can match it.

## Key enums

- `ExceptionType`: `price_variance` `quantity_variance` `freight_charge` `tax_mismatch` `rounding_difference` `missing_po` `duplicate_invoice` `bank_details_changed` `new_vendor` `over_threshold` `einvoice_missing` `invalid_gstin`
- Hard controls (always `blocking: true`, autonomy `locked`): `duplicate_invoice` `bank_details_changed` `new_vendor` `over_threshold` `einvoice_missing` `invalid_gstin`
- `Action`: `approve` `approve_adjusted` `hold` `reject` `escalate`
- `CaseStatus`: `open` `auto_resolved` `resolved`
- `AutonomyLevel`: `suggest` `auto` `locked`
- `RecSource`: `memory` (grounded in Hindsight) · `no_memory` (memory off / no precedents) · `guardrail` (forced by a hard control)
- `Recommendation.route`: `reflect` (Hindsight reflect, about $0.05) · `fast` (Hindsight recall + one LLM call, about $0.001, for routine vendor × type pairs) · `guardrail` (hard control, no model call) · `no_memory`
- `AutonomyCertificate.status`: `collecting` (not enough verified pay decisions to certify yet; with no errors it takes 59; auto-pay only at confidence ≥ 0.95) · `certified` (auto-pay at confidence ≥ `threshold`) · `paused` (30+ verified decisions and an observed wrong-payment rate above 5%: auto-approval off)
- `MsmeStatus.status`: `ok` · `due_soon` (7 days or fewer) · `breached`
- `VendorRisk.level`: `low` · `medium` · `high`
- `CitationKind`: `world` `experience` `observation` `mental_model` `directive`
- `CaptureResult.status`: `matched` (clean 3-way match) · `exception` (a case was opened: see `exception_id`) · `unknown_vendor`

## Screens → endpoints

| Screen | Uses |
|---|---|
| Exception queue (with MSME deadline sort) | `GET /api/exceptions`, SSE |
| Exception detail (3-way match, compliance strip, recommendation, memories-used panel, approve/correct with reason) | `GET /api/exceptions/{id}`, `POST …/resolve`, `POST …/recommend` |
| Memory ON/OFF toggle (global) | `GET/PATCH /api/settings` |
| Vendor file (beliefs with history, wiki, risk, MSME / e-invoice facts) | `GET /api/vendors/{id}`, `GET /api/vendors/{id}/beliefs` |
| Trust map (with certificate status) | `GET /api/autonomy`, `GET /api/autonomy/certificate`, SSE `autonomy.changed` |
| Learning (curves, certificate, calibration, cost and latency) | `GET /api/metrics`, `GET /api/autonomy/certificate` |
| Risk (vendor ranking, Benford) | `GET /api/risk`, `GET /api/benford` |
| Vendor wiki | `GET /api/knowledge`, `GET /api/knowledge/{page_id}` |
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
- `ExceptionSummary.msme_days_left`: days before the Section 43B(h) payment deadline (MSME vendors only; negative = breached; `null` for duplicates, which are never paid). `ExceptionDetail.compliance`: `{msme: MsmeStatus | null, e_invoice: {required, irn_present}}`.
- `InvoiceDoc.supplier_gstin` / `InvoiceDoc.irn`: the GSTIN printed on the invoice and its e-invoice IRN (64 hex characters) when there is one.
- `VendorSummary.msme_category`, `e_invoice_required`, `risk_score`, `risk_level`; `VendorProfile.risk` (score, level, reasons, the vendor's Benford result) and `udyam`.
- `VendorProfile.playbook`: the vendor's Hindsight **Knowledge Page** as markdown (falls back to a playbook mental model while the page is first being written). Treat `null` or "Generating content…" as pending.
- `Recommendation.route`, `calibrated_confidence` (how often past recommendations at this stated confidence were right) and `cost_usd` (what producing it cost, in US dollars).
- `Metrics.certificate`, `Metrics.calibration` (`ece` = expected calibration error; bins of stated vs actual accuracy) and `Metrics.performance` (fast-path share, p50/p95 latency, cost per 1,000 exceptions). `Kpis.msme_open_at_risk` / `msme_tax_at_risk`: open MSME cases due soon or breached, and the tax deduction at stake.
