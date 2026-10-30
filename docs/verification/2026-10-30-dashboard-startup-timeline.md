# Dashboard startup timeline and local round-trip cost

30 October 2026. Primary checkout, source parent `b5891de5b`. DP-003/103/104
evidence; full program remains **3/27 accepted (11.1%)**. Diagnostics only: no
application/API/DB source, runtime policy, dependency or environment change.
No deployment, provider action, business data write or application fixture.

## Diagnostic change and regression

The existing aggregate request-work totals did not identify when Activity's own
client batch started. The red browser tests observe a missing timeline. The
existing optional QA observer now records start, response-header and finish counts
and relative times for fixed resource labels and exact Activity read batches.
`streamingApi` derives only the GET JSONL negotiation flag; `route` identifies
same-origin Flight requests. No raw URL/query/path/header/body/identity is retained.
Activity list and filter labels can describe the same HTTP request, not two calls.

All clocks are the runner's monotonic event clock relative to observation begin.
Missing headers/finish remain null; events after the observation cutoff cannot
change the numeric snapshot. Finish includes cancellation/failure and is not SQL
completion. Header time is not result-ready time. Existing completed counts/byte/
fixed phase summaries remain, with Flight work now separately classified.

`QA_WEB_ACTIVITY_STARTUP=true` reuses the canonical QA journey and family runner,
selecting only Activity refresh/return plus the existing Overview-away transition.
It preserves loaded-content, error and shell-retention checks, and cannot enable
Preview/nonlocal diagnostics or omit the required artifact directory. Full family
mode remains the default selector; both flags choose the full pass. No second
runner, service controller, authentication shortcut or write permission.

## Checks

- Red two browser cases fail on the missing timeline. Existing intercepted
  browser suite22/22 and final focused diagnostic cases pass, including fixed
  labels, foreign/lookalike/query-string
  rejection, header/input/body sentinels excluded, late completion immutability,
  focused2-action/full18-action selection, missing Activity content refusal,
  local-only guards, existing base journey and isolated diagnostic refusal cases.
- Explicit four-owned-script plan/check:47 tests/195 assertions, QA tooling types
  and Biome pass; no unknown mapping. This is the tooling/core scope, not the
  broader237-test app/domain smoke. Two explicit non-null assertions required for
  type narrowing were then included in the final focused diagnostic rerun.
- H01 inputs unchanged; existing evidence reused. H02 passes: no gated change.
  Application, API, permissions, query/cache policies and domain source unchanged;
  existing Dashboard types/build and browser-stream transport evidence are valid.
  No new app build or repeated source/platform checks were needed for QA-only code.
- Current Channels/Compliance sources already start optional reads without waiting
  and Channels has independent settings sections/tests. Those earlier fixes are
  reused, not repeated. The awaited prescription workspace-access read gates
  clinical queue reads intentionally; no authorization dependency was removed.

## Focused optimized measurement

Reused exact application artifact `b5891de5b`, Next16.4.3 BUILD_ID
`o7zCuLrMZYHJOvlfCX3EM`; application/lock/four manifests match the preserved build.
Only QA scripts changed. Canonical local smoke passes with all four QA source
hashes frozen2026-10-30T10:32:43.191Z–10:33:19.249Z. Passed receipt copied before
documentation edits. Existing QA login/profile/Catalog/sale-draft/cancel and both
Activity actions pass. No business submission or fixture; runtimeVerified:false.

| Observation | Refresh | Warm return |
| --- | ---: | ---: |
| Document headers |18.0ms |— |
| Document finish |676.1ms |— |
| Last script finish |723.2ms |— |
| Last observed Flight finish |801.5ms |454.3ms |
| Activity list/filter request starts |945.4ms |456.1ms |
| Activity response headers |1628.6ms |1101.4ms |
| Activity HTTP request finishes |2773.4ms |2233.9ms |
| Recorded-content readiness |3007ms |2619ms |

The list and filters share one streaming HTTP request in each action. Refresh's
other API requests begin earlier at76.7ms; grouping every API start together would
have obscured Activity's actual start. Activity request duration is1828.0/1777.8ms,
including683.2/645.3ms until headers. This supports investigating both client
startup and API admission/transaction round trips. It does not prove a specific
React/hydration cause. Finish-to-readiness233.6/385.1ms includes driver polling
and rendering; it is not a browser main-thread/React profile.

Refresh includes26 canceled Flight requests; return includes2. Labels do not yet
distinguish prefetch from navigation or show server-to-server work. Cancellation
alone does not prove wasted work. Existing menu intent scheduling deliberately
retains automatic parent tasks; classify those requests before changing it.

One sample pair on unchanged application code, not p95/CWV/budget qualification
or a speedup. The prior3593/2631ms differs despite no runtime-source change.
No extra family sweep or direct Activity SQL probe was performed.

## Bounded literal database probe

A separate guarded local-profile diagnostic uses the same endpoint fingerprint
as the previous Activity plans. Three `EXPLAIN (ANALYZE, FORMAT JSON) SELECT 1`
reads touch no application tables. Only fixed numeric metrics/fingerprint and a
loopback boolean are retained, never connection URL, SQL plan text or credentials.

| Sample | Driver-inclusive round trip | Server planning | Server execution |
| --- | ---: | ---: | ---: |
|1 |244.8ms |0.015ms |0.019ms |
|2 |303.1ms |0.015ms |0.019ms |
|3 |244.9ms |0.014ms |0.019ms |

The selected endpoint is non-loopback. Most literal-query elapsed time is outside
the reported server plan; transport/driver/remote-service overhead is material.
This is not a pure network-RTT measurement or an explanation of every API wait.
New probe connection setup2070.9ms is separate; ordinary API traces use pooled
connections, so it must not be attributed to every page load. Client closed; no
provider/profile/data change. Sample count3, not a latency distribution.

Indexes cannot address this measured literal-plan overhead. Keep removing
avoidable source work while calibrating local budgets against the selected
database topology. A different local database/profile would require a separate
concrete environment/data plan; it is not silently substituted to pass QA.

## Restoration and remaining work

Dashboard development was restored through the root launcher after optimized
listener14906 stopped. API48226, Storefront46668 and Marketing90981 unchanged;
trusted-CA doctor passes, optimized manifests preserved. No API restart/deployment.

Private evidence under `/tmp/ewatrade-dashboard-program-20261029/`:
`startup-timeline-{red,driver-final,quick,smoke,restored-doctor}.log`,
`startup-timeline-window.json`, `startup-timeline-smoke-passed.json`,
`startup-timeline-activity/route-families.json`, `startup-literal-roundtrips.json`.

Next: distinguish navigation/prefetch server work and actual client startup,
evaluate remaining fresh request round trips without weakening current authority,
and complete the family/lifecycle/code/interaction acceptance. No ticket closed.
Brain current pointers, web-navigation feature/QA and attribution ADR updated.
Public API/permission/schema semantics unchanged; no migration/database docs update.
