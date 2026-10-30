# Overview numbers acquisition — 30 October 2026

Local DP-103/401 slice; parent `e3a7f76d9`. Full program remains **3/27 accepted**.
No deployment, schema change or service restart. Private evidence root:
`/tmp/ewatrade-dashboard-program-20261029/overview-summary-*`.

## Scope and cause

The actual `getDashboardOverviewMetrics` reader previously issued four independent
Prisma operations when Orders, Catalog and Product presence were true: today's
Order sum, this month's Order count, Catalog count and stock-source count. They
were already concurrent; this is acquisition/round-trip consolidation, not removal
of a serial Promise chain. The actual Dashboard Overview metrics server component
is the sole production caller. Recent Orders, presence, staff visibility resolution
and all command readers remain separate and unchanged.

The existing DB boundary now returns the same four numeric fields from one
parameterized current PostgreSQL projection. All-false presence still returns
zeros without a DB operation. Disabled sections omit their table reads. Catalog
uses EXISTS, so multiple offerings/availability rows do not multiply the count.
The order aggregate retains both independent lower bounds, exact Tenant/Store and
optional creator scope; all existing statuses, negative amounts and future-dated
rows retain their existing behavior. This does not redefine the metric's labels
or turn it into a different financial report. Stock retains the existing Store-only
predicate; fresh admission already establishes the globally unique allowed Store.

No TTL/shared cache, route/UI, API, authorization, locked money command, schema,
index or infrastructure changes. Missing/error results propagate to the existing
error boundary; no last-known financial payload is introduced. PostgreSQL bigint
counts/sums become the same public numeric DTO as before. Midday keeps its Overview
summary in the DB query boundary; EwaTrade uses the existing parameterized projection
pattern already established for Overview presence.

## Focused proof

The regression test first reproduces four reader acquisitions where one is
expected. Legacy read ports are inert; the replacement `$queryRaw` port executes
the actual Prisma-parameterized SQL in disposable in-memory PostgreSQL through
the existing locked PGlite runtime. No live database/profile, provider, stored
business fixture, sale or payment is involved.

The predicate matrix covers all eight presence masks with six creator scopes,
including omitted, two actors, missing, empty and injection-shaped values.
It also covers zero/foreign/injection-shaped Store scope, Tenant separation,
duplicate and unavailable Catalog offerings, system Catalog exclusion, date
boundaries in both orders, refunds/cancellations/drafts/future rows retained by
the existing predicates, negative and greater-than-32-bit sums, failures/missing
rows and fresh consecutive reads after an isolated data change. It exercises the
current raw SQL, not a string-based substitute for its WHERE behavior. Legacy
ports measure acquisition count; they are not Prisma's generated-query execution.

All six cases pass with107 assertions. Acquisition count alone is not a page-speed
result. The SQL tests reuse PGlite already present in the locked Prisma development
graph and existing repository tests; no package/lock change or new runtime is added.

## Query plans and tradeoff

The disposable plan harness creates300,000 synthetic Orders with the existing
Store/date and Tenant/Store/creator/date indexes, and empty unrelated summary
tables. It executes the actual summary SQL and comparable old Order sum/count
reads with `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)`, for all-creators and one creator,
three samples each. This is single-process PostgreSQL/WASM under Node, without
network latency, connection contention, real Store distribution or populated
Catalog/stock cost. It is not a hosted PostgreSQL performance benchmark or p95.

An initial combined Order scan used more buffers:1,490 vs1,280 for all creators
and707 vs477 for one creator. The final statement keeps separate indexed date
subqueries inside the same current statement. Final buffer hits match the old
reads in every sample:1,280/all creators and477/one creator. SQL work is comparable:
the old two sequential Order reads total5.079–7.046ms vs final whole summary
4.931–5.794ms; one-creator totals0.672–0.699ms vs0.685–0.824ms. Those tiny synthetic
timings are noisy and do not compare the old four-way concurrent client wall time.
They support retaining access paths, not a guaranteed latency improvement.

Private plans: `overview-summary-plans.json`; initial scan plans and source digest
are retained separately. Original Bun and first Node harness attempts were stopped
and are not accepted results. A small probe identified invalid multi-statement
VACUUM use; separate statements fix it. Stage markers then isolated index creation
work with parallel maintenance enabled in the single-process test host. Disabling
parallel workers only in that host makes the same300,000-row/index setup complete
in about1.5s and the full execution in about2.5s. No application/hosted DB settings
were changed. See corrected final log `overview-summary-final-plans.log`.

## Final source and local checks

Full Dashboard types and the explicit DB reader/test type graph pass. The owned
fast plan includes five explicit paths, core/domain/web/mobile and zero unknown
mappings; foreign staged work is excluded. Final fast checks pass237 tests/1,533
assertions plus QA tooling types/Biome. H01 coverage remains current in local mode
with an unusable DB sentinel; H02 passes for domain with zero capability/procedure
rows changed. No schema/migration command is needed. `qa:doctor --offline` and
`git diff --check` pass.

Frozen canonical local UI smoke passes01:18:02–01:18:21UTC: exact QA account,
populated Catalog, sale draft item/total and cancellation without submission.
Ten source/caller/scope/helper/lock hashes match afterward. Copy:
`overview-summary-smoke-passed.json`, `runtimeVerified:false`. This journey does
not assert the Overview numbers or establish source/runtime parity or optimized
page latency; exact metrics proof remains the disposable SQL tests. No connected
business fixtures, money/approval/provider action, application restart or deployment.

Prepared optimized9eb8 manifest hashes remain unchanged and exclude this source.
Its separately pending timing/restoration request is not satisfied by this smoke.
Full DP-103/401 and the overall program remain open at3/27 accepted.
