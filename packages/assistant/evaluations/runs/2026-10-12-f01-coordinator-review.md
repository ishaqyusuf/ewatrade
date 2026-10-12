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

## Repair revalidation and remaining contract gaps — 12 October 2026

The original three failures above describe the earlier source. Updated probes
now supply the new required tenant/source fields and an actor with canonical
payment-acceptance permission. A valid matching control still settles 1000,
permits a manual receipt and creates an intent with the valid expiry. Against
those controls, wrong source identity returns `source_mismatch`, all four invalid
manual amounts return `INVALID_AMOUNT`, and an invalid expiry returns
`INVALID_EXPIRY`. This last result is no longer a refusal caused by missing actor
permission. Existing owner six-case/22-case evidence is reused.

Two extended pure probes still fail the intended safe contract:

1. With matching source identity but source currency **USD**, a received intent
   and event in **NGN** return `settle` for 1000. Match the current canonical
   source currency as well as the intent/event currency before settlement;
   preserve the received money for reconciliation when they disagree.
2. `decideHeldResolution` has no held intent/Tenant/source identity to compare.
   A held NGN amount paired with another Tenant's order/customer returns an
   approved customer-credit decision when supplied an authorized actor boolean.
   Bind held money to its original intent/Tenant/source and resolve both through
   the canonical authorized transaction before proposing credit or refund.
   This is a synthetic helper result, not evidence of an actual cross-Tenant
   posting: the helper is not wired to a persisted command.

The diagnostic script above contains both original repair controls and these
extended probes. The local collection/payout/canary ADR now records policy
decisions; that does not establish live provider-account facts or authorize a
runtime account change here. Canonical persisted intent/event commands, atomic
manual/online exclusion, reconciliation and saved UI remain open. F01 stays
partial and unbookmarked.
