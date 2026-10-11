# Customer credit transaction/source verification — 11 October 2026

Evidence: deterministic unit tests and scoped TypeScript; no live model or database run.

Apply credit and release allocation now expose caller-owned transaction functions;
root commands retain maxWait 10s/timeout 30s. Shared source checks preserve canonical
source/account scope, available amounts, active control accounts and posted Order
provenance. Read-only previews report selected source balances or released allocation
and account balances, current revision and explicit no-collection/no-refund semantics.
Execution retains locks, fresh authority, immutable replay and existing journal/order
settlement writes. No action is activated by this change.

11 tests / 102 assertions passed across allocations-transaction, allocation-releases-
transaction, credit-review and order-charges test files. Covered replay without nested
transactions, revoked authority, payload conflict, stale revision before effects,
preview caps, closed period/currency/access refusal, read-versus-lock order validation,
missing billing, mismatched total and foreign source refusal.

Scoped TypeScript initially found lost orderId null narrowing after extracting the
source guard; the guard now carries its validated assertion type. Scoped TypeScript recheck passed. These tests do not prove successful database effects,
concurrent confirmation or assistant conversation behavior. Adapter, editor, database
and dashboard acceptance remain pending. No UI change or new screenshot this run.
