# Activity read attribution — 30 October 2026

Source parent `51e6854a7`; local implementation and testing only. Full program
**3/27 accepted (11.1%)**. This supplies DP-003/103/407 attribution, not optimized
page-speed acceptance or deployment qualification.

## Implementation

The prior trace exposed total SQL work but could not distinguish current Activity
scope, Store selection, projection and transaction-control work. Four red cases
reproduce missing domain/control phases and parser support.

The existing default-off tracing now allows seven fixed numeric phases:
`activityAdmission`, `activityStores`, `activityPageSql`, `activityFilterSql`,
`activityList`, `activityFilters`, `transactionSql`. Domain wrappers measure the
existing operations without changing their inputs, SQL, ordering or results.
The two overall read phases include the existing transaction lifetime; admission
includes the Membership row-lock statement. Neither reports pure lock wait.

The existing pg instrumentation recognizes transaction-control statements and
adds a nested numeric duration/count without changing the query, callback or
Promise. This is elapsed statement time, not pure network time. Installed
adapter-pg starts with BEGIN then SET TRANSACTION ISOLATION LEVEL, and commits
after the callback. No adapter override, isolation change or command shortcut.

Existing trace privacy/default-off behavior remains: fixed labels, numeric counts
and durations only. No SQL, parameters, actor/business/Store IDs, payloads, private
errors or headers enter these measurements. Phases overlap; do not sum all fields.

The existing QA runner gains an optional local-only two-GET diagnostic, documented
in `docs/testing.md`. It reads current `activity.filters` then `activity.listPage`
with a fixed seven-day UTC window and25-item limit. It deliberately does not claim
the UI's timezone/date-filter behavior. Only status, elapsed time, decoded response
bytes and allowlisted phases leave the page. Refusal/malformed results, missing
current domain phases or transaction timing fail the probe. No new runner or
provider integration. Ordinary smoke and Preview behavior remain unchanged.

## Verification

-42 focused cases/541 assertions pass: real Activity SQL/paging/scope/legacy,
  actual pool callback/Promise/release/error semantics, request isolation,
  fixed-only header formatting/parsing, default-off Hono headers and stream lifetime.
- The actual production read entrypoints record expected scope/projection/overall
  phases while returning the same results. Refused access/cursors do not start
  Store/projection work beyond their existing boundaries. Trace serialization
  excludes fixture actor/business/private values.
- Intercepted Chromium driver:17 cases pass, including all four new valid/refused/
  malformed/missing-trace diagnostic cases and foreign-origin refusal. One existing
  login/draft fixture times out; focused retry passes in2.04s. Evidence is combined,
  not an18-pass single run. The initial driver command used the wrong browser cache;
  retry uses the repository's installed QA Chromium, with no download.
- Initial QA tooling type failure for a test array was corrected. DB/owned tests,
  API production graph and Dashboard types pass. Scoped owned-file fast check:
  237 tests/1533 assertions plus QA tooling types/Biome pass; foreign staged
  explainers and AGENT_CHAT excluded.
- Tracing-only AST normalization proves unchanged domain queries, authority,
  conditions, transaction options and DTOs. Scope-member/source/router/UI byte
  parity passes. Existing native SQL/lock evidence from the preceding slices is
  reused; no data-query or locking semantic change.
- Reviewed H02 passes. H01 from the preceding admission slice reused: no handler,
  manifest, capability/procedure or coverage source change; no assistant promotion.

## Focused local result

Canonical existing-data smoke passed2026-10-30T08:40:43.426Z–08:41:21.109Z.
Eleven owned source/test/QA hashes and lock were frozen and match through the
receipt; the passed receipt was copied before documentation edits. Existing
development runtime only, `runtimeVerified:false`; complete API revision remains
uncertified. Successful new phase counts specifically prove current trace wiring.

Existing QA Owner/data, populated Catalog and cancelled sale draft; four Overview/
Catalog navigation samples and order/stock sheets opened/cancelled. No nine-family
sweep, fixtures, money, grants, messages or provider effects. The two additional
GETs run outside navigation observations and send no business mutation.

| Measurement | Filters | List page |
| --- | ---: | ---: |
| Browser-observed isolated read | 2072ms | 2346ms |
| API request | 2034.4ms | 2327.9ms |
| Context | 696.7ms | 668.6ms |
| Whole domain transaction | 1335.2ms | 1655.6ms |
| Transaction-control SQL,3 calls | 657.0ms | 657.1ms |
| Current admission SQL | 216.0ms | 220.1ms |
| Store read | 221.6ms | 216.0ms |
| Page/filter projection | 238.3ms | 533.9ms |
| Pool checkout accumulated | 0.1ms | 0.2ms |
| SQL count | 9 | 9 |
| Decoded response bytes | 15264 | 14074 |

Auth228.7/231.3ms, QA proof245.9/217.4ms, cookie scope222.0/219.6ms. Context plus
whole domain read explains nearly all request time; their nested phases must not
be added again. Serialization1.2/0.5ms. Client pool waiting is negligible in these
samples. Transaction/control and several independent reads each take roughly
0.22s, consistent with substantial database/transport round-trip cost; this does
not distinguish network from server waiting/compute. The page projection's extra
time is unresolved and needs its actual scoped plan before a query rewrite.

Next safe source candidate: combine the current locked admission and Store
projection inside the existing RepeatableRead owner, retaining all current role,
assignment, plan and cursor rules. This targets one measured serial operation per
read; it does not remove the transaction or authorize a driver/library shortcut.
Then inspect actual list plans and the server-to-client startup edge. Frontend
render changes alone cannot remove these measured isolated API waits. No p95,
causal page-speed, remote-provider/region or global budget conclusion from one pair.

No service restart or Dashboard mode switch. Current API48226, Dashboard55140,
Storefront46668 and Marketing90981 match their last confirmed listeners. Trusted-CA
doctor passes afterward; no TLS bypass or deployment.

Private evidence root `/tmp/ewatrade-dashboard-program-20261029/`:
`activity-trace-{red,tests,db-types,api-types,dashboard-types,quick-plan,quick,driver,
driver-retry,h02,smoke,doctor-before,doctor-after}.log`,
`activity-trace-{window,smoke-passed,parity}.json`,
`activity-trace-reads/{activity-reads,performance}.json` and synthetic driver debug
output. Brain current/feature/API/privacy and attribution ADR updated locally.
