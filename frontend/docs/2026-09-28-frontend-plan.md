# Precedent frontend: implementation plan

> **For agentic workers:** use superpowers:executing-plans. The foundation and P0 are built natively; P1/P2 feature folders may be delegated to parallel subagents once P0 exists as the style reference. Steps use `- [ ]`.

**Goal:** build every screen in the spec (P0, P1, P2) as a working PWA in `frontend/`.
**Architecture:** Vite SPA with React Router 7 in data mode and lazy feature routes. Server state lives in TanStack Query, fed by an openapi-fetch client (with a fixture middleware) and invalidated by one SSE hook. Case Law design tokens sit in `src/index.css`. Shared UI lives in `src/components/precedent/`. Each screen lives in `src/features/<name>/`.
**Tech stack:** Vite 8.3 · React 19.3 · TS ~6.0 · Tailwind 4.3 · shadcn (radix, sera) · TanStack Query 5 / Table 8.21 · Zustand 5 · React Router 7.18 · Recharts 3 · motion · NumberFlow · vite-plugin-pwa.
**Spec:** [`2026-09-28-frontend-design.md`](2026-09-28-frontend-design.md)

## Global constraints

- Branch `frontend` only. Commit messages are a few lowercase words (`add docket`). No AI attribution.
- Pins:
  - `typescript@~6.0`
  - `react-router@^7.18.4`
  - `@vite-pwa/assets-generator@^1.0.4`
  - Generate API types with `npx -p typescript@5 -p openapi-typescript@7`
- Money is formatted with `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})`. Dates come from `settings.sim_date` and are never `Date.now()`.
- Fonts:
  - Newsreader for the agent's voice and page titles.
  - Geist for the UI, with `tabular-nums` on numbers.
  - Geist Mono for IDs.
- Colour only where it means something (decisions, status). Anything the agent wrote carries ◆.
- Motion:
  - 150–250 ms on `cubic-bezier(0.23,1,0.32,1)`.
  - No animation on keyboard navigation.
  - Animate `transform` and `opacity` only.
  - Respect reduced motion.
- **Deviations from the spec**, chosen for speed and control:
  - TanStack Table **v8.21** (v9 was only needed for tablecn).
  - Stage rail, timeline, citation hover cards and dropzone are built on shadcn primitives + react-dropzone instead of the community registries.
  - URL state uses React Router `useSearchParams` instead of nuqs.
- **Every task ends with:** `npm run build` green, `npx oxlint` clean except shadcn fast-refresh warnings, `npm test` green, then commit.

## Review focus (failure modes the tests must pin)

1. **Recommendation still null:** the case file shows the staged "Reasoning…" state and swaps in the opinion on `exception.updated`. It never crashes on `recommendation: null`. Test: case-file render with a null recommendation.
2. **Guardrail and ML-check rationales:** `parseRationale` splits them correctly. Plain rationales pass through untouched. Test: `parse-rationale.test.ts`.
3. **3-way join:**
   - invoice lines with `sku: null`
   - PO or GRN missing (`missing_po`)
   - GRN short-received
   
   Test: `three-way.test.ts`.
4. **Resolve form validation:**
   - reason must be at least 5 characters
   - adjusted amount only for `approve_adjusted`
   - a money-out action on a `blocking` case requires the callback checkbox
   
   Test: `resolve-form.test.tsx`.
5. **Pending placeholders:** "Generating content…", a null playbook or a null policy render a pending state, not raw text. Test: `labels.test.ts` (`isPendingContent`).

---

### Task 1: Scaffold `frontend/`
**Files:** `frontend/{package.json, vite.config.ts, tsconfig*.json, index.html, components.json, .env.example, src/main.tsx, src/index.css, src/sw.ts, public/*}`
- [ ] Run create-vite `react-ts` into a temp directory, then move it into `frontend/`, keeping `README.md` and `docs/`.
- [ ] Set up:
  - `paths` alias `@/*`
  - `@tailwindcss/vite`
  - `resolve.tsconfigPaths`
  - `server.fs.allow: ['..']`
  - alias `@mocks` → `../docs/mocks`
- [ ] `npx shadcn@latest init -t vite -b radix -p sera`, then add the component batch (sidebar, resizable, command, sheet, dialog, alert-dialog, popover, tooltip, hover-card, tabs, toggle-group, badge, kbd, skeleton, spinner, empty, field, label, textarea, input, select, checkbox, switch, separator, scroll-area, chart, table, sonner, alert, progress, dropdown-menu, card, collapsible, item, button-group, drawer).
- [ ] Install the remaining dependencies (spec §2, with the deviations above) and dev tooling: vitest, happy-dom, @testing-library/react + jest-dom + user-event, @playwright/test.
- [ ] Tokens in `index.css`:
  - paper/ink light and dark
  - decision colours `--approve --adjusted --hold --reject --escalate`, each with a `-soft` variant
  - fonts (serif, sans, mono)
  - `@plugin "@tailwindcss/typography"`
  - easing variable `--ease-out`
- [ ] Swap Sera's fonts for Newsreader, Geist and Geist Mono.
- [ ] PWA: `injectManifest` with `src/sw.ts`, `tsconfig.sw.json`, and icons generated from `docs/brand/icon.svg` (assets generator, preset `minimal-2023`). Copy the sample invoice to `public/samples/`.
- [ ] Scripts: `gen:api`, `test`, `e2e`.
- [ ] Build green → commit `scaffold frontend`.

### Task 2: API layer and domain lib (with tests)
**Files:** `src/api/{schema.d.ts, client.ts, fixtures.ts, types.ts, keys.ts, queries.ts, mutations.ts}` · `src/lib/{format.ts, labels.ts, parse-rationale.ts, three-way.ts}` · `src/hooks/use-server-events.ts` · tests next to each.

**Produces:**
- **Types:** `type S = components['schemas']`, plus exported aliases `ExceptionSummary`, `ExceptionDetail`, `Recommendation`, `Citation`, `Action`, `ExceptionType`, `AutonomyState`, `Lesson`, and so on.
- **API client:** `api` (openapi-fetch client) and `unwrap<T>(res): T`, which throws `ApiError{status, detail}`.
- **Fixture mode:** `fixturesEnabled(): boolean`.
- **Query keys and options:** `qk.*` key factories; `settingsQ()`, `healthQ()`, `demoQ()`, `exceptionsQ(filters)`, `exceptionQ(id, memOn)`, `vendorsQ()`, `vendorQ(id)`, `autonomyQ()`, `metricsQ()`, `memoryRecentQ()`, `lessonsQ(vendorId?)`, `policyQ()`.
- **Mutation hooks:** `useSetMemory()`, `useResolve(id)`, `useRecommend(id)`, `useRevoke()`, `useAdvance()`, `useReset()`, `useCapture()`, `useAsk()`, `usePushSubscribe()`.
- **Formatting (`format.ts`):** `inr(n)`, `inrCompact(n)`, `pct(n)`, `simDate(iso)`, `simTime(iso)`, `simRelative(iso, simToday)`.
- **Labels (`labels.ts`):** `TYPE_LABEL`, `ACTION_META{label, tone, icon}`, `KIND_META{label, tip}`, `confidenceBand(c)`, `isPendingContent(s)`.
- **Rationale parsing:** `parseRationale(text) → {control?: {message, forced}, memoryWouldHave?: Action, ml?: string, body: string}`.
- **3-way join:** `joinThreeWay(invoice, po, grn, issues) → ThreeWayRow[]`.
- **SSE:** `useServerEvents()`, with the pure mapping `eventInvalidations(event, data) → QueryKey[]`.

- [ ] Write the failing tests for format, labels, parse-rationale, three-way and eventInvalidations. Run them and confirm they fail.
- [ ] Implement until they pass.
- [ ] Fixture middleware: map method + path to the matching `@mocks/*.json` file, with a 250–600 ms delay; the `resolve` / `revoke` / `advance` / `capture` / `copilot` POSTs answer with their mock result.
- [ ] Commit `add api layer`.

### Task 3: Brand and precedent primitives
**Files:**
- `src/components/brand/{wordmark.tsx, mark.tsx}`: inline SVG paths with `currentColor`.
- `src/components/precedent/`:
  - `decision-chip.tsx`, `source-chip.tsx`, `confidence.tsx`, `type-chip.tsx`, `money.tsx`, `case-id.tsx`
  - `kind-badge.tsx`, `trust-dots.tsx`, `auto-seal.tsx`, `redacted-text.tsx`, `markdown.tsx`, `page-header.tsx`
  - `agent-mark.tsx` (◆), `stat.tsx`, `empty-state.tsx`
- [ ] Each primitive takes API values (`Action`, `RecSource`, `CitationKind`, …) and renders label + icon + tone.
- [ ] `RedactedText` turns `[REDACTED:kind]` into chips.
- [ ] `Markdown` is react-markdown + GFM in serif `prose`.
- [ ] Commit `add ui primitives`.

### Task 4: App shell
**Files:** `src/app/{router.tsx, providers.tsx, theme.tsx}` · `src/app/shell/`:
- layout: `app-shell.tsx`, `app-sidebar.tsx`, `top-bar.tsx`, `mobile-tabs.tsx`
- controls: `stage-rail.tsx`, `memory-switch.tsx`, `health-dot.tsx`, `clerk-picker.tsx`
- overlays: `banners.tsx`, `narrator.tsx`, `command-menu.tsx`, `presenter.tsx`

Plus `src/stores/ui.ts` and `src/hooks/use-shortcuts.ts`.

**Produces:**
- `useUi()` store: `{clerk, presenter, narratorsSeen, askOpen, askVendor}` and setters.
- `openAsk(vendorId?)`.
- Lazy routes for every page in spec §4. Each page module default-exports its page.

**Behaviour:**
- [ ] Sidebar, top bar and the memory-off hatch.
- [ ] Stage rail: confirm dialog, busy state, reset.
- [ ] Health hover card.
- [ ] Banners: Hindsight down, offline, SSE state.
- [ ] Presenter mode: `P`, 1–4 jump stages, root font 115%.
- [ ] Theme toggle with `D`.
- [ ] ⌘K palette: navigate, actions, ask.
- [ ] Mobile bottom tabs.
- [ ] Commit `add app shell`.

### Task 5: Docket (P0)
**Files:** `src/features/docket/{docket-page.tsx, case-list.tsx, case-row.tsx, docket-filters.tsx}`
- [ ] Resizable split view: list on the left, `<Outlet/>` or an empty state on the right.
- [ ] Status tabs with counts, vendor and type filters in URL search params.
- [ ] J/K moves between cases.
- [ ] New rows animate in; a reasoning shimmer shows when the recommendation is null.
- [ ] Commit `add docket`.

### Task 6: Case file (P0)
**Files:** `src/features/case-file/`:
- page: `case-file.tsx`, `case-header.tsx`, `issue-strip.tsx`
- evidence: `three-way-table.tsx`, `bank-check.tsx`, `anomaly.tsx`, `case-timeline.tsx`
- opinion: `opinion-panel.tsx`, `reasoning-state.tsx`, `citations.tsx`, `verdict-diff.tsx`
- decisions: `resolve-form.tsx` (+ `.test.tsx`), `resolution-card.tsx`, `lesson-card.tsx`
- [ ] Everything in spec §5.2, including:
  - guardrail inversion
  - "memory alone would have said"
  - ML note
  - footnoted citations with hover cards
  - accept, overrule, hold and escalate shortcuts
  - AUTO seal on promotion
  - PII chips
  - revoked state
  - override for auto-resolved cases
- [ ] Commit `add case file`.

### Task 7: Trust map (P0)
**Files:** `src/features/trust/{trust-page.tsx, trust-matrix.tsx, trust-cell.tsx}`
- [ ] Matrix with the hard-control group, hover cards, header counts and "How trust is earned".
- [ ] Mobile list.
- [ ] Commit `add trust map`.

### Task 8: Learning (P1)
**Files:** `src/features/learning/{learning-page.tsx, figures-row.tsx, curve-chart.tsx, type-bars.tsx}`
- [ ] Spec §5.5. Run the dataviz palette validator on the two series in light and dark.
- [ ] Commit `add learning`.

### Task 9: Memory (P1)
**Files:** `src/features/memory/{memory-page.tsx, lessons-tab.tsx, lesson-item.tsx, revoke-dialog.tsx, policy-tab.tsx, raw-tab.tsx}`
- [ ] Spec §5.6.
- [ ] Commit `add memory`.

### Task 10: Vendors (P1)
**Files:** `src/features/vendors/{vendors-page.tsx, vendor-page.tsx}`
- [ ] Spec §5.4. The TanStack Table index is sortable, with search.
- [ ] Commit `add vendors`.

### Task 11: Ask Precedent (P1)
**Files:** `src/features/ask/{ask-sheet.tsx}`, wired into `command-menu.tsx`
- [ ] Spec §5.7.
- [ ] Commit `add ask`.

### Task 12: Capture (P2)
**Files:** `src/features/capture/{capture-page.tsx}`
- [ ] Spec §5.8, including "Use sample invoice".
- [ ] Commit `add capture`.

### Task 13: PWA push, install and update (P2)
**Files:** `src/sw.ts`, `src/features/pwa/{notify-popover.tsx, install-prompt.tsx, update-toast.tsx}`
- [ ] Subscribe flow: `urlBase64ToUint8Array(key)`, then `pushManager.subscribe`, then POST.
- [ ] Handle the service worker's `NAVIGATE` message by calling the router's navigate.
- [ ] Commit `add pwa`.

### Task 14: Dark theme, mobile polish, visual QA, smoke e2e (P2)
- [ ] Take Playwright screenshots of every route at 1440px and 390px, in light and dark, with fixtures on and against the live backend. Fix what they show.
- [ ] `e2e/smoke.spec.ts` in fixture mode:
  - docket → case → opinion and citations visible → resolve → lesson card
  - → trust map → learning
- [ ] Update `frontend/README.md` with run, fixtures and generate commands.
- [ ] Commit `polish ui`.
