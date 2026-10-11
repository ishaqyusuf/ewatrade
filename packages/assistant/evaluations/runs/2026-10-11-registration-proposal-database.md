# Assistant purchase registration database acceptance — 11 October 2026

Evidence kind: deterministic-integration; provider/model not applicable.
Fixture: purchase-registration.v1 PA01, PA04, PA06, PA07 (bounded cases below).
Retained helper: apps/api/src/assistant/general-purchase-registration.integration-check.ts.
Entry: general-proposals.integration.test.ts with RUN_GENERAL_PURCHASE_REGISTER=1.
Environment: verified isolated Development database; owned QA tenant and Finance Book.
Rollout overrides are process-local and restored; shared planned availability remains.

PASS: run 02190081-df83-4611-86e1-488f4e4fcc4b, 37 assertions, 140.23s, exit 0.
Four independent financial cleanup counts zero; outer owned QA tenant/user
cleanup completed. Scoped helper TypeScript exit 0. Final local log retained.
Unknown supplier/config and fresh changed-supplier/revoked-membership refusals pass.
Concurrent/replayed confirmation yields one registration/two lines/one private
accrual and the identical receipt. Actual registration, detail and purchase-bill
list tools pass; no invoice/event/receipt/journal/stock operation. The displayed
outer test name is shared with the broader suite; only this helper ran.

The first run, 03b3acad-aca9-4746-8f4f-274d8d9f0764, failed a test-only expectation:
createFinanceSupplier returns a document result, not a supplier name. Its agreement
rollback, concurrent confirmation, replay and registration list checks had passed.
Four independent financial cleanup counts were zero and outer fixture cleanup
completed. Corrected the expected name and invalid fixture membership role;
scoped helper TypeScript passes. Initial log retained locally.

Scope: two exact goods lines (2.125 and 1 bags), total 1100 minor units, original
.123Z agreement time; injected assistant completion failure, concurrent/replayed
confirmation, unknown supplier/config refusal, after-draft supplier/authority changes,
actual registration/detail/bill-list tools and no journal, invoice event or stock.
This does not accept invoice/ownership/physical receipt, settlement, closed-period,
full browser confirmation or live-model behavior. E05 and the 45-ticket roadmap
remain incomplete. No schema, transaction-limit, mobile or deployment change.
