# Matching optimized Dashboard timings and Finance read diagnostics

30 October 2026. The approved local Dashboard-only test window is complete and
normal development mode is restored. API, Storefront and Marketing kept listener
PIDs48226/46668/90981. Dashboard changed23874 development→35806 optimized→36296
development through the existing Portless/root dev commands. No deployment.

## Runtime and scope

- Compiled Dashboard source: `4d6da50ad9fbc69eedb3286ef39c668eacefdf88`,
  Next16.4.3, BUILD_ID `U_E0LUKJ0Rjy7uTi_nwj0`. This includes the committed Finance
  document scheduling and accumulated shared boot source. Four manifests and the
  lockfile matched before/after serving. The old f027 artifact is privately archived.
- The independently running hot API was not restarted. Its revision remains
  uncertified; do not infer API artifact identity from the compiled Dashboard.
- QA-only scripts were dirty and frozen during execution, with exact SHA-256s in
  the private window inventory. Product source stayed at4d6d. Foreign Agent Chat
  and staged explainer changes were preserved. The generated next-env build change
  was restored exactly; development type references and optimized manifests match.
- Canonical existing-data local web smoke passed 2026-10-30T04:33:50.551Z–
  2026-10-30T04:35:10.357Z; receipt `072eecd2-eaf9-4439-a923-ed4fcb3bded0`. RuntimeVerified=false:
  manual local artifact identification is not signed deployment acceptance.
- All18 representative readiness actions passed; sidebar retained on soft departure
  and return. Zero blocked business writes. Existing sale draft/item/total checked
  and cancelled; order/stock sheets opened and cancelled. Existing QA Owner/data
  only, no fixtures, financial effects, access changes, messages or provider actions.

## Observations

| Representative | Refresh | Warm return |
| --- | ---: | ---: |
| Overview | 2186ms | 1070ms |
| Catalog | 1588ms | 817ms |
| Orders | 2228ms | 814ms |
| Customers | 1002ms | 1315ms |
| Finance | 5335ms | 2834ms |
| Website requests | 2487ms | 817ms |
| Activity | 3508ms | 3114ms |
| General | 1367ms | 1321ms |
| Reports | 3793ms | 816ms |

Initial post-login shell5895ms; the separate first Catalog refresh2935ms. Later
Catalog refresh1588ms shows why single observations are insufficient for a budget.
These are driver action-to-content samples, not p95, Core Web Vitals, causal
before/after speedups or full domain acceptance. Finance and Activity still miss
proposed warm/refresh targets despite the optimized frontend. Prior f027 samples
remain historical; unrelated source and network variability prevent attribution.

Two separate existing-data GET probes ran after Finance's timed warm return and
outside every page observation window. They preserve fresh ordinary API admission
and retain only fixed labels, numeric phases, elapsed/status/decoded-byte counts:

| Isolated procedure | Elapsed | Request phase | SQL calls / aggregate time | Context | Decoded JSON |
| --- | ---: | ---: | ---: | ---: | ---: |
| finance.book |1940ms|1923.5ms|9 /1917.5ms|639.6ms|9149 bytes|
| finance.owedSummary |2380ms|2372.2ms|11 /2364.7ms|642.3ms|512 bytes|

Each probe reports pool0.1ms, serialization0.5/0.1ms, auth212.2/220.7ms and two
scope phases425.1/422.0ms. Durations are nested/overlapping and must not be added.
The SQL/request times support investigating database round trips before more
serialization/pool tuning for these reads; they do not prove a particular SQL plan
or every user's bottleneck. Owed11 calls is consistent with the bounded source
path, not a runtime revision certificate. Decoded JSON sizes are not compressed
wire sizes; response data, IDs, names, amounts and raw headers are not retained.

Finance refresh's browser-visible API phases report22 SQL calls/4693.5ms aggregate
work; its warm return has no completed browser API group. Activity refresh reports
40/8535.6ms and warm return18/3879.0ms. Background/batched activity may be included,
while server-to-server work is invisible. Missing browser phases do not mean zero
SQL or cached server rendering. Do not compare these counts as causal reductions
against the older f027 mixed-runtime run.

## Next work inside the existing phases and tickets

1. **Phase0 DP-003 / Phase1 DP-103:** retain this matching Dashboard baseline and
   attribute the independently running API and SSR waves. Source inspection shows
   FinanceRoute still awaits finance.book on every route render before starting
   document panels. Two distinct fresh read phases remain; document prefetch alone
   does not remove that dependency or make warm server navigation instant.
2. **Phase1 DP-103 / Phase4 DP-405:** investigate Finance's fresh Membership lock
   plus later Membership/Tenant projection as one joined locked read, following
   the proven Activity scope pattern. Preserve transaction lifetime, current
   Owner/Admin/active business checks, null/error behavior and concurrent
   revocation guarantees. Prove lock retention/release and role/scope equivalence
   before changing this guard shared by commands. Avoid cross-request role caching.
3. **Phase1 DP-102/104 / Phase2 DP-201–204 / Phase4 DP-405:** evaluate a bounded
   Finance route read or independently protected scheduling that reduces the
   Book-before-panels edge and redundant Book payload. Preserve exact query keys,
   admission/refusal erasure, scope/currency changes, mutation invalidation and
   existing command authority. Warm return must retain current authorized content;
   no blanket TTL or cached access decision. This is a candidate, not an approved
   new public API contract or an implemented optimization.
4. **Phase4 DP-407 then DP-409/403:** attribute Activity refresh and return reads
   individually, retaining cursor/grant/subscription freshness. Reports and Orders
   remain subsequent measured priorities; cover all nine families before closure.
5. **Phase3 DP-301–304 / Phase5 DP-501–503:** complete measured delivery/rendering
   work and repeated comparable optimized samples, tab/Back/draft/error/scope/
   revocation journeys and regression budgets. One passing representative sweep
   does not close these obligations. Full program remains3/27 (11.1%).

## QA implementation and verification

The existing optional nine-family pass now records two isolated Finance reads in
`route-families.json` under `diagnosticReads`. No runner, default sweep, service
control, business mutation, API contract or production instrumentation was added.
Only the canonical local Dashboard origin is allowed. The current Book binds the
owed read. Refusal, absent Book or invalid exact-string/top-three summary fails
DP-405 with fixed error text; private bodies/IDs never enter checkpoints. Queries
run outside page timing windows and preserve existing write interception.

- 13 intercepted Chromium driver cases pass, including all18 representatives,
  retained shell, denied/malformed/missing Finance reads, local-only refusal before
  page activity, session/error/readiness failures and payload sentinel erasure.
- Scoped QA source smoke47 tests/195 assertions, QA tooling types and Biome pass.
  This explicitly excludes unrelated Agent Chat/explainer paths. Initial lint found
  a deliberately malformed test's imprecise numeric literal; replaced with the
  equally invalid numeric1, then checks passed. No check was bypassed.
- Matching optimized Dashboard build passes. H02 passes(no gated change); H01 and
  product graph/type/domain evidence from4d6d are reused: no product code changed.
- Trusted local CA doctor passes before and after the window. No TLS bypass.
  Root launcher confirms next dev --turbopack after restoration, all other listener
  identities retained. No schema/migration/API/permission/command change here.

Private evidence root `/tmp/ewatrade-dashboard-program-20261029/`:
`optimized-4d6d-{before,manifests,window,smoke-passed}.json`, build/runtime/smoke
logs, `optimized-4d6d-families/{route-families,performance}.json`,
`dashboard-restored-after-4d6d.log`, and `isolated-finance-{driver,quick-plan,quick,h02}.log`.
Brain BRAIN/task/web-navigation-performance updated locally. This measurement slice
adds no durable architecture or business contract; existing ADRs remain applicable.
