# Reports cold Stock activation — 30 October 2026

Local DP-103/409 implementation and DP-502 regression evidence under the
[full program](../plans/2026-10-29-dashboard-performance-program.md). Primary
checkout, parent `a8625157`. No deployment, schema, API or business command change.

## Reproduced cause

Service entry correctly avoids unused Stock prefetches. Later Stock activation
called `useSuspenseQuery(reconciliation)` and then `useSuspenseQuery(balances)` in
one component. A cold first hook suspends before the second hook runs. Default
Stock entry hid this dependency because the server already started both reads.

The actual Reports/installed tabs/QueryClient/tRPC fixture first renders Service
with zero Stock operations, then cold Stock while reconciliation is held. Before
the fix it observes only reconciliation: 7 pass/1 fail. This is the actual caller
seam, not a hook mock or an artificial preference-read delay.

The preserved optimized `a8625157` artifact, build `Fp2hx3sRkDaie2XJkSXLj`, confirms
the browser path: reconciliation starts 48.5ms and finishes 993.1ms; balances starts
994.2ms and finishes 2376.1ms. Content is ready at 2884ms. The canonical focused
runner fails its new one-batch guard as expected after recording the two requests.
That receipt is an expected failing baseline, not passing acceptance.

## Change and preserved ownership

The existing Stock owner now uses the installed TanStack `useSuspenseQueries` to
start both independent reads before suspending. They share the current browser
batch/client and its fresh GET admission. Each protected procedure and repository
retains its current authority; no permission result is treated as cached authority.

The exact Store inputs, compatible-total option, query keys, retry/freshness/cache
policy, source DTOs, report arithmetic, selected-tab mounting, local Suspense/error
boundary, download/date/history flow and offline review owner remain unchanged.
Service entry still starts no Stock reads, and warm tab return still uses existing
query entries. No all-tab prefetch, extra API endpoint or custom concurrency layer.

Midday reference: its Customers route batches independent prefetches and composes
query owners under local Suspense boundaries. Its installed reference does not use
this particular hook. EwaTrade's single Stock panel needs both existing results,
so the installed library's parallel Suspense API applies the same independent-work
principle at cold client activation, where route-only prefetch cannot help.

## Regression instrumentation and focused checks

The existing local canonical runner gains `QA_WEB_REPORT_TABS=true`. It reuses QA
login, current account/data, write interception and the existing observer. It records
Reports refresh/return, then opens a fresh Service document before timing a cold
Stock click. Stock content and unchanged shell are required; both exact procedures
must occur once in the same HTTP batch. No arbitrary millisecond threshold.

The observer adds only fixed `stockReconciliation`, `stockBalances` and
`stockReportBatch` numeric labels. It retains no URL, inputs, actor/Store IDs,
response bodies or private headers. These overlapping labels do not count as three
operations. Default full-family and focused Activity journeys are unchanged.

- Actual route/consumer fixture: 8 tests/52 assertions pass after the fix, including
  held reconciliation, exact inputs, no duplicate hydrated or warm-return reads,
  hidden Stock on Service, URL fallback and admission refusals.
- Existing browser-driver suite: 26/26 pass against intercepted inert pages. New
  cases accept a combined Stock batch and reject serial or missing Stock content;
  exact-procedure, foreign-origin/lookalike and sentinel-redaction checks pass.
- Full Dashboard, explicit fixture and QA-tooling type graphs pass. Source quick
  scope passes 237/1533 plus QA types/Biome across 45 smoke files, with seven explicit
  owned paths and no unknown mapping. Foreign Agent Chat/staged explainers excluded.
  The wrapper/fixture checks run separately from fast smoke.
- The preference-ordering hypothesis was rejected: those helpers read existing
  request cookies, without a new DB operation. Fresh Activity proof/scope/locked
  transaction dependencies were inspected and retained; no speculative shortcut.

## Corrected optimized result and restoration

Next 16.4.3 build `zMN4q6wxzuTfj0KPK4a8Y`, parent `a8625157` plus seven frozen
owned source hashes and lock. Required build/type checks pass (compiled 4.2s).
Canonical focused local smoke passes 11:42:27.642Z–11:43:05.575Z, including QA
account selection, populated Catalog, existing sale draft item/total/cancel,
Reports refresh/return and actual Service-to-Stock click. Zero business submissions.

| Observation | Preserved baseline | Corrected candidate |
| --- | ---: | ---: |
| Reports full refresh | 1932ms | 2017ms |
| Reports warm return | 817ms | 832ms |
| Cold Stock activation | 2884ms | 1874ms |
| Stock HTTP reads | 2 separate | 1 batch containing 2 procedures |
| Reconciliation request starts | 48.5ms | 52.2ms |
| Balances request starts | 994.2ms | 52.2ms |

The corrected batch receives headers at 764.4ms and finishes at 1421.8ms.
Both fixed procedure labels refer to that same request, not separately timed body
results. These are single content-readiness samples, not p95, CWV or a dashboard-wide
ratio. The structural finding is the removed request/context wave; refresh/return
measurements are similar and do not establish other budgets. Baseline receipt fails
its new batch guard as expected; corrected receipt passes. Both are retained.

Source/lock/four manifests match through the copied passing receipt and after
restoration. Baseline Dashboard 30258 and corrected 31074 were stopped at their
respective window ends; development restored through the root launcher between
builds and at completion. API 48226, Storefront 46668 and Marketing 90981 stayed
unchanged. Original generated type references/app config are restored; trusted-CA
doctor passes. `runtimeVerified:false`: local evidence, no release/deployment.

H01 coverage inputs unchanged; valid evidence reused. H02 passes one client record,
zero capability/procedure deltas. No current API, DB or auth source delta.

## DP-103 acceptance audit

The shared critical-path scheduling requirement is now accepted. The original
criterion is unchanged: overlap independent settings, summary and repository work,
trim projections, measure serial work removal, retain bounds and authority.

| Requirement | Current implementation and authoritative proof |
| --- | --- |
| Independent settings/summary work | Channels has independent approval/settings owners after their required admission; its actual mounted 16/109 proof and [section receipt](2026-10-29-dashboard-section-loading.md) remain valid. Overview presence and Order scope start together; [actual Flight proof](2026-10-30-dashboard-overview-streaming.md) retains their necessary private-data dependencies. |
| Independent repository scheduling | Finance's three protected Overview reads start beside Book metadata, bind only admitted Book IDs and preserve bounded current-mode inputs. [Mounted/transport/SQL evidence](2026-10-30-dashboard-finance-independent-prefetch.md) covers hold, mismatch, refusal, cancellation and exact canonical outputs. Current Finance owners are byte-identical to that verified product commit. |
| Narrow bounded projections | [Activity enrichment](2026-10-30-dashboard-activity-bounded-enrichment.md) bounds presentation to limit+1 with exact native output parity and 35% less decoded raw row data. Current read/scope/filter source matches `5518bde5a`; canonical plan resolver is unchanged. Larger server timing was slower, so structural bounds are the accepted finding. |
| Measured shared serial read removal | [Workspace/plan projection](2026-10-30-dashboard-workspace-plan.md) proves real SQL2→1 and exact output in one existing-data snapshot, policy/error/Store parity and current optimized shell behavior. The cold Stock regression additionally reproduces/removes its request wave in the actual caller and optimized browser. |
| Transaction and authorization invariants | No API/DB/auth source changes in this slice. Finance fresh locked snapshots, Activity Membership lock/RepeatableRead, proof, role, Store/plan and command admission retain their previously verified source. The earlier ReadCommitted proposal and ineffective code-warming experiments were removed. No TTL or cached authority substitutes for these checks. |

Program acceptance becomes **4/27 (14.8%)**: DP-001, DP-002, DP-101 and DP-103.
DP-003 budgets, DP-102 hydration, DP-104 loading ownership, lifecycle/delivery,
all nine domain tickets and final regression/behavior acceptance remain open.
This is the shared-boot ticket's criterion-level acceptance; per-family coverage
continues under the unchanged domain requirements. No full-goal completion claim.

Private evidence: `/tmp/ewatrade-dashboard-program-20261029/report-stock-*`:
red/green/driver/type/quick/build logs, fixed numeric baseline/candidate timelines,
frozen source/lock/manifests, copied canonical receipts and restoration records.
Baseline application source intentionally differs from the dirty corrected source;
its preserved artifact identity is explicit. No release/runtime qualification.

Brain feature, QA, task and BRAIN pointers updated locally. No public API/permission,
schema or durable architecture change, so no schema/API document, migration or new
ADR is required. Broader Reports, query-lifecycle, latency and program acceptance
remain separate requirements.
