# Precedent: frontend

The clerk's workspace for Precedent, the accounts-payable agent that learns from every invoice exception it resolves. It is a desktop-first PWA, designed to be judged on a projector at 1280px and wider, and it also works on phones for capture and push notifications.

- **Design direction:** "Case Law". The agent writes opinions and cites past cases like footnotes, on paper-and-ink styling where colour only marks decisions.
- **Spec:** [`docs/2026-09-28-frontend-design.md`](docs/2026-09-28-frontend-design.md)
- **Build plan:** [`docs/2026-09-28-frontend-plan.md`](docs/2026-09-28-frontend-plan.md)
- **Brand files:** [`docs/brand/`](docs/brand/)

## Run it

Needs Node 22+.

```bash
cd frontend
npm install
cp .env.example .env            # VITE_API_BASE_URL=http://localhost:8000
npm run dev                     # http://localhost:5173
```

Start the backend first (see [`../CLAUDE.md`](../CLAUDE.md)).

**No backend?** Open `http://localhost:5173/?fixtures=1`, or set `VITE_FIXTURES=1`. Every API call is then answered from [`../docs/mocks`](../docs/mocks), which holds real Week 3 data. The setting sticks for the browser tab; `?fixtures=0` switches back to the live backend.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-checks (app + service worker) and builds the PWA |
| `npm run preview` | Serves the build. Use this to test install and push (the service worker is off in dev). |
| `npm test` | Unit tests (Vitest + Testing Library) |
| `npm run e2e` | Playwright smoke test of the demo path in fixture mode (uses your local Chrome) |
| `npm run gen:api` | Regenerates `src/api/schema.d.ts` from the running backend's OpenAPI |
| `npx oxlint` | Lint |

## Where things live

```
src/api/        typed client (openapi-fetch) · query keys · queries · mutations · fixture mode
src/app/        router · providers · theme · shell (sidebar, top bar, stage rail, memory switch, ⌘K, presenter)
src/features/   one folder per screen: docket · case-file · trust · vendors · learning · memory · ask · capture · pwa
src/components/ precedent/ (DecisionChip, SourceChip, TrustDots, AutoSeal, KindBadge, …) · brand/ · ui/ (shadcn)
src/lib/        format (₹, simulated dates) · labels · parse-rationale · three-way
src/hooks/      use-server-events (SSE → query invalidation)
```

## Presenting

| Key | Action |
|---|---|
| `P` | Presenter mode (larger type, key hints) |
| `1`–`4` | Jump demo stage (presenter mode) |
| `J` / `K` | Next / previous case |
| `↵` | Accept Precedent's recommendation |
| `O` | Overrule |
| `H` | Hold |
| `E` | Escalate |
| `⌘K` / `Ctrl K` | Search, or ask Precedent |
| `D` | Paper / ink theme |

## Conventions

- Money is always INR, formatted with `Intl.NumberFormat('en-IN')` (₹2,41,428.00). Fonts load the `latin-ext` subset, which contains the ₹ sign.
- Dates come from the simulated clock (`settings.sim_date`), never from `Date.now()`.
- Anything the agent wrote carries the ◆ mark.
- Hard controls are shown with a lock and hatching. Nothing in the UI lets memory override them.
