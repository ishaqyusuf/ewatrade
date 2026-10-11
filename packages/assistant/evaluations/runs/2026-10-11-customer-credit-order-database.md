# Customer credit linked-Order acceptance — 11 October 2026

Run42d0f8f9-b62c-4fd3-ae0c-0388fda520ad. Sourcef76d439d plus parameterized
order fixture; c92a4d33 money transaction seam was committed during the run but is
unrelated to this proof. Isolated Development, owned QA tenant. Provider-free.
Process42778 exited0:1test58assertions,217.12s (body215.88s), cleanup verified.

Seeded confirmed Order500, canonical BILLED posting created exact ORDER_CHARGE,
canonical customer receipt1000 created one deposit. Assistant apply300 then release100
used exact source IDs and review named the Order. Credit settlement payment300 and
linked reversal100 use CUSTOMER_CREDIT; Order amountPaidMinor200,PARTIALLY_PAID.
Cash balance1000 unchanged, receivable300,customer advances800. One customer receipt
and one receipt journal; monetary collections listing0. No double collection.

Inherited fixture assertions also prove fresh stale/overlimit/missing source refusal,
injected assistant receipt failure rollback for apply/release, sequential replay,
exact balanced journals, and actual allocation/history tool readbacks. Two linked
payments only; financial and outer owned QA cleanup completed. Transaction limits
unchanged. Existing pg concurrent-query deprecation warning retained in local log.
Initial fixture typecheck found wrong package export and TenantContext.store; corrected
to internal posting import (test-only) and activeStore, scoped API types then passed.

Scope: Order and deposit fixture directly seeded/canonically posted, not an assistant
order-creation or cash-payment conversation. Not live-model, concurrent confirmation,
full release dashboard acceptance or deployment. Parent test title includes cases
outside this focused branch. Full log:/private/tmp/e02-customer-credit-order-database.log.
