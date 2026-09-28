# Note for Eldorado5002: frontend round 2 is ready to test

Hi! Everything in `docs/frontend-integration.md` is built on the **`frontend`** branch. I checked it against a local
backend **without API keys**, so a few things could not be tested for real. You have the keys, so please run the
checks below. Then fix the backend items in section 3.

## 1. Run it

```bash
git fetch && git checkout frontend
cd backend && uv run fastapi dev app/main.py        # with your keys in backend/.env
cd frontend && npm install && npm run dev           # http://localhost:5173 (talks to http://localhost:8000)
```

To point the frontend at another backend, set `VITE_API_BASE_URL` in `frontend/.env`.

## 2. What to test (the guide's §6 acts)

Parts marked ✅ already passed without keys. Parts marked 🔑 need your keys.

| Act | Check |
|---|---|
| Day 1 | ✅ EXC-0001 shows Hold and "No precedent" |
| Week 3 | ✅ EXC-0010 shows Approve 95 via the fast path, $0.001 · ✅ memory off shows Hold 40 and the diff · ✅ Accept stamps AUTO · 🔑 Balaji's vendor page shows **"What Precedent believes"** (with its history) and the **Vendor wiki** with proper headings |
| Week 8 | ✅ three lanes on auto · ✅ Learning shows 98% vs 50%, the certificate card, calibration and cost figures |
| Twist | ✅ EXC-0037 inverse panel · ✅ MSME sort puts EXC-0041 first · ✅ Balaji risk 58 · High on the vendor page and on /risk |
| Capture | 🔑 On /capture use the three sample invoices, then freight again. Expected results: freight **auto-resolved** (green), no-IRN **held**, bad-GSTIN **escalated**, freight again **rejected by the duplicate control**. The result banner should name the control. |

Without keys, I replayed the recorded extractions through `capture_invoice` with the Gemini call stubbed out (no
backend files changed). No-IRN, bad-GSTIN and duplicate came out right. Freight could not auto-resolve because
Hindsight was unreachable.

Afterwards, `POST /api/demo/reset` puts everything back to Day 1.

## 3. Backend fixes needed

1. **`/api/health` reports Hindsight "up" when it isn't.** With a bad or missing key, Hindsight answered 401 on
   every call, but health still said `"hindsight": "up"`. The header's Hindsight light trusts this. Please make it
   do a real (cheap) call and report `down` on failure.
2. **`GET /api/vendors/{id}` can't say "memory unavailable".** When Hindsight fails, it returns `learned: []` and
   `playbook: null`, which is the same answer as "nothing learned yet". The frontend now works around this (it uses
   the 503 from `/beliefs` as the signal). A field like `memory: "ok" | "unavailable"` on `VendorProfile` would make
   it exact. It is a contract change, so let's agree on it first and then update `docs/api-contract.md`.
3. **The MSME status differs between the case detail and the list** (optional). `detail()` sends `compliance.msme`
   for every status, but `summary()` sends it only for open cases (`services/cases.py`). The frontend now calms the
   MSME line on decided cases either way, so this is only for consistency.

## 4. If something looks wrong

- Frontend bugs: tell me (srupesh08) the page, stage and case id, plus a screenshot. Please don't edit `frontend/`.
  I'll fix it on the `frontend` branch.
- Anything that changes `docs/` (contract or mocks): let's agree first, as usual.

## 5. Backend reply (28 Sep, 14:00)

Thanks, this was a clean handover. We ran every check with real keys on `main` after your merge:

| Check | Result |
|---|---|
| `npm run build`, `npx oxlint` | Pass (2 fast-refresh warnings) |
| `npx vitest run` | 476 / 476 |
| `npx playwright test` | 6 / 6 |
| Week 3 · Balaji's vendor page | "What Precedent believes" (backed by 6 memories) and the Vendor wiki with proper headings, no `{'level': …}` text |
| Capture at the Twist | Freight **auto-resolved** (EXC-0043), no-IRN **held** (EXC-0044), bad-GSTIN **escalated** (EXC-0045), freight again **rejected as a duplicate** (EXC-0046); every banner names its control |
| After capture | Balaji's vendor page, the trust map and the docket render; the new lanes show as "E-invoice (IRN)" and "GSTIN", always human |

Your three backend items are done (all on `main`, pinned by `backend/tests/test_frontend_contract.py`):

1. **Health.** `/api/health` now does an authenticated call; a bad key reads `"hindsight": "down"`. The old fallback
   used the version endpoint, which answers without a key. Checked live with a wrong key.
2. **`VendorProfile.memory: "ok" | "unavailable"`.** Agreed and added; `docs/api-contract.md` and the vendor-profile
   mocks are updated. It defaults to `"ok"`, so it's optional in the generated types. Once you run
   `npm run gen:api`, you can use it in place of the `/beliefs` 503 workaround.
3. **MSME consistency.** `compliance.msme` is now only set while a case is open, the same as `msme_days_left`.

One UX suggestion from the live run: on the vendor file, "What Precedent believes" and "What Precedent has learned"
show the same sentence, because both come from the same Hindsight observation. Merging them (beliefs, with the
evidence count and history, are the richer view) would read better.

One more from the screenshots for the README: on a 390 px phone, the case file shows a horizontal scrollbar at the
bottom (something is a few pixels wider than the screen). Small, but visible on the phone screenshot.

**Hosting:** the app now runs on Google Cloud Run at https://precedent-1058141277368.us-central1.run.app, one
container serving your built app (with `VITE_API_BASE_URL=/`) and the API. See `docs/DEPLOY.md`. Nothing in
`frontend/` was changed for this.

