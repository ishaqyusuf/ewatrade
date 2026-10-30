# Activity filter projection and combined runtime — 30 October 2026

Source parent `c119f31b3`. Local only; full six-phase program **3/27 accepted
(11.1%)**. This contributes to DP-003/103/407/502 without closing their acceptance.

## Cause and implementation

Activity filters serialized person choices and type availability in separate
queries after fresh scope admission. The main filter consumes its initial person
choices, so skipping them would change the UI. The actual-reader red test observes
four reader operations: locked scope, Stores, people, types. The new reader uses
three, retaining the same RepeatableRead transaction and Membership lock.

One SELECT returns two bounded JSON projections:26 ordered person choices for the
existing25-item cursor page, and at most two availability classifications per
implemented handler. Unknown types were already ignored after decoding; they are
now excluded in SQL. All non-legacy origin variants were already “recorded”; SQL
normalizes them to that same classification before DISTINCT. Recorded still wins
over legacy in the unchanged catalog mapper. No change to planned catalog types.

The source CTE stays NOT MATERIALIZED so each branch retains scope pushdown.
People come only from visible events, retain current/former role and display-name
rules,240-character clipping, exact escaped search, order and cursor boundaries.
Scope/search/cursor setup, availability/DTO/transaction tail, list/detail readers,
source union, scope/Finance rules, router and Dashboard UI are unchanged. No cache,
freshness, schema/index, dependency, permission, command or notification change.

## Focused and native verification

- Red:11 behavior cases pass; statement-budget case observes4 instead of3.
- Final actual PostgreSQL page/filter/scope/legacy suites:22 cases/416 assertions.
  Covers person paging beyond25, former people, display/clipped names, escaped and
  injection-like search, recorded precedence, unknown handlers/origin variants,
  empty/name-less history, current role/Store/Finance refusal and changed cursors.
  Existing exact money, list snapshots and both-direction paging checks retained.
- A1,000-event origin/type-variant case proves at most26 people and2×implemented
  handler classifications leave the database, with no source CTE materialization.
  The fixture initially expected one order classification; it correctly contains
  both recorded snapshots and remaining legacy orders, so the expected bound is2.
- DB/owned-test, API production graph and Dashboard types pass. Explicit owned-file
  fast plan/check:237 tests/1533 assertions plus QA tooling types/Biome pass.
- H02 reviewed impact passes. H01 from `683b8712d` reused: manifest, handlers,
  capability/procedure/coverage sources unchanged. No assistant promotion.
- Source parity confirms unchanged authority/search/cursor setup, catalog/DTO/
  transaction tail and all other Activity/domain/UI readers and commands.

Native PostgreSQL16 runs actual old/new functions for Owner, searched-person and
scoped-staff reads at0/2,000/10,000 added events. Nine complete outputs match exactly,
including types, actors, Store scope, management flags and cursors. Synthetic added
events intentionally vary recordingOrigin to exercise the transfer bound; this is
not typical production payload size.

| Added events, Owner read | Projection statements old/new | Decoded JSON bytes old/new | Buffer hits old/new |
| --- | ---: | ---: | ---: |
| 0 | 2 / 1 | 351 / 373 | 52 / 52 |
| 2,000 | 2 / 1 | 115,244 / 428 | 428 / 428 |
| 10,000 | 2 / 1 | 579,245 / 428 | 2,622 / 2,622 |

Bytes describe database-to-API decoded projection JSON, not compressed wire or
API-to-browser responses; browser DTOs match. The new JSON contains bounded nested
objects in one physical row. All plans have zero temporary writes/materialization.
Owner EXPLAIN execution samples old/new0.351/0.306ms,5.078/5.013ms,25.154/25.325ms:
no SQL compute-speed claim. Gains are one fewer round trip and bounded decoding.

Fixture `activity_filter_20261030_a4c812` removed, absence count0; isolated socket-only
cluster stopped. No app database fixture/write or shared-service change.

## Combined local runtime

Approved Dashboard-only window2026-10-30T05:59:32.162Z–06:01:19.108Z. Reused optimized
Dashboard artifact `b636ec94a`, Next16.4.3 BUILD_ID `9_xXHBCwpx3JFUo5UurJb`, with
the separately running updated hot API. It is not a newly compiled full-stack
candidate or certified API revision; `runtimeVerified:false`. Four Activity source
hashes, four manifests and lock pinned, unchanged through the passed receipt. The
receipt was copied before documentation edits; manifests also match after restore.

All18 family content-readiness actions pass with retained soft-navigation shell,
zero blocked business writes and existing QA Owner/data. Existing sale draft
cancelled; order/stock sheets opened/cancelled. No manufactured business data, money,
grants, messages or provider effects.

| Family | Refresh | Warm return |
| --- | ---: | ---: |
| Overview | 2150ms | 1057ms |
| Catalog | 2207ms | 1820ms |
| Orders | 4561ms | 1314ms |
| Customers | 1362ms | 2319ms |
| Finance | 3707ms | 2832ms |
| Website requests | 2530ms | 812ms |
| Activity | 3513ms | 4615ms |
| General | 1301ms | 1316ms |
| Reports | 6540ms | 816ms |

Warm Activity's one observed API batch reports15 SQL statements versus17 in the
previous workspace-projection sample, consistent with the combined page/count and
filter changes. That is indirect live evidence, not whole-runtime source identity.
Refresh3513ms compares with4205ms; warm4615ms compares with3103ms. Warm auth/context
rose211.9/631.7→653.7/1089.2ms; aggregate SQL work4182.9→5263.7ms, pool0.1ms in both.
Phases overlap and cannot be added. One sample each; variable waits and Reports/
Orders outliers remain unexplained. No causal page-speed, p95, CWV or budget claim.
Do not rerun merely to obtain favorable timings.

Dashboard50735(dev)→54526(optimized)→55140(dev), restored via root launcher.
API48226, Storefront46668 and Marketing90981 unchanged. Trusted-CA doctor passes;
no application API restart, TLS bypass or deployment. Next: fixed numeric Activity
phase attribution, then server-to-client startup and remaining metadata ownership.

## Plan and Brain impact

The main program is consolidated around current evidence and all27 original
acceptance criteria, preserved verbatim. The entire prior1,148-line plan is
byte-preserved in `docs/plans/2026-10-30-dashboard-performance-program-history-c119f31b.md`.
Historical implementation contracts remain there; earlier “current” build labels
are explicitly historical. Acceptance stays3/27. Brain current pointers replace
their previous top entry; Activity feature/projection ADR updated locally.

Private evidence root `/tmp/ewatrade-dashboard-program-20261029/`:
`activity-filter-{red,tests,db-types,api-types,dashboard-types,quick-plan,quick,h02,
native-plans,runtime,smoke,doctor-before,doctor-after}.log`, native plan JSON,
`activity-filter-{window,smoke-passed,parity,plan-parity}.json`, original filter copy,
fixture log and `dashboard-restored-after-activity-filter.log`. Native comparison
source is private `.scratch/activity-filter-{reference,native-comparison.test}.ts`.
