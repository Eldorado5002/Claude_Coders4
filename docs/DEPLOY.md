# Deploying Precedent

The live demo runs as **one Google Cloud Run service** that serves both the web app and the API from the same
HTTPS address, so there is one URL to share, no CORS, and push notifications work.

| | |
|---|---|
| Live URL | https://precedent-1058141277368.us-central1.run.app |
| Google Cloud project | `claude-coders-4` (account `phoenixfintechai@gmail.com`) |
| Region | `us-central1` (cheapest; close to Hindsight's servers) |
| Service | `precedent`: 1 vCPU, 1 GiB, **at most 1 instance**, scales to zero when idle |

## How it's built

The [`Dockerfile`](../Dockerfile) at the repository root has two stages:

1. **Web app.** `npm ci && npm run build` in `frontend/`, with `VITE_API_BASE_URL=/`, so the app calls the API on its
   own origin. `docs/mocks` is copied in because fixture mode imports it at build time.
2. **API.** Python 3.12 with `uv sync --frozen --no-dev`, the `backend/app` code and `backend/data` (the demo
   snapshots and evaluation results). The built web app goes to `/app/web`, and `FRONTEND_DIST=/app/web` makes the API
   serve it: real files as they are, every other non-`/api` path gets `index.html`, so deep links work.

[`.gcloudignore`](../.gcloudignore) and [`.dockerignore`](../.dockerignore) keep secrets and bulk out of the upload:
every `.env`, `node_modules`, virtual environments, local databases, downloaded datasets and tests.

**It must stay a single instance** (`--max-instances 1`). Live updates, the simulator and the demo state live in memory.

## Secrets and settings

API keys live in **Secret Manager** and are injected as environment variables at start-up. They are never in the
image or in git.

| Kind | Name |
|---|---|
| Secret Manager | `HINDSIGHT_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`, `VAPID_PRIVATE_KEY` |
| Environment variable | `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `DAILY_CAP_ASK=30`, `DAILY_CAP_CAPTURE=40`, `DAILY_CAP_RERUN=30`, `PER_VISITOR_PER_MINUTE=6` |

To rotate a key: `gcloud secrets versions add HINDSIGHT_API_KEY --data-file=- --project claude-coders-4` (paste the
key, then Ctrl+Z Enter on Windows or Ctrl+D elsewhere), then redeploy or restart the service.

### Spend guards on the public link

Three actions cost money, so each has a daily cap on the hosted demo. Every visitor also gets at most 6 of them a
minute. Over a limit, the API answers `429` with a plain message the app shows as a toast. Everything else
(browsing, stage switches, resolving, revoking) is free and unlimited. The caps reset at midnight UTC or on a restart.

| Action | Why it costs | Cap per day |
|---|---|---|
| Ask Precedent | a Hindsight reflect, about $0.05 | 30 |
| Capture an invoice | Gemini vision, about $0.001 | 40 |
| Re-run a recommendation | can be a reflect, about $0.05 | 30 |

Locally all limits are off (the defaults are 0).

## Demo on / demo off

Cloud Run scales to zero when nobody is using it, which costs nothing. The first visit after that takes about 20
seconds and starts the demo fresh at Day 1. For a showcase, keep one instance warm:

```bash
# demo on: before the showcase (no cold start, about ₹1–2 per hour extra)
gcloud run services update precedent --region us-central1 --project claude-coders-4 --min-instances 1

# demo off: after the showcase (back to sleeping when idle, ₹0)
gcloud run services update precedent --region us-central1 --project claude-coders-4 --min-instances 0
```

## Redeploy after changes

From the repository root (the service keeps its secrets, variables and limits):

```bash
gcloud run deploy precedent --source . --region us-central1 --project claude-coders-4
```

Cloud Build builds the image in Google Cloud (no local Docker needed) and Cloud Run switches over with no downtime.

## Costs

- **Cloud Run.** The free tier covers 180,000 vCPU-seconds and 360,000 GiB-seconds a month, about **50 hours of
  active time**. After that, active time costs about $0.09 (≈ ₹8) an hour. An open browser tab keeps the live-update
  connection open, which counts as active time.
- **Keeping it warm** (`demo on`) costs about ₹1–2 an hour.
- **Secret Manager, Cloud Build, Artifact Registry.** Within their free tiers for this project, or a few rupees at most.
- **Gemini** is billed to the same billing account, so hosting and Gemini share the budget. Set a budget alert in
  Billing → Budgets & alerts (for example at ₹300 and ₹600).

## Useful commands

```bash
gcloud run services describe precedent --region us-central1 --project claude-coders-4 --format="value(status.url)"
gcloud run services logs read precedent --region us-central1 --project claude-coders-4 --limit 50
```

## Things to know

- **The demo is shared.** Everyone who opens the link sees the same demo state; one visitor's stage change is
  everyone's. Use the stage rail's Reset to start again at Day 1.
- **A restart starts fresh.** On every cold start the app seeds its database and opens Day 1 from the committed
  snapshots. Resolved cases and push subscriptions from before are gone; the Hindsight memory banks are not.
- **Hindsight banks are shared with local runs.** A laptop backend and the hosted one use the same demo banks, so
  avoid capturing invoices on both at once.
- **Timeouts.** Cloud Run closes any request after 60 minutes, so the app reconnects its live-update stream about
  once an hour (automatically). FastAPI sends a keep-alive ping every 15 seconds.
