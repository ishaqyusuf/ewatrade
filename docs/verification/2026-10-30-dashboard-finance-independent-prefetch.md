# Independent Finance Overview document reads —30 October 2026

Source parent6423eda88. Local DP-102/103/405 slice, full program3/27 accepted.
Matching optimized runtime verification passed and development mode is restored.
No deployment, schema/index/migration or financial command change.

## Problem and change

The optimized4d6d baseline measured Finance5335ms refresh/2834ms warm return.
A red actual-route reproduction holds Book metadata and observes only finance.book;
none of the panels start. The existing document prefetch began after that read,
leaving a full API/context/Book wave ahead of all three panels.

On Overview documents, Book and three independently protected current-Book reads
now start together through the existing render-owned tRPC client. Each current
read resolves the current currency Book inside its own existing guarded snapshot
transaction. No separate lookup, cross-request authority cache, aggregate endpoint
or combined all-panel response is introduced. The real streaming transport proof
shows one HTTP batch/context, one legal/Tenant admission, and panel completion
while Book metadata is still held.

The route still awaits its canonical Book admission. Only after that succeeds may
an early response populate the canonical Book-ID query key, and only when its
resolvedBookId matches. A mismatched identity or missing-current-Book race takes
one canonical Book-ID fallback. A scope/plan/other failure remains local and is
not turned into a fallback. Missing/refused Book cancels unused pending reads and
never hydrates panel data. No currency-based query cache is created.

The actual Workspace/Overview consumers, cache keys, stale/retry/refusal policy,
mutation invalidation and other Finance views remain unchanged. Soft navigation
retains browser panel ownership and avoids three redundant server reads. A cold
soft visit retains its existing behavior. This change removes the document-start
dependency; it does not bypass the warm navigation Book gate.

## API and data contract

Only finance.balances, finance.owedSummary and finance.bills add a strict alternative
to their existing Book-ID inputs: {currentCurrency}. For bills this bounded mode
requires limit5 and rejects filters/Store/cursor overrides. The cursor field allows
only absent/undefined in that branch so tRPC retains the existing legacy infinite
reader's type surface; real cursor strings in current mode are rejected.

Fresh server-derived actor/business/Owner/Admin/plan admission still runs for every
query. The repository compares the requested currency with its fresh guarded Tenant
snapshot and rejects a mismatch before selecting a Book or reading money. Its
current selector is Tenant+currency, using the existing unique Book scope. Legacy
Book-ID reads retain their historical-currency semantics. New mode alone adds
resolvedBookId; legacy response objects remain unchanged, including no metadata
property. The server uses the returned identity before seeding existing keys.

Canonical transaction controls, Membership locks, exact money/projection/snapshot
arithmetic, expense pagination/summaries/receipt counts and command paths remain.
No new procedure/tool/capability/permission grant or assistant availability. Existing
assistant tool inputs still require exact Book IDs; general bill tests and the
unchanged tool adapter confirm that path. Current-mode reads may begin for a
business with no Book; these are bounded authorized reads, cancelled/discarded on
missing Book and never used to render setup-state financial data.

## Focused verification

- Red route:15 pass/1 fail; held Book prevented all three panels starting.
- Twenty mounted actual route/Workspace/Overview cases,100 assertions pass. Startup
  concurrency, independent pending/error states, no duplicate browser read, role/
  session refusal, no unused work in five other views, retained returns, exact
  invalidation/refused-payload erasure, same-currency Book-ID mismatch, currency
  race fallback and cancellation on missing/refused Book are covered.
- Seven real tRPC/Hono/server transport cases,52 assertions pass. The added case
  proves one render-owned batch/context/authority read and canonical hydration
  without another fetch; existing owner isolation, streaming, refusal and abort
  cases remain. The transport fixture does not replace real Finance policy tests.
- Nineteen balance/owed actual-reader/PGlite and spending contract cases,275
  assertions pass. Current and canonical outputs match, exact huge amounts remain,
  legacy metadata stays absent, stale currency stops before Book/projection work.
- Fifteen actual Finance-router/schema/legacy money-read cases,82 assertions pass.
  Strict alternatives, cursor/filter/authority/ambiguous-input rejection, current
  Actor/Tenant binding and Owner/Admin/Free-plan gates are checked. Two unchanged
  assistant bill-tool cases pass; model input remains exact Book-ID only.
- DB graph, API production/owned-test graph, mounted fixture graph and full Dashboard
  TypeScript pass. Broad types exposed a legacy infinite-list compatibility issue;
  the cursorless branch now retains the necessary type field while rejecting real
  pagination input. No type assertion or disabled check bypassed the failure.
- Scoped fast source checks237/1533+QA tooling types/Biome pass. One test formatter
  drift was fixed before the successful check. Foreign Agent Chat/explainer paths
  are excluded. H01 is current. H02/evidence record accompanies this slice.
- Fourteen intercepted Chromium driver cases pass. The existing optional isolated
  Finance probe now verifies current-mode resolved identity without persisting IDs,
  currency, bodies, names, amounts or raw headers. Refusal/malformed/missing/
  mismatched Book cases fail DP-405. No new runner or default live sweep.

## Matching optimized runtime and restoration

The approved Dashboard-only window passed 2026-10-30T05:09:04.288Z–2026-10-30T05:10:20.160Z.
Compiled source is parent6423eda88 plus17 frozen owned product/QA hashes; final
commit identity is recorded after this receipt. Next16.4.3, BUILD_ID
`9_xXHBCwpx3JFUo5UurJb`. Four manifests, lock, source hashes and development type
references match before/after execution. Generated next-env was restored exactly;
the earlier4d6d optimized files are privately archived. Foreign changes preserved.

All18 representative content-readiness actions pass, retained shell on soft
navigation, zero blocked business writes, existing sale draft cancelled and order/
stock sheets opened/cancelled. Existing QA Owner/data only; no fixture manufacture,
role/grant changes, messages, money effects or provider actions. RuntimeVerified
remains false: this is a manually identified local build, not deployment identity.
The separately running hot API's whole revision is uncertified; the successful
current-mode identity probe specifically verifies the new wire contract.

| Representative | Refresh | Warm return |
| --- | ---: | ---: |
| Overview | 2088ms | 1042ms |
| Catalog | 1582ms | 820ms |
| Orders | 2252ms | 815ms |
| Customers | 976ms | 1317ms |
| Finance | 3414ms | 2847ms |
| Website requests | 2496ms | 820ms |
| Activity | 3496ms | 3113ms |
| General | 1074ms | 1318ms |
| Reports | 2338ms | 818ms |

Finance refresh3414ms compares with5335ms in the previous4d6d sample:1921ms/about36.0%
lower in these observations. The new candidate also includes the previous6423
snapshot-guard change, and network/other-runtime variation remains. This is not
isolated causal attribution, p95, Core Web Vitals or budget acceptance. The actual
transport proof independently demonstrates removal of the Book-before-panel wave.
Warm Finance2847ms versus2834ms is effectively unchanged, consistent with keeping
the mandatory metadata gate on soft navigation. Activity3496/3113ms remains slow.

Isolated Book read1963ms/9SQL, context646.6ms, pool0.1ms, decoded JSON9149 bytes.
Current-mode owed summary2180ms/10SQL, context639.7ms, pool0.1ms, decoded JSON557
bytes; resolved identity matches Book. Its SQL count is consistent with the earlier
snapshot guard reduction, not a revision certificate. These two probes run outside
page timing windows and do not describe whole SSR work. Phases overlap; decoded
bytes are not compressed wire bytes. No private values are retained.

Dashboard listener changed36296(dev)→43134(optimized)→43803(dev). API48226,
Storefront46668 and Marketing90981 remained. Existing root dev launcher restored
Dashboard only; next dev --turbopack and trusted-CA doctor pass afterward. No TLS
bypass, application API restart, deployment or provider action.17 frozen hashes,
optimized manifests, lock and development references still match after restore.

Remaining work: warm metadata/context cost, bounded spending projections, Activity
attribution and the full existing27-ticket program.3/27 (11.1%) remains accepted;
this verified source/runtime slice does not close a whole family or budget ticket.

Private evidence root /tmp/ewatrade-dashboard-program-20261029/:
finance-independent-{red,mounted,transport,db-tests,api-tests,assistant-tests,
mounted-types,db-types,api-tests-types,dashboard-types,quick-plan,quick,h01,h02,driver,
build,runtime,smoke,doctor-before,doctor-after}.log;
finance-independent-{build-before,manifests,window,smoke-passed}.json;
finance-independent-families/{route-families,performance}.json and
dashboard-restored-after-independent-finance.log. The passed canonical receipt
was copied before editing this report. Sources stayed frozen during smoke.

Brain feature/API/permission/task/index and the independent-prefetch ADR updated
locally. Existing UI/Workshop design, service/provider and release boundaries remain.
