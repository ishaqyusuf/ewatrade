# Dashboard database connection reuse — 30 October 2026

Partial DP-003/103 in the [27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Parent eb362433b; primary checkout, local only. No deployment, provider/schema
change, keepalive SQL or business submission. Acceptance remains3/27 (11.1%).

## Finding and bounded change

Catalog's development refresh still takes4054ms. Existing trace combines pool
checkout, queueing and new physical socket setup. A controlled installed pg.Pool
probe against the verified local profile separates these mechanisms. Only SELECT1
is executed, without private tables, fixtures or writes. Initial read1505ms has
1291ms physical setup; subsequent reads take210–211ms with checkout below0.1ms.

A second four-read comparison uses identical pools except idleTimeoutMillis.
Both initial reads are cold (1540–1550ms). After just over10seconds idle, the
installed default10-second pool reconnects:1494ms total,1284ms physical setup and
210ms SQL. The30-second candidate reuses its socket:225ms total,0.2ms checkout,
224ms SQL. This proves a mechanism under this local pause, not a page/p95 speedup,
regional production result or a general ideal pool policy.

The shared application pool options now explicitly retain idle connections for
30seconds in traced and ordinary Prisma adapters. Max10/min0 and transaction
maxWait10seconds/timeout30seconds remain. Existing queries and fresh authority
checks run normally. Up to20additional seconds of idle socket lifetime per idle
connection is the resource tradeoff; no extra pool capacity, indefinite retention,
periodic query, provider setting or schema change is introduced. Cold starts and
pauses beyond30seconds remain cold, and network SQL latency remains.

Default-off tracing additionally exports fixed numeric `connection` (physical
socket/TLS/auth setup) and `poolBusy` (whole checkout begun with no idle capacity
at configured max). The latter includes waiting and any replacement connection;
it is not pure queue wait. These phases overlap checkout/request/SQL work and
cannot be summed as page latency. The existing local QA observer accepts only
these fixed numeric labels, with no SQL, parameters, host/user/session identity,
error text or arbitrary descriptions. No runtime fact cache is added.

Midday's API context timing and request-owned database boundary were inspected.
The application keeps Prisma and its existing package owner, rather than copying
Midday's Supabase/JWT/Drizzle authority. Installed pg/pg-pool8.x source and public
Client configuration are authoritative for this adapter version.

## Verification

- Actual installed pool with inert socket I/O: missing physical/busy attribution
  reproduces3 failures; setup/warm checkout, full-pool callback scope, release,
  duplicate release, connection failure identity and disposal now pass.
- Two separate processes load real application config, generated Prisma and
  installed PrismaPg against an unreachable socket sentinel. Both fail with10s
  before the change, then pass with30s; trace mode differs only in diagnostics.
  Construction stays lazy; no connection is opened.
- Pool/config/tracing/QA parser checks:13 tests/57 assertions pass. Existing trace
  concurrency, callback receiver, error/exporter failure and private-value checks
  remain. Real read-only probes:7 SELECT1 reads total across both experiments,
 0writes,0stored fixtures. Probe pools closed normally.
- API production-entrypoint plus owned DB/config/tracing test graph typecheck
  passes. The initial combined test graph included a JavaScript tooling test
  without allowJs; that tooling is checked by the existing QA graph instead.
  Owned fast scope passes237 tests/1533 assertions plus QA tooling types/Biome.
  It excludes unrelated staged explainers and Agent Chat changes. H01 is current;
  H02 passes1 record/domain,0 capability or procedure changes. Existing3 isolated
  browser-driver checks pass. Prepared optimized3cf manifests remain unchanged.
- Final frozen-source canonical local existing-data web smoke passes, receipt
  copied before documentation edits. It remains runtimeVerified:false and does
  not qualify an optimized candidate or release. Existing QA selection, populated
  Catalog, draft item/total and cancel pass; shell retained,0 blocked business
  writes. No manual service restart/switch or business submission occurred.

The bounded development run reports initial post-login shell6323ms, Catalog
refresh2510ms, first Catalog1913ms/warm841ms and Overview2484ms/warm1360ms.
The prior refresh4054ms is uncontrolled comparison, not a causal speedup/p95 claim.
One observed API read reports request1558.4ms, context626ms, auth209.8ms,
QA proof208.3ms, six SQL calls1238.8ms and pool314.5ms. New poolBusy count1/duration
314.4ms confirms the changed runtime instrumentation is active and exposes a
saturated-start checkout in this window. No physical connection event appears in
this captured read; that does not prove all process/server-render work was warm.
PoolBusy includes its whole checkout and phases overlap. Browser metrics do not
capture every server-to-server read. This prioritizes request/concurrency/critical
path correlation; it does not justify increasing max or weakening fresh checks.

Private evidence: /tmp/ewatrade-dashboard-program-20261029/pool-*.
Brain impact: feature/task/BRAIN pointers, API diagnostic contract and connection
reuse decision. No database schema/relationship/migration documentation changes
are applicable. Runtime/optimized identity and full per-family budgets stay open.
