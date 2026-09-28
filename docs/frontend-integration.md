# Frontend integration guide

For: the frontend (Rupesh). From: the backend. Status: 28 Sep 2026.

The backend gained a set of features after the frontend was built: an autonomy certificate, calibrated
confidence, cost and routing per recommendation, a beliefs timeline, the vendor wiki, India compliance
(MSME deadlines, e-invoice IRN, GSTIN checks), vendor risk and Benford analysis. This guide lists everything the
frontend needs to show them, screen by screen, with the exact fields and a real mock for each.

**The API change is purely additive.** Nothing was removed or renamed. The only existing type that changed is
`ExceptionType`, which gained two values. Everything that works today keeps working.

We ran the current frontend against the live backend (Day 1 → Week 3 → Twist). It works end to end. The
backend fixes this uncovered are already done (see "Already fixed on the backend" at the end).

## 0. Setup

```bash
git pull
cd backend && uv sync && uv run fastapi dev app/main.py     # API on :8000
cd frontend && npm install && npm run gen:api                # regenerates src/api/schema.d.ts
```

`npm run dev` then talks to the live backend; `?fixtures=1` uses `docs/mocks/` as before.

## 1. Catch up with the contract (small, do first)

1. **Types.** After `npm run gen:api`, add to `src/api/types.ts`:
   `AutonomyCertificate`, `CertificateRow`, `Calibration`, `CalibrationBin`, `Performance`, `Belief`,
   `BeliefVersion`, `KnowledgePageSummary`, `KnowledgePage`, `VendorRisk`, `VendorRiskRow`, `BenfordResult`,
   `Compliance`, `MsmeStatus`, `EInvoiceStatus`.
2. **The two new exception types** (both are hard controls):

   | Value | Label | Forced action |
   |---|---|---|
   | `einvoice_missing` | E-invoice (IRN) | hold |
   | `invalid_gstin` | GSTIN | escalate |

   In `src/lib/labels.ts`, add them to `TYPE_LABEL` (TypeScript will now insist) and to `HARD_CONTROLS`, so the trust
   map gives them a column and chips get the lock and hatching.
3. **A crash to guard.** `sortLanes` in `src/features/vendors/vendors-view.ts` calls
   `TYPE_LABEL[a.exception_type].localeCompare(...)`. With a type it doesn't know, the vendor page crashes. This
   happens after Act 5, when a captured invoice opens an `einvoice_missing` or `invalid_gstin` case. Step 2 fixes
   it; a `?? a.exception_type` fallback keeps it safe for the future.

## 2. Fixture mode and tests

The mocks were regenerated from the live app. There are now three sets (details in
[`api-contract.md`](api-contract.md#mocks)):

| Folder | State | Contents |
|---|---|---|
| `docs/mocks/*.json` | **Week 3** (what fixture mode expects) | One open case, `EXC-0010`: Balaji freight, Approve 0.95 from memory via the fast path. Plus `exception-detail-memory-off.json` (same case with memory off: Hold 0.40), and `beliefs`, `knowledge`, `knowledge-page`, `risk`, `benford`, `certificate` |
| `docs/mocks/twist/` | **The Twist** | Hard-control case, MSME case, V001 profile with high risk, the three captured sample invoices, metrics, certificate |
| `docs/mocks/replay-end/` | **End of the replay** | `certificate.json` (certified), `calibration.json`, `performance.json`, `kpis.json` |

The fixture glob (`docs/mocks/*.json`) only reads the top folder, so the subfolders don't change fixture mode.

**To do in `src/api/fixtures.ts`:** answer the new endpoints:
- `GET /api/vendors/{id}/beliefs` → `beliefs.json`
- `GET /api/knowledge` → `knowledge.json`
- `GET /api/knowledge/{id}` → `knowledge-page.json`
- `GET /api/risk` → `risk.json`
- `GET /api/benford` → `benford.json`
- `GET /api/autonomy/certificate` → `certificate.json`

Also:
- Pass through the `sort` query on `/api/exceptions`.
- For the memory switch, `exception-detail-memory-off.json` is the real memory-off verdict of the same case.

**Tests.** With the new mocks, 211 of 227 pass. The 16 failures assert values from the old mocks, not bugs:

| Test file | Why it fails now |
|---|---|
| `features/ask/ask-model.test.ts`, `ask-sheet.test.tsx` (7) | The copilot answer and its latency changed |
| `features/capture/capture-page.test.tsx`, `capture-result.test.tsx` (2) | The captured case is now `EXC-0011`, not `EXC-0140` |
| `features/learning/learning-view.test.ts`, `learning-page.test.tsx` (4) | The replay headline is now **98% vs 50%**, touchless 54%. At Week 3 there is no hard-control row in `by_type` yet, so "0% by design" has nothing to draw: use `twist/metrics.json` for that test |
| `features/memory/memory-page.test.tsx` (2) | Different lesson counts, and Week 3 has no auto-resolved lessons yet: use a Twist lesson or inline data for the auto-lesson test |
| `features/vendors/vendor-pages.test.tsx` (1) | The learned-observation text changed |

## 3. New UI, screen by screen

Everything below keeps the "Case Law" language: decision colours only for decisions, ◆ for what the agent
wrote, lock and hatching for hard controls.

### 3.1 Case file (`/exceptions/:id`)

**a. Compliance strip.** Add it under the issue strip, from `ExceptionDetail.compliance` and `invoice`:

| Show | When | From |
|---|---|---|
| "MSME · micro · **5 days** to the 43B(h) deadline (2 May) · ₹46,476 tax deduction at stake" | `compliance.msme` is not null | `msme.category`, `days_left`, `deadline`, `tax_at_risk`, `status` (`ok` / `due_soon` / `breached`: hold colour for `due_soon`, reject colour for `breached`) |
| "E-invoice: IRN ✓" or "IRN missing: not a valid tax invoice" | `compliance.e_invoice.required` | `e_invoice.irn_present`; show `invoice.irn` shortened in mono |
| "GSTIN on invoice ✓ matches master" or a 🔒 mismatch | always | `invoice.supplier_gstin` vs `vendor.gstin` |

Mock: `twist/exception-detail-msme.json` (MSME, due soon), `twist/capture-case-no-irn.json` (IRN missing),
`twist/capture-case-bad-gstin.json` (GSTIN mismatch).

```json
"compliance": {
  "msme": { "category": "micro", "udyam": "UDYAM-TS-22-0009561", "limit_days": 45, "accepted_on": "2026-03-18",
            "deadline": "2026-05-02", "days_left": 5, "status": "due_soon", "tax_at_risk": 46475.59,
            "terms_exceed_limit": false },
  "e_invoice": { "required": false, "irn_present": false }
}
```

**b. Opinion footer.** Extend it with the three new `Recommendation` fields:

- **`route`:** "Fast path" (`fast`: Hindsight recall + one model call), "Deep reasoning" (`reflect`), "Hard control" (`guardrail`), "No memory". This is our cost story: routine cases take the fast path.
- **`cost_usd`:** e.g. "$0.001". Show 3 decimals; under $0.001 show "< $0.001".
- **`calibrated_confidence`:** next to the confidence band, e.g. "High · 95 · right 67% of the time at this confidence". It can be null early in the demo.

```json
{ "action": "approve", "confidence": 0.95, "calibrated_confidence": 0.667, "route": "fast", "cost_usd": 0.000986,
  "source": "memory", "provider": "hindsight-recall+gemini:gemini-3.1-flash-lite", "latency_ms": 2048 }
```

**c. Hard-control panel. Nothing to build.** The backend now writes exactly what `parse-rationale.ts` expects, so
the inverse panel's "Action forced to escalate." line and the struck-through **"Memory alone would have said
~~Approve~~"** now appear. Check it with `twist/exception-detail-hard-control.json`:

```
Hard control: Pay-to account Yes Bank XXXXXX9083 (YESB0000871) differs from vendor master HDFC Bank XXXXXX2071
(HDFC0001234). Action forced to escalate. (Memory alone would have suggested approve.) Past decisions for this
vendor are shown for context; they cannot override this rule.
```

### 3.2 Docket (`/exceptions`)

- **MSME chip on rows** from `ExceptionSummary.msme_days_left`: "MSME · 5d" (hold colour when ≤ 7, reject colour and "overdue" when negative). `null` means not MSME, or a duplicate that will never be paid.
- **Sort control:** Newest · MSME deadline · Amount at risk, sent as `sort=newest|msme_deadline|amount`. `docketView` currently moves blocking cases to the top of the Open tab. With `sort=msme_deadline`, keep the server's order, or apply "blocking first" and then the deadline; your call.
- Mock: `twist/exceptions-by-msme-deadline.json`.

### 3.3 Vendor file (`/vendors/:id`) and vendor index

- **"What Precedent believes" (new section)** from `GET /api/vendors/{id}/beliefs`:
  - Each belief shows its text in serif, "backed by **N** memories" (`evidence_count`), first seen and last updated.
  - A disclosure lists `versions` oldest first: *"was: {text}"* (as of `as_of`), and under it the `new_evidence` lines that changed it.
  - This is the "memory that shows its work" moment.
  - Mocks: `beliefs.json` (Week 3), `twist/beliefs.json` (more history).
  - The call goes through Hindsight (about 1.5 s), so give it its own skeleton, as `Learned` does.

  ```json
  { "id": "f461a148-…", "text": "Shree Balaji Steel Traders Pvt Ltd (V001) has a standing agreement allowing for
    freight charges up to ₹5,000 per trip, …", "evidence_count": 7, "first_seen": "2026-03-02T12:36:00Z",
    "last_updated": "2026-04-22T09:02:05Z",
    "versions": [ { "text": "…", "as_of": "2026-03-18T11:50:00Z", "new_evidence": ["Precedent (AP agent) approved invoice SBST/2526/0964 …"] } ] }
  ```

- **Playbook → vendor wiki.** `VendorProfile.playbook` is now the vendor's Hindsight Knowledge Page (markdown with `##` headings). Rename the section to "Vendor wiki", badged "Written by Hindsight"; the rendering already works.
- **Risk** in the header: `VendorProfile.risk.score` (0–100) and `level` (low / medium / high) as a figure, with `risk.reasons` in a hover card. At the Twist, Balaji reads **58 · high**: "1 request(s) to pay a different bank account", "1 duplicate invoice submission(s)", "exception rate 91% vs 23% across all vendors". Mock: `twist/vendor-profile.json`.
- **Facts row:** MSME category and Udyam number (`udyam`) when present, and "E-invoicing: required" (`e_invoice_required`).
- **Vendor index:** add Risk (score, coloured by `risk_level`) and an MSME / e-invoice badge column from `VendorSummary`.

### 3.4 Learning (`/learning`): "Trust you can check" (new section)

Put it after the curves. All of it comes from `GET /api/metrics` (`certificate`, `calibration`, `performance`),
or `GET /api/autonomy/certificate` for the certificate alone.

- **Certificate card.**
  - A status seal: CERTIFIED (ink), COLLECTING (outline) or PAUSED (reject).
  - "Auto-pay allowed at confidence ≥ **0.75**", "**73** verified payment decisions · **0** wrong", "with 95% confidence at most **4.0%** of automatic payments are wrong (target 5%)".
  - The `table` as a small ladder, one row per threshold with a tick when `certified`.
  - `explanation` in serif underneath.
  - During the demo it reads `collecting`, with the explanation "…takes 59 of them if no more are wrong". Design both states: `replay-end/certificate.json` is certified, `certificate.json` is collecting.

  ```json
  { "status": "certified", "target_error": 0.05, "confidence_level": 0.95, "threshold": 0.75, "decisions": 73,
    "errors": 0, "error_upper_bound": 0.0402, "auto_resolutions": 46, "auto_errors": 0,
    "auto_error_upper_bound": 0.063, "table": [ { "threshold": 0.95, "decisions": 66, "errors": 0,
    "upper_bound": 0.0444, "certified": true }, … ], "explanation": "Of 73 verified pay recommendations …" }
  ```

- **Calibration:** a small stated-vs-actual chart from `calibration.bins` (a diagonal "perfect" reference and one dot per bin sized by `n`; skip bins with `actual: null`), labelled "Expected calibration error 0.07". Mock: `replay-end/calibration.json`.
- **Cost and speed** as figures in the same row style: `performance.cost_per_1000_exceptions_usd` ("$17 per 1,000 exceptions"), `fast_share` ("58% on the fast path"), `latency_p50_ms` / `latency_p95_ms` ("2.7 s median · 9.4 s p95"). Mock: `replay-end/performance.json`.
- **Two more figures** in the live-docket row: `kpis.msme_open_at_risk` and `kpis.msme_tax_at_risk` ("1 MSME invoice at risk · ₹46,476"). Mock: `twist/metrics.json`.

### 3.5 Trust map (`/trust`)

A certificate chip in the header next to "N on auto · N learning · N locked", e.g. "◆ Certified · auto-pay at ≥
0.75" or "Collecting evidence · 13 of 59", linking to the Learning section. From `GET /api/autonomy/certificate`.

### 3.6 Risk (new route `/risk`, new sidebar entry)

- **Vendor ranking** from `GET /api/risk` (already sorted, highest first): vendor, score with level, reasons. The Twist shows Balaji at the top. Mock: `twist/risk.json`.
- **Benford's law** from `GET /api/benford`: bars of `observed` vs `expected` for first digits 1–9 (ink vs muted dashed, one axis), and the verdict "MAD 0.0146 · marginal" (`mad`, `conformity`: close / acceptable / marginal / nonconformity / insufficient data). One line of explanation: "In genuine financial data, about 30% of amounts start with 1. Large deviations can point to invented invoices." Mock: `twist/benford.json`.
- Each vendor's own Benford result is in `VendorProfile.risk.benford`, for the vendor file if you want it.

### 3.7 Capture (`/capture`)

- **Bundle the three samples** from `docs/samples/` into `frontend/public/samples/`. `invoice-balaji-freight.png` there is an older version that doesn't match today's dataset, so replace it.
- Turn "Use sample invoice" into a small picker:

  | Sample | At the Twist |
  |---|---|
  | `invoice-balaji-freight.png` | Auto-resolved (the lane is on auto) |
  | `invoice-balaji-no-irn.png` | Held: e-invoice control |
  | `invoice-balaji-bad-gstin.png` | Escalated: GSTIN control |
  | freight again | Rejected as a duplicate |

- **Result view:** show the IRN (shortened, mono) and the supplier GSTIN that were read (`extracted.irn`, `extracted.supplier_gstin`). For a hard-control outcome, say which control fired. Mocks: `twist/capture-*.json` and the cases they opened in `twist/capture-case-*.json`.

### 3.8 Narrator (optional)

The Twist card could add one line: "Sort the docket by MSME deadline: a micro supplier's invoice is 5 days from
its 43B(h) deadline."

## 4. Live updates

Add to `eventInvalidations` in `src/api/keys.ts`:

| Event | Also invalidate |
|---|---|
| `exception.updated`, `autonomy.changed`, `memory.revoked` | the certificate query |
| `memory.retained` | the beliefs query for that vendor (`data.vendor_id`) |
| `exception.created` | the risk query |

`sim.changed` now always carries a `DemoState`, the same as `POST /api/demo/advance`.

## 5. What costs money

| Action | Cost |
|---|---|
| Ask Precedent | about $0.05 per question |
| Re-run a recommendation | about $0.05 when it uses reflect |
| Capture | about $0.001 |
| Beliefs, vendor profile, policy | small Hindsight recalls |

Please don't poll any of them faster than every 15 seconds. Stage switches, lists and metrics are free.

## 6. Acceptance: the five acts against the live backend

1. **Day 1:** EXC-0001 shows Hold, "No precedent". (The old "Playbook: Generating content…" citation is gone.)
2. **Week 3:**
   - EXC-0010 shows Approve 95 via the **fast path**, costing about $0.001, grounded in precedents.
   - Memory off shows Hold 40, and the verdict diff appears.
   - Accept promotes the lane, and the **AUTO seal** stamps.
   - Balaji's file shows beliefs and the wiki (proper headings, no `{'level': …}` text).
3. **Week 8:**
   - Three lanes are on auto.
   - Learning shows the headline 98% vs 50%, the certificate card (collecting) and the calibration and cost figures.
4. **Twist:**
   - EXC-0037 shows the inverse hard-control panel with "Memory alone would have said ~~Approve~~".
   - Sort by MSME deadline: EXC-0041 comes first with "5 days".
   - Balaji risk 58 (high) on the vendor file and the Risk page.
5. **Capture at the Twist:** freight is auto-resolved, no-IRN is held, bad-GSTIN is escalated, freight again is rejected. The docket, trust map and Balaji's vendor page must not crash on the new types.

Afterwards, `POST /api/demo/reset` puts everything back to Day 1.

## Already fixed on the backend

- Hard-control rationales use "Action forced to X." again, plus "(Memory alone would have suggested Y.)" when the team's last decision on the invoice's other issue differs. This is pinned by `backend/tests/test_frontend_contract.py`.
- Knowledge Pages that Hindsight wrote as Python-style section dicts are converted to markdown.
- Unfinished Hindsight summaries ("Generating content…") are no longer cited as evidence.
- `sim.changed` always sends a `DemoState`.
- MSME risk figures skip duplicates, which are never paid.

If anything in the contract is unclear or missing, ask the backend owner; `docs/` changes only when we both agree.
