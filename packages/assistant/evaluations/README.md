# Assistant conversation evaluations

[Bookmarked 45-ticket status board](TICKETS.md): implementation versus acceptance,
including pending and deferred work.

This is the versioned catalog of conversational scenarios. It complements the
[capability/test index](../src/capabilities/COVERAGE.md). A fixture describes a test;
it is not an executed result, enabled capability, or deployment claim.

| Capability | Fixture version | Scenarios | Recorded model runs |
|---|---|---|---|
| Supplier settlement | [1](fixtures/supplier-settlement.v1.md) | Paid advances, exact-source allocation, partial payment, stale/chronology/rollback/replay and owning receipt | None yet |
| Purchase recognition | [1](fixtures/purchase-recognition.v1.md) | Independent invoice/ownership, exact posting review, rollback/replay and physical receipt boundaries | None yet |
| Purchase registration | [1](fixtures/purchase-registration.v1.md) | Agreement-only draft, exact goods, scope/stale guards, rollback/recovery | None yet |
| Purchase recognition reads | [1](fixtures/purchase-recognition-reads.v1.md) | Pre-invoice discovery, separate stages, correction/source evidence | None yet |
| Purchase bill reads | [1](fixtures/purchase-reads.v1.md) | Settlement separation, recognition provenance, bounded history, exact scope | None yet |
| Supplier creation | [1](fixtures/supplier-create.v1.md) | Identity normalization, ambiguity, duplicate/scope refusal, rollback/recovery and receipt | None yet |
| Expense/payment corrections | [1](fixtures/bill-correction.v1.md) | Exact original targets, no-transfer boundaries, void/payment guards, stale/retry and rollback | None yet |
| Supplier search/statements | [1](fixtures/supplier-reads.v1.md) | Exact identities, separate balances, snapshot continuation and scope refusal | None yet |
| `finance.money_movement.record` v1 | [1](fixtures/money-movement.v1.md) | Completed transfers/owner funds, ambiguity, posting guards, retry, editor/receipt | None yet |
| `finance.expense.record` v1 | [1](fixtures/expense.v1.md) | Unpaid/partial/owner-funded expense, ambiguity, posting guards, atomic retry, receipt | None yet |
| `finance.bill.pay` v1 | [1](fixtures/bill-payment.v1.md) | Existing bill resolution, partial/owner payment, stale/void/closed guards, retry, editor | None yet |
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

- [Ten-line receipt stock/valuation writes, 12 October 2026](runs/2026-10-12-ten-line-receipt-batch.md): maximum ten mixed goods/100 categories, exact saved canonical command proof19.50s and complete signed assistant confirmation23.15s roll back correctly; changed stock revision refuses with facts unchanged. Advisory draft29.51s and final maximum browser confirmation/recovery remain open; E05 stays partial.

- [Bounded purchase stock preparation, 12 October 2026](runs/2026-10-12-stock-bounds-preparation.md): fresh source reads batch across 1–10 goods, exact shared/packaged quantities and scope/revision guards retained. Ten actual sources prepare in3.11s with saved financial/stock facts unchanged. Full ten-line posting remains pending; E05 stays partial.

- [Supplier creation and agreement web, 12 October 2026](runs/2026-10-12-supplier-registration-web.md): both actual Edit/re-review/Confirm and global Open/Close pass with exact revised identity/goods/date, no new payable/posting/stock and completed recovery. Two actions source-available; assertion preservation fixed and verified. E05 remains partial.

- [Supplier and purchase discovery, 12 October 2026](runs/2026-10-12-supplier-discovery.md): name/code lookup discovers the canonical Book; 12 real read checks and unchanged saved facts pass. Supplier statement and invoice Open/Close preserve chat, with screenshots. Six supplier/purchase reads and explicit-Book funding dependency are source-available. E05 remains partial; no model run.

- [Supplier settlement full proposals and actual web, 12 October 2026](runs/2026-10-12-supplier-settlement-web.md): advance/allocation/partial payment completion rollback, real chat Edit/re-review/Confirm and global Open/Close pass; exact balances/journals/stock and concurrent completed recovery verified. Three actions source-available; edited descriptions now visible. E05 remains partial; discovery activation and larger bounds remain open.

- [Supplier settlement source, 11 October 2026](runs/2026-10-11-supplier-settlement-source.md): three strict canonical proposals and editor modes;10 tests/260 assertions/scoped types, actual canonical rollback/replay and editor checks pass. Global purchase-invoice sheet source added; local API unresponsive, saved detail/full chat confirmation pending. All three capabilities remain planned.

- [Physical receipt proposal and actual web confirmation, 11 October 2026](runs/2026-10-11-receipt-proposal-web.md): full assistant rollback reaches completion in28.8s; focused tests/scoped types pass. Dashboard Edit/re-review/Confirm and global Open/Close pass; exact stock/valuation/journal readback, replay and duplicate-stage refusal verified. E05 stays partial; advances/allocation/settlement and larger bounds remain open.

- [Locked physical receipt confirmation, 11 October 2026](runs/2026-10-11-receipt-confirmation.md): fresh complete review digest checked under Book/sorted stock locks, actual new event/journal/movement proof reused;22 tests/136 assertions and scoped types pass. Stale digest refuses; matching two-line receipt/valuation rolls back after28.1s inside30s. Whole assistant proposal transaction/editor remain pending.

- [Physical receipt review, 11 October 2026](runs/2026-10-11-receipt-review.md): exact stock/category/known-or-unknown valuation review shares writer calculation;17 tests/88 assertions and scoped types pass. Real two-line review11.8s matches rollback-only command27.8s. Atomic assistant composition remains pending; no receipt activation.

- [Two-line receipt performance, 11 October 2026](runs/2026-10-11-receipt-performance.md): original rollback-only command timed out31.7s; batched immutable receipt proof completes27.7s with exact two valuations and unchanged saved counts.12 tests/80 assertions and scoped types pass. Full assistant physical receipt review/confirmation remains pending.

- [Purchase fact chat flow, 11 October 2026](runs/2026-10-11-recognition-web.md): actual dashboard invoice/ownership edit, review, confirmation and global receipt Open/Close pass; exact two journals, one payable and zero owned stock effects verified. Source available; E05 partial. QA fixtures retained pending cleanup permission.

- [Purchase fact editor, 11 October 2026](runs/2026-10-11-recognition-editor.md): actual invoice/ownership component integration, acknowledgment/date/money/reference guards, exact target/timestamp preservation, disabled/Cancel behavior and screenshots pass; full chat confirmation pending.

- [Purchase fact proposal integration, 11 October 2026](runs/2026-10-11-recognition-proposals.md): strict invoice/ownership action and owning agreement receipt; 74 source/display assertions, scoped types and 57 isolated database assertions pass. Initial fixture failure retained; browser acceptance pending.

- [Purchase recognition review, 11 October 2026](runs/2026-10-11-recognition-review.md): 8 tests/60 assertions and scoped types pass; isolated database 23 assertions passes with exact invoice/ownership journals, rollback/replay and 16 cleanup checks. Assistant/browser and physical receipt acceptance remain pending.

- [Registration editor, 11 October 2026](runs/2026-10-11-registration-editor.md): layout comparison and actual component acknowledgment/zero guards, exact decimal/minor amount/timestamp, target preservation and Cancel verified; screenshot retained. Full confirmation pending.

- [Registration receipt overlay source, 11 October 2026](runs/2026-10-11-registration-receipt-source.md): global sheet, readable agreement/recognition detail, corrected-event component and missing-Book/Close browser checks; scoped types pass. Saved-record acceptance pending.

- [Registration proposal source, 11 October 2026](runs/2026-10-11-registration-adapter.md): strict agreement-only action and canonical adapter;54 assertions pass. Editor/receipt overlay and proposal acceptance pending.

- [Registration database regression, 11 October 2026](runs/2026-10-11-registration-database.md):16 assertions for review, transaction rollback, two-line replay and no posting effects;16 owned cleanup checks clear. Assistant integration pending.

- [Purchase registration review, 11 October 2026](runs/2026-10-11-purchase-registration-review.md): shared canonical validation and agreement-only review;64 assertions pass. Database/proposal/web acceptance pending.

- [Recognition reads source, 11 October 2026](runs/2026-10-11-recognition-reads-source.md): planned canonical registration/event lookup with separate stages and corrections;14 assertions/scoped API types pass. Actual-tool acceptance pending.

- [Purchase reads source, 11 October 2026](runs/2026-10-11-purchase-reads-source.md): canonical planned lookup tools, settlement/source separation and bounded histories;19 assertions/scoped API types pass. Actual-tool acceptance pending.

- [Supplier receipt Open/Close, 11 October 2026](runs/2026-10-11-supplier-receipt-web.md): saved receipt opens exact supplier statement over chat, zero balances/activity, Close preserves chat; owned cleanup verified. Backend confirmation only.

- [Supplier editor component, 11 October 2026](runs/2026-10-11-supplier-editor.md): three layouts compared; field refusal, normalized save/preserved Book and Cancel checked in browser, screenshot retained. Full chat flow pending.

- [Coverage reconciled, 11 October 2026](runs/2026-10-11-coverage-reconciled.md): classified saved Order activity read as planned H04, regenerated current catalog; coverage test passes4 assertions. Earlier classification blocker resolved.

- [Supplier creation database acceptance, 11 October 2026](runs/2026-10-11-supplier-create-database.md):24 assertions passed for rollback/concurrent confirmation/recovery, duplicate refusal and actual supplier tools; one identity/no postings, owned cleanup verified.

- [Supplier creation adapter, 11 October 2026](runs/2026-10-11-supplier-create-adapter.md): strict schema and canonical transactional adapter;14 assertions pass. Editor and database/web/model acceptance pending.

- [Supplier creation review, 11 October 2026](runs/2026-10-11-supplier-create-review.md): canonical fresh-authority/Book/duplicate review and transaction export;7 tests/42 assertions pass. Assistant proposal and database/web acceptance pending.

- [Supplier read source, 11 October 2026](runs/2026-10-11-supplier-reads-source.md):14assertions and scoped types pass; canonical search/statements registered as planned dashboard tools. Actual-tool acceptance pending.

- [Correction receipt Open/Close, 11 October 2026](runs/2026-10-11-correction-receipt-open.md): saved cards load; Open shows corrected bill over same chat, Close preserves it; working receipt list and owned cleanup verified. Backend confirmations; full UI confirmation pending.

- [Protected correction history, 11 October 2026](runs/2026-10-11-correction-history-router.md): retained router/middleware regression passes4assertions with synthetic completed correction DTOs and verified chat cleanup; HTTP/runtime investigation remains pending.

- [Receipt lifecycle fix, 11 October 2026](runs/2026-10-11-receipt-lifecycle-fix.md): reproduced false mount-guard rejection, fixed subscription ordering, verified list/Refresh in browser and43 existing state assertions; owned cleanup complete.

- [Chat loading diagnosis, 11 October 2026](runs/2026-10-11-chat-loading-diagnostic.md): empty chat briefly rendered then reached global error boundary; root cause unproven, web acceptance remains incomplete.

- [Saved corrected bill overlay, 11 October 2026](runs/2026-10-11-bill-correction-web.md): direct sheet shows cancelled expense and reversed payment; Close retains assistant route. Chat/attachment access errors prevent full acceptance; owned fixture cleanup verified.

- [Correction authority, period and concurrency, 11 October 2026](runs/2026-10-11-bill-correction-guards.md): 139 combined assertions passed, including fresh authority/period checks, unavailable targets, concurrent recovery and exact original-account reversal sides; cleanup verified.

- [Correction proposal database acceptance, 11 October 2026](runs/2026-10-11-bill-correction-database.md): 120 combined assertions passed; reversal/void rollback and replay, paid-void refusal, retained history, balanced journals and owned cleanup verified.

- [Correction editor component, 11 October 2026](runs/2026-10-11-bill-correction-editor.md): reversal acknowledgment/reason guards, edited reason, exact timestamp and cancel verified; screenshot retained. Full proposal acceptance pending.

- [Bill correction proposal adapters, 11 October 2026](runs/2026-10-11-bill-correction-adapter.md): 16 schema assertions and scoped adapter types pass; coverage blocked by unrelated order-activity classifications. Correction editor/database/web/model acceptance pending.

- [Bill correction review preparation, 11 October 2026](runs/2026-10-11-bill-correction-review.md): shared reversal/void source checks;44 unit assertions and scoped types pass; canonical correction integration19 assertions passed.

- [Existing bill-payment database acceptance, 11 October 2026](runs/2026-10-11-bill-payment-database.md):81 assertions passed including actual discovery, rollback/concurrent recovery, stale/closed/void guards and owner remainder; owned cleanup verified.

- [Existing bill discovery, 11 October 2026](runs/2026-10-11-bill-discovery.md): canonical list/detail tools, exact liability and bounded payment/reversal history;2 tests/12 assertions pass; actual-tool database/model execution pending.

- [Bill-payment proposal/editor, 11 October 2026](runs/2026-10-11-bill-payment-adapter.md): strict action/canonical adapter,13 schema assertions and scoped types pass; component acknowledgment/exact values/cancel checked with screenshot; database/full web pending.

- [Bill-payment review preparation, 11 October 2026](runs/2026-10-11-bill-payment-review.md): shared canonical source checks and exact liability review;5 tests/89 assertions and scoped types pass; expense database regression43 assertions/cleanup passed.

- [Expense database acceptance, 11 October 2026](runs/2026-10-11-expense-database.md):43 assertions passed for actual category tool, unpaid/partial/owner-funded expenses, rollback/replay and balanced journals; owned cleanup verified.

- [Expense editor component check, 11 October 2026](runs/2026-10-11-expense-editor.md): acknowledgment/overpayment refusal, exact amounts/timestamps, unpaid omission and cancel passed; screenshot retained; full proposal/database/web acceptance pending.

- [Expense category lookup, 11 October 2026](runs/2026-10-11-expense-category-lookup.md): canonical scoped category query and planned assistant tool;3 tests/22 assertions and scoped types pass; actual-tool database/model acceptance pending.

- [Expense proposal integration, 11 October 2026](runs/2026-10-11-expense-adapter.md): strict action, canonical adapter and global bill receipt;5 tests/64 assertions and scoped types pass; editor/discovery/database/web pending.

- [Expense review preparation, 11 October 2026](runs/2026-10-11-expense-review.md): shared canonical normalization and unpaid/partial/owner-funded review;3 tests/46 assertions and scoped types pass; assistant/database/web acceptance pending.

- [Saved movement receipt web check, 11 October 2026](runs/2026-10-11-money-movement-receipt-web.md): Open displays exact recorded journal over assistant; Close preserves chat; backend-confirmed QA record and cleanup verified. Full dashboard confirmation remains pending.

- [Owner funds and concurrent confirmation, 11 October 2026](runs/2026-10-11-money-movement-owner-database.md): 51 assertions passed for transfer/owner journals, simultaneous confirmation recovery and period closed after review; cleanup verified.

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

- [Purchase registration proposal database acceptance, 11 October 2026](runs/2026-10-11-registration-proposal-database.md): 37 assertions pass; rollback, concurrent replay, fresh supplier/authority guards and actual reads; full web/model acceptance pending.

- [Saved purchase agreement receipt web acceptance, 11 October 2026](runs/2026-10-11-registration-receipt-web.md): actual Open/Close preserves the assistant chat; saved canonical agreement details and screenshot; backend fixture confirmation only.

- [Maximum ten-line draft and receipt web acceptance, 12 October 2026](runs/2026-10-12-ten-line-receipt-web.md): read-only draft batches, full GENERAL Edit review11.56s, actual Edit/re-review/Confirm/Open/Close/reload, exact ten saved movements/values/100 categories and concurrent completed recovery; E05 parent audit pending.
