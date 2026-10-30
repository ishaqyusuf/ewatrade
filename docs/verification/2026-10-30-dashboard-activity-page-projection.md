# Activity page/count projection — 30 October 2026

Local source parent `683b8712d`; no deployment. Full program **3/27 accepted
(11.1%)**. This slice contributes to DP-103/407; whole-page budget, optional-panel
and other-family acceptance remain open.

## Cause and implementation

The Activity list ran a page SELECT followed by a separate exact-count SELECT on
the same transaction connection. Both used the same scope, source window and
filter predicates. The red production-reader test observed four reader operations:
current locked scope, Store scope, page, count. It now observes three. Transaction
control operations are unchanged and excluded from that counter.

One SQL statement joins the exact count to the bounded page. Count is independent
of the cursor bound; the page retains the original tuple ordering and limit+1.
An outer order explicitly preserves result order. A left lateral join retains the
total even when a cursor is exhausted or a filter finds no rows. The single null-ID
sentinel is removed before presentation; no fake event reaches the DTO.

The source CTE is explicitly NOT MATERIALIZED for this list query so PostgreSQL
retains independent predicate pushdown. This removes one transport round trip,
not a source scan or exact-count requirement. Existing detail/filter consumers
keep their original default source planning. There is no new cache, index, schema,
dependency, isolation level or denormalized read model.

The existing RepeatableRead owner and Membership SHARE lock remain unchanged.
Authority, role/Store/Finance plan rules, source deduplication, snapshot cutoff,
filter and cursor signature/refusal, native exact money and presentation remain.
Detail/filter reads, notification commands/producers, API inputs/DTO and Dashboard
mount-owned fresh reads/loading/retention are unchanged. This is DB-package query
work; route/API orchestration stays thin, following the inspected Midday query
boundary while preserving EwaTrade's domain authority.

## Validation

- Red test:4 reader operations, expected3; all four existing behavior cases pass
  before implementation. Corrected a test's exhausted-cursor fixture first; it
  initially supplied null instead of an actual cursor.
- Six actual SQL page cases plus nine existing scope/legacy cases:15 tests/370
  assertions pass. Tied timestamps in both sort directions, exact big integers and
  signed refund, empty/exhausted total, recorded/legacy deduplication, snapshot
  cutoff, actor/category/type/Store/target/escaped search, foreign scope, revision
  and revoked-member refusal, current Finance entitlement all covered.
- The2,000-recorded-event case returns only3 raw page/count rows for a2-item page,
  with exact1004-event count. An actual EXPLAIN confirms no activitySources CTE
  materialization. Fixture-only indexes mirror existing schema indexes.
- Production DB plus owned-test, API production graph and Dashboard types pass.
- Explicit three-owned-source fast plan/check:237 tests/1533 assertions plus QA
  tooling types and Biome pass. Foreign AGENT_CHAT/staged explainers excluded.
- H02 reviewed impact passes. H01 evidence from the preceding `683b8712d` slice
  reused: no manifest, capability/procedure/schema/coverage source changes.
- Byte parity: all scope/filter/command/privacy/router/UI sources unchanged;
  authority predicates and cursor/snapshot setup, output cursor/coverage and
  transaction/detail tail unchanged. Source helper default differs only in SQL
  whitespace; its legacy union/window/deduplication predicates stay identical.

## Native PostgreSQL comparison

The disposable PGlite comparison completed small and2,000-event fixtures, then
stalled consuming CPU on the old reader at10,000 events. It was stopped; an earlier
frozen-clock attempt also stalled. Those runs are not successful scale evidence.
The same actual old/new readers and fixtures were compared on isolated socket-only
PostgreSQL16 instead. All three output comparisons pass; only per-call snapshot
timestamps inside the result/cursor are normalized, with no concurrent writes.
All event, total, cursor position/signature, coverage and exact money fields match.

| Added recorded events | Old projection statements | New | Old/new buffer hits | Old/new decoded projection rows |
| --- | ---: | ---: | ---: | ---: |
| 0 | 2 | 1 | 68 / 68 | 6 / 5 |
| 2,000, half outside window | 2 | 1 | 735 / 735 | 27 / 26 |
| 10,000, half outside window | 2 | 1 | 4,703 / 4,703 | 27 / 26 |

All variants have zero temporary writes and no CTE scan/materialization. Summed
EXPLAIN execution samples old/new:0.426/0.334ms,5.095/5.045ms,24.888/20.932ms.
Single local synthetic observations, not p95 or app latency. The established gain
is one fewer serial statement with equivalent bounded outputs and read work.

Fixture database `activity_page_20261030_8fd24a` removed, absence count0, isolated
cluster stopped. No application data, service restart, money, notification, grant,
message or provider effects. PostgreSQL fixture data is not an app fallback.

## Runtime scope and remaining work

The unchanged UI's previous18-action local readiness evidence from `683b8712d`
is reused for UI behavior only. No new browser pass or optimized runtime timing
is claimed for this SQL slice. Latest observed Activity4205/3103ms(refresh/warm)
belongs to that earlier sample. Shell-to-client startup, filter projections and
fresh metadata/auth/QA cost remain to attribute; exact-count scanning still grows
with matching history. This receipt does not close DP-103/407 or program budgets.

Private evidence root `/tmp/ewatrade-dashboard-program-20261029/`:
`activity-page-{red,tests,db-types,api-types,dashboard-types,quick-plan,quick,h02,
plans,native-plans}.log`, `activity-page-parity.json`, original read/source copies,
fixture cluster log and preserved failed/stalled harness outputs. Comparison source
is private `.scratch/activity-page-{reference,native-comparison.test}.ts`.
Brain feature/current pointers and projection ADR updated locally.
