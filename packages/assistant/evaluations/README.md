# Assistant conversation evaluations

This is the versioned catalog of conversational scenarios. It complements the
[capability/test index](../src/capabilities/COVERAGE.md). A fixture describes a test;
it is not an executed result, enabled capability, or deployment claim.

| Capability | Fixture version | Scenarios | Recorded model runs |
|---|---|---|---|
| `finance.money_movement.record` v1 | [1](fixtures/money-movement.v1.md) | Completed transfers/owner funds, ambiguity, posting guards, retry, editor/receipt | None yet |
| Apply/release customer credit | [1](fixtures/customer-credit.v1.md) | Source resolution, partial amounts, ambiguity, no-cash boundaries, stale/authority, retry, Order provenance | None yet |
| `customers.receipt.record` v1 | [1](fixtures/customer-receipt.v1.md) | New deposit, existing order payment, ambiguity, stale/closed targets, authority, atomic retry, receipt | None yet |
| `finance.money_accounts.read` v1 | [1](fixtures/money-accounts.v1.md) | Book scope, account ambiguity, continuation, balance boundary, access refusal | None yet |
| Customer funds reads | [1](fixtures/customer-funds.v1.md) | Account resolution, deposit provenance, source revision, statement snapshot, access refusal | None yet |
| `customers.credit.refund` v1 | [1](fixtures/held-credit-refund.v1.md) | Completed payout, ambiguity, unused-credit limits, stale review, authority, injection, retry, provenance, receipt | None yet |
| `sales.product.return` v1 | [1](fixtures/product-return.v1.md) | Partial restock, ambiguity, dispositions, over-return, stale evidence, authority, injection, replay/recovery | None yet |
| `sales.products.fulfill` v1 | [1](fixtures/bulk-fulfillment.v1.md) | Success, ambiguity, denial, stale target, injection, replay, outage | None yet |

Other capabilities do not yet have versioned conversation fixtures here. H03 is
incomplete. Existing unit/integration tests and local web acceptance records remain
separate evidence; do not import them as successful model evaluations.

## Recorded non-model evidence

- [Money movement database acceptance, 11 October 2026](runs/2026-10-11-money-movement-database.md): 25 assertions passed for transfer rollback/replay, balanced journal and canonical receipt; owned cleanup verified. Owner-funds/concurrency/full web acceptance remain pending.

- [Money movement proposals and components, 11 October 2026](runs/2026-10-11-money-movement-adapter.md): 7 tests/73 assertions; editor validation and unavailable global receipt checks passed; database/full web acceptance pending.

- [Money movement preview, 11 October 2026](runs/2026-10-11-money-movement-review.md): shared canonical account resolution and exact review data;5 tests/55 assertions and scoped types pass; adapter/UI acceptance pending.

- [Customer credit linked-Order acceptance, 11 October 2026](runs/2026-10-11-customer-credit-order-database.md): 58 assertions passed; linked credit/reversal, unchanged cash, no duplicate deposit/collection, rollback/replay and cleanup verified.

- [Money movement transaction preparation, 11 October 2026](runs/2026-10-11-money-movement-transaction.md): caller-owned canonical command,2 tests/10 assertions; assistant and database/web acceptance pending.

- [Customer credit dashboard acceptance, 11 October 2026](runs/2026-10-11-customer-credit-web.md): application edit/review/confirm and customer overlay passed; release blocked by browser network error before confirmation, zero releases verified; QA cleanup complete.

- [Customer credit database and discovery acceptance, 11 October 2026](runs/2026-10-11-customer-credit-database.md): 44 assertions passed for apply/release, rollback/replay, balanced journals and actual lookup tools; cleanup verified.

- [Customer credit proposals and editor, 11 October 2026](runs/2026-10-11-customer-credit-adapters.md): planned adapters, strict actions and component browser checks; full database/web acceptance pending.

- [Customer credit source verification, 11 October 2026](runs/2026-10-11-customer-credit-source.md): apply/release transaction seams and shared previews; 11 tests / 102 assertions. Assistant and database acceptance pending.

- [Customer receipt dashboard acceptance, 11 October 2026](runs/2026-10-11-customer-receipt-web.md): normal edit/review/confirm, customer overlay, exact saved effects and cleanup passed with screenshots; provider-free.

- [Customer receipt database acceptance, 11 October 2026](runs/2026-10-11-customer-receipt-database.md): 32 assertions passed, atomic rollback/replay, one balanced journal and unchanged opening debt; owned cleanup verified.

- [Customer receipt editor component check, 11 October 2026](runs/2026-10-11-customer-receipt-editor.md): acknowledgment, exact amount, method/reference, cancel and fresh-open checks passed with screenshot.

- [Customer receipt source verification, 11 October 2026](runs/2026-10-11-customer-receipt-source.md): canonical transaction seam, preview, revision guard and planned adapter; 11 tests / 69 assertions.

- [Held-credit refund dashboard acceptance, 11 October 2026](runs/2026-10-11-held-credit-refund-web.md): review/edit/confirm, customer overlay, exact saved financial effects and owned fixture cleanup passed; provider-free.

- [Money account tool/database acceptance, 11 October 2026](runs/2026-10-11-money-account-database.md): actual account discovery and unknown-Book refusal; refund regression passed 46 assertions, cleanup verified.

- [Money account lookup source verification, 11 October 2026](runs/2026-10-11-money-account-source.md): 18 tests / 150 assertions; scoped TypeScript passes.

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
