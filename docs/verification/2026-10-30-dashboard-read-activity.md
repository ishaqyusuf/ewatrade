# Dashboard read activity and optimized checkpoint —30 October2026

DP-003/204/502 evidence under the [full27-ticket/59-route program](../plans/2026-10-29-dashboard-performance-program.md).
Application candidate `abf8aae83`, Next16.4.3 build `KRKyPfsdjz-gY_DEgb_mF`.
Seven owned QA paths/lock and four build manifests are pinned privately. No product,
API, command, permission, schema or provider change in this slice. Acceptance remains
**4/27 (14.8%)**; this is not whole-Dashboard or release acceptance.

## Instrumentation and verification

The existing canonical runner gains local-only `QA_WEB_READ_ACTIVITY=true` with
navigation artifacts. It reuses the nine fixed representatives, content readiness,
shell retention, QA login/data and business-write interception. Each family adds
visible idle, controlled hidden, focus return, offline idle and reconnect. Catalog's
65s windows cross the shared60s timers; Website's35s visible/hidden windows cross
its30s queue cadence. Remaining5s idle windows are samples, not complete interval
coverage. Recovery windows are4s plus content readiness. Only this opt-in local
journey gets a12min runner limit; ordinary/Preview/Android limits stay unchanged.

Installed headless Chromium keeps blank tabs visible when another tab comes forward.
Consequently visibility is **controlled DOM emulation**, with coherent hidden/
visibilityState and a bubbling visibilitychange event. Offline uses Playwright's
network emulation. This does not verify native tab occlusion, OS suspend or native
device behavior. Finally restores owned overrides and network state, including on
failure. No application cache/authority is replaced or patched.

The existing observer counts RPC operations separately from HTTP batches using
fixed groups. It retains no URL, query input, procedure names, body, header values
or actor/Store IDs. Unknown procedures count as otherRpc; grouped counts alone
cannot identify duplicate inputs or establish that every operation is unnecessary.
An opt-in guard rejects new API starts during hidden/offline windows on these
fixed base routes, which open no proof/job/optional panel. It does not apply to an
active committed job or public/private payment-status journey.

- Final31 existing browser-driver cases pass with intercepted inert pages. New
  cases verify batching/redaction, all63 checkpoint phases, both window-level
  recoveries per family, no extra cleanup recovery, failure restoration and
  rejection of injected hidden/offline work. Inert waits are shortened; tests
  assert the requested live durations and do not supply page-speed evidence.
- A strengthened window-listener case first fails because the visibility event
  did not bubble; it passes after correction. The first live partial probe is
  excluded and retained separately. An additional test demonstrates27 rather
  than18 recovery requests because final cleanup redundantly notified an already
  visible document; cleanup now notifies only when restoring a hidden document.
- Lifecycle phase measurements below precede that final cleanup correction.
  The active/hidden/focus/offline/reconnect bodies are unchanged. Cleanup occurs
  outside those windows. Their18 refresh/return timing rows are excluded from the
  navigation baseline. A separate normal18-check run follows the cleanup fix.
  The final passive inactive-window guard is also replayed against all63 recorded
  samples:18 inactive windows pass, without another connected sweep.
  Reconstructed, formatted source hashes confirm exact measured/baseline helper
  parity after excluding only the stated passive guard and outside-window cleanup.
- QA tooling types, four observer/budget unit cases/13 assertions and owned
  seven-path quick scope47 tests/195 assertions plus Biome pass, zero unknown
  mappings. Foreign Agent Chat/staged explainers excluded. The actual optimized
  Dashboard build, including full types, passes. An initial Bun command printed
  help, and a workspace-local binary path was absent; corrected invocations are
  the accepted build/runtime. No application checks were bypassed.
- H01 valid unchanged coverage evidence reused; H02 reports no gated change.

## Observed activity

Corrected lifecycle journey passes **12:53:44.683Z–13:02:26.735Z**,63 checkpoints,
zero business submissions. Table counts are started RPC operations, not HTTP
requests or server SQL. Visible-idle timing varies by the durations above.

| Family | Visible-idle RPCs | Hidden API starts | Focus-return RPCs | Offline API starts | Reconnect RPCs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Overview |0 |0 |5 |0 |4 |
| Catalog |5 |0 |5 |0 |5 |
| Orders |1 |0 |4 |0 |4 |
| Customers |0 |0 |4 |0 |4 |
| Finance |0 |0 |4 |0 |4 |
| Website requests |3 |0 |6 |0 |6 |
| Activity |0 |0 |6 |0 |6 |
| General |0 |0 |4 |0 |4 |
| Reports |0 |0 |4 |0 |4 |

Catalog's five count operations across65s are consistent with one30s count and
three60s counts; they share three HTTP requests. Website's35s sample includes two
queue operations plus one shared count. Closed preview, WhatsApp, attachment,
Domain-progress and Product-state groups start zero operations across all45
lifecycle windows. These observations do not prove every optional feature or role.

There are23 browser-classified cancellations across the lifecycle windows, zero
uncancelled network failures and zero HTTP errors. Streaming consumption can end
as cancelled; these counters do not prove RPC success/failure inside a200 stream.
Cancelled responses lack the observer's completed body-size measurement. Missing
payload/phase measurements are **not zero bytes/SQL/work**. Server-to-server reads,
pending work started before a window, and streams beyond its end are outside the
complete-cost claim. New RPC counts improve attribution; full DP-003 remains open.

## Separate optimized navigation sample

Normal full-family smoke passes **13:05:39.652Z–13:06:52.544Z**,18 checks, on the
same artifact after cleanup correction, without lifecycle emulation.

| Family | Full refresh | Warm return |
| --- | ---: | ---: |
| Overview |932ms |1059ms |
| Catalog |1412ms |853ms |
| Orders |2045ms |823ms |
| Customers |913ms |1327ms |
| Finance |3297ms |2345ms |
| Website requests |2277ms |1823ms |
| Activity |2301ms |2623ms |
| General |875ms |1322ms |
| Reports |2348ms |818ms |

One representative sample per action, not p95, CWV, accepted budgets or a causal
speedup. Warm Website1823ms exceeds the preceding816ms sample; variability/cause
is unresolved. Finance/Activity and other rows still miss provisional warm targets.
The existing isolated Finance read diagnostics accompany each full-family run;
they are separate from page timings and do not fill every streaming measurement.

## Restoration, audit scope and remaining work

Dashboard-only test/restoration used existing owner authorization. Optimized server
stopped; root `bun run dev --local -f dashboard` restored development listener45644.
API48226, Storefront46668 and Marketing90981 remain unchanged. Generated next-env
references match exact original development bytes; source/lock/build hashes match.
Trusted-CA lightweight API/Dashboard doctor passes. `runtimeVerified:false`; no
release qualification, push, deployment, provider action or business fixture.

Fresh AST scan of1108 production source files still finds33 query intervals and
six repeating timers across25 files. A separate extension finds43 setTimeout
calls and one WebSocket: original39-site history is retained. One-shot UI/search/
autosave/expiry work differs from bounded Setup-run, receipt-job and payment/socket
recovery. Their contracts are recorded in the polling audit; this is source review,
not live proof/payment/provider acceptance. Full DP-204, other families' states and
roles, query lifetimes/invalidation, interaction budgets and remaining23 tickets
stay open.

Private evidence `/tmp/ewatrade-dashboard-program-20261029/read-activity-*` holds
separate measured/final input manifests, excluded probe/checkpoint, red/green/
driver/type/build/quick logs, lifecycle and normal navigation receipts, extended
source inventory, budget replay, runtime/restoration and doctor evidence. Final
guards add no measured workload; accepted phase data is reused as scoped above.
Brain BRAIN/task/QA/navigation pointers updated locally. No API/schema/durable
architecture change; API docs, migration and a new ADR are not required.
