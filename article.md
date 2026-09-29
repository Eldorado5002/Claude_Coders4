# Hindsight Turned One Clerk’s Decision into a Vendor Rule

An invoice agent that remembers “approve freight” is dangerous. The useful thing to remember is the condition: approve it up to ₹5,000 per trip, and stop when the next invoice crosses that line.

That distinction shaped how we built Precedent, an accounts-payable agent for recurring invoice exceptions. A steel vendor billed freight separately from its purchase order. At first, the agent held the charge. A clerk explained the agreement. Later, the agent used that explanation to approve an in-limit charge and hold one that exceeded the cap. The interesting part was not that a model produced a plausible answer. It was that the system carried a decision forward, with its source and limits, into another case.

## The same exception keeps coming back

Invoice processing has a repetitive failure mode: the software can detect that an invoice does not match its purchase order or goods receipt, but the explanation for how to handle that mismatch often lives in a person’s memory.

Maybe a supplier bills freight on a separate line. Maybe a contract permits a small price increase. A three-way match can flag the discrepancy, but it cannot tell the next clerk what the team agreed to do last time. A stateless language model has the same problem: unless the relevant history is included in its prompt, it starts over.

We built Precedent around a simple loop: match the invoice, retrieve relevant decisions, recommend an action with evidence, and retain the resolution so it can help with the next case.

![Precedent’s invoice-to-memory loop](C:\Users\win11\OneDrive\Desktop\Claude_Coders4\architecture.png)

## A decision needs its context

The first Balaji freight case is a good example. The invoice included ₹3,850 of freight not listed on the purchase order. With no precedent available, the agent recommended a hold. The clerk overruled it and explained that Balaji’s standing agreement allowed freight up to ₹5,000 per trip.

That resolution is more useful than a label like “approved.” It includes the vendor, exception type, amount, decision, and reason. The memory store retains a plain-language case record with metadata and tags, so later reads can be scoped to the vendor and exception type:
![Precedent’s interface showing the freight recommendation and supporting memory](C:\Users\win11\OneDrive\Desktop\Claude_Coders4\Precedent_interface.png)
```python
await self.client.aretain(
    bank_id,
    content=content,
    timestamp=when,
    context="AP invoice exception resolution",
    document_id=case_id,
    metadata={"exception_id": case_id, "vendor_id": vendor_id,
              "decision": decision, "taught_by": taught_by},
    tags=[vendor_tag(vendor_id), *(exc_tag(t) for t in types),
          f"decision:{decision}"],
    retain_async=retain_async,
)
```

This is the call in [`MemoryStore.retain_resolution`](backend/app/memory/store.py). The content is assembled by the case lifecycle with the resolution reason; the retain mission in the bank asks Hindsight to preserve exact thresholds, caps, agreements, and whether a clerk accepted or overruled the agent. That last detail matters. A recommendation that a clerk rejected should become evidence about the agent’s track record, not silently turn into a policy.

![Precedent’s Hindsight retain call](C:\Users\win11\OneDrive\Desktop\Claude_Coders4\hindsight-memory-call.png)

Hindsight extracts facts from each retained case and consolidates durable observations. In this example, separate case records can support a vendor observation that the team approves Balaji freight up to ₹5,000 per trip. The memory is scoped with tags, and the case timestamp gives the system a basis for time-aware recall. The [Hindsight project](https://github.com/vectorize-io/hindsight) and its [memory documentation](https://hindsight.vectorize.io/) describe the underlying memory system; in Precedent, we use it as the record of what the AP team has learned, while SQLite remains the record of what happened to invoices.

## Recall should return evidence, not vibes

When another freight exception arrives, Precedent first checks whether a hard control applies. If not, the recommendation pipeline can use a cheaper recall path for a routine vendor-and-exception pair. New or uncertain cases go through Hindsight `reflect()` with a structured invoice brief, the relevant tags, a typed response schema, and the facts used in the answer.

The memory wrapper scopes reflection to the vendor and exception types, asks Hindsight to include facts, and turns the response into citations for the interface:

```python
resp = await self.client.areflect(
    bank_id,
    query=query,
    budget=budget,
    response_schema=response_schema,
    tags=tags or None,
    tags_match="any",
    include_facts=True,
)
return resp, citations_from(resp), int((time.perf_counter() - t0) * 1000)
```

That call comes from [`MemoryStore.reflect`](backend/app/memory/store.py). The result is not treated as grounded just because it sounds confident: Precedent labels a recommendation as memory-backed only when it says a precedent applies and cites actual memory evidence. The clerk can inspect those citations in the “memories used” panel.

The distinction between a raw past case and a consolidated observation is useful. A case says what happened once. An observation proposes a durable pattern across cases. Showing the evidence and observation history makes it possible to notice when the summary changes—or when it has generalized too far. We saw this risk in the evaluation: a summary of several moisture-loss cases could overstate a tolerance. That is why summaries do not get to authorize payments by themselves.

## The cap has to work in both directions

After the clerk taught the ₹5,000 limit, the agent approved subsequent freight charges of ₹4,100, ₹2,900, and ₹4,200, citing the precedent. It then held a ₹7,400 charge. That is the behavior we wanted: memory taught a boundary, not a positive example to copy indiscriminately.

The recommendation prompt makes this explicit: a known limit being exceeded is a reason to hold, and confidence is about whether the team would make that decision—not simply whether the agent is recommending payment. The interface also shows the recommendation’s route, cited cases, and rationale so a reviewer can see why a decision followed from the remembered agreement.

There is a tempting shortcut here: let memory decide everything. We did not. Duplicate invoices, bank-detail changes, invalid GSTINs, missing e-invoice IRNs, new vendors, and invoices over ₹5,00,000 are hard controls. They are detected before model reasoning, and the recommender forces the corresponding reject, escalate, or hold action. Memory can still provide context, but it cannot override the control.

```python
if control is not None:
    # a hard control decides the action in code: no model call is needed
    forced = CONTROL_ACTION[control]
    msg = next(i.message for i in ctx.issues if i.type == control)
    ...
    draft = RecDraft(
        action=forced,
        confidence=0.99,
        adjusted_amount=None,
        rationale=f"Hard control: {msg} Action forced to {forced.value}.",
        precedent_found=False,
    )
```

This branch is from [`Recommender.recommend`](backend/app/agent/recommender.py). Financial arithmetic is also kept in Python: when an invoice is paid at a corrected amount, the system computes the adjustment from the detected variance rather than asking a language model to do money math.

That separation is an engineering choice about failure modes. Hindsight helps the agent use accumulated team experience; deterministic code protects invariants that should not depend on what a model recalls or infers.

## Memory changed the replay, with caveats

We evaluated Precedent on a fixed 26-week replay: 576 generated invoices, 144 exceptions, and 25 vendors. The synthetic data’s timing and volume were calibrated using a real purchase-to-pay event log, but the invoices and clerk decisions in the replay are generated. Months one through four build up memory; months five and six measure performance. The comparison uses the same decision model with Hindsight enabled and disabled.

In the measurement window, the agent’s payment outcome matched the ground truth in 98.1% of memory-on recommendations and 50.0% of memory-off recommendations. With memory enabled, it resolved 53.7% of exceptions on its own, with zero incorrect auto-payments in that replay. Those numbers describe this dataset and setup; they are not a production guarantee. The replay uses one seed and a simulated clerk that consistently applies the ground truth.



The result we care about is not simply “memory improved accuracy.” The freight example shows the mechanism: the agent retained a human explanation, retrieved it for a later case, and applied the numeric condition in either direction. The code’s guardrails and autonomy certificate then constrain whether a recommendation can result in an automatic payment.

## What we learned

**Store the reason, not just the outcome.** “Approve” is hard to reuse safely. “Approve freight up to ₹5,000 per trip” gives retrieval and reasoning a condition to check.

**Keep evidence close to the recommendation.** A summary is easier to read than a case history, but the reviewer needs a way to trace that summary back to decisions and see when it changed.

**Make safety boundaries executable.** A directive can guide reasoning, but a bank change or duplicate payment should be blocked by code that does not need the model’s cooperation.

**Treat autonomy as earned and bounded.** Precedent promotes a vendor-and-exception pair after a run of accepted recommendations, demotes it after an overrule, and requires statistical certification, a normal anomaly score, and an amount within what humans have already approved before automatic payment.

**Measure the system you actually built.** Our replay is useful evidence about the design, not proof of performance across real companies, clerks, or vendors. The next important step is testing with real AP teams, where people disagree, policies change, and a memory system has to earn trust case by case.

For a deeper look at [agent memory from Vectorize](https://vectorize.io/what-is-agent-memory), Hindsight’s role in Precedent is concrete: it lets a new invoice be judged in light of prior decisions, while keeping the evidence visible and the payment controls outside the model.
