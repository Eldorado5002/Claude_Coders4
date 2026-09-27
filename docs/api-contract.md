# Precedent API contract

Base URL: `http://localhost:8000` (set `VITE_API_BASE_URL` in the frontend).
Source of truth: [`backend/app/schemas.py`](../backend/app/schemas.py). Interactive docs at `/docs` when the backend runs.
Every endpoint has a matching mock in [`docs/mocks/`](mocks/) generated from those same schemas.

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
| GET | `/api/exceptions?status=open\|auto_resolved\|resolved\|all&vendor_id=&type=&limit=50&offset=0` | — | `Page<ExceptionSummary>` | `exceptions.json` |
| GET | `/api/exceptions/{id}` | — | `ExceptionDetail` | `exception-detail.json` |
| POST | `/api/exceptions/{id}/recommend` | — | `ExceptionDetail` (fresh recommendation) | `exception-detail.json` |
| POST | `/api/exceptions/{id}/resolve` | `ResolveRequest` | `ResolveResult` | `resolve-result.json` |
| GET | `/api/vendors` | — | `VendorSummary[]` | `vendors.json` |
| GET | `/api/vendors/{id}` | — | `VendorProfile` | `vendor-profile.json` |
| GET | `/api/autonomy` | — | `AutonomyState[]` | `autonomy.json` |
| GET | `/api/metrics` | — | `Metrics` | `metrics.json` |
| GET | `/api/memory/recent?limit=20` | — | `MemoryItem[]` | `memory-recent.json` |
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

Tip: on any event, `queryClient.invalidateQueries()` for the affected keys is enough.

## Key enums

- `ExceptionType`: `price_variance` `quantity_variance` `freight_charge` `tax_mismatch` `rounding_difference` `missing_po` `duplicate_invoice` `bank_details_changed` `new_vendor` `over_threshold`
- Hard controls (always `blocking: true`, autonomy `locked`): `duplicate_invoice` `bank_details_changed` `new_vendor` `over_threshold`
- `Action`: `approve` `approve_adjusted` `hold` `reject` `escalate`
- `CaseStatus`: `open` `auto_resolved` `resolved`
- `AutonomyLevel`: `suggest` `auto` `locked`
- `RecSource`: `memory` (grounded in Hindsight) · `no_memory` (memory off / no precedents) · `guardrail` (forced by a hard control)
- `CitationKind`: `world` `experience` `observation` `mental_model` `directive`

## Screens → endpoints

| Screen | Uses |
|---|---|
| Exception queue | `GET /api/exceptions`, SSE |
| Exception detail (3-way match side by side, recommendation, memories-used panel, approve/correct with reason) | `GET /api/exceptions/{id}`, `POST …/resolve`, `POST …/recommend` |
| Memory ON/OFF toggle (global) | `GET/PATCH /api/settings` |
| Vendor profile (learned observations + playbook) | `GET /api/vendors/{id}` |
| Autonomy ladder | `GET /api/autonomy`, SSE `autonomy.changed` |
| Metrics dashboard (touchless rate, memory on vs off) | `GET /api/metrics` |
| Ask Precedent (copilot) | `POST /api/copilot/ask` |
| Capture invoice (camera / upload) | `POST /api/invoices/capture` |
| Demo controls (Day 1 → Week 3 → Week 8 → Twist) | `GET /api/demo/state`, `POST /api/demo/advance`, `POST /api/demo/reset` |
| Hindsight-down banner | `GET /api/health` → `hindsight: "down"` |
| Push notifications | `GET /api/push/public-key`, `POST /api/push/subscribe` |
