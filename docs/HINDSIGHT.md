# How Precedent uses Hindsight memory

Memory is the product. Invoices, purchase orders and goods receipts live in SQLite as the system of record.
Everything the AP team *learns* (how each exception was resolved, why, and which vendor habits and limits
apply) lives in a Hindsight memory bank. Remove the memory and Precedent becomes a generic assistant that
recommends the correct payment outcome 50% of the time instead of 98%.

All Hindsight calls go through [`backend/app/memory/store.py`](../backend/app/memory/store.py).

## 1. The memory bank

One bank per AP team (`precedent-ap`), created with:

| Setting | Value | Why |
|---|---|---|
| `mission` | Institutional memory of the AP team at a Hyderabad manufacturer | Frames everything the bank stores |
| `retain_mission` | Extract who resolved which exception, for which vendor, the amounts, the decision and the exact reason (especially thresholds, caps, percentages, agreements and seasons), and whether the agent was accepted or overruled | Steers fact extraction towards what matters for AP |
| `observations_mission` | Durable vendor habits and policies, with exact numeric limits; update when terms change and keep the history | Makes consolidated observations useful as policy |
| `reflect_mission` | "I am Precedent, a careful AP specialist… this vendor's precedents first, then the same exception type… I never weaken financial controls" | Identity for every recommendation |
| Disposition | skepticism 5, literalism 4, empathy 1 | A finance agent should be sceptical and literal |
| `entity_labels` | `exception_type` (12 values), `decision` (5 values) | Controlled vocabulary at extraction time |
| Directives (7) | Bank change → escalate; duplicates → reject; new vendors → escalate; over ₹5,00,000 → escalate; a supplier above ₹5 crore without an e-invoice IRN → hold; a GSTIN that fails its checksum or differs from the master → escalate; only rely on matching precedents, prefer the most recent, admit when none applies | Hard rules applied inside every `reflect()` |
| Mental models | `team-policy` (team-wide rules), plus a `playbook-<vendor>` fallback | Curated summaries that reflect reads first |
| Knowledge Pages | A "Vendors" folder with one page per vendor | The vendor wiki (section 5) |

## 2. Writing memory: every decision becomes a lesson

When a clerk resolves an exception (or the agent auto-resolves one), Precedent calls `retain()` with a
plain-language account of the case:

```text
Case EXC-0001 on 02 Mar 2026: Priya (AP) resolved an invoice exception for vendor
Shree Balaji Steel Traders Pvt Ltd (V001).
Invoice SBST/2526/0938, total ₹1,62,685.16, PO PO-2026-0001.
Exception type: freight_charge. Details: Line 3 'Freight charges - Medchal to Unit 2' (₹3,850.00 + GST)
is not on the purchase order.
Decision: APPROVE (pay as invoiced). Reason: "Balaji bills freight separately on the last line — our
standing agreement covers freight up to ₹5,000 per trip."
Precedent (the AP agent) had recommended HOLD with 30% confidence; the clerk overruled it.
```

| Field | Value | Used for |
|---|---|---|
| `document_id` | the case id (`EXC-0001`) | One document per lesson, so it can be revoked on its own |
| `timestamp` | the simulated resolution date | Temporal reasoning ("last quarter", monsoon months) and time-anchored recall |
| `tags` | `vendor:V001`, `exc:freight_charge`, `decision:approve` | Scoping recall and reflect |
| `metadata` | exception id, vendor id, decision, `taught_by` | Attribution and auditing |

From each lesson Hindsight extracts:
- **World facts**: "Priya approved invoice SBST/2526/0938 … freight within the ₹5,000 agreement"
- **Experience facts** (the agent's own track record): "Precedent recommended HOLD with 30% confidence, but
  Priya overruled this recommendation"
- **Observations**, consolidated in the background: "Shree Balaji Steel freight charges are approved by the
  team when they are ₹5,000 or less per trip"

Before anything is sent, [`redact.py`](../backend/app/memory/redact.py) removes phone numbers, bank account
numbers, PAN, Aadhaar, card numbers, emails and UPI ids from the clerk's free-text reason. Hindsight's own
`memory_defense` redaction is a paid capability our organisation isn't entitled to, so Precedent redacts
locally. It also tries to enable Hindsight's version and uses it when available.

## 3. Reading memory: three routes, cheapest first

Every exception takes exactly one route ([`agent/recommender.py`](../backend/app/agent/recommender.py)):

| Route | When | What happens | Cost |
|---|---|---|---|
| **Guardrail** | A hard control fired | The action is forced in code. `recall()` fetches the precedent being overridden, so the clerk sees why strong precedent didn't win | ~$0.0005 |
| **Fast path** | A routine vendor × type pair (at least 2 accepted recommendations) with a consolidated observation | `recall()` with the vendor and type tags and `query_timestamp` set to the invoice date, then one LLM call over the recalled facts | ~$0.001, ~2 s |
| **Reflect** | Everything else, *and* any fast answer that is ungrounded or below 0.8 confidence | `reflect()` with a structured brief, tags, `response_schema` and `include_facts` | $0.05, ~7 s |

For `reflect()`, Precedent sends:
- a structured brief: vendor, invoice lines, the issues the 3-way match found, the amount at risk, the
  vendor's typical invoice total, the ML anomaly score and any MSME payment deadline
- `tags = [vendor:V001, exc:freight_charge]` with `tags_match="any"`, so it sees this vendor's lessons and
  the same exception type across vendors
- `response_schema` = the recommendation schema (action, confidence, rationale, precedent_found), so the
  answer comes back typed
- `include_facts=True`, so `based_on` lists the exact memories, mental models and directives used

Those citations become the **"memories used" panel** in the UI. A recommendation only counts as
memory-backed when the model says a precedent applies *and* it cites real memories. Otherwise it is labelled
"no memory" and kept at low confidence.

Over the 26-week replay, 58% of recommendations took the fast path, the median took 2.7 seconds, and memory plus models cost **$17 per 1,000 exceptions**.

If `reflect()` fails, Precedent falls back to `recall()` (the same tags) and gives the recalled facts to the
LLM router. If Hindsight is down, it falls back to the LLM without memory, and `/api/health` reports
`hindsight: down` so the UI can show a banner.

## 4. Beliefs, and how they changed

`GET /api/vendors/{id}/beliefs` shows what the agent believes about a vendor. For each consolidated
observation it calls the memory API for the observation's **source memories** (the evidence count) and its
**observation history**: every earlier version of the belief, when it was true, and which new facts changed
it. A clerk can see, for example, that "freight is approved" became "freight is approved up to ₹5,000 per
trip" when a new lesson arrived, and exactly which lesson that was.

## 5. The vendor wiki (Knowledge Pages)

The vendor profile's playbook is a **Hindsight Knowledge Page**. The first time a vendor is opened, Precedent
creates a page in a "Vendors" folder, tagged with the vendor and driven by a source query ("What should an AP
clerk know about invoices from this vendor? Billing habits, exact limits, the standard decision per
exception type, and anything that changed over time"). Hindsight writes it in the background and keeps it up
to date as lessons arrive. `GET /api/knowledge` lists the pages and `GET /api/knowledge/{id}` returns one as
markdown. The demo builder asks for Balaji's page at every stage, so it's ready when a judge opens it.

Other reads:

| Feature | Hindsight call |
|---|---|
| Vendor profile: "what we've learned about this vendor" | `recall(types=["observation"], tags=[vendor], tags_match="any_strict")` |
| Team policy | `team-policy` mental model, refreshed on demand when it is older than 10 minutes |
| Ask Precedent (copilot) | `reflect(budget="mid")` over the whole bank, with citations; the question is prefixed with the simulated date so "last month" means the right month |
| Recent learning feed | `list_memories` |

## 6. Learning shows up as autonomy, and autonomy is certified

Every recommendation made with memory on is compared with the clerk's decision (same payment outcome: pay /
pay a corrected amount / don't pay). Three agreements in a row for a vendor × exception type promote it to
**auto**; a single overrule demotes it. The six hard-control types are locked and never auto-resolve.

An automatic *payment* additionally needs:
- an amount no larger than humans have already approved for that pair,
- a normal anomaly score, and
- confidence at or above the threshold set by the **autonomy certificate**
  ([`agent/certify.py`](../backend/app/agent/certify.py)).

The certificate treats every memory-backed payment recommendation that a human verified (a clerk's decision
or a passed audit) as a trial, and a payment that shouldn't have been made as an error. For thresholds from
0.95 downwards, tested in a fixed order, it computes the exact one-sided Clopper–Pearson upper bound on the
wrong-payment rate. The lowest threshold whose bound stays under 5% at 95% confidence is certified. Until
then (with no errors that takes 59 verified decisions) autonomy runs at a strict provisional 0.95. If 30 or
more verified decisions show a wrong-payment rate above 5%, auto-approval pauses by itself.

At the end of the 26-week replay the certificate read: **certified at ≥ 0.75**, 73 verified payment
recommendations, 0 wrong, upper bound 4.0%. Stated confidence is also calibrated against outcomes
(expected calibration error 0.07), and each recommendation carries both numbers.

What the replay showed for one vendor:

| Day | Balaji freight | Agent | Outcome |
|---|---|---|---|
| 0 | ₹3,850 | hold, 0.30, no memory | overruled; stored as an experience fact |
| 5, 10, 16 | ₹4,100 / ₹2,900 / ₹4,200 | approve (1.00 / 1.00 / 0.95), citing the Day 0 decision and the observation | accepted, promoted to auto |
| 23 | ₹7,400 (over the cap) | **auto-hold**, 0.90, fast path | correct: it learned the cap, not just "approve freight" |
| 30, 51 | ₹3,300 / ₹3,600 | auto-approve | touchless |
| 44 | ₹4,650 | approve, not auto (above the largest human-approved amount) | a human confirmed; the limit grows |

## 7. Forgetting a wrong lesson

A lesson taught by mistake (or maliciously) can be revoked: `POST /api/lessons/{case_id}/revoke`.
Because every lesson is its own Hindsight document, Precedent deletes that document through the Documents
API (`delete_document`), which removes every fact extracted from it. It then resets the vendor × type
autonomy ladder and discards cached recommendations for open cases of that pair. The revocation, who made it
and why are kept in the database for audit. Tested live: a poisoned "pay any freight, no cap" lesson went from
2 extracted facts to 0.

## 8. Hard controls sit outside memory

Duplicate invoices (exact, reformatted, resubmitted with a suffix, or with transposed digits), bank-account
changes, a GSTIN that fails its checksum or differs from the vendor master, a missing e-invoice IRN,
first-time vendors and invoices over ₹5,00,000 are detected in code before any model runs. Their action is
forced (reject, escalate or hold) whatever memory suggests. The matching directive and the precedent that was
overridden are both shown as citations.

## 9. Which part of memory does the work? (ablation)

[`scripts/ablation.py`](../backend/scripts/ablation.py) replays 12 weeks in its own database and bank. The
product agent (hybrid) runs live and is taught by the simulated clerk. Five shadow variants answer every
exception first, read the same bank at the same moment, use the same LLM and never write anything:

| Weeks 5–12, 36 judgement cases | Matches the clerk | Wrong payments | Cost / case | Median latency |
|---|:---:|:---:|:---:|:---:|
| No memory (LLM alone) | 31% | 0 | < $0.001 | 1.7 s |
| Vector RAG over the same lesson texts | 92% | 0 | < $0.001 | 2.3 s |
| Hindsight `recall`, raw facts only | 86% | 0 | < $0.001 | 2.8 s |
| Hindsight `recall`, facts + observations | 83% | 1 | < $0.001 | 2.6 s |
| Hindsight `reflect` | 92% | 0 | $0.050 | 7.1 s |
| **Precedent hybrid** | 83% | 0 | $0.028 | 5.8 s |

Having memory matters far more than how it is read. `reflect` is the most accurate route and the most
expensive; the hybrid gives up a few cautious holds to cut cost, and its cost keeps falling as more pairs
become routine ($0.021 per case in weeks 9–12). A plain vector store is a strong baseline on this data; what
it doesn't give us is consolidated beliefs with history, directives enforced during reasoning, time-anchored
recall, a self-writing wiki and clean forgetting. Full method and variance notes: [`EVALUATION.md`](EVALUATION.md);
raw results: [`ablation.json`](../backend/data/ablation.json).

## 10. Demo snapshots and evaluation

[`scripts/build_demo.py`](../backend/scripts/build_demo.py) replays the 26-week timeline with a fresh bank.
At each demo stage it saves the database state, clones the bank with `clone_bank` (`precedent-ap-day1`,
`-week3`, `-week8`, `-twist`) and starts Balaji's wiki page, so the live demo switches stages instantly and
reproducibly. It then replays the same timeline with memory off (same LLM, no Hindsight, nothing retained)
and writes the weekly learning curve, the end-of-timeline certificate, calibration, cost and latency to
[`backend/data/eval.json`](../backend/data/eval.json).

## 11. Cost and limits

- Hindsight Cloud pricing we planned around: retain ≈ $10 per million input tokens, reflect ≈ $0.05 per call.
  The fast path exists because of that price: once a vendor's habit has been consolidated, recall plus one
  small LLM call answers routine cases for about a fiftieth of the cost.
- A full demo build costs a few dollars of Hindsight and a few cents of Gemini. Every recommendation is cached
  per case and memory mode, so the live demo re-uses results instead of paying twice.
- Mental-model refreshes are throttled (`mental_model_min_refresh_interval_seconds=300`), because each
  refresh is an LLM call.
- `reflect()` takes about 5–14 s, which is why routine cases avoid it and the demo uses prebuilt stage
  snapshots.
