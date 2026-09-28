# Precedent

An accounts-payable (AP) agent that learns from every invoice exception it resolves.
Built for HackwithHyderabad 3.0 on **Hindsight** agent memory (Vectorize).

Invoices are 3-way matched against the purchase order (PO) and goods receipt (GRN).
Mismatches become exceptions. The agent recalls how similar exceptions were resolved
before, recommends a decision with cited precedents, learns from the clerk's decision,
and earns autonomy per vendor × exception type. Hard financial controls never bend.

**Principle:** the database records what happened; Hindsight stores what the team learned.

## Ownership (do not edit the other side's folder)

| Folder | Owner | Scope |
|---|---|---|
| `backend/` | Eldorado5002 | FastAPI API, data generator, matching, guardrails, Hindsight memory, LLM router, agent, eval |
| `frontend/` | teammate | Desktop-first PWA with mobile support |
| `docs/` | shared | `api-contract.md` + `mocks/` — change only after both agree |

## Git rules (mandatory for every Claude session)

- Commit and push directly to `main`. No feature branches.
- Always `git pull --rebase` before `git push`.
- Commit messages: short and simple, e.g. `add matching engine`, `fix queue filters`.
- **Never add `Co-Authored-By` trailers, "Generated with Claude" lines, or any AI attribution** to commits or PRs.
- Never commit secrets. `backend/.env` is gitignored; `backend/.env.example` lists the variable names.

## Backend (`backend/`)

- Python 3.12, **uv**, FastAPI (built-in SSE), Pydantic v2, SQLModel + SQLite.
- Memory: Hindsight Cloud via `hindsight-client` (retain / recall / reflect, tags, directives, mental models).
- LLM: `app/llm/router.py` — one OpenAI-compatible client, failover chain
  Groq `openai/gpt-oss-120b` → Gemini `gemini-3.1-flash-lite` → NVIDIA `nvidia/nemotron-3-super-120b-a12b`.
  LLMs only return schema-validated JSON; plain Python drives control flow.
- Deterministic guardrails run **before** any LLM: duplicate invoice (exact and fuzzy), bank-detail change,
  invalid or mismatched GSTIN, missing e-invoice IRN, first-time vendor, over ₹5,00,000.
- Recommender routes, cheapest first: guardrail (no LLM) → fast path (Hindsight recall + one LLM call, for routine
  vendor × type pairs) → reflect (new or uncertain cases). Auto-payment also needs the autonomy certificate
  (`app/agent/certify.py`, Clopper–Pearson bound on the wrong-payment rate).
- India compliance lives in `app/services/compliance.py` (MSME 43B(h), e-invoicing); fraud scoring in
  `app/services/risk.py` and `app/ml/benford.py`.
- ML: scikit-learn IsolationForest per vendor → anomaly score.

```bash
cd backend
uv sync
uv run python -m app.data.seed        # generate the synthetic dataset into SQLite
uv run fastapi dev app/main.py        # API on http://localhost:8000  (docs at /docs)
uv run pytest                         # tests
uv run ruff check . && uv run ruff format .
```

Evaluations (live APIs, cost real money — ask before rerunning): `scripts/build_demo.py` (demo snapshots +
learning curve, ~$4–5 of Hindsight), `scripts/ablation.py` (~$4.60), `scripts/eval_capture.py` (~$0.05 of Gemini).
Method and results: `docs/EVALUATION.md`. `scripts/make_mocks.py` regenerates `docs/mocks/` from the running app
(~$0.06; it deletes the lessons it writes into the demo banks afterwards).

Contract with the frontend: the UI parses fixed sentences out of a recommendation's rationale (hard control,
"Memory alone would have suggested", ML check, MSME note; all listed in `docs/api-contract.md`). The hard-control
ones are pinned by `tests/test_frontend_contract.py`. Change any of them only together with
`frontend/src/lib/parse-rationale.ts`. After changing recommendation wording, update the stored demo
snapshots for free with `uv run python -m scripts.refresh_stage day1 week3 week8 twist --text-only`.

## Frontend (`frontend/`)

- Vite 8 + React 19 + TypeScript, vite-plugin-pwa (`injectManifest`), Tailwind v4 + shadcn/ui,
  TanStack Query + TanStack Table, Zustand, React Router 7, Recharts, openapi-typescript + openapi-fetch.
- **Desktop-first** (≥1280px is the primary layout, judged on a projector), fully responsive down to phones.
- Build against the mocks until the backend is running; then point `VITE_API_BASE_URL` at it.
  `docs/mocks/*.json` is Week 3 (fixture mode, `?fixtures=1`); `docs/mocks/twist/` and `docs/mocks/replay-end/` hold
  real responses for the Twist and the end of the replay (hard controls, MSME, risk, captures, certified certificate).
- Generate API types from the running backend: `npm run gen:api`.
- Screen-by-screen work for the newer backend features: `docs/frontend-integration.md`.

## Hosting

The demo runs on Google Cloud Run (project `claude-coders-4`, service `precedent`, `us-central1`): one container
that serves the API and the built web app (`Dockerfile` at the root). Keys live in Secret Manager, never in git.
Keep it at **one instance** (live state is in memory). Deploy, demo on/off and costs: `docs/DEPLOY.md`.

## Conventions

- Money is INR, sent as numbers (rupees with paise); format in the UI with `Intl.NumberFormat('en-IN')`.
- Dates are ISO 8601. The app runs on a **simulated clock** (`sim_date`), not wall-clock time.
- LLM keys live only in `backend/.env` and never reach the browser.
