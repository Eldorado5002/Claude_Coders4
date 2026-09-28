# How we evaluated Precedent

Every number in the README comes from one of three reproducible evaluations. This page gives the full method,
the complete tables and the caveats. The raw results are committed next to the code:

| Evaluation | Question it answers | Script | Raw results |
|---|---|---|---|
| **Learning curve** | Does memory make the agent better over time, and is it safe? | [`build_demo.py`](../backend/scripts/build_demo.py) | [`eval.json`](../backend/data/eval.json) |
| **Ablation study** | Which part of memory does the work? | [`ablation.py`](../backend/scripts/ablation.py) | [`ablation.json`](../backend/data/ablation.json) |
| **Capture accuracy** | Can it read real invoices it has never seen? | [`eval_capture.py`](../backend/scripts/eval_capture.py) | [`capture_eval.json`](../backend/data/capture_eval.json) |

## 1. The dataset

The invoices are synthetic, generated from a fixed seed, and calibrated on a real purchase-to-pay log:
the **BPI Challenge 2019** event log (van Dongen, 4TU.ResearchData), with 1,595,923 events and 251,734
purchase-order items from a multinational's procurement process. [`calibrate_bpi.py`](../backend/scripts/calibrate_bpi.py)
streams the log once and writes [`bpi2019_calibration.json`](../backend/data/bpi2019_calibration.json).

| What we took from the real log | Real log | How we use it |
|---|---|---|
| PO → goods receipt delay | median 9 days (p10 2, p90 33) | Sampled from the same quantiles |
| Goods receipt → invoice delay | median 26 days (p10 3, p90 80) | Sampled from the same quantiles, clipped to 1–40 days |
| Vendor concentration | top 20% of vendors hold 92% of items | Invoice volume per vendor follows the same curve |
| Benford first-digit fit of amounts | MAD 0.0048 ("close") | Our line amounts score MAD 0.0088 ("acceptable") |
| Exception proxy (price or quantity changed, invoice cancelled) | 13% of items | We use 25% on purpose, so 26 weeks contain enough exceptions to learn from |

The result: 25 vendors across 8 Indian states (10 MSMEs, 12 e-invoicing suppliers), 541 purchase orders and
goods receipts, and **576 invoices over 26 weeks, of which 144 are exceptions**. Each exception carries a
ground-truth decision and reason, which only the simulated clerk sees. The matching engine independently
finds exactly the issues the generator planted, on all 576 invoices, and that check runs in the test suite.

## 2. Learning curve: memory ON vs OFF (26 weeks)

**Method.** The timeline is replayed twice with the same data and the same LLM (Gemini `3.1-flash-lite`
is pinned first for both runs):

- **Memory ON:** the product as shipped. The agent recommends; a simulated clerk resolves each open case
  with the ground-truth decision and reason, and audits every auto-resolution; every resolution is retained in
  a fresh Hindsight bank before the next day starts.
- **Memory OFF:** the same LLM with no Hindsight and nothing retained. Autonomy requires memory-backed
  recommendations, so this run never auto-resolves.

"Correct" means the recommendation has the same *payment outcome* as the ground truth: pay in full, pay a
corrected amount, or don't pay (hold, escalate and reject all mean "don't pay"). Months 1–4 build memory;
months 5–6 (weeks 18–26) are the measurement window.

| Months 5–6 | Memory ON | Memory OFF |
|---|:---:|:---:|
| Recommendation has the correct payment outcome | **98.1%** | 50.0% |
| Exceptions the agent resolved on its own | **53.7%** | 0% |
| Auto-resolutions that paid when they shouldn't have | **0** | — |

| Full 26 weeks, memory ON | Result |
|---|---|
| Exceptions | 144 (12 blocked by hard controls) |
| Resolved by the agent on its own | 46 (31.9%), every one audited, 0 wrong |
| Clerk agreed with the recommendation | 84.7% of human-decided cases |
| Cited memories about the same vendor or exception type | 93.9% |
| Memories in the bank at the end | 309 |
| Estimated clerk time saved | 820 minutes (7 min per manual exception, 1 min to confirm an accepted recommendation) |

## 3. The autonomy certificate

**Question:** how sure must a payment recommendation be before the agent may pay without a human?

Every memory-backed recommendation to pay (approve or approve a corrected amount) whose outcome a human
verified (a clerk's decision, or a passed audit of an auto-resolution) is a trial; paying when the correct
decision was not to pay is an error. For a confidence threshold τ, among the n verified pay recommendations
at confidence ≥ τ with k errors, the exact one-sided **Clopper–Pearson** upper bound U(k, n) bounds the
true wrong-payment rate with 95% confidence.

Thresholds are tested in a fixed order (0.95, 0.90, 0.85, 0.80, 0.75) and the search stops at the first one
whose bound exceeds the 5% target (fixed-sequence testing, as in "learn then test"). Because the order is
fixed in advance, trying several thresholds doesn't inflate the error rate.

| Status | Rule | Effect |
|---|---|---|
| collecting | No threshold passes yet (with 0 errors, 59 verified decisions are needed) | Auto-pay only at confidence ≥ 0.95, plus the per-pair streak |
| certified | The lowest passing threshold τ | Auto-pay at confidence ≥ τ, plus the per-pair streak |
| paused | ≥ 30 verified decisions and an observed wrong-payment rate above 5% | No automatic payments until the evidence improves |

At the end of the 26-week replay:

| Threshold | Verified pay decisions | Wrong | 95% upper bound | Passes 5%? |
|:---:|:---:|:---:|:---:|:---:|
| 0.95 | 66 | 0 | 4.44% | yes |
| 0.90 | 72 | 0 | 4.08% | yes |
| 0.85 | 73 | 0 | 4.02% | yes |
| 0.80 | 73 | 0 | 4.02% | yes |
| **0.75** | **73** | **0** | **4.02%** | **yes: certified** |

The 46 auto-resolutions themselves had 0 errors (95% upper bound 6.3%, from fewer trials).

## 4. Calibration

Each recommendation's stated confidence is compared with how often recommendations at that confidence were
right. Bins use a Beta(1, 1) prior so that small bins don't swing to 0% or 100%; the calibrated value is shown
next to the stated one.

| Stated confidence | Decisions | Average stated | Actually right |
|---|:---:|:---:|:---:|
| below 0.50 | 9 | 0.41 | 0.36 |
| 0.50–0.70 | 11 | 0.60 | 0.92 |
| 0.70–0.85 | 1 | 0.80 | — |
| 0.85–0.95 | 17 | 0.89 | 0.79 |
| 0.95 and above | 85 | 0.96 | 0.97 |

Expected calibration error: **0.07** over 123 memory-backed decisions. The model is well calibrated where it
matters most (≥ 0.95, which is where autonomy lives) and under-confident in the middle band.

## 5. Cost and latency

| 26 weeks, 144 recommendations | Memory ON | Memory OFF |
|---|:---:|:---:|
| Share on the fast path | 58% | — |
| Median latency | 2.7 s | 1.7 s |
| 95th percentile latency | 9.4 s | 2.0 s |
| Average cost per exception | $0.0173 | $0.0003 |
| Cost per 1,000 exceptions | **$17.30** | $0.25 |

Costs count Hindsight calls (reflect $0.05; recall about $0.0005) and LLM tokens at list price (Gemini
`3.1-flash-lite`: $0.25 per million input tokens, $1.50 per million output). Retaining memories is billed
separately by Hindsight and is not included.

## 6. Ablation: which part of memory does the work?

**Method.** Twelve simulated weeks (60 exceptions) in a separate database and a separate Hindsight bank.
The product agent (hybrid) runs live: it recommends, earns autonomy and is taught by the simulated clerk, so
the bank fills with the same lessons a real team would teach. Before each exception is decided, five
**shadow variants** answer it, reading the same bank at the same moment with the same LLM. Shadows never
write anything, so they cannot influence the memory being measured. The RAG baseline embeds exactly the
lesson texts that Hindsight retains, at the moment Hindsight retains them.

| Variant | How past decisions are used |
|---|---|
| No memory | The LLM alone |
| Vector RAG | Gemini embeddings (`gemini-embedding-001`) of past resolution texts; the 8 most similar by cosine similarity |
| Hindsight recall, facts | `recall()` restricted to world and experience facts, then one LLM call |
| Hindsight recall | `recall()` with facts and consolidated observations, then one LLM call |
| Hindsight reflect | `reflect()` with directives, mental models and typed output |
| **Precedent hybrid** | Recall fast path for routine vendor × type pairs; `reflect()` otherwise, or when the fast answer is ungrounded or below 0.8 confidence |

Hard-control cases (7 of 60) are decided in code for every variant (all correct), so the comparison uses the
53 judgement cases.

**Weeks 5–12 (36 judgement cases, after a month of learning)**

| Variant | Correct | Wrong payments | Needless holds | Cost / case | Median latency | 95th pct latency |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| No memory | 11 (31%) | 0 | 25 | $0.0003 | 1.7 s | 2.2 s |
| Vector RAG | 33 (92%) | 0 | 3 | $0.0007 | 2.3 s | 3.0 s |
| Hindsight recall, facts | 31 (86%) | 0 | 5 | $0.0010 | 2.8 s | 3.9 s |
| Hindsight recall | 30 (83%) | 1 | 5 | $0.0010 | 2.6 s | 5.1 s |
| Hindsight reflect | 33 (92%) | 0 | 3 | $0.0500 | 7.1 s | 15.1 s |
| **Precedent hybrid** | 30 (83%) | 0 | 6 | $0.0282 | 5.8 s | 12.6 s |

**All 12 weeks (53 judgement cases):** no memory 32%, vector RAG 83%, recall facts 81%, recall 79%,
reflect 81%, hybrid 77%. **Weeks 9–12 (17 cases):** no memory 35%, RAG / recall facts / recall 94%,
reflect 100%, hybrid 82%, and the hybrid's cost falls to $0.021 per case as more pairs become routine
(10 of its 17 answers took the fast path).

**Run-to-run variance.** We ran the study twice. The first run used an earlier prompt, in which "keep
confidence below 0.5" sat next to "choose hold", and had no fast-path hand-over. It gave, for weeks 5–12: no
memory 31%, RAG 89%, recall facts 89%, recall 86%, reflect 92%, hybrid 86%, and 0 wrong payments in every
variant. The order of the memory variants changed between runs; the gap to no memory did not. Some of the
hybrid's misses in the second run were `reflect()` calls that answered differently from the shadow
`reflect()` on the identical case, which is model non-determinism rather than a design effect.

**What we conclude**

1. Memory is what matters: every way of using past decisions lifts accuracy from about a third to 83–92%.
2. Mistakes with memory are almost all cautious. Across 318 answers there was one wrong payment, from plain
   recall without a reasoning step.
3. `reflect()` is the most accurate route on average and the most expensive ($0.05, about 7 s). The hybrid
   gives up a few cautious holds for lower cost, and its cost keeps falling as vendors become routine.
4. On this data a plain vector store over well-written lessons retrieves about as well. Hindsight's value in
   Precedent is what retrieval alone doesn't provide: consolidated beliefs with their history, directives
   enforced inside reasoning, time-anchored recall, self-writing Knowledge Pages and document-level
   forgetting.

The whole study cost about $4.60 (almost all of it `reflect()` calls).

## 7. Capture accuracy on real invoices

**Method.** The 50 invoices of the validation split of
[`katanaml-org/invoices-donut-data-v1`](https://huggingface.co/datasets/katanaml-org/invoices-donut-data-v1)
on Hugging Face: scanned invoices with a hand-labelled parse, none of which we made. Each image goes through
the same Gemini vision call and the same `CapturedInvoice` schema the app uses. The only change is the
system prompt, which names the locale (US dates, European decimal commas), as a real deployment would.

| Field | Correct | Scoring rule |
|---|:---:|---|
| Invoice number | 50 / 50 | Exact, ignoring punctuation |
| Invoice date | 50 / 50 | Exact calendar date |
| Seller name | 50 / 50 | The label is "name + address"; the extracted name must be its leading name |
| Grand total | 50 / 50 | Within 1 cent |
| Bank account (IBAN) | 39 / 50 raw, **50 / 50** adjudicated | Exact; see below |
| Line count | 48 / 48 | Two rows label only their first line item and are not scored for lines |
| Line items | 194 / 196 | Quantity, unit price and tax rate all exact |

Median 2.9 s and about $0.001 per invoice.

**Two findings that changed the code**

- **Ambiguous dates.** Asked for an ISO date, the model returned day-first readings for 7 of 50 invoices,
  despite a prompt saying the dates are month-first. All 7 were ambiguous (e.g. *04/11/2021*, where both
  numbers are 12 or less). The app now also extracts the date exactly as printed and parses it in code with
  the locale (day-first for Indian invoices), which took dates from 43 / 50 to 50 / 50.
- **Wrong labels.** All 11 bank-account "misses" are errors in the dataset's labels: the labelled IBAN fails
  the ISO 13616 mod-97 checksum (an OCR slip such as S read as 5, or a repeated run of digits) while our
  extraction passes it. The script checks this automatically and reports both numbers.

## 8. Limitations

- **Synthetic data.** The invoices are generated, not taken from a company, although their timing, volume,
  amounts and exception mix are calibrated on a real log. The vendor habits are consistent by design, which
  favours any method that retrieves the right precedent.
- **Simulated clerk.** The clerk always applies the ground truth. Real clerks disagree with each other and
  change their minds; lesson revocation and audits exist for that, but we haven't measured them against real
  people.
- **Small samples.** The ablation compares variants on 36 cases, so differences of one to three cases are
  noise. The learning curve uses one seed.
- **Consolidation can over-generalise.** Hindsight's observations are summaries. In one run, per-case
  moisture losses of 2–5% for a polymer supplier were summarised as a "tolerance updated from 5% to 4%". This
  is why the app shows every belief with the evidence behind it, and why payments rest on cited precedents,
  the amount envelope and the certificate rather than on a summary alone.
- **One model.** All evaluations use Gemini `3.1-flash-lite` for decisions; other models in the failover
  chain were not evaluated separately.

## 9. Reproduce

```bash
cd backend
uv run python -m scripts.calibrate_bpi   # dataset calibration from the BPI 2019 log (downloads about 37 MB)
uv run python -m scripts.build_demo      # learning curve, certificate, calibration, demo snapshots (~20 min)
uv run python -m scripts.ablation        # ablation study, own database and bank (~15 min)
uv run python -m scripts.eval_capture    # capture accuracy on 50 Hugging Face invoices (~1 min)
uv run python -m scripts.make_charts     # redraw the charts from the results
```

The live runs need Hindsight and Gemini keys in `backend/.env`. A full rebuild costs a few dollars of
Hindsight; the ablation about $4.60; the capture evaluation about $0.05 of Gemini.
