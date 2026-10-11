# Assistant conversation evaluations

This is the versioned catalog of conversational scenarios. It complements the
[capability/test index](../src/capabilities/COVERAGE.md). A fixture describes a test;
it is not an executed result, enabled capability, or deployment claim.

| Capability | Fixture version | Scenarios | Recorded model runs |
|---|---|---|---|
| Customer funds reads | [1](fixtures/customer-funds.v1.md) | Account resolution, deposit provenance, source revision, statement snapshot, access refusal | None yet |
| `customers.credit.refund` v1 | [1](fixtures/held-credit-refund.v1.md) | Completed payout, ambiguity, unused-credit limits, stale review, authority, injection, retry, provenance, receipt | None yet |
| `sales.product.return` v1 | [1](fixtures/product-return.v1.md) | Partial restock, ambiguity, dispositions, over-return, stale evidence, authority, injection, replay/recovery | None yet |
| `sales.products.fulfill` v1 | [1](fixtures/bulk-fulfillment.v1.md) | Success, ambiguity, denial, stale target, injection, replay, outage | None yet |

Other capabilities do not yet have versioned conversation fixtures here. H03 is
incomplete. Existing unit/integration tests and local web acceptance records remain
separate evidence; do not import them as successful model evaluations.

## Recorded non-model evidence

- [Customer funds tool/database acceptance, 11 October 2026](runs/2026-10-11-customer-funds-database.md): 44 assertions passed across actual read executors and refund composition; snapshot preserved, stale source rejected, cleanup verified.

- [Customer funds read source verification, 11 October 2026](runs/2026-10-11-customer-funds-source.md): focused schema, exact-money and pagination checks; database/browser/model acceptance pending.

- [Bulk fulfillment database acceptance, 11 October 2026](runs/2026-10-11-bulk-database.md): 24 assertions passed; no-Finance-Book scope only. This is not a model evaluation.

- [Bulk fulfillment dashboard acceptance, 11 October 2026](runs/2026-10-11-bulk-web.md): review/edit/confirm, global order sheet and saved-state readback passed. Provider-free QA draft.

- [Product-cost regression failure, 11 October 2026](runs/2026-10-11-product-cost-failure.md): timed out and lost its connection before valuation acceptance; owned fixtures cleaned.

- [Product return editor component check, 11 October 2026](runs/2026-10-11-return-editor.md): exact quantity, disposition, destination clearing and cancel checked without database writes.

- [Product return database failure, 11 October 2026](runs/2026-10-11-return-database-failure.md): transaction startup P2028; owned fixtures cleaned, acceptance incomplete.

- [Return transaction probes, 11 October 2026](runs/2026-10-11-return-transaction-probes.md): read-only rollback/reacquisition passed with and without tracing; root cause remains unproven.

- [Product return no-Book database acceptance, 11 October 2026](runs/2026-10-11-return-database.md):29assertions passed across stale review, rollback, replay and all dispositions; financial and full browser acceptance remain pending.

- [Reviewed return financial failure, 11 October 2026](runs/2026-10-11-return-financial-failure.md): preview assertions passed, locked valuation exceeded30s; cleanup verified.

- [Held-credit refund review source checks, 11 October 2026](runs/2026-10-11-held-credit-refund-review.md): 6 unit tests /50 assertions; assistant and database acceptance pending.

- [Held-credit refund editor browser check, 11 October 2026](runs/2026-10-11-held-credit-refund-editor.md): isolated component checks and screenshots; full assistant flow pending.

- [Held-credit refund proposal database acceptance, 11 October 2026](runs/2026-10-11-held-credit-refund-database.md): 30 assertions passed, including stale review, atomic rollback, balanced journal and replay; cleanup verified.

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
