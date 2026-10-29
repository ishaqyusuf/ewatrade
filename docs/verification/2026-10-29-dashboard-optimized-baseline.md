# Dashboard optimized local baseline —29 October2026

Partial DP-003/502 evidence under the [27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Owner explicitly approved switching only Dashboard to the prepared965f64794 build,
measuring it and restoring development mode. Primary checkout; no deployment,
business submission, new business fixture, provider action or API restart.

## Candidate and measurement boundaries

- Next16.4.3 optimized `next start`, canonical local Dashboard host, existing local
  environment/Portless launcher. Four prepared build-manifest hashes matched before
  and after the session. Later5d211023a/81c48f2d3 source improvements are absent from
  this build and receive no optimized-runtime acceptance from this receipt.
- API listener remained the same traced process throughout. Shared checkout moved
  to1cac06951 through an unrelated documentation commit. Canonical local smoke
  records that checkout SHA plus dirty hashes; `runtimeVerified:false` correctly
  does not establish the identity of an already-running build. Private manifest,
  source/lock hashes and process receipts supplement that limited local evidence.
- Existing QA owner/workspace and existing records only. Desktop IAB gave bounded
  action-to-visible-locator observations, including bridge/observation overhead;
  these are not browser NavigationTiming, Core Web Vitals or percentile estimates.
  Public Performance API is unavailable in the constrained IAB evaluation scope.
- The canonical existing Node/Playwright smoke gave more precise Catalog/Overview
  action-to-ready samples. Its write interception and blocked service workers are
  part of this harness; do not assume ordinary user HTTP cache behavior or compare
  its latency directly with IAB observations. No throttling was introduced.

## Observed results

One IAB sample per representative family, milliseconds:

| Family | Existing-data readiness target | Refresh observation |
| --- | --- | ---: |
| Overview | Existing recent order | 3940 |
| Catalog | Existing Notebook row,20 loaded items | 6451 |
| Sales | Existing first order,25 loaded | 4430 |
| Customers | Existing customer link,61 displayed | 4139 |
| Finance | Existing spending item; accounts also present | 9624 |
| Website requests | Existing product request,1 pending product/1 service | 9257 |
| Activity | Existing recorded order event,19 events | 8801 |
| Settings | Server-rendered current currency | 3864 |
| Reports | Existing30-day sales chart | 5913 |

Catalog Notebook first open4508ms; first Activity3551ms; Activity deep-link
refresh9400ms. Loaded Overview/Orders/Activity revisits77/81/85ms, without a new
loading skeleton. The first Orders visit showed loading then its existing order;
no reliable first-load timing was retained. These are single bounded observations,
not a causal comparison or acceptance of the family budgets.

Final frozen-source canonical run:

| Journey | Action to ready |
| --- | ---: |
| Catalog full refresh | 3540ms |
| First measured return to Catalog after the sale-draft check | 3353ms |
| First measured return to Overview | 2565ms |
| Warm Catalog | 819ms |
| Warm Overview | 1322ms |

The initial shell after QA login was5976ms; that marker does not prove every
optional widget ready. Shell identity remained connected. Order and stock sheets
opened and closed; zero business writes attempted. Navigation feedback/tab retention
and full-refresh latency are separate concerns: the latter still misses the2s goal.

## Request and byte evidence

The existing smoke's optional artifacts now include privacy-safe observation
windows. The final Catalog refresh window started102 requests,7 still in flight
at readiness. It includes previous-page/background/prefetch work, so102 is **not**
an attribution of102 necessary Catalog resources. Completed observations include:

-59 script responses,1,128,848 body bytes;2 stylesheets46,468 bytes; document28,636
  bytes. Available browser body-byte measurements exclude headers and are not
  source/module-file sizes. The document request occupied3467ms of the3540ms
  action window; this is not a TTFB or a CPU profile.
- One visible API response655 bytes,1872.1ms server request time, context1057.8ms,
  auth429.8ms, QA proof410.5ms, scope432.9ms,8 SQL calls/1720.5ms accumulated SQL
  work and8 pool observations/147.5ms. It can include background work and cannot
  explain the entire route. Phases overlap; adding them is invalid.
-24 cancelled requests in the `other` group. Warm transitions likewise include
  browser cancellations. These are recorded separately from HTTP errors and are
  not by themselves application failures. No observed completed HTTP error here.
- First measured Catalog/Overview returns delivered13/12 scripts,126,576/508,929
  body bytes respectively. This build predates the subsequent optional-delivery
  slice; no byte-reduction claim is made for the newer source.

Server-to-server API/SQL work is invisible to this browser observer. Missing phase
data is not zero work. Complete per-family attribution and budgets remain DP-003;
automatic regression thresholds remain DP-502. Current evidence supports prioritizing
fresh-load server/context scheduling and optional delivery before more tab retention.
Fresh authorization, proof, money and scope checks must stay current.

## Verification, caveats and restoration

- Offline doctor passes. Owned QA-script fast smoke47 tests/193 assertions, tooling
  types and Biome pass; foreign staged explainers/Agent Chat excluded explicitly.
  New phase privacy parser1/1 and canonical intercepted browser-driver3 tests pass,
  including actual byte/header observations, in-flight readiness, later completion,
  cancellation and existing business-write refusal. No Dashboard/API production
  source changed in this slice; their prior scoped source evidence is retained.
- The first diagnostic smoke passed. A subsequent journey completed, but its
  canonical receipt correctly failed source-drift validation because this agent
  edited testing documentation during the window. That failure is preserved;
  it is not counted as acceptance. The final frozen-source smoke passes. No runtime
  redeployment/restart was used to retry the smoke.
- Some initial IAB sidebar clicks on pages with child links did not navigate.
  An unobstructed visible Settings/Reports click worked immediately. Expanded
  Settings was partly clipped near the account footer. Discard the missed-click
  wall clocks as latency samples. Finance's initial missed soft click remains an
  interaction uncertainty requiring a normal-driver reproduction, not an asserted
  server hang. Source review also flags the focus-expanded sidebar/child-toggle
  geometry for DP-304 investigation; no speculative UI repair is included.
- Optimized Dashboard stopped after the final run; `bun run dev --local -f dashboard`
  restored Next16.4.3 Turbopack development mode. The new Dashboard listener and
  loaded Reports chart plus visible Next.js dev tools confirm restoration. API
  listener PID48226 remained unchanged; all other services untouched. User-owned
  original Catalog tab was preserved; the agent test tab remains available.
  Overall accepted3/27 unchanged. H02 passes with0 detected capability/procedure
  changes; H01 production source unchanged, prior coverage evidence retained.

Private evidence root: `/tmp/ewatrade-dashboard-program-20261029/`.
`optimized-965-ui-timings.json`, `optimized-965-manifests.json`,
`optimized-965-{runtime,driver,qa-quick,phase-test}.log`,
`optimized-965-smoke-{frozen,source-drift}*`, Catalog/Reports screenshots and
`dashboard-restored-dev.log`. Canonical receipt remains local/runtime-unverified.
Brain feature/task/BRAIN updated locally; no API/schema/permission contract changed.
