# Reports selected-tab prefetch — 30 October 2026

Local DP-102/409 slice; parent `78ab86c69`. Full Dashboard program remains
**3/27 accepted**. No deployment or service restart. Private execution evidence:
`/tmp/ewatrade-dashboard-program-20261029/report-prefetch-*`.

## Finding and change

The actual `/analytics?operationsReportTab=service` route started five report
operations. Its actual Reports component, shared URL parser and installed Base UI
tabs consume three: current/previous sales and the Service summary. The hidden
Stock panel is not mounted. Server hydration keys match the visible consumers;
the extra work was unconditional prefetching, not duplicate client hydration.

The server loader now returns the allowlisted tab already used by the client.
The thin route starts reconciliation and balances only for Stock entry. Service
deep links start three operations instead of five. Default, explicit Stock and
invalid-tab fallback still start five. Service summary remains common because its
warning indicator is visible in the tab trigger even while Stock is selected.

No client presentation, tab/history behavior, dates, CSV, query key, freshness,
permission, API, schema or write changes. Store comes from current route admission;
URL Store spoofing gains no authority. Stock remains available on activation, and
the unchanged query cache serves later Service renders within its current window.
Midday reference: Reports keeps orchestration thin and passes work to its feature
owner; the established shared URL-loader/prefetch/HydrateClient pattern supplies
the selected feature instead of fetching every panel indiscriminately.

## Focused proof and limits

The isolated fixture runs the actual route, OperationsReports, URL loader/hook,
installed nuqs testing adapter, real UI tabs, tRPC options and app QueryClients
with their actual serialization/hydration. Auth, transport data, offline review,
charts/date/download presentation and telemetry are inert. No live report, model,
database or command is issued. Error fallback presentation is an inert port; this
does not add error-recovery acceptance.

Before the fix, three cases fail: Service entry and pending entry each start five
operations instead of three; the loader omits its selected tab. Four other cases
already pass. Afterward all seven pass with 45 assertions. Visible HTML includes
the selected panel, Sales and the Service warning marker, with the other panel
absent; rendering consumes hydration without extra operations. Later Stock render
adds its two reads, and returning to Service adds none. These separate SSR renders
prove consumer/query activation and identity; they do not simulate browser Back,
hydrated effects, expiration or a timed user click. Auth/no-Tenant/no-Store
redirects issue zero report reads. Held presentation reads do not block returning
the route boundary. The isolated entry and existing range/section suites pass:
10 tests/31 outer assertions, in addition to the seven fixture cases.

Two fewer operations is an operation-count result for Service entry, not a
40% page-latency improvement or optimized-runtime acceptance. Default Stock entry
is unchanged. Prepared optimized `9eb8a0c8` remains separate and excludes later
source; its timing/restoration window still requires the pending newer-build
answer. The old `965f64794` window was already completed/restored.

## Verification receipt

Full Dashboard and explicit fixture/entry type graphs pass. Owned fast source
checks pass237 tests/1,533 assertions plus QA tooling types/Biome, using eight
explicit owned paths; foreign staged work is excluded, with no unknown mappings.
H01 coverage is current in local mode with an unusable DB sentinel; H02 passes
for client with zero capability/procedure rows changed. The test-only loader
invocation was corrected to its existing Promise input type; production contract
was not widened. `qa:doctor --offline` and `git diff --check` pass.

Frozen canonical local browser smoke passes01:04:53–01:05:14UTC: exact QA account,
populated Catalog, sale draft item/total and cancel without submission. Copy:
`report-prefetch-smoke-passed.json`, `runtimeVerified:false`. Eleven frozen
source/helper/lock hashes match afterward; no edits occurred during execution.
This smoke does not exercise Reports or establish runtime/source parity. Exact
Reports behavior remains the inert actual-route/consumer SSR proof above. No
service restart, optimized-build switch, money write or deployment. The four
prepared9eb8 optimized manifest hashes remain unchanged.
