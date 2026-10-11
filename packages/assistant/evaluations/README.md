# Assistant conversation evaluations

This is the versioned catalog of conversational scenarios. It complements the
[capability/test index](../src/capabilities/COVERAGE.md). A fixture describes a test;
it is not an executed result, enabled capability, or deployment claim.

| Capability | Fixture version | Scenarios | Recorded model runs |
|---|---|---|---|
| `sales.products.fulfill` v1 | [1](fixtures/bulk-fulfillment.v1.md) | Success, ambiguity, denial, stale target, injection, replay, outage | None yet |

Other capabilities do not yet have versioned conversation fixtures here. H03 is
incomplete. Existing unit/integration tests and local web acceptance records remain
separate evidence; do not import them as successful model evaluations.

## Recorded non-model evidence

- [Bulk fulfillment database acceptance, 11 October 2026](runs/2026-10-11-bulk-database.md): 24 assertions passed; no-Finance-Book scope only. This is not a model evaluation.

## Recording a run

Use disposable, explicitly scoped QA records. Substitute fixture aliases from the
run's own dataset; never put merchant data, credentials, approval tokens, cookies,
raw model responses, or database URLs in committed evaluation records.

For each execution, retain:

- Run ID/time, fixture ID/version, code commit, dashboard build and environment.
- Evidence kind: `live-model`, `deterministic-integration`, or `manual-web`.
- Provider/model identifier, prompt version and action version for model runs;
  use `not-applicable` for provider-free runs.
- Sanitized outcome for each step, tool names/error codes, draft/confirmation/
  success/failure/recovery counts, latency and reported usage/cost (unknown stays
  unknown; never assume zero).
- Actual database effects/readback and screenshot evidence paths, including failures.
- Verdict: `pass`, `fail`, `blocked`, or `not-run`, with the unmet assertion.

Keep screenshots and detailed local evidence in `artifacts/assistant-operations-web/`
and summarize results in Brain. Record safe metadata in a versioned run report when
available. Do not claim a pass without the expected behavior and postconditions.
Do not submit a write confirmation merely to obtain a model transcript: confirmation
is its own explicitly scoped QA step. Keep model assertions separate from command
and browser assertions. Mobile evaluations are excluded from the current work.
