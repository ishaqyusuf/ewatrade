# Customer receipt source verification — 11 October 2026

Evidence: deterministic unit/source verification; provider/model not applicable.
11 tests / 69 assertions passed across receipt preview, transaction/replay, action
schema and capability coverage. Scoped API TypeScript and formatting passed.

The root canonical receipt command delegates to an explicit caller-owned transaction
form. Book/account locks, current authority, immutable command replay and existing
money/advance/Store checks remain. Optional expectedRevision is server-supplied by
the assistant and checked after locks and replay before any new effect. Existing
root/API callers may omit it; no client revision field was added to the API schema.

Read-only preview shares the execution money-account checks, reports exact existing
and projected unallocated credit, unchanged debt, current server-time posting and
no order settlement or collection. Strict action requires moneyAlreadyReceived:true;
rejects authority, revision, command, backdating and order/payment-source overrides.

Tests prove replay without nested transactions or writes, current authority before
replay, conflicting replay refusal, bounded root transaction, stale revision refusal,
preview scope/currency/period/method/account checks and receipt semantics. They do
not prove real database atomicity, double-credit prevention across all source types,
dashboard editing, live-model interpretation or deployment. Capability stays planned.
No UI surface was activated, so no new screenshot for this source-only slice.
