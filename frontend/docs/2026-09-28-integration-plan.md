# Precedent frontend: integration plan (round 2)

> Executed with superpowers:executing-plans. Task 1 runs first (shared code); Tasks 2–7 then run in parallel, each in its own feature folder; Task 8 (shared wiring) and Task 9 (acceptance) come last. Steps use `- [ ]`.

**Goal:** show every backend feature added after the first frontend release. Scope: autonomy certificate, calibration, cost and routing, beliefs, vendor wiki, India compliance (MSME 43B(h), e-invoice IRN, GSTIN), vendor risk, Benford.
**Spec:** [`../../docs/frontend-integration.md`](../../docs/frontend-integration.md), the backend's guide. The design system is unchanged from [`2026-09-28-frontend-design.md`](2026-09-28-frontend-design.md).
**Definition of done:** the guide's §6, the five acts against the live backend. Where the local backend has no API keys, those acts are checked against the matching `docs/mocks/twist/` and `replay-end/` data.

## Global constraints

Everything in the first plan still applies:
- Branch `frontend`; commit messages are a few lowercase words.
- TDD for logic.
- "Case Law" visuals: colour only for decisions; ◆ for anything the agent wrote; lock and hatching for hard controls.
- The simulated clock, never `Date.now()`.
- No polling of Hindsight-backed data faster than every 15 s (the guide's §5).

## Tasks

### Task 1: Catch-up (shared; executor)

**Types and labels:**
- [ ] Regenerate `schema.d.ts`. Add the new type aliases to `api/types.ts`.
- [ ] `lib/labels.ts`: add `einvoice_missing` ("E-invoice (IRN)") and `invalid_gstin` ("GSTIN") to `TYPE_LABEL` and `HARD_CONTROLS`, plus `ROUTE_LABEL`.
- [ ] `sortLanes` falls back to the raw type string when a label is missing. Test first.

**API layer:**
- [ ] Queries and keys: `beliefsQ`, `knowledgeQ`, `knowledgePageQ`, `riskQ`, `benfordQ`, `certificateQ`, plus the `sort` parameter on `exceptionsQ`.
- [ ] `eventInvalidations` gets the guide's §4 additions. Test first.
- [ ] Fixtures:
  - the 6 new endpoints
  - `sort` passthrough
  - memory-off detail from `exception-detail-memory-off.json`

  Tests first.

**Tests and assets:**
- [ ] Update the 16 stale tests to the regenerated mocks (the guide's §2 table).
- [ ] Copy the 3 sample invoices into `public/samples/`, replacing the old freight one.

Commit `catch up with backend`.

### Task 2: Risk page (`features/risk/`, new route `/risk`)
- The guide's §3.6: the vendor ranking and the Benford first-digit chart with its verdict.
- Commit `add risk`.

### Task 3: Learning, "Trust you can check" (`features/learning/`)
- The guide's §3.4: certificate card (both states), calibration chart, cost and speed figures, MSME figures.
- Commit `add trust you can check`.

### Task 4: Vendors (`features/vendors/`)
- The guide's §3.3:
  - the beliefs timeline
  - "Vendor wiki"
  - risk in the header, with reasons on hover
  - the MSME / Udyam / e-invoicing facts
  - the index risk column and badges
- Commit `add vendor beliefs and risk`.

### Task 5: Case file and docket (`features/case-file/`, `features/docket/`)
- Case file (the guide's §3.1):
  - the compliance strip: MSME, IRN, GSTIN
  - the opinion footer: route, cost, calibrated confidence
- Docket (the guide's §3.2): the MSME chip and a sort control (newest, MSME deadline, amount).
- Commit `add compliance and msme sort`.

### Task 6: Capture (`features/capture/`)
- The guide's §3.7: a sample picker (freight, no-IRN, bad-GSTIN); the IRN and supplier GSTIN read from the invoice; which control fired.
- Commit `add capture samples`.

### Task 7: Trust map (`features/trust/`)
- The guide's §3.5: a certificate chip linking to the Learning section.
- Commit `add certificate chip`.

### Task 8: Shared wiring (executor)
- Sidebar, router and ⌘K entries for Risk.
- The twist narrator's MSME line (the guide's §3.8).
- Commit `wire risk page`.

### Task 9: Acceptance and review
- Run the five acts (the guide's §6), in the browser at 1440px and 390px.
- Full suite, build and e2e.
- A fresh whole-branch review, then one fix pass.
- Push.
