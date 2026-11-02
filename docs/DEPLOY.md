# Deploying Precedent

The live demo runs as **one Render web service** on the free plan. It serves both the web app and the API from the
same HTTPS address, so there is one URL to share, no CORS, and push notifications work.

| | |
|---|---|
| Live URL | https://precedent-ap.onrender.com |
| Host | [Render](https://render.com), service `precedent-ap`, Docker runtime, branch `main` |
| Plan | Free: 0.1 CPU, 512 MB RAM, **one instance**, sleeps after 15 minutes without visitors |
| Health check path | `/api/demo/state` (reads the local database only, so the checks never call Hindsight) |

## How it's built

Render builds the [`Dockerfile`](../Dockerfile) at the repository root. It has two stages:

1. **Web app.** `npm ci && npm run build` in `frontend/`, with `VITE_API_BASE_URL=/`, so the app calls the API on its
   own origin. `docs/mocks` is copied in because fixture mode imports it at build time.
2. **API.** Python 3.12 with `uv sync --frozen --no-dev`, the `backend/app` code and `backend/data` (the demo
   snapshots and evaluation results). The built web app goes to `/app/web`, and `FRONTEND_DIST=/app/web` makes the API
   serve it: real files as they are, every other non-`/api` path gets `index.html`, so deep links work.

Uvicorn listens on `$PORT`, which Render sets (10000 by default). [`.dockerignore`](../.dockerignore) keeps secrets
and bulk out of the build: every `.env`, `node_modules`, virtual environments, local databases, downloaded datasets
and tests.

**It must stay a single instance.** Live updates, the simulator and the demo state live in memory.

## Secrets and settings

Everything is set under the service's **Environment** tab on Render. Keys are never in the image or in git.

| Kind | Name |
|---|---|
| Keys | `HINDSIGHT_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`, `VAPID_PRIVATE_KEY` |
| Settings | `HINDSIGHT_BASE_URL`, `HINDSIGHT_BANK_ID`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` |
| Spend caps | `DAILY_CAP_ASK=30`, `DAILY_CAP_CAPTURE=40`, `DAILY_CAP_RERUN=30`, `PER_VISITOR_PER_MINUTE=6` |

The model names have working defaults in [`backend/app/config.py`](../backend/app/config.py), so they need no
variables. Setting `GROQ_MODEL`, `GEMINI_MODEL` or `NVIDIA_MODEL` on Render overrides them.

`GEMINI_API_KEY` must come from an AI Studio project **with no billing account linked**, so it runs on Gemini's free
tier. A key from a prepaid project stops with HTTP 402 when the credits run out.

To rotate a key, edit it in the Environment tab and choose **Save and deploy**.

### Spend guards on the public link

Three actions use paid or rate-limited APIs, so each has a daily cap on the hosted demo. Every visitor also gets at
most 6 of them a minute. Over a limit, the API answers `429` with a plain message the app shows as a toast. Everything
else (browsing, stage switches, resolving, revoking) is unlimited. The caps reset at midnight UTC or on a restart.

| Action | What it uses | Cap per day |
|---|---|---|
| Ask Precedent | a Hindsight reflect, about $0.05 | 30 |
| Capture an invoice | Gemini vision (free tier, so this protects the daily free quota) | 40 |
| Re-run a recommendation | can be a Hindsight reflect, about $0.05 | 30 |

Locally all limits are off (the defaults are 0).

## Sleeping and waking

After 15 minutes without visitors the free service sleeps. The next visit wakes it in about a minute and starts the
demo fresh at Day 1. For a showcase, open the link a couple of minutes early so it is awake when you present.

## Redeploy after changes

Push to `main`. Render rebuilds the image and switches over by itself. To redeploy without a new commit, use
**Manual Deploy → Deploy latest commit** in the dashboard. The build logs and the app's logs are under **Logs**.

## Costs

- **Render.** The free plan costs nothing. It includes 750 instance hours a month, enough for one service running all
  month. With no payment method on file, Render suspends the service instead of billing.
- **Groq, Gemini and NVIDIA.** All three keys are on free tiers. When one is rate-limited, the router moves to the next.
- **Hindsight** is the only paid service. It uses prepaid credits and refuses calls (HTTP 402) at zero, so it can't
  overspend unless auto-recharge is on. Ask and Re-run are capped above. Resolving a case is not capped: it stores a
  lesson for under a cent and can trigger a vendor-page refresh at $0.05.

## Things to know

- **The demo is shared.** Everyone who opens the link sees the same demo state; one visitor's stage change is
  everyone's. Use the stage rail's Reset to start again at Day 1.
- **A restart starts fresh.** The free plan has no persistent disk. On every start the app seeds its database and
  opens Day 1 from the committed snapshots. Resolved cases and push subscriptions from before are gone.
- **Memory is not reset.** Reset and restarts restore the database, not the Hindsight banks. Lessons that visitors
  teach the demo stay in the stage banks.
- **Hindsight banks are shared with local runs.** A laptop backend and the hosted one use the same demo banks, so
  avoid capturing invoices on both at once.
- **Live updates reconnect.** If the live-update stream drops (a restart, a proxy timeout), the app reconnects by
  itself. FastAPI sends a keep-alive ping every 15 seconds.

## Earlier hosting

Until October 2026 the demo ran on Google Cloud Run (project `claude-coders-4`). That project's billing account is
closed, so the old `run.app` link no longer works. [`.gcloudignore`](../.gcloudignore) is left over from that setup.
