# Customer credit database and discovery acceptance — 11 October 2026

Run: 3bd33a5d-9773-43f3-8d4f-3ad07630e899. Base: 91590e57 plus
allocation lookup tools and focused integration fixture in this commit.
Evidence: deterministic integration, no live model. Isolated Development database
`ewatrade_general_assistant_main_20261009`, disposable owned QA tenant only.
Process64875 exited0: 1 test,44 assertions,252.02s; test body250.72s.

Opening credit1000/debt500 → apply300 → credit700/debt200 → release100 →
credit800/debt300. Exactly one allocation and release, one command each and balanced
two-line advances/receivables journals. No customer receipt was created. Injected
assistant-receipt failure rolled back allocation/release and journals; apply proposal
remained pending. Sequential retries returned stored receipts without duplicate effects.
Unknown credit, overapplication, overrelease and stale review refused.

Actual readCustomerEntry/readCustomerAllocationHistory executors returned the exact
allocation with remaining200/released100 and one release100. Stale history revision
and missing entry returned unavailable. Source guards retain bounded pages and
canonical revision-pinned continuation. Two unit tests/12 assertions passed; scoped
API TypeScript and regenerated capability coverage check (1test/4assertions) passed.

Financial cleanup verified zero Books/accounts, outer owned tenant/user cleanup
completed. Process-local capability activation restored. No DB run remains live.
A pg concurrent-query deprecation warning appeared; it did not fail this run and is
not a demonstrated transaction timeout. Existing maxWait10s/timeout30s unchanged.

Scope limits: opening-ledger sources only; no linked-Order financial acceptance,
concurrent confirmations, pagination DB acceptance, full dashboard flow or live-model
conversation acceptance. Parent suite title names additional cases that this focused
branch does not run. No screenshots because no UI was changed/tested in this run.
Full local log: /private/tmp/e02-customer-credit-database.log.
