# F01 collection contract coordinator review — changes required

The source audit and exported pure decisions start F01 but do not implement a
canonical persisted collection intent. No payment command calls the new helpers;
the proposed migration, manual receipt integration and durable provider-event
reconciliation remain unimplemented. Existing payment-provider tests are reused.
No connected, provider or payment action occurred in this review.

Three additional pure probes exercised the actual exported decisions:

1. `decideProviderSettlement` returns `settle` when the intent belongs to source A
   but the supplied current source is B. It checks the provider reference but
   never checks `intent.sourceId === source.id`. Validate the exact source binding
   before a settlement decision and retain a durable reconciliation outcome for
   received money that cannot safely settle. Canonical callers must obtain both
   records within the authorized transaction; matching balances are not identity.
2. `decideManualReceipt` accepts -1, zero, 0.5 and NaN amounts when there is no open
   intent. It checks only `amount > balance`. This exported contract needs a
   positive safe-integer amount boundary, or an explicit validated input contract
   that every caller must use. Do not represent invalid amounts as approved
   receipts. No invalid value was sent to a real payment command here.
3. `decideOpenCollection` approves `new Date(NaN)` as the expiry because both
   lifetime comparisons are false. Validate finite dates/current time before the
   lifetime check. The diagnostic JSON serializes this invalid expiry as null;
   the returned Date is invalid, not a valid null/no-expiry policy.

Reproduction: `bun --env-file=/dev/null
artifacts/assistant-operations-parallel/f01-contract-review-probes.ts`.
Output: wrong source → `settle` amount 1000; all four invalid manual amounts →
`ok: true`; invalid expiry → `ok: true` with an invalid Date.

Repair ownership stays with the implementation agent. Preserve exact current
balance/currency, actor and tenant/Store authority, stable provider reference,
atomic manual/online exclusion and durable received-money evidence in subsequent
canonical integration. Pure helpers alone cannot prove duplicate prevention.
The existing checkout race findings are source observations, not connected
reproductions. Business policy decisions listed in the source handoff are still
open; a proposed policy must not be described as already approved.

F01 stays partial without an accepted bookmark. The full 45-ticket scope and
13/45 web acceptance are unchanged.
