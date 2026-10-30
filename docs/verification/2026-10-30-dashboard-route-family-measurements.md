# Dashboard route-family measurement coverage — 30 October 2026

Local DP-003/502 tooling slice; parent6b197848. Full program remains3/27 (11.1%).
No product/runtime source, provider configuration or deployment changes. Current
optimized f027263c stays prepared, with its timing/restoration request pending.

## Change

The existing QA performance mode covered only Catalog refresh and Catalog/Overview
transitions. Add the optional QA_WEB_ROUTE_FAMILIES=true flag to the same local
qa:smoke command, requiring QA_WEB_NAVIGATION_ARTIFACTS and the canonical local
Dashboard origin before page activity. Ordinary smoke and Preview stay unchanged.
No new runner, service launcher, account, stored business fixture or command.

Nine fixed read-only entries map to DP-401–409. Each has one full refresh and one
warm return after navigating away, with existing request-count/byte/phase summaries.
The shell must retain identity both leaving and returning via sidebar links.
Headers alone are insufficient: current row/summary/panel/list/region/headline
boundaries are inspected in the actual source and used for representative readiness.
Finance needs its existing book/panels; requests/activity may use healthy empty
states. Visible main-content errors, redirects or unavailable targets fail.

Checkpoint route-families.json records running/passed/failed plus fixed current
family/phase and prior successful samples. A failed/incomplete pass cannot imply
nine-family acceptance. Labels are fixed; no query strings, row/contact/account
values, credentials, response bodies or raw error text are retained. Browser
request observation excludes server-to-server work and counts only requests begun
inside its action window; background/prefetch work may overlap and incomplete
requests/bytes remain explicit. Phase work is not additive wall time.

These are action-to-representative-content measurements with driver overhead, not
Web Vitals or p95. They do not measure all subroutes, commands, tables/charts,
Back/filters/drafts/deep links or authority changes. No numeric budget acceptance
is added before a comparable pinned optimized baseline exists. Product f027263c
is unchanged by these QA scripts, so its prepared timing request stays current.

## Verification

The existing Chromium driver now passes10 checks: the three retained privacy/
ordinary-smoke/write-blocking cases and seven new family/readiness cases. Inert
HTML/transport fixtures exercise all18 samples, header-only customer data, a
visible Finance error with normal content still present, shell replacement on
both departure and return, a session redirect, and pre-navigation local-artifact
guards. Partial failure/checkpoint labels and privacy sentinels are asserted.

This is real Chromium exercising the runner, with intercepted inert page content;
it is not product React/Next rendering, DB/provider or page-speed evidence.
QA tooling types pass. The seven-path owned fast scope selects core only, with
zero unknown mappings;47 tests/195 assertions plus QA tooling types/Biome pass.
This scoped result excludes foreign staged work and does not typecheck/retest
product graphs. Product/API source is unchanged, so current H01 coverage evidence
at f027 is reused; H02 passes with no gated change. Offline doctor and whitespace
checks pass. No optimized runtime switch is inferred.

## Existing-data development run

Frozen canonical local smoke passes02:37:57–02:39:24UTC. Exact QA account,
populated Catalog, sale draft/total and cancellation run through the existing
write-blocking driver. All18 additional family samples and soft shell checks pass;
performance.json contains24 total samples and zero blocked business writes.
Canonical receipt remains runtimeVerified:false; separate family JSON records
passed, not whole-domain or release qualification. One sample per action:

| Representative | Refresh ms | Warm return ms |
| --- | ---: | ---: |
| Overview | 1015 | 2890 |
| Catalog | 1953 | 861 |
| Orders | 2632 | 863 |
| Customers | 4166 | 1405 |
| Finance | 6422 | 2982 |
| Website requests | 3395 | 868 |
| Activity | 5513 | 3693 |
| General settings | 1941 | 1399 |
| Reports | 4346 | 862 |

These are uncontrolled development observations, not a before/after comparison,
optimized budgets or p95. Overview's warm return exceeds its refresh in this run;
cache/compilation/background/actionability effects are not isolated. Each family
hard refresh re-creates its client; warm return follows navigation away. Warm
readiness can use retained current-workspace results while requests continue;
this is not proof that every fresh read has completed.

Finance and Activity are the slowest representatives here. Their completed
browser-visible API work reports73/76 SQL phase calls with15,700.9/16,175.5ms
summed SQL durations, versus3.3/3.4ms pool phases. These aggregate samples include
batches/background work and overlap; they do not attribute statements to one
procedure or add up to page latency. Some windows have no completed API phase
samples; server-to-server reads and late/in-flight work are not zero. Attribute
individual domain reads before changing them. Prioritize DP-405/407 investigation
alongside the pending optimized comparison, preserving mandatory financial/access
freshness. Development script-body observations are not optimized bundle sizes.

Eight tooling/docs/lock hashes match after the frozen run. The four preparedf027
optimized manifests match as well; product source/runtime selection is unchanged.
Private evidence: route-families-{frozen,observations,smoke-passed}.json,
route-families-local/{route-families,performance}.json and existing private images,
route-families-{driver,types,fast,fast-plan,h02,local-smoke}.log. No live business
submission, generated content, export, grant change, fixture, restart or deployment.

Brain updates cover current project/task pointers and navigation performance.
No schema/API/permission/ADR change is needed for optional QA observation. Full
DP-003/502 and the27-ticket program remain open at3/27 accepted (11.1%).
