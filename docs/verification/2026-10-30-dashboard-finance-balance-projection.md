# Finance account balance projection — 30 October 2026

Local DP-103/405 read slice; parent3fb4f97f. Full program stays3/27 (11.1%).
No deployment, schema/index/provider change or service restart. Private evidence
prefix: /tmp/ewatrade-dashboard-program-20261029/finance-balances-*.

## Finding and change

The nine-family development pass observed Finance refresh6422ms and warm2982ms.
Its API phases are aggregate/background observations, not proof that this one
procedure caused the delay. Source investigation finds a concrete avoidable
cost in getFinanceAccountBalances: one account query plus two journal groupBy
queries inside the same RepeatableRead transaction. Installed PrismaPg obtains
one connection for a transaction; Promise.all does not make those statements
execute in parallel on it. A red actual-reader probe counts3 projection reads
when the desired count is1. Connection checkout count is unchanged.

A private account-balance projection now returns account metadata plus all-time
and month debit/credit sums in one parameterized SELECT. Conditional aggregates
reuse the same Book/sequence scan. The root still owns its current Membership
FOR SHARE lock, active Owner/Admin/Tenant check, exact Tenant/Book lookup,
RepeatableRead snapshot and10s/30s limits. UTC month derivation, Book metadata,
normal balance sides, archived/zero accounts, payment-method arrays, pause/mobile
money/bank fields and exact string amounts are unchanged. Same-Book composite
entry joins and sequence cutoff remain. The original month predicate has only a
lower bound, so committed future-effective entries remain included; no hidden
new upper bound or startsAt clamp is added. No cache or authorization shortcut.

Native enums/enum arrays are cast to text/text[] for the installed raw-query
adapter, preserving their values. Every canonical FinanceAccount scalar field
is checked against the generated scalar-field enum; internal aggregate aliases
never reach the API. This follows Midday's narrow repository projections and
conditional SQL aggregates within EwaTrade's existing Prisma/Finance boundary.
The public procedure/DTO and canonical commands do not change.

## Verification

Six actual-reader/SQL cases plus five retained journal-rule cases pass together
with150 assertions.
The projection matrix covers36 Book/snapshot/month combinations and all account
kinds. Disposable PostgreSQL executes the actual new SQL and the three-read
reference: exact money beyond2^53, boundary/future dates, snapshot cutoffs, other
Books, empty/zero/archived accounts, metadata, portable column types, parameter
binding, refusal-before-read and SQL error identity. Consecutive root reads obtain
new authority/Book state and later posting sequence rather than reusing a cache.

The fixture's authority/transaction ports are inert; it does not exercise real
row-lock races or live grants. Those source boundaries are unchanged. AST parity
proves admission/Book/month statements, transaction options, non-account Book DTO
and all other readers match before/after; Finance authority is byte-identical.
Initial harness failures involved native enum-array binding/reference decoding
and an unavailable Prisma.dmmf helper; corrected to PostgreSQL array text,
model-like decoding and generated scalar-field metadata without weakening checks.

A separate disposable plan check uses150,000 entries,300,000 journal lines and60
accounts across two Books, with the same relevant account/entry/line indexes.
All40 returned account rows match. Old statement buffer hits1+4004+3500=7505;
new4006. No shared reads or temp spills occur in these warm plans. One warm local
EXPLAIN sample totals about320ms across the old statements versus225ms for the
new statement; this is synthetic SQL work, not network or browser latency/p95.
Parallel workers are disabled only in this inert PGlite host, not app/provider
configuration. No new index is proposed.

Owned DB source/test, full imported API production graph and Dashboard types
pass. The six-path owned fast scope selects all four groups, with zero unknown
mappings:237 tests/1,533 assertions plus QA tooling types/Biome pass. Foreign staged
work is excluded. H01 coverage remains current; H02 passes for domain with zero
capability/procedure rows changed. Offline doctor and whitespace checks pass.
No new UI pass is needed for an unchanged DTO/markup/command flow; actual balance
SQL and metadata behavior are proved at the inert reader/PostgreSQL boundary.
Previous UI receipts retain only their recorded source/platform meaning.

Brain impact: update current project/task pointers, navigation performance and
Merchant Finance feature. No database schema/relationship/migration, API contract/
permission or new architecture decision changes require further documents.
The prepared optimized Dashboard f027263c
artifact remains unchanged and excludes this new repository source; its separate
runtime timing request remains pending. API runtime/source parity and a browser
speedup are not inferred from a local source change or build presence.
