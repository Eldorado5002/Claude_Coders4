# Precedent frontend: design spec

Status: draft for review · 28 Sep 2026 · branch `frontend`
Sources: [`docs/api-contract.md`](../../docs/api-contract.md), [`backend/app/schemas.py`](../../backend/app/schemas.py), [`docs/mocks/`](../../docs/mocks/), [`docs/HINDSIGHT.md`](../../docs/HINDSIGHT.md)

## 1. Goal

A desktop-first PWA that lets an AP clerk work invoice exceptions with Precedent, and lets hackathon judges *see* the agent learn within 60 seconds.

Success means:

- The demo path (Day 1 → Week 3 → Week 8 → The twist) runs end to end on a projector at 1280px or wider, with no dead ends.
- Memory is visible on every screen that matters: cited precedents, lessons filed, trust earned, the with/without-memory gap.
- It works on a phone for capture, push and quick decisions.
- It never looks like a generic AI dashboard.

Out of scope: login and roles, editing vendors or POs, i18n, offline writes.

## 2. Constraints

- Stack (pinned, verified in a test build):
  - Vite 8.3 · React 19.3 · TypeScript ~6.0 (7.x breaks openapi-typescript)
  - Tailwind 4.3 · shadcn CLI 4.21, `--base radix`, preset **Sera**
  - TanStack Query 5.104 · TanStack Table 9.2 · Zustand 5
  - React Router **7.18** in data mode (npm `latest` is 8)
  - Recharts 3.10 · openapi-fetch 0.17
  - Utilities: nuqs · motion · @number-flow/react · react-hotkeys-hook · react-markdown + remark-gfm · @tailwindcss/typography · react-dropzone · react-error-boundary · date-fns · vite-plugin-pwa 1.3
  - Registry components: Dice `stepper` + `timeline` · ai-elements `inline-citation` · Kibo `dropzone` · tablecn `data-table`
- The backend owns the contract. Anything we need changed in `docs/` or `backend/` is a request to the backend owner, never an edit.
- Work happens on branch `frontend`, which is merged to `main` at the end. Commits are under the author's own name with no AI attribution.
- Money is INR in `Intl.NumberFormat('en-IN')`. Dates follow the **simulated clock** (`settings.sim_date`), never `Date.now()`.

## 3. Visual system: "Case Law"

The agent writes opinions and past cases are cited like footnotes. Paper and ink, with colour only where it means something.

### Brand

- Wordmark **"Precedent◆"**: Newsreader 600, with a diamond full stop.
- Monogram **"P◆"**: the app icon, paper on ink.
- The files are in [`brand/`](brand/): `wordmark*.svg`, `mark.svg`, `icon.svg`. They are outlined paths, so no font is needed to render them. `make_mark.py` regenerates them.
- **◆ is the agent's mark everywhere:** anything Precedent wrote (opinions, lessons, auto-resolutions, answers) carries it.

### Type

| Role | Font | Use |
|---|---|---|
| Voice | Newsreader Variable (opsz 6–72, italic) | page titles, the agent's opinion, playbook, policy, Ask answers, narrator cards |
| UI | Geist Variable, `tabular-nums` for all numbers | everything else |
| Ledger | Geist Mono Variable | IDs: `EXC-0014`, `PO-2026-0081`, `SBST/2526/1231`, GSTIN, IFSC, masked accounts |

Scale in px: 12 · 13 · 14 (UI base) · 16 · 18 (opinion body, 1.55 leading) · 22 · 30 · 44 (page titles, opsz 72). Amounts are right-aligned.

All three fonts come from Fontsource. ₹ (U+20B9) lives in the `latin-ext` subset. We checked in a real browser that all three render it. Workbox precaches only `*-latin*.woff2`.

### Colour tokens (shadcn CSS variables; hex here, OKLCH in code)

| Token | Light | Dark |
|---|---|---|
| background (paper) | `#FBFBFA` | `#111214` |
| card / popover | `#FFFFFF` | `#18191C` |
| foreground (ink) | `#15171A` | `#EDEEF0` |
| muted-foreground | `#5E636B` | `#9BA1A9` |
| border (rule) | `#E3E3E0` | `#2A2C30` |
| muted (subtle fill) | `#F3F3F1` | `#1E2023` |
| primary | ink | paper |

Decision colours are reserved for decisions. Each one always comes with an icon and a label.

| Action | Light | Dark | Icon |
|---|---|---|---|
| approve | `#15803D` | `#3DD68C` | check |
| approve_adjusted | `#0F766E` | `#2DD4BF` | check + ₹ delta |
| hold | `#B45309` | `#FFB224` | pause |
| reject | `#B91C1C` | `#FF6369` | x |
| escalate | `#1D4ED8` | `#6EA8FE` | arrow-up |

**Recommendation source**, shown by shape and fill rather than hue:

| Source | Chip | Label |
|---|---|---|
| `memory` | solid ink chip | "◆ Grounded in N precedents" |
| `no_memory` | dashed outline | "◌ No precedent" |
| `guardrail` | inverse chip (paper on ink) | "🔒 Hard control" |

**Charts:**
- "With memory" is drawn in ink; "Without memory" in `#9BA1A9`, dashed.
- Every chart has one y-axis and labels at the end of each line.
- The palette is validated with the dataviz validator before shipping.

### Shape, space, motion

- **Sera corners:** square (0) on panels, inputs and buttons; 2px on chips. Buttons use uppercase tracked labels.
- **Depth:** hairline rules instead of shadows. The only shadow is on popovers and sheets.
- **Spacing:** a 4px grid. The docket and case file are dense; the Learning page is airy.
- **Motion** (Emil Kowalski rules):
  - UI transitions run 150–250 ms on `cubic-bezier(0.23, 1, 0.32, 1)`.
  - Nothing animates on keyboard navigation (J/K, ⌘K open).
  - Animate only `transform` and `opacity`.
  - `prefers-reduced-motion` reduces motion to opacity fades.
  - Two rare moments may take longer:
    - the **AUTO seal** stamp on promotion, about 500 ms;
    - the memory-toggle crossfade of the opinion, 220 ms with a 2px blur.

### Labels

| API value | UI label |
|---|---|
| `price_variance` | Price variance |
| `quantity_variance` | Quantity variance |
| `freight_charge` | Freight |
| `tax_mismatch` | GST mismatch |
| `rounding_difference` | Rounding |
| `missing_po` | No PO |
| `duplicate_invoice` | Duplicate |
| `bank_details_changed` | Bank change |
| `new_vendor` | New vendor |
| `over_threshold` | Over ₹5L |

Memory kinds get a label and a tooltip. Tooltip text is taken from Hindsight's docs.

| Kind | Label | Tooltip |
|---|---|---|
| `observation` | Learned pattern | A pattern Hindsight built by merging related facts; it changes as evidence changes. |
| `world` | Past decision | A fact about what happened: who decided what, for which vendor. |
| `experience` | Agent's action | Something Precedent itself did. |
| `mental_model` | Playbook | A standing answer Hindsight keeps rewriting as it learns. |
| `directive` | Policy | A hard rule the agent must follow. |

Confidence is shown as a band plus a number: **High ≥ 80 · Medium 50–79 · Low < 50**, e.g. "High · 95".

## 4. Shell and routes

```
/                      → redirect to /exceptions
/exceptions            Docket (split view; right pane shows empty state)
/exceptions/:id        Docket + case file   (push notifications deep-link here)
/trust                 Trust map
/vendors, /vendors/:id Vendor index, vendor file
/learning              Metrics
/memory                Lessons · Team policy · Raw memories (tabs)
/capture               Capture (mobile-first)
```

**Ask Precedent** is a right-side sheet opened with ⌘K, not a route.

**Desktop shell:**
- **Sidebar** (sidebar-07, collapses to icons):
  - navigation with a live open-case count
  - "Signed as" clerk picker: Priya (AP), Rahul (AP), Sneha (AP Lead), Arjun (AP)
  - theme and presenter toggles
- **Top bar:**
  - simulated date
  - **stage rail**
  - **memory switch**
  - Hindsight health dot; its hover card shows `bank_id` and `llm_chain`
- **Memory OFF:** a hatched strip across the top bar reads "Memory off · stateless baseline".

**Phones (under 768px):**
- Bottom tabs: Docket · **Capture** · Trust · More.
- The case file stacks the opinion first, then the evidence, with a sticky action bar.

## 5. Screens

### 5.1 Docket: `/exceptions`

The list pane is 400px wide and resizable:
- **Status tabs:** Open · Auto-resolved · Resolved · All, with counts. The tab lives in the URL via nuqs.
- **Filters:** vendor (popover + command) and type.
- **Rows show:**
  - vendor, type chip, amount at risk
  - mono case ID, invoice number, simulated time
  - recommendation chip and confidence
- **Row states:**
  - "◆ Reasoning…" shimmer while the recommendation is null
  - 🔒 inverse chip when `blocking`
  - ◆ Auto seal when auto-resolved
- **Live:** new cases slide in from the top (200 ms) with a fading highlight.
- **Empty open queue:** "Docket clear. Precedent handled everything that arrived today."

### 5.2 Case file: `/exceptions/:id`

**Header:**
- Mono case ID, then "{vendor} — {type}" in serif.
- Meta line: invoice number · total · received date · PO · GRN.
- Right side: **At risk ₹** (large) and a **trust meter** (streak dots, e.g. "2 of 3 to auto"; 🔒 when locked).

**Issue strip:** one line per issue with icon, label, message and variance chip. Blocking issues come first, in inverse style.

**Evidence** (left, about 58%):
- **3-way match table:**
  - Rows are keyed by SKU. Invoice lines with no SKU get their own row, marked "— not on PO —".
  - Column groups: Invoice (qty, rate, GST %, amount) | PO (qty, rate, GST %) | GRN (received qty).
  - Hovering a row highlights all three groups.
  - The issue's `line_no` row gets a left marker. Mismatched cells get a delta chip.
  - Footer compares totals: invoice vs PO, with Δ.
- **Missing PO:** an explainer panel replaces the PO and GRN groups.
- **Bank check:** `invoice.bank_account` vs `vendor_bank_on_file`. Equal shows ✓; different shows red 🔒.
- **Anomaly:** `anomaly_score` on a 0–1 scale with "typical / unusual". Null shows "Not enough history yet".
- **Timeline** (Dice timeline): Received (`created_at`) → Matched (N issues) → Opinion (`generated_at`) → Resolved (`resolved_at`) → Lesson filed.

**Opinion** (right, about 42%, sticky):
- **Header:** "◆ Precedent's opinion" and the source chip.
- **Decision:** the decision chip, then the confidence band. For `approve_adjusted` it shows "Pay ₹X".
- **Rationale:** Newsreader 18px, ending with footnote markers ¹²³.
  - Hovering a marker opens its hover card (ai-elements `inline-citation`).
  - The **Precedents cited** list below shows kind label, text, date and "→ EXC-xxxx" when `exception_id` is present.
  - Directives appear only on guardrail recommendations; the backend already filters them.
- **Guardrail:**
  - The panel inverts.
  - Parse `/Hard control: (.+?) Action forced to (\w+)\./` to get the control message.
  - Parse `/Memory alone would have suggested (\w+)/` and show it as "Memory alone would have said ~~Approve~~".
- **ML note:** parse the trailing `/ ML check: (.+)$/` into a separate "Unusual for this vendor" note.
- **Footer** (muted mono): `provider · latency · generated_at`, plus a "Re-run" button (`POST …/recommend`).
- **Loading** (recommendation null; real latency 7–9 s):
  - Staged copy: "Recalling this vendor's precedents… → Weighing past decisions… → Checking hard controls…".
  - It resolves on the `exception.updated` event.
- **Verdict diff:** when both memory variants are in the query cache, show
  "Memory changed this verdict: ◌ HOLD 40 → ◆ APPROVE 95".
- **Decision bar:** `[Accept · Approve ↵] [Overrule O] [Hold H] [Escalate E]`.
- **Resolve form:**
  - The five actions as coloured segments.
  - Adjusted amount, only for `approve_adjusted`, prefilled from the recommendation.
  - Reason: required, 5 characters minimum. Prefilled with the rationale's first sentence on Accept. Placeholder: "Why? Precedent learns from this."
  - `resolved_by` is the signed-in clerk.
  - When the case is `blocking` and the chosen action pays money, require a "Verified by callback" checkbox.
- **After resolve**, the panel becomes:
  - a **Resolution** card: decision, reason quoted, by and at, agreed or overruled, and a "PII redacted" badge when `redacted` is non-empty (render `[REDACTED:kind]` spans as inline chips)
  - then a **"◆ Lesson filed to memory"** card with the `lesson` text; the trust dots fill in.
  - On `promoted`, the ink **AUTO** seal stamps onto the trust meter.
  - On `demoted`: "Trust reset: back to suggest".
- **Auto-resolved cases:** "◆ Resolved by Precedent under earned autonomy" plus an **Override** button, which re-opens the resolve form.
- **Revoked lessons:** the Resolution card shows "Lesson revoked by {revoked_by}: {revoke_reason}" with the lesson struck through.

### 5.3 Trust map: `/trust`

- **Layout:** a matrix with vendors as rows (only vendors that have autonomy rows) and exception types as columns.
- **Hard-control columns** sit apart under a hatched header, "Always human".
- **Cells:**
  - `suggest`: 3 streak dots
  - `auto`: solid ink "◆ AUTO" seal plus the auto-resolved count
  - `locked`: hatched with 🔒
  - blank when there is no row
- **Hover card:** accepted, overruled, auto, `updated_at`, and "1 more accepted recommendation to auto".
- **Header:** "N lanes on auto · N learning · N locked", plus a collapsible "How trust is earned".
- **Live:** `autonomy.changed` animates the dots; a promotion stamps.
- **Phones:** a grouped list instead of the matrix.

### 5.4 Vendors: `/vendors`, `/vendors/:id`

- **Index:** a tablecn data table with vendor (name, city, category), GSTIN (mono), terms, invoices, exceptions, open, and touchless rate as an inline bar. Sort and search are kept in the URL.
- **Vendor file:**
  - Header: name in serif, GSTIN, state, terms, bank on file.
  - **What Precedent has learned** (`learned` observations).
  - **Playbook:** markdown in serif prose, badged "Maintained by Hindsight".
    - Treat null or "Generating content…" as pending: "Drafting playbook…" with a retry.
  - Trust lanes: a mini matrix.
  - Lessons for this vendor (`/api/lessons?vendor_id=`).
  - Recent cases.
  - "Ask about this vendor" opens Ask with the vendor filled in.
- **Loading:** the header renders at once from the vendor-index cache (`placeholderData`); the learned sections show skeletons, because this call hits Hindsight.

### 5.5 Learning: `/learning`

- **Headline sentence (serif)**, built from `eval`:
  - *"Months 5–6: right 96% of the time with memory, 35% without. Zero false approvals."*
  - Fallback when there's no baseline: the memory-on figures only.
- **One typographic row of figures**, hairline dividers, no cards:
  - touchless rate · acceptance · citation relevance · exceptions · auto-resolved · blocked by controls · **false approvals 0** · lessons revoked · memories · hours saved
  - Animated with NumberFlow.
- **Two line charts** (touchless by week; accuracy by week):
  - Memory on vs off, labels at the line ends, one axis.
  - Stage markers at weeks 1, 3, 8 and 9. Crosshair tooltip.
  - When `memory_off` is null, draw a single line with "Baseline not available".
- **By exception type:** horizontal bars. Hard controls show 🔒 "0% by design".
- **Assumptions** as numbered footnotes in small serif.

### 5.6 Memory: `/memory`, three tabs

- **Lessons** (default):
  - `GET /api/lessons?include_revoked=true`, grouped by day with shadcn `marker`.
  - Each item shows: vendor, type, decision chip, reason quote, "taught by {clerk}" or "◆ auto", date.
  - **Revoke** opens an alert dialog with a reason (min 5 characters) and `revoked_by` set to the signed-in clerk.
  - The result reads: "Memory deleted · N open cases will be re-evaluated · trust reset to {level}".
  - `memory.revoked` strikes the item through, live.
- **Team policy:** `GET /api/memory/policy` as serif markdown with "refreshed {refreshed_at}". Treat "Generating content…" as pending.
- **Raw memories:** `/api/memory/recent?limit=50`, filterable by kind, with a glossary aside that defines the memory types.
- **Hindsight down (503):** "Hindsight is unreachable. The ledger returns when memory does."

### 5.7 Ask Precedent: ⌘K and a sheet

- **Command palette:**
  - Actions: go to case or vendor, toggle memory, move stage, presenter mode, theme.
  - When the input looks like a question, the top item is "Ask Precedent: …".
- **Sheet** (480px, right):
  - The question.
  - The answer as serif markdown with footnoted citations.
  - "Answered from memory in {latency} s".
  - A vendor scope chip.
  - Three suggested questions.
  - Loading: "Reflecting on memory…". 503: an inline error.

### 5.8 Capture: `/capture`

- **Input:**
  - Phones: `<input type=file accept="image/*" capture="environment">`.
  - Desktop: a Kibo dropzone plus a **"Use sample invoice"** button that loads the bundled Balaji PNG.
- **Processing:** the image with a scan line (reduced-motion: a spinner) and "Reading invoice…".
- **Result:**
  - The extracted invoice card: vendor matched ✓ by GSTIN, lines, total, bank account.
  - Then one of three outcomes:
    - `matched` → "Clean 3-way match: queued for payment"
    - `exception` → "Opened {id} →"
    - `unknown_vendor` → "Vendor not in master"
- **Errors:** 413, 415 and 502 each get a plain message.

### 5.9 Stage rail and narrator

- **Rail:** Dice stepper with four nodes (`reached`, current).
- **Advancing:**
  - Clicking the next node confirms first: "Advance to Week 8 · Earned autonomy?".
  - Snapshots make it near-instant, but while `busy` the rail shows progress and controls are disabled.
  - Reset lives in the overflow menu.
- **Narrator card** at the top of the docket: once per stage, dismissible, in serif.

| Stage | Narrator text |
|---|---|
| Day 1 | "Fresh agent, no memory. Watch its first freight charge." |
| Week 3 | "Two weeks of decisions later…" |
| Week 8 | "Earned autonomy." |
| Twist | "Someone changes Balaji's bank account." |

### 5.10 System states, PWA, presenter mode

- **Banners:**
  - Hindsight down: amber, from `/api/health`, polled every 30 s.
  - Offline: "Showing last synced data".
  - SSE disconnected: the top-bar dot turns grey.
- **Push and install:**
  - A "Notify me on this device" popover: `GET /api/push/public-key` then `POST /api/push/subscribe`.
  - An install prompt.
  - The service worker `notificationclick` opens the notification's `url`, or focuses the app and navigates to it.
- **Presenter mode (`P`):**
  - Root font 115%.
  - Number keys 1–4 jump stages.
  - A keyboard hint overlay.

## 6. Architecture

```
frontend/
  src/
    api/          schema.d.ts (generated) · client.ts · queries.ts (queryOptions factories) · fixtures.ts
    app/          router.tsx · providers.tsx · shell/ (sidebar, topbar, stage-rail, memory-switch)
    features/     docket/ · case-file/ · trust/ · vendors/ · learning/ · memory/ · ask/ · capture/
    components/   ui/ (shadcn + registry, restyled) · brand/ (Wordmark, Mark) · precedent/ (DecisionChip,
                  SourceChip, ConfidenceBand, TypeChip, Money, CaseId, KindBadge, TrustDots, AutoSeal)
    lib/          format.ts (inr, dates on sim clock) · labels.ts · parse-rationale.ts · keys.ts
    hooks/        use-server-events.ts · use-shortcuts.ts
    stores/       ui.ts (Zustand: clerk, presenter, theme, dismissed narrators; persisted)
    sw.ts
  docs/           this spec · brand/
```

### Server state (TanStack Query)

**Query key factories:**

| Key | Source |
|---|---|
| `['settings']` | settings |
| `['health']` | health, refetch every 30 s |
| `['demo']` | demo state |
| `['exceptions', filters]` | exception list |
| `['exception', id, memOn]` | case detail |
| `['vendors']`, `['vendor', id]` | vendors |
| `['autonomy']` | trust map |
| `['metrics']` | Learning |
| `['memory', 'recent']` | raw memories |
| `['lessons', vendorId?]` | lessons |
| `['policy']` | team policy |

- `staleTime` is 30 s; SSE does the freshness.
- `memOn` is part of the case key, so both variants stay cached and the verdict diff can read them.
- **Memory switch:** `PATCH /api/settings`, optimistic update of `['settings']`, then invalidate `['exceptions']` and `['exception']`.
- **Mutations:** resolve, recommend, revoke, advance, reset, capture, subscribe, ask.

### Live events (one hook mounted in providers)

| Event | Invalidate | Also |
|---|---|---|
| `exception.created` | `exceptions` | toast, except while `demo.busy` |
| `exception.updated` | `exceptions`, `['exception', id]`, `vendors`, `metrics` | |
| `memory.retained` | `memory`, `lessons`, `metrics` | "◆ Learned" toast |
| `autonomy.changed` | `autonomy`, `['exception']`, `['vendor', vendor_id]` | stamp on promotion |
| `memory.revoked` | `lessons`, `autonomy`, `exceptions`, `['exception']` | |
| `sim.changed` | everything (ignore the payload; it has two shapes) | |

- While `demo.busy`, invalidations are batched once per second.
- On reconnect after a gap, invalidate everything.

### Routing

- `createBrowserRouter` in data mode.
- Route `lazy` for code-splitting, so Learning and Recharts load separately.
- Loaders call `queryClient.ensureQueryData` for the case file and vendor file.

### Fixture mode

- Turned on with `VITE_FIXTURES=1` or `?fixtures=1`.
- An openapi-fetch middleware answers from `docs/mocks/*.json`, imported through a Vite alias (`@mocks`, with `server.fs.allow` for the parent folder).
- SSE is disabled in this mode.
- It keeps the UI buildable and demo-safe if the backend is unreachable.
- MSW is for tests only, because it clashes with our service worker scope.

### Other

- **Keyboard** (react-hotkeys-hook; ignored inside inputs):

| Key | Action |
|---|---|
| J / K | next / previous case |
| ↵ | accept |
| O | overrule |
| H | hold |
| E | escalate |
| ⌘K | palette |
| P | presenter mode |
| D | theme |
| [ / ] | previous / next stage |
| 1–4 | stages (presenter mode only) |

- **Errors:**
  - `react-error-boundary` around the opinion panel, markdown blocks and charts.
  - FastAPI `detail` messages go to toasts.
  - 409 on resolve shows "Already resolved", then refetch.
- **PWA:**
  - vite-plugin-pwa `injectManifest` with `src/sw.ts`: precache, a navigation fallback that denies `/api/`, and push handlers.
  - Icons come from `brand/icon.svg` via `@vite-pwa/assets-generator@1.0.4`.

## 7. Testing

- **Vitest + RTL + happy-dom** for:
  - formatters (INR, sim dates)
  - `parse-rationale` (guardrail, ML check, plain)
  - label maps
  - 3-way row join (SKU and no-SKU lines)
  - the SSE → invalidation mapping
  - resolve form validation (reason ≥ 5, adjusted amount, blocking guard)
- **Playwright smoke in fixture mode:** open the docket, open a case, see the opinion and citations, resolve, see the lesson card, open the trust map and Learning.
- **Before each commit:** `npm run build` (tsc + vite) and `npx oxlint`.

## 8. Build order

1. **P0 (demo path):**
   - scaffold and tokens
   - brand components
   - API layer, fixtures and SSE
   - shell (sidebar, top bar, stage rail, memory switch)
   - docket and case file (evidence, opinion, resolve, lesson moment)
   - trust map
2. **P1:** Learning · Memory (lessons, revoke, policy, raw) · vendor index and file · Ask sheet and ⌘K · presenter mode · narrator.
3. **P2:** capture · push and install · dark-theme pass · mobile polish · Playwright smoke.

## 9. Open items for the backend owner

These are not blocking.

- Send one payload shape for `sim.changed`. The frontend already ignores it.
- Optional: offer our wordmark SVGs in place of `docs/assets/title-*.svg` in the README.
