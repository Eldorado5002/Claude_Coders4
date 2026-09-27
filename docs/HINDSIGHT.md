# How Precedent uses Hindsight memory

Memory is the product. Invoices, purchase orders and goods receipts live in SQLite as the system of record.
Everything the AP team *learns* — how each exception was resolved, why, and which vendor habits and limits
apply — lives in a Hindsight memory bank. Remove the memory and Precedent becomes a generic assistant that
recommends the correct payment outcome 35% of the time instead of 96%.

All Hindsight calls go through [`backend/app/memory/store.py`](../backend/app/memory/store.py).

## 1. The memory bank

One bank per AP team (`precedent-ap`), created with:

| Setting | Value | Why |
|---|---|---|
| `mission` | Institutional memory of the AP team at a Hyderabad manufacturer | Frames everything the bank stores |
| `retain_mission` | Extract who resolved which exception, for which vendor, the amounts, the decision and the exact reason — especially thresholds, caps, percentages, agreements, seasons — and whether the agent was accepted or overruled | Steers fact extraction towards what matters for AP |
| `observations_mission` | Durable vendor habits and policies, with exact numeric limits; update when terms change and keep the history | Makes consolidated observations useful as policy |
| `reflect_mission` | "I am Precedent, a careful AP specialist… this vendor's precedents first, then the same exception type… I never weaken financial controls" | Identity for every recommendation |
| Disposition | skepticism 5, literalism 4, empathy 1 | A finance agent should be sceptical and literal |
| `entity_labels` | `exception_type` (10 values), `decision` (5 values) | Controlled vocabulary at extraction time |
| Directives (5) | Bank change → escalate; duplicates → reject; new vendors → escalate; over ₹5,00,000 → escalate; only rely on matching precedents, prefer the most recent, admit when none applies | Hard rules applied inside every `reflect()` |
| Mental models | `team-policy` (team-wide rules) and one `playbook-<vendor>` per vendor | Curated summaries that reflect reads first |

## 2. Writing memory: every decision becomes a lesson

When a clerk resolves an exception (or the agent auto-resolves one), Precedent calls `retain()` with a
plain-language account of the case:

```text
Case EXC-0001 on 02 Mar 2026: Priya (AP) resolved an invoice exception for vendor
Shree Balaji Steel Traders Pvt Ltd (V001).
Invoice SBST/2526/1100, total ₹1,73,873.00, PO PO-2026-0001.
Exception type: freight_charge. Details: Line 3 'Freight charges - Medchal to Unit 2' (₹3,850.00 + GST)
is not on the purchase order.
Decision: APPROVE (pay as invoiced). Reason: "Balaji bills freight separately on the last line — our
standing agreement covers freight up to ₹5,000 per trip."
Precedent (the AP agent) had recommended HOLD with 40% confidence; the clerk overruled it.
```

| Field | Value | Used for |
|---|---|---|
| `document_id` | the case id (`EXC-0001`) | One document per lesson, so it can be revoked on its own |
| `timestamp` | the simulated resolution date | Temporal reasoning ("last quarter", monsoon months) |
| `tags` | `vendor:V001`, `exc:freight_charge`, `decision:approve` | Scoping recall and reflect |
| `metadata` | exception id, vendor id, decision, `taught_by` | Attribution and auditing |

From each lesson Hindsight extracts:
- **World facts**: "Priya approved invoice SBST/2526/1100 … freight within the ₹5,000 agreement"
- **Experience facts** (the agent's own track record): "The assistant recommended escalating, but was
  overruled by Priya"
- **Observations**, consolidated in the background: "Shree Balaji Steel freight charges are approved when
  under ₹5,000 per trip"

Before anything is sent, [`redact.py`](../backend/app/memory/redact.py) removes phone numbers, bank account
numbers, PAN, Aadhaar, card numbers, emails and UPI ids from the clerk's free-text reason. Hindsight's own
`memory_defense` redaction is a paid capability our organisation isn't entitled to, so Precedent redacts
locally. It also tries to enable Hindsight's version and uses it when available.

## 3. Reading memory: a recommendation with receipts

For every exception that passes the hard controls, Precedent calls `reflect()` with:
- a structured brief: vendor, invoice lines, the issues the 3-way match found, the amount at risk, the
  vendor's typical invoice total and the ML anomaly score
- `tags = [vendor:V001, exc:freight_charge]` with `tags_match="any"`, so it sees this vendor's lessons and
  the same exception type across vendors
- `response_schema` = the recommendation schema (action, confidence, rationale, precedent_found), so the
  answer comes back typed
- `include_facts=True`, so `based_on` lists the exact memories, mental models and directives used

Those `based_on` items become the **"memories used" panel** in the UI. A recommendation only counts as
memory-backed when the model says a precedent applies *and* it cites real memories. Otherwise it is labelled
"no memory" and kept at low confidence.

If `reflect()` fails, Precedent falls back to `recall()` (the same tags) and gives the recalled facts to the
LLM router. If Hindsight is down, it falls back to the LLM without memory, and `/api/health` reports
`hindsight: down` so the UI can show a banner.

Other reads:

| Feature | Hindsight call |
|---|---|
| Vendor profile: "what we've learned about this vendor" | `recall(types=["observation"], tags=[vendor], tags_match="any_strict")` |
| Vendor playbook | `playbook-<vendor>` mental model, created on first view and refreshed after consolidation |
| Team policy | `team-policy` mental model, refreshed on demand at most every 10 minutes |
| Ask Precedent (copilot) | `reflect(budget="mid")` over the whole bank, with citations |
| Recent learning feed | `list_memories` |

## 4. Learning shows up as autonomy

Every recommendation made with memory on is compared with the clerk's decision (same payment outcome: pay /
pay a corrected amount / don't pay). Three agreements in a row for a vendor × exception type promote it to
**auto**. From then on, a memory-backed recommendation with confidence ≥ 0.75, a normal anomaly score and an
amount no larger than humans have already approved is resolved automatically, and that resolution is itself
retained as a lesson. A single overrule demotes the pair. The four hard-control types are locked and never
auto-resolve.

What the replay showed for one vendor:

| Day | Balaji freight | Agent | Outcome |
|---|---|---|---|
| 0 | ₹3,850 | hold, 0.40, no memory | overruled — stored as an experience fact |
| 5, 10, 16 | ₹4,100 / ₹2,900 / ₹4,200 | approve, 1.00, cites the Day 1 decision and the observation | accepted, promoted to auto |
| 23 | ₹7,400 (over the cap) | **auto-hold**, 1.00 | correct: it learned the cap, not just "approve freight" |
| 30 | ₹3,300 | auto-approve | touchless |
| 44 | ₹4,650 | approve, not auto (above the largest human-approved amount) | a human confirmed; the limit grows |

## 5. Forgetting a wrong lesson

A lesson taught by mistake (or maliciously) can be revoked: `POST /api/lessons/{case_id}/revoke`.
Because every lesson is its own Hindsight document, Precedent deletes that document through the Documents
API (`delete_document`), which removes every fact extracted from it. It then resets the vendor × type
autonomy ladder and discards cached recommendations for open cases of that pair. The revocation, who made it
and why are kept in the database for audit. Tested live: a poisoned "pay any freight, no cap" lesson went from
2 extracted facts to 0.

## 6. Hard controls sit outside memory

Duplicate invoices, bank-account changes, first-time vendors and invoices over ₹5,00,000 are detected in code
before any model runs. Their action is forced (reject or escalate) whatever memory suggests. The matching
directive and the precedent that was overridden are both shown as citations, so the clerk sees *why* strong
precedent didn't win.

## 7. Demo snapshots and evaluation

[`scripts/build_demo.py`](../backend/scripts/build_demo.py) replays the 26-week timeline with a fresh bank.
At each demo stage it saves the database state and clones the bank with `clone_bank`
(`precedent-ap-day1`, `-week3`, `-week8`, `-twist`), so the live demo switches stages instantly and
reproducibly. It then replays the same timeline with memory off (same LLM, no Hindsight, nothing retained)
and writes the weekly learning curve to [`backend/data/eval.json`](../backend/data/eval.json).

## 8. Cost and limits

- Hindsight Cloud pricing we planned around: retain ≈ $10 per million input tokens, reflect ≈ $0.05 per call.
  A full demo build makes about 140 reflect calls and about 150 retains. Every recommendation is cached per
  case and memory mode, so the live demo re-uses results instead of paying twice.
- Mental-model refreshes are throttled (`mental_model_min_refresh_interval_seconds=300`), because each
  refresh is an LLM call.
- `reflect()` takes about 5–14 s, which is why the demo uses prebuilt stage snapshots.
