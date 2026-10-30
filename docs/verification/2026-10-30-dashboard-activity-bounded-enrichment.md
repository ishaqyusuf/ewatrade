# Activity bounded enrichment and read projection

30 October 2026. Source investigation parent `709d2269c`; current primary checkout.
Unrelated documentation-only `af36359d7` landed before the final focused smoke.
Contributes to DP-003/103/407. Full six-phase program stays **3/27 accepted
(11.1%)**. No deployment or whole-family performance acceptance.

## Findings and implementation

The existing list joined presentation objects before applying its page limit.
The red PostgreSQL plan assertion observes1,004 enriched rows for a two-item page,
expected at most3. The candidate page now applies all existing access/filter/
snapshot/cursor/order predicates and limit+1 before the one-to-one presentation
joins. Person search and unknown-person predicates retain the actor joins before
the bound. Exact count retains those same filters and ignores the cursor as before;
the empty-page sentinel and total remain. Count omits unused presentation joins.

The common raw projection now selects11 event fields plus9 presentation aliases,
rather than every event column. It serves Activity list/detail and the existing
notification inbox presenter; inbox commands, eligibility and transaction ownership
are unchanged. Unused source hashes, keys and command metadata stay in the database.
Internal candidate/source rows still carry all authority and join fields. Exact
money still comes from the unchanged canonical payload presenter.

Midday reference: `packages/db/src/queries/transactions.ts` orders and bounds its
query before mapping fetched rows. This adaptation keeps EwaTrade's current
Membership lock, RepeatableRead owners, Tenant/Store/Finance authority and tuple
cursor contract. No schema/index, cache, freshness, dependency, API DTO or UI change.

## Evidence

- Two red signals: enrichment exceeds the page bound; unused metadata crosses
  the raw read boundary. Final inert PostgreSQL29 tests/472 assertions pass,
  including search, departed actors, current/unavailable links, empty/exhausted
  pages, exact large signed money, refusal, scope changes and list/detail parity.
- Native PostgreSQL compares the complete old/new public output68 times across
  Owner/scoped Cashier, eight filter/sort/target cases, first/next pages and
  0/2,000/10,000 recorded events. Only independently sampled snapshot timestamps
  are normalized. All match. Existing concurrency/lock evidence is reused because
  admission and transaction code are byte-identical, not newly concurrency-tested.
- For limit25, the final native plans bound presentation enrichment to26 rows
  versus1,004/1,668 rows per reported loop in the larger old plans. Exact-count and
  source scans remain. Buffer hits719/719 and4,539/4,499(old/new), no temp spill.
  Execution7.609/5.810ms and33.142/39.610ms: the largest sample is slower. This is
  structural work-bound evidence, not a consistent SQL latency improvement.
- Actual existing local QA Owner reads are guarded by the selected local profile,
  active QA Tenant/member checks and one RepeatableRead snapshot, then rolled back.
  No application fixtures/writes. Numeric plans only; no retained SQL, conditions,
  parameters, actor/Tenant IDs or private response bodies. Cold server planning
 108.468ms/execution13.624ms; warmed old/new plans4.449/4.063ms planning and
 1.427/1.760ms execution. Cold/warm differences do not establish a causal speedup.
- Same-snapshot existing-data public output matches.19 raw rows36→21 columns
  (including total),24,700→16,046 decoded JSON bytes,35.0% fewer. One raw read pair
 415.1→211.6ms is variable transport/driver-inclusive timing, not a payload-only
  speedup claim. Browser DTO and its byte count remain unchanged.
- Canonical presenter/conditions, list admission/cursor setup and output/transaction/
  detail wrapper source are byte-identical. Compiled shared join text/values match
  the parent. Scope/source/filters, notification reader/commands, router/UI untouched.
- Owned DB/test types, API application-source types and Dashboard types pass.
  Full API typecheck has five unrelated fixture diagnostics: two customer-allocation,
  two product-share and one customer-ledger input fixture. No owned diagnostics;
  whole-API green is not claimed. Explicit two-owned-path fast plan/check passes
 237 tests/1,533 assertions plus QA tooling types/Biome. Foreign files excluded.
  H01 evidence reused: capability/handler/manifest inputs unchanged. H02 reviewed.
- Native fixture database `activity_page_bound_20261030_c41d28` removed; absence
  count0. Owned socket-only PostgreSQL cluster stopped. No application API restart.

Private numeric evidence under `/tmp/ewatrade-dashboard-program-20261029/`:
`activity-page-plan-before.json`, `activity-page-bound-local-plans.json`,
`activity-page-bound-raw-{before,after}.json`, focused/native/quick/type logs and
`activity-page-bound-window.json`. Raw byte counts describe decoded database rows,
not protocol bytes or browser savings.

## Approved optimized Dashboard-only window

Reused preserved frontend artifact `b636ec94a`, Next16.4.3 BUILD_ID
`9_xXHBCwpx3JFUo5UurJb`, with the separately running updated hot API. This is not a
newly built full-stack candidate or release identity; `runtimeVerified:false`.
Six owned source hashes, lock and four optimized manifests stayed fixed.

First smoke stopped at login with the QA entry absent; no measurements. Subsequent
QA capability and HTTP200 checks passed without a policy/config change. Retry
completed all18 representative readiness actions, isolated Activity GETs and the
ordinary login/catalog/sale-draft/cancel journey. The overall receipt was then
invalidated by unrelated checkout changes; **it is not passing smoke evidence**.
Two unrelated untracked assistant-response documents present before the run were
absent afterward; this work did not alter them. Frozen owned source/manifests/lock
match. Diagnostics remain individual observations, not accepted runtime qualification.

| Family | Refresh | Warm return |
| --- | ---: | ---: |
| Overview |2197ms |1075ms |
| Catalog |1378ms |817ms |
| Orders |2042ms |816ms |
| Customers |1032ms |1317ms |
| Finance |3233ms |2329ms |
| Website requests |2476ms |813ms |
| Activity |3654ms |2600ms |
| General |991ms |1322ms |
| Reports |1843ms |814ms |

Single samples, including driver overhead. No p95, CWV, full-family or causal
page-speed claim. Activity refresh remains slow and slightly exceeds the prior
3513ms observation, while return is lower than the prior4615ms.

Isolated filters1772ms/list1804ms; both SQL8, pool0.1ms. List context652.4ms,
admission260.8ms, page SQL219.3ms, transaction-control643.1ms(3 operations).
Previous list2143ms/page SQL531.7ms; this pair is not a percentile or controlled
transport attribution. Nested phases cannot be summed. Most residual time is
outside the warmed server plan: inspect request/transaction round trips and the
server-to-client startup edge before indexes or wider caching.

Optimized listener5282 was stopped after measurement; Dashboard development was
restored through the root launcher. API48226, Storefront46668 and Marketing90981
remain running. Trusted-CA doctor passes; preserved optimized manifests and
Dashboard config/type reference files remain unchanged. No TLS bypass or deployment.

After restoration, focused canonical existing-data smoke passes in development:
2026-10-30T10:04:40.403Z–10:05:16.922Z, checkout `af36359d7`; the complete passed
receipt is preserved as `activity-page-bound-local-smoke-passed.json`.
The four ordinary navigation samples,
draft cancel and two isolated GETs complete with frozen owned source. Filters1740ms/
list1806ms, list page SQL237.1ms, SQL8 each. This is valid local development evidence,
`runtimeVerified:false`, and does not repair the invalid optimized receipt or certify
page budgets. No broad-family rerun to select favorable numbers.

## Brain impact and remaining acceptance

Updated local Brain current pointers, Activity feature and page/count ADR. Public
contracts and permission semantics did not change; no schema/migration update.
Current program records these source/diagnostic results without closing another
ticket. Next: initial Activity loading ownership, request/control latency, then
the remaining family/lifecycle/interaction and comparable optimized acceptance.
