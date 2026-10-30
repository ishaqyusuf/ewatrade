# Optimized local Dashboard route-family timings —30 October 2026

The approved Dashboard-only test window is complete. Normal development mode is
restored; no deployment occurred. API, Storefront and Marketing retained their
original listener PIDs48226/46668/90981. Dashboard changed83548→23330 optimized→23874
development. The existing root dev launcher restored only Dashboard.

## Runtime and evidence limits

- Dashboard artifact: `f027263c2bcf9851b77df8078121d36ac357722e`, Next16.4.3,
  BUILD_ID `gyux6-wPMhNP3vw2kNKj5`. Four prepared manifest hashes matched before
  serving and after restoration. The root optimized files remain preserved.
- Checkout at execution: `91c6c812c5c4508dcb463f7dc251329d6f348109` with unchanged
  foreign Agent Chat/explainer changes. Later Finance/Activity DB source is not in
  the compiled Dashboard artifact. The independently running hot API has no runtime
  revision certification; its responses must not be attributed to f027 source.
- Canonical existing-data local web smoke passed, source frozen during the run,
  2026-10-30T03:31:21.878Z–2026-10-30T03:32:38.476Z. RuntimeVerified remains false:
  this is a manually identified local artifact, not signed deployment acceptance.
- All18 fixed-family content-readiness samples passed; retained sidebar on warm
  departures/returns, zero blocked business writes, ordinary sale draft cancelled
  without submission. Existing QA Owner/data only; no fixtures, live grant changes,
  messages, financial commands or provider actions.
- One observation per action, same local environment; no p95, causal before/after,
  Production or broad domain acceptance. Missing browser Server-Timing does not
  mean zero server work. Network/SQL durations can overlap and must not be added.

## Observations

| Representative | Refresh | Warm return |
| --- | ---: | ---: |
| Overview | 946ms | 1044ms |
| Catalog | 1762ms | 819ms |
| Orders | 2377ms | 817ms |
| Customers | 2185ms | 1318ms |
| Finance | 5916ms | 2830ms |
| Website requests | 2459ms | 832ms |
| Activity | 3480ms | 3114ms |
| General | 1231ms | 1317ms |
| Reports | 3565ms | 818ms |

Initial post-login shell was5692ms. The first separate Catalog refresh before
family traversal was3252ms; its later representative refresh was1762ms. That
variation is itself evidence against treating one warm sample as a stable budget.
Finance and Activity remain slow even with an optimized frontend. The measurements
support continued shared boot/server critical-path work and domain query work.

Finance refresh observed56 SQL calls/11874.4ms aggregate SQL work across completed
browser-visible API phases, pool1.6ms. Activity refresh observed43 SQL calls/
9138.7ms aggregate SQL work, pool1.5ms. These include batched/background activity;
they are not per-procedure counts, additive wall latency or proof of a specific
N+1. Activity warm return still observed19 SQL calls/3996.6ms aggregate work.
A completed one-request API context took roughly630ms on several families, worth
further attribution while retaining current auth/legal/scope checks.

## Plan changes and next acceptance

Keep the existing six phases and27 tickets. Prioritize DP-003 attribution and
DP-103 shared/server scheduling, then DP-405 Finance and DP-407 Activity, followed
by Reports/Orders and the other families. DP-201–204 still own retention, precise
invalidation and unnecessary hidden/revisit reads; a short freshness policy must
not cache away financial authority or revocation. DP-301–304 retain measured
optional-code/rendering work. DP-501–503 require repeated optimized measurements,
correctness/error/scope journeys and regression budgets before ticket closure.
The f027 run does not validate the later Finance or Activity query reductions.
Full program remains3/27 accepted; build success is not blanket acceptance.

## Verification and restoration

Canonical `qa:smoke --target local --surface web` with `QA_WEB_ROUTE_FAMILIES=true`
and private navigation artifacts passed. Existing driver tests10/10,47/195 source
checks and tooling types from3fb4f97f remain applicable: runner code unchanged.
Activity slice91c6c812 separately passes9/313, DB/API/Dashboard types,237/1533,
QA tooling/Biome and H01/H02. No test success implies deployment permission.

The first lightweight doctor probe lacked the local CA and failed. The documented
`NODE_EXTRA_CA_CERTS=$HOME/.portless/ca.pem` retry passed before restoration, and
passed again afterward. Restored log confirms `next dev --turbopack`, Next16.4.3,
and named-host response. No certificate validation was disabled.

Private evidence root `/tmp/ewatrade-dashboard-program-20261029/`:
`optimized-f027-{window,manifests,smoke-passed}.json`, runtime/smoke logs,
`optimized-f027-families/{route-families,performance}.json`,
`dashboard-restored-after-f027.log`. No sensitive account data is committed here.
Brain BRAIN/task/web-navigation-performance updated locally; no schema/API/
permission contract or new architectural decision in this measurement slice.
