# Dashboard performance program

## Bounded Finance owed summary — DP-103/405, 30 October 2026

- [x] Reproduce four projection operations and complete directory/balance decoding
  for a panel that displays totals and three names.
- [x] Replace with one grouped projection, retaining current role/Book/lock/snapshot
  controls and exact independent customer/supplier sequence arithmetic.
- [x]12 cases/133 assertions,27 scope/sequence combinations and full currency,
  error/refusal/binding/fresh/tie checks pass. DB/API/Dashboard types and parity pass.
- [x] Generated-Prisma/canonical-helper synthetic comparison at10k/5k target scope:
  equal summaries, decoded rows30,000→2, warm buffer hits190,976→1,635. Small-scope
  check also stays indexed and equivalent. No new index/schema or provider change.

Scoped fast237/1533+QA types/Biome, H01/H02 and source/control parity pass.
[Receipt](../verification/2026-10-30-dashboard-finance-owed-summary.md). Counts/sums cover the whole scope; ties
now use stable IDs. Unchanged e053 UI evidence reused; browser/optimized speedup
and full DP-405 remain open. Full program3/27; prepared f027 excludes this source.

## Finance Overview document scheduling — DP-102/103/405, 30 October 2026

- [x] Reproduce browser-only panel startup after Book hydration.
- [x] Start the three visible Overview reads on document loads and hydrate their
  pending results into the unchanged consumers; do not await the panels.
- [x] Preserve soft-return cache ownership and cold-soft-visit behavior; all five
  other Finance views retain their selected reads.
- [x] Fifteen mounted cases/76 assertions, Dashboard/fixture types, installed
  Next header and authority/consumer/cache/invalidation parity pass.

[Receipt](../verification/2026-10-30-dashboard-finance-overview-prefetch.md). The canonical invalidation and refused
panel erasure remain. No cache/API/schema/permission/command/UI-design change.
Scoped fast237/1533+QA types/Biome, H02 and final frozen local smoke pass; unchanged
H01 evidence reused. All18 family samples/retained shell/zero writes pass, runtime
unverified. Finance dev5578ms refresh/2881ms return remains slow. Middleware
overrides forged scheduling hints and preserves auth/privacy/forwarding.
This is earlier document-read scheduling, not a measured speedup or whole-ticket
acceptance. Full program 3/27; prepared f027 excludes this source; local only.

## Remembered-business age projection — DP-103/201,30October2026

- [x] Reproduce a separate User read after actual GET preference admission.
- [x] Project the canonical age band in that admission query and reuse it lazily
  only inside the existing exact DB/actor HTTP GET owner.
- [x] Preserve age-before-protected-Tenant refusal, POST/mutation freshness and
  all explicit-header/fallback/new-request/foreign-owner paths.
- [x]16 tests/90 assertions, actual compiled one-statement SQL/PostgreSQL scope
  proof, API/fixture/Dashboard types and downstream policy parity pass.

[Receipt](../verification/2026-10-30-dashboard-preference-age-projection.md). Scoped
fast237/1533+QA types/Biome, H01/H02 and frozen local smoke pass (runtime unverified).
One observed API read emits legalReuse1/SQL5. Dev refresh3239ms/warm1441ms are not
causal/optimized proof. One later read is removed, not the whole
session-context sequence. Browser speedup/optimized acceptance remains open; full
program3/27. No schema, service restart or deployment.

## Optimized runtime measured and restored — DP-003/103/502,30October2026

- [x] Serve the pinnedf027 optimized Dashboard, run canonical existing-data smoke,
  measure18 fixed-family refresh/warm-return actions, restore development mode.
- [x] Four manifest hashes match; API/Storefront/Marketing listeners unchanged.
- [x] Retained shell, zero business writes and ordinary draft cancellation pass.

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

Initial post-login shell5692ms; first separate Catalog refresh3252ms. One sample
per action, no causal/p95/Production claim. Checkout91c6c812; compiled Dashboard
f027 excludes later Finance/Activity source; separate hot API revision unverified.
[Receipt](../verification/2026-10-30-dashboard-optimized-route-family-timings.md). Full program3/27 unchanged.


## Activity scope projection — DP-103/407,30October2026

- [x] Combine the existing fresh Membership lock and scope facts into one query;
  scope resolution uses two operations instead of three.
- [x] Preserve role/Store/Finance rules, transaction, subscription and cursor facts.
  Actual PostgreSQL lock retention/release and84 access combinations pass.
- [x] Nine focused scope/legacy cases,313 assertions; DB/API/Dashboard types and
  downstream/caller/policy parity pass.

[Receipt](../verification/2026-10-30-dashboard-activity-scope-projection.md). No cache, schema, public API or permission
change. Preparedf027 excludes this source; browser/optimized Activity acceptance
remains open. Full program3/27; no service restart or deployment for this slice.

## Finance account projection — DP-103/405,30October2026

- [x] Actual reader reproduces three projection statements on one transaction
  connection; replace with one current conditional aggregate SELECT.
- [x] Preserve fresh authority/Book/lock/snapshot, all scalar metadata and exact
  account/month amounts. Six projection cases plus five journal-rule cases pass.
- [x]36 Book/snapshot/month combinations match the three-read reference; synthetic
  150k-entry/300k-line plans return identical rows with7505→4006 buffer hits.

[Receipt](../verification/2026-10-30-dashboard-finance-balance-projection.md).
This removes two statements, not a connection checkout or financial freshness.
Browser/optimized timing remains open; preparedf027 excludes this new source.
Owned DB/API/Dashboard types, scoped fast237/1533+QA types/Biome, H01/H02 and
control/DTO/other-reader parity pass. Full program remains3/27; no schema/index,
service restart or deployment.

## Nine-family measurement coverage — DP-003/502,30October2026

- [x] Extend the existing optional local QA performance pass to fixed DP-401–409
  representatives: full refresh, warm return and retained shell on departure/return.
- [x] Record18 content-readiness samples plus partial failure checkpoints; headers,
  visible errors, redirects and replaced shells cannot produce full acceptance.
- [x] Ten existing-driver Chromium fixture checks and QA types pass. Ordinary
  smoke/Preview and prepared product f027263c stay unchanged.

[Receipt](../verification/2026-10-30-dashboard-route-family-measurements.md).
Frozen existing-data development smoke passes all18 family samples and zero
business writes; source/lock hashes and preparedf027 manifests match. Finance/
Activity refresh6422/5513ms and warm2982/3693ms lead the next attribution work.
Owned fast47/195+QA types/Biome and H02 pass; unchanged H01 evidence reused.
This adds measurement coverage, not numeric budgets or domain acceptance. Full
program remains3/27 (11.1%); subsequent f027 optimized timings are linked above.

## Current optimized candidate — DP-003/502,30October2026

- [x] Full optimized build at product source f027263c passes compile/types/75
  page entries/final optimization; four manifests and source/lock identity pinned.
- [x] Prior9eb8 runtime archived with matching manifests; dev references and
  both dev type hashes restored/matching. Current relevant source remains clean.
- [x] Dashboard-only serve/timing/restore completed in the later linked runtime
  receipt. API/other services retained their listeners; development mode restored.

[Build receipt](../verification/2026-10-30-dashboard-optimized-candidate-f027.md).
Current root optimized output is f027263c; earlier “prepared9eb8” entries are
historical milestone evidence. This build includes the accumulated source but
was subsequently served/timed and development restored. Full program remains3/27
(11.1%); no deployment.

## Customer-book independent reads — DP-103/404,30October2026

- [x] Actual reader regression reproduces saved Customers waiting unnecessarily
  for Order projection; own-sales exclusion is retained.
- [x] Overlap only these two existing reads; preserve current scope, SQL/select,
  matching/totals, merge dependency and downstream balance ownership.
- [x] Nine inert cases/26 assertions pass, including failures and contact precedence.

[Receipt](../verification/2026-10-30-dashboard-customer-book-scheduling.md).
This removes a serial edge, not a read or payload. The existing unbounded customer
book remains DP-404 work; no browser or optimized latency acceptance claimed.
Owned DB/Dashboard types, scoped fast237/1533+QA types/Biome, H01/H02 and
AST/loader parity pass. Full program remains3/27; no service restart or deployment.


## Submenu speculation budget — DP-103/501,30October2026

- [x] Actual Chromium/Next Link registry reproduces nine Full child tasks when
  Settings opens before destination intent, plus15 automatic parent tasks.
- [x] Child-only IntentLink enables warming on hover/focus/touch and retains
  native navigation, cancellation, href ownership and caller handlers.
- [x] Eleven browser cases/52 assertions pass; four groups expand with zero
  Full child tasks and unchanged automatic parent positive control.

[Receipt](../verification/2026-10-30-dashboard-menu-prefetch.md). This bounds
optimized speculation; installed Next already disables development prefetch.
No page-speed, HTTP/SQL count or whole-ticket acceptance claim. Midday also
explicitly prefetches children; this is an evidence-based adaptation. Dashboard/
owned types, browser entry, scoped fast237/1533+QA types/Biome, H01/H02 and frozen
canonical local smoke pass (runtime unverified). Full program stays3/27.
Prepared9eb8 remains separate; no service restart or deployment.

## Inbox/queue refused-read intervals — DP-201/204/406,30October2026

- [x] Actual mounted owners reproduce12 refused-interval failures at P17/P25–27.
  Healthy tab proof confirms one selected list and required fresh return.
- [x] Reuse the shared guard at all four sites, preserving cadence, activation,
  scopes, freshness, background pause and current focus/invalidation/reopen reads.
- [x]31 mounted cases/175 assertions pass, including private erasure, transients,
  empty queues/badges and refused tab visits. No business/provider commands.

[Receipt](../verification/2026-10-30-dashboard-inbox-polls.md). Final source/platform
checks pass: Dashboard/owned types, isolated entry, owned fast237/1533+QA types/
Biome, H01/H02 and frozen local smoke (runtime unverified). Exact owner proof is
inert; no browser-speed claim. This is A2 for these readers; WhatsApp/attachment/domain/job
owners and aggregate/optimized acceptance remain. Full program stays3/27.

## Overview content loading owner — DP-104/401,30October2026

- [x] Actual Flight reproduces whole-page header/actions waiting on presence and
  current visibility. Keep auth/membership admission ahead of the header.
- [x] Thin route returns existing controls with a content Suspense boundary;
  projected server props retain current scope, with private reads after both gates.
- [x] Nine Flight cases/57 assertions pass: arrival order, refusal/failure,
  own/all visibility, overlapping scopes and existing section/stream ownership.
- [x]19 AST move/role/control parity checks pass; no design or command change.

[Receipt](../verification/2026-10-30-dashboard-overview-streaming.md). Source/platform
checks pass: Dashboard/owned types, owned fast237/1533+QA types/Biome, H01/H02 and
frozen local smoke (runtime unverified). This is earlier server output, not browser latency, Back or
full DP-104/401 acceptance. Prepared9eb8 stays separate; full program3/27.

## Overview numbers projection — DP-103/401,30October2026

- [x] Actual metrics reader reproduces4 acquisitions for a populated Overview.
- [x] One parameterized current statement preserves all four numeric fields,
  exact presence/scope/date/status predicates, disabled-section omission and errors.
- [x] Six disposable PostgreSQL cases/107 assertions pass, including48 presence/
  creator combinations and fresh consecutive reads. No live business fixtures.
- [x]300,000-row synthetic plans retain separate indexed date probes after a
  combined-scan trial increased buffer work. Final all/creator buffer counts match
  comparable old probes; timings are noisy and do not establish browser budgets.

[Receipt](../verification/2026-10-30-dashboard-overview-summary.md). Source/platform
verification passes: Dashboard/owned types, owned fast237/1533+QA types/Biome,
H01/H02 and frozen local smoke (runtime unverified). Exact metrics proof is inert
SQL, without a browser speed claim. No schema/index/cache/permission/command,
deployment or service change. Prepared9eb8 remains separate; full program3/27.

## Reports selected-tab startup — DP-102/409,30October2026

- [x] Reproduce five startup operations on Service entry while actual mounted
  consumers use three, with matching hydration rather than duplicate keys.
- [x] Return the shared parsed tab to the route; prefetch Stock reads only for
  Stock entry. Preserve common sales, warning indicator, scope and date behavior.
- [x] Seven actual route/URL/tabs/consumer/cache SSR cases pass, including later
  Stock activation, Service return and pending/admission boundaries.

[Receipt](../verification/2026-10-30-dashboard-report-prefetch.md). This removes two
startup operations on Service deep links; it does not establish page latency,
browser Back or full DP-102/409 acceptance. Full program remains3/27 accepted.

Executed: Dashboard/owned fixture types, owned fast237/1533 plus QA types/Biome,
H01/H02 and frozen canonical local UI smoke pass (runtime unverified). Exact
Reports behavior is inert SSR proof; no live report/write, restart or deployment.
Prepared9eb8 optimized files remain unchanged and exclude this source.

Owner authorized execution on29 October2026 by “proceed” after the complete
six-phase,27-ticket roadmap in this chat. Current primary checkout; local commits,
implementation and testing only. No push, deployment, provider changes, paid
resources or business submissions. Preserve concurrent work and existing approvals.

This is the durable scope for the active goal, including across chat continuations.
Do not substitute the earlier navigation batch or Catalog correction for completion
of this program. Work-package progress and measured performance acceptance are
separate. Start:0/27. Evidence belongs in the execution log below and linked receipts.

## Current assessment and phase order

Midday adoption is partial across owners. Request-local reuse, streaming,
retained tabs, hidden-reader controls and optional delivery have implemented
slices. The optimized local run above still shows initial shell5692ms, Finance
refresh5916ms/warm2830ms and Activity3480ms/3114ms. Development compilation cannot
explain all remaining waits. One sample is insufficient for stable budgets.

| Phase | Tickets | Accepted | Remaining outcome |
| --- | --- | --- | --- |
|0 Evidence |001–003 |2/3 |Optimized, pinned per-family costs and calibrated budgets |
|1 Shared boot |101–104 |1/4 |Hydration consumption, shorter critical path, independent loading |
|2 Query lifecycle |201–204 |0/4 |Correct retention, precise invalidation, bounded background reads |
|3 Delivery/rendering |301–304 |0/4 |Code recovery/optimized bytes, import/tools and interaction evidence |
|4 Domain rollout |401–409 |0/9 |All nine families satisfy read/state/access/freshness budgets |
|5 Acceptance |501–503 |0/3 |Behavior, regression budgets and full27-ticket audit |

Execution order within the existing tickets:

1. **DP-003 → DP-103:** attribute document/SSR and individual API procedures;
   distinguish fresh auth/legal/scope round trips from domain SQL and serialization.
   Shared API context is roughly630ms in several observed requests. Remove proven
   redundant work and independent serial edges, preserving fresh authority.
2. **DP-102/104 + DP-201–204:** prove matching hydration keys, independent loading,
   retained tabs and exact invalidation. Each read owner records scope, freshness,
   retention, activation, cancellation and post-command dependencies. No blanket
   stale-time increase for permission, money, proof or access reads.
3. **DP-405/407 first:** Finance and Activity remain slow on optimized runtime.
   Attribute their root/list/filter/summary scopes and inspect actual SQL plans.
   Verify the committed Finance/Activity reductions in a subsequent matching build;
   the current f027 artifact does not contain them. Then prioritize Reports/Orders,
   Website Requests/Customers and the remaining family acceptance journeys.
4. **DP-301–304:** measure unopened sheets/tools/import graphs and main-thread
   interactions; split or stabilize demonstrated costs. Record transferred bytes,
   loading/recovery and realistic table interaction evidence.
5. **DP-501–503:** run repeated comparable optimized samples and critical
   Back/tab/draft/error/scope/revocation journeys; enforce per-family budgets in
   existing QA tooling. Proposed100ms feedback/200ms retained tabs/1s warm navigation/
   2s optimized refresh remain targets, not achieved or statistical guarantees.

Every ticket retains the acceptance criteria below. Build/source milestones and
one faster tab do not close a domain ticket. Current optimized window is closed,
development restored, no deployment. Overall3/27 (11.1%).

## References and migration contract

Midday reference: local `apps/dashboard/src/trpc/{server,query-client,request-context}`,
Customers route, `customer-details`, Customers table, URL hooks and global-sheets
provider. EwaTrade uses existing route/header/content/form/table/repository layers,
typed URL state, tRPC identities, loading/error boundaries and shared UI wrappers.
Retain current table columns, selection, filters, sheets, drafts, business terms
and explicit mutation invalidation. No interface redesign or Workshop is needed
for data scheduling, lifetimes or code delivery. Changes to actual visual design
remain subject to their existing design authority.

Midday's short freshness windows and retention inform query lifetime. EwaTrade's
proof, role, Store, financial, stock and revocation checks retain explicit current
authority. Never use a broad stale cache or longer TTL as a substitute for those
checks. Server prefetch must match the consuming key and scope; speculative reads
must be useful, bounded and privacy-safe. Independent reads may overlap; dependent
authorization and locked commands retain their ordering and transaction boundaries.

## Phase0 — Reliable evidence

- [x] **DP-001 Stable candidate.** Reconcile outstanding compile/smoke/coverage
  blockers; pin commit plus dirty hashes, service/profile identity and lock hash.
  Acceptance: canonical existing-data smoke can exercise the intended runtime;
  foreign failures remain visible and owned/coordinated, never silently excluded.
- [x] **DP-002 Journey inventory.** Classify every page entrypoint under DP-401–409.
  Cover refresh, soft navigation, Back/filter restoration, tab revisits, close/
  reopen, scope changes and critical error paths. Acceptance: route inventory,
  owning layer and representative bounded journey for every route family.
- [ ] **DP-003 Baseline and budgets.** Extend existing privacy-safe tracing to
  distinguish auth/legal/scope, API, SQL/pool, serialization and browser work.
  Separate development compilation from an optimized local runtime. Acceptance:
  representative pinned baseline with request/query/payload and latency costs;
  agreed measurable per-family budgets and explicit sample limits.

## Phase1 — Shared boot and data loading

- [x] **DP-101 Request context reuse.** Remove duplicate read-only session/legal/
  membership/Store/plan lookups within the same trusted request/batch. Acceptance:
  real multi-caller regression, correct strict/recovery scope and rejection, no
  cross-request reuse or weaker fresh write checks.
- [ ] **DP-102 Hydration identity.** Match server/client scope, params, pagination
  and keys; remove prefetches that cannot reach their consumer. Acceptance: useful
  prefetch consumed without redundant initial fetch; foreign scope cannot hydrate.
- [ ] **DP-103 Critical-path scheduling.** Overlap independent settings, summary
  and repository reads and trim projections. Acceptance: measured removal of
  serial work, retained query bounds and no transaction/authorization shortcuts.
- [ ] **DP-104 Loading ownership.** Separate primary content, shell, summaries and
  optional panels at actual data boundaries. Acceptance: optional waits/failures
  remain local, current authorized content does not unnecessarily disappear.

## Phase2 — Query lifetime and refresh

The [30 October complete interval-site audit](2026-10-30-dashboard-polling-audit.md)
records33 query intervals and6 explicit timers across25 files. Three inert red
reproductions expose hidden Assistant record polling, repeated refused reads and
duplicate Finance first-page operations. Its A1–A6 subtasks belong to DP-201/203/204
and the affected domain tickets; they do not add to or close the27-ticket scope.
Implement the demonstrated owners first, then prove source-only hypotheses and
roll out the remaining activation/refusal/budget contracts. Required visible
financial/access/approval queues and bounded durable recovery retain freshness.

- [ ] **DP-201 Freshness policy.** Inventory reference/directory/live financial/
  access/proof reads; specify retention, activation, invalidation and exceptions.
  Acceptance: policy is applied at correct owners with explicit sensitive-read rules.
- [ ] **DP-202 Detail and tab lifetime.** Preserve loaded state inside the current
  authorized workspace and reset it at actual scope boundaries. Acceptance: no
  unnecessary revisit loading; bounded retention; close/reopen/revocation correct.
- [ ] **DP-203 Mutation invalidation.** Define command-to-read dependencies and
  remove unnecessary full refreshes. Acceptance: affected money/stock/customer/
  summary facts all update promptly, without broad duplicate foreground refetches.
- [ ] **DP-204 Background requests.** Audit/deduplicate polling, cancellation,
  visibility, focus and reconnect behavior. Acceptance: hidden optional UI avoids
  work while required access and durable status/revocation checks remain active.

## Phase3 — JavaScript and rendering

- [ ] **DP-301 Sheet feature delivery.** Split optional sheet families by URL,
  permission and intent. Acceptance: unopened features do not load heavy graphs or
  fetch data; deep links/history/focus and command owners stay intact.
- [ ] **DP-302 Import boundaries.** Measure expensive hot import graphs and narrow
  public subpath exports. Acceptance: comparative compile/byte evidence; no mass
  rewrite based on barrel-import counts alone.
- [ ] **DP-303 Heavy optional tools.** Bound chart, PDF/export, editor, generator
  and assistant delivery. Acceptance: normal navigation avoids their critical path;
  meaningful content retains SSR and existing working lazy boundaries are reused.
- [ ] **DP-304 Responsiveness.** Profile expensive rows/context/effects/search;
  use stable identities, deferred work/cancellation only where needed. Acceptance:
  representative typing, selection and scrolling budgets at realistic data sizes.

## Phase4 — Every dashboard family

Each ticket includes read scheduling, DTO bounds, loading/error behavior, URL and
draft/state retention, mutation freshness, relevant access checks and before/after
evidence. Inspect SQL plans before indexes/read models; do not silently change
schema or infrastructure. Large datasets should not require every row in the browser.

- [ ] **DP-401 Overview.** Summaries, counts, setup cards and first useful content.
- [ ] **DP-402 Catalog/Inventory.** Fresh detail reads, report/stock payloads,
  compatible totals, pagination/filtering and useful detail hydration.
- [ ] **DP-403 Sales/Orders.** Detail lines/timelines, approvals, forms and precise
  post-command refresh while preserving canonical money/fulfillment authority.
- [ ] **DP-404 Customers/Ledger.** Directory/history bounds, balance summaries,
  scoped detail reuse and currency/account identity.
- [ ] **DP-405 Finance.** Accounts/bank/spending/suppliers/payments/refunds; load
  only the selected view while retaining current financial facts and confirmations.
- [ ] **DP-406 Services/Requests.** Jobs/bookings/prescriptions/website requests/
  conversations; bounded histories and required queue/access freshness.
- [ ] **DP-407 Assistant/Activity/Staff/Notifications.** Capability and count reads,
  histories, minimized panels, streams and duplicated background work.
- [ ] **DP-408 Studio/Settings/Access.** Storefront editing/generation, settings,
  login/setup/account/platform and ancillary public capability routes; preserve
  privacy/no-store/proof rules and activation ownership.
- [ ] **DP-409 Reports/Analytics.** Bounded aggregates/chart delivery and existing
  durable jobs/export paths for heavy work; explicit freshness and failure state.

## Phase5 — Acceptance and regression prevention

- [ ] **DP-501 Behavior.** Verify representative navigation/deep links/Back/filters/
  drafts/errors/scope changes with existing data and no business submissions.
- [ ] **DP-502 Budgets.** Extend existing QA timing artifacts with per-family
  request/payload/interaction regression checks. Acceptance: avoidable remounts and
  material regressions are detected without another runner or constant live sweep.
- [ ] **DP-503 Program acceptance.** Audit all27 requirements against pinned source,
  checks and optimized-runtime journeys. Record exceptions and Brain impact. No
  ticket is accepted merely because source compiles; unproven requirements remain
  open. Local acceptance never implies deployment/release qualification.

## Targets and execution rules

Provisional targets, to calibrate in DP-003: navigation feedback100ms, loaded tab
revisit200ms without avoidable skeletons, warm useful navigation1s, warm optimized
full refresh toward2s. These are proposed engineering goals, not measured production
SLOs. Record sample counts, data size, environment and remaining misses; no p95
claim from a few samples. Prior Catalog warm tabs135–168ms and dev full refresh4.16s
are historical evidence, not acceptance of every route or this new candidate.

Order: Phase0, shared boot/query lifetime, then highest measured Catalog/Inventory/
Sales costs and remaining families. Independent source work may progress while a
shared runtime gate is blocked. Use current docs/testing.md, focused checks once
ready, appropriate types/build and assistant gates. Keep one stable dated evidence
directory, avoid unnecessary DB probes, restore build-only generated type changes,
and commit owned coherent slices. Preserve all original27 requirements across turns.

## Execution log

-29October2026: active program established from owner-authorized27-ticket roadmap.
  Existing primary main checkout retained; foreign dirty/staged source preserved.
  Offline QA doctor passes. Prior Storefront Form compile import has been corrected
  by its owner; revalidation of shared runtime/gates remains DP-001.
- DP-002: all59 current page entrypoints mapped in the linked route inventory,
  with nine representative journey families and explicit public-link/setup/platform
  evidence gaps. Document checks47/193 pass. This completes source/journey inventory,
  not the timing/behavior acceptance required by DP-003/501/503. Progress1/27 (3.7%).
- DP-001 interim: canonical existing-data local web smoke now passes at shared
  HEADa94ba7317, runtime identity unverified. No business submissions. Earlier
  Catalog shared compile blocker is cleared for this journey; full shared source/
  coverage/optimized-runtime acceptance remains separate.
- DP-003 instrumentation: existing PERFORMANCE_TRACE gate now exports fixed numeric
  phase/count Server-Timing values; adds legal/sessionProof/scope distinctions.
  Arbitrary labels, SQL, inputs, identities and error text are excluded. Durations
  overlap and are not additive wall time. Focused tracing/request-ID9/29, owned fast
  source237/1531 and API production-source types pass. Runtime `/live` shows the new
  header; approved API-only root launcher runs with local tracing, other services
  preserved. One observed QA request4038ms had context3371ms, auth1873ms,
  QA proof1281ms and scope445ms. This identifies a hypothesis, not an optimized or
  production baseline. Bounded journey collection remains open.
- DP-101: real protected/protected-or-internal callers reproduced3 legal+Tenant
  reads before correction, now1 each. One HTTP GET owns memoized in-flight facts,
  keyed by database/actor/business/Store; procedures receive independent copies.
  POST, mutations, linked identity and default byte resolvers stay fresh. Strict
  Store rejection and recovery cannot share incompatible facts.26/76 focused
  tests, owned fast237/1531, Dashboard types and API production-source types pass.
  Two stale age-gate fixtures gained the session envelope required by the existing
  browser-identity guard; the guard was unchanged. Runtime traces show scopeReuse
  hits including2 and8 in separate GETs. Warm core sample Catalog950ms/Overview1381ms;
  prior985/1474ms has too few observations for a reliable speedup claim. Progress
  DP-002+DP-101:2/27 (7.4%); remaining tickets retain their full acceptance scope.
- DP-102 partial: Inventory's unconsumed unscoped Catalog detail prefetch removed.
  Deep-linked existing Notebook still opens3479ms/refreshes6860ms in development;
  latency remains above target. Existing reader-key isolation tests5/39 and types
  pass. Remaining route prefetch/input matching audit stays open.
- DP-001 local baseline accepted: current runtime source is committed in1c7713ec9;
  controlled fixed phase headers and GET reuse counters prove the changed API path
  is active. Existing root local profile/QA admission and canonical smoke pass at
  that candidate. Local receipt runtimeVerified remainsfalse, so this is not a
  release identity assertion. H01 snapshot now matches the committed router in
  APP_ENV=local and H02 passes4 records,0 capability/4 procedure changes from the
  comparison (procedure deltas belong to concurrent committed features, not this
  optimization). Program impact ticket metadata corrected to the existing H02
  schema; DP work IDs remain in this plan. Source/lock hashes and process details
  retained privately. DP-001+002+101 complete3/27 (11.1%); DP-003 optimized-runtime
  measurement and final DP-503 acceptance remain open.

- DP-102 audit:52 direct server option calls across22 owners inventoried, plus
  variable-held prescription access inspected separately. Store/range/filter/key
  comparison and activation findings recorded in [hydration audit](2026-10-29-dashboard-hydration-audit.md).
  Runtime request-count/scope proof remains open; source matches are not acceptance.
- DP-301 partial: Catalog editor and Finance form bodies now dynamically import only
  when the existing sheet renders them. Light URL/dismissal/provider/command-lock
  owners remain in place. Refreshed Overview no longer delivers those body definitions
  in observed development scripts. Types, optimized build and owned fast220/1481
  pass. Catalog open/close/focus/Back and Finance deep-link/cancel verified without
  submissions; Finance retains replace-history close behavior. Other families,
  chunk-failure behavior and optimized-runtime measurement remain open. Overall
  accepted count remains3/27 (11.1%). [Receipt](../verification/2026-10-29-dashboard-deferred-forms.md).

- DP-103/204 partial: real route tests reproduced6 failures, then11/20 pass.
  Finance book and independent scoped display preferences now start together after
  admission. Services Work prefetches1 data endpoint instead of3; Requests omits
  the hidden Work queue. Shared typed URL parsers preserve role/default/sheet and
  filter semantics. Open sheet dependencies retain bounded reads. Existing URL
  tests2/9, owned fast220/1481, Dashboard types/build and actual existing-data views
  pass. Loaded Services tab revisits95/125ms, Work refresh2613ms, Requests refresh
 12206ms, Finance summary refresh5979ms: small development samples, initial loads
  remain above target. Shared API window includes substantial context/pool waits;
  no endpoint-level attribution or causal speedup claim. DP-103/204 and program
  count3/27 stay open until the remaining scheduling/runtime evidence is complete.
  [Receipt](../verification/2026-10-29-dashboard-route-scheduling.md).

- DP-302/303 partial: actual closed Overview delivered payment-review bodies via a
  timestamp helper and Setup chat/draft bodies via its banner. Formatter now uses
  the existing pure model; Setup bodies load dynamically within their unchanged
  controller/frame. Observed resolved dev scripts23.39MB→19.06MB; seven review and
 14 Setup app modules removed in successive observations. Types, focused28/86,
  owned fast220/1481 and closed Overview/bell UI pass. Open Setup runtime and new
  optimized comparative proof remain open; prepared965f64794 build preserved while
  Dashboard-only switch approval is pending. [Receipt](../verification/2026-10-29-dashboard-optional-delivery.md).
- DP-201 audit:425 direct tRPC option sites/245 owners inventoried, with explicit
  limits and [query policy](2026-10-29-dashboard-query-policy.md). Zero freshness is
  often a required sensitive-read contract. Minimized Quick Assistant data/pending/
  voice queries need visibility ownership while preserving in-flight work. Policy
  application and DP-204 proof continue;3/27 (11.1%) unchanged.

- DP-202/204/407 partial: real mounted Assistant source reproduced hidden query/poll
  work and cached hidden auto-start. Visibility now reaches hook, pending-review
  and voice query owners; pending commands/durable runs keep their owner alive.
  Draft/ready files/recorder/stream are retained.5/28 mounted, existing attachment
  regression, fast237/1531, Dashboard types and actual saved-chat minimize/reopen
  pass; test draft cleared, no sends/confirmations/new conversation. Other polling
  owners and optimized runtime remain open;3/27 unchanged.
  [Receipt](../verification/2026-10-29-dashboard-assistant-visibility.md).

- DP-003/502 partial: owner-approved prepared965f64794 optimized Dashboard measured
  locally, preserving API/other services. IAB representative refresh observations
  cover all nine families; loaded Catalog tabs77/81/85ms. Final frozen-source
  canonical smoke passes: Catalog refresh3540ms, warm Catalog819ms/Overview1322ms,
  shell retained and zero business writes. Existing QA artifacts now record bounded
  request/byte/fixed-phase/cancellation summaries without URLs or payloads. Catalog
  action window includes59 scripts/1.13MB body bytes and one visible API request
  with1058ms context/8 SQL calls; background/server-to-server limitations explicit.
  Missed IAB sidebar clicks are interaction uncertainties, not valid latency clocks.
  Per-family attribution, calibrated budgets and newer-source optimized proof stay
  open; accepted3/27 unchanged. Development mode restoration is part of this window.
  [Receipt](../verification/2026-10-29-dashboard-optimized-baseline.md).

- DP-103/401 partial: actual shell regression reproduced3 plan repository reads
  for menu features. A current narrow billing projection uses1 joined SQL query,
  retaining canonical known/unknown plan, native/reviewer expiry, metadata and
  optional-failure policy. Real existing-data read-only comparison confirms3→1
  with identical features; timings have pool warm-up differences, no page-speed
  claim. Shell4/9, billing parity/existing18/215, owned fast237/1531, Dashboard
  types and refreshed Reports/menu pass. Full billing commands/limits unchanged.
  Broader API context/scheduling/optimized acceptance remain open;3/27 unchanged.
  [Receipt](../verification/2026-10-29-dashboard-shell-plan-read.md).

- DP-003/102/103/104 partial: actual server transport reproduced a ready result
  blocked behind a slow sibling and module-global batching across simulated render
  owners. Server client is now render-request-owned and streams within each batch;
  one shared fresh API context/legal/Tenant read remains. Actual transport6/40,
  focused21/109, owned fast237/1531, Dashboard/API production types and optimized
  build pass. Optional traces follow body completion/cancel/error; setup timing
  is explicitly separate. Existing-QA Reports navigation/full refresh renders its
  loaded chart in development. No new optimized runtime switch or page-speed claim.
  Awaited route presentation reads and all-panel pending gates remain DP-104 work;
  no blanket await removal ahead of clinical/access admission. Program3/27 (11.1%)
  unchanged. [Receipt](../verification/2026-10-29-dashboard-server-streaming.md).

- DP-104 partial: nine actual route functions reproduced presentation-prefetch waits
  before returning their loading owners. Settings Channels/Compliance/Service-commerce/
  Receipts/Returns/Stores/Messages, Conversations and Order detail now start those
  reads without awaiting completion. Clinical workspace access and Setup dependency
  waits remain. Actual routes22/64 (9 red before fix), owned fast237/1531, Dashboard
  types/H02 and read-only Receipt settings refresh pass. Client all-panel gates and
  optimized latency acceptance remain;3/27 unchanged.
  [Receipt](../verification/2026-10-29-dashboard-route-presentation.md).

- DP-104/408 partial: Customer channels all-query pending/error gate reproduced10
  mounted failures. Workspace now owns admission/status; management sections and
  approval rows have local pending/error/retry owners. Independent approval read
  still overlaps workspace; current canManage gates management mounts.16/109 actual
  mounted checks, fast237/1531, Dashboard types/H02 and existing-QA navigation/full
  refresh/See why open-close pass, no settings save. [Contract](2026-10-29-dashboard-section-loading.md)
  and [receipt](../verification/2026-10-29-dashboard-section-loading.md) record Midday
  conformance. Broader loading/optimized budgets remain open;3/27 unchanged.

- DP-204/407 partial: three notification reads reproduced repeated refused interval
  requests (6 mounted failures). Four hooks now separate query ownership from UI;
  known rejected reads stop polling, while fresh focus/reopen/manual recovery and
  successful/transient cadence remain.21/80 mounted, policy/retry6/65, real server
  hydration/refusal6/40, fast237/1531, Dashboard types/H02 and existing-QA bell
  open-close-reopen pass without alert changes. Other polling/projection owners and
  optimized budgets remain;3/27 (11.1%) unchanged.
  [Evidence](../verification/2026-10-29-dashboard-notification-polling.md).

### QA proof projection contract (DP-103, implementation follow-up)

Actual createTRPCContext→validateQaDerivedSession path inspected. A valid QA-derived
session currently reads Session+authorization+grant, then the bound Membership/
Tenant/active Store. The second query depends only on fields in the first. Keep
fresh managed-domain admission and invalid-session deletion; this is no auth cache.
Midday users-on-team query reference selects narrow joined facts behind the DB
boundary. EwaTrade keeps Prisma schema/DbClient and current validation API.

- [x] Add an internal qa-session-validation-facts query selecting only current
  QA scope/status/expiry/revocation/domain facts and the exact membership/Tenant/
  Store predicates in one parameterized statement. No token/digest/metadata payload.
- [x] Keep validateQaDerivedSession output, legacy/nonexistent handling, fresh
  domain policy check, invalid-session delete and error propagation. No schema,
  migration, cross-request memo, API/procedure, write/permission or provider change.
- [x] Prove two repository calls→one for valid proof; policy matrix for missing/
  legacy/expired/revoked/domain/membership/Tenant/Store cases, fresh rereads and
  failures. Execute a bounded read-only PostgreSQL CTE matrix over inert values
  using the actual statement; no real auth token extraction or stored fixtures.
- [x] Run owned checks/types/assistant impact and one existing-data local runtime
  verification, update Brain/evidence and commit only owned paths. Broader context
  latency and optimized family budgets remain open; full program denominator27.

Executed: validator36/116, tracing/privacy44/142, actual PostgreSQL inert CTE33/33,
owned fast237/1531, API entrypoint+owned-test types/H02 and frozen-source existing-QA
smoke pass. New qaProofFacts/qaDomain phases confirm the helper is serving locally
without restart. Development Catalog refresh5261ms and warm Catalog874ms/Overview
1347ms remain observations, not optimized acceptance. Auth2446.8ms and accumulated
pool2218.9ms in one visible response prioritize further attribution; overlapping
phases are not additive. Full program3/27 (11.1%) remains unchanged.
[Evidence](../verification/2026-10-29-dashboard-qa-proof-projection.md).

### SDK session join contract (DP-103, implementation follow-up)

The installed Better Auth1.6.23 Prisma adapter supports experimental.joins. Current
configuration leaves it off: real initAuth/getSession regression reproduces two
repository reads for a valid signed cookie. Midday keeps admission in its existing
SDK and instruments context separately; its JWT/Supabase provider is not applicable
to EwaTrade's cookie/bearer and current QA proof authority. Keep the auth package
as owner; enable the installed adapter's relation support rather than replacing it.

- [x] Prove current signed-cookie admission, missing/expired/revoked session and
  missing user refusal, fresh current user/session reads, SDK refresh/delete/error
  behavior, creation privacy/legal hooks and existing account/session relations.
- [x] Enable only the supported joined read setting. Keep cookie cache disabled,
  all token/signature/expiry/refresh policy and API bearer/QA/legal/Store/command
  checks unchanged. No schema, dependency, endpoint or provider configuration change.
- [x] Verify real SDK+adapter read count reduction and generated Prisma relation
  compatibility, focused/fast/types/impact checks, then one canonical existing-data
  local smoke. Preserve partial/full-ticket distinction and program3/27.

Executed:12/46 actual SDK tests after4 red excess-read failures; generated Prisma
compatibility1 SQL/0 rows with an inert nonexistent signed token; owned fast237/
1533, API production+owned-test types/H02 and frozen-source canonical local smoke
pass. Development Catalog refresh4128ms, warm Catalog899ms/Overview1087ms; shell
retained,0 blocked business writes. One visible response has6 SQL/acquisitions,
auth1478.6ms/context2380.1ms; pool1760.6ms remains substantial. No controlled ratio,
optimized acceptance or runtime identity claim. No restart/runtime switch/deploy.
Broader DP-103/context/pool work remains; program3/27 (11.1%) unchanged.
[Evidence](../verification/2026-10-29-dashboard-auth-session-joins.md).

### Global sheet delivery contract (DP-301/302, implementation follow-up)

Current hydrated GlobalSheets statically imports41 sheet families; unopened
controllers pull their feature graphs into ordinary navigation. Midday's global
sheet provider preserves typed URL controllers and scope lifetime; EwaTrade keeps
that ownership and adds demand-based delivery using existing next/dynamic. No
redesign, command change or global cache policy is involved.

- [x] Reproduce closed-family mounts at the actual GlobalSheets boundary. Cover
  all41 typed deep-link intents, invalid modes, permission/path exclusions and
  the assistant-owned Job exception; keep role/Store/access fingerprints intact.
- [x] Split all41 family imports behind intent; retain an activated controller
  through close/reopen in the same scope so existing dismissal/focus/draft owners
  keep their lifecycle. Scope/permission changes still remove the owning subtree.
- [x] Reuse canonical parsers/allowlists, including empty malformed target overlays
  that must still show their existing refusal. Separate pure assistant object URL
  constants from receipt orchestration imports; no new registry or polling runner.
- [x] Prove loaded-controller retention, scope reset, no unopened imports/mounts,
  actual assistant Job revocation and existing mounted private-reader policy. Run
  focused/fast/types/build/impact and one existing-data browser window; compare
  closed resource delivery without treating dev module bytes as optimized transfer.

Full program3/27 remains until ticket acceptance is established; current bounded
family/runtime evidence will be recorded independently from source conformance.

Executed: actual boundary54/113 after48 initial failures; existing private-reader/
Job entry checks5/30; AST conformance preserves existing factory access/path/props/
keys/callbacks. Fast237/1533, full Dashboard types, optimized build/H02 and existing-QA
Catalog tabs/deep-link refresh/close/reopen, Order detail and frozen-source smoke
pass. Development Catalog refresh script responses77→52 and measured encoded bodies
3240339→2282436 bytes (29.6% less); refresh4052ms remains above target. Warm Catalog
862ms/Overview1167ms, shell retained,0 blocked business writes. No optimized transfer,
causal page-speed or production claim. Remaining route-owned Inventory operation/
audit/store/threshold, Sales create and Services Job/Request/Settings imports require
inspection/correction before DP-301 acceptance. Program3/27 (11.1%) unchanged.
[Evidence](../verification/2026-10-29-dashboard-global-sheet-delivery.md).

### Route sheet body delivery contract (DP-301/302, implementation follow-up)

Active Inventory/Catalog and Sales routes import their closed sheet controllers,
which eagerly import InventoryOperationForm/StockCountForm and OrderForm. Services
imports closed Request/Settings forms and ServiceJobWorkspace. Keep these lightweight
controllers mounted; defer six heavy bodies within their existing open/current
admission branches and SheetFrame loading/error ownership. Midday InvoiceSheet
provides the controller/form separation; existing local Catalog/Finance bodies
provide the demand-import pattern.

- [x] Reproduce eager optional body evaluation through actual sheet-controller
  imports. Prove each body only loads when selected, with current Store resolution,
  header, child key/props and close-error behavior retained.
- [x] Move parseJobStep unchanged into existing pure service-utils so the Job
  header cannot pull in its workspace. Keep the old export for compatibility.
- [x] Preserve job handoff fresh authority/refusal, title lookup, keys, current
  scope and dismissal/release/invalidation; no command/data/cache policy change.
- [x] Run focused/private-owner checks, owned fast/types/build/impact and one
  existing-data local browser/smoke window. No save/fulfillment/provider submission.

Do not edit the unused ServiceRequestsPage merely for import counts: its route
redirects to the current Services workspace. Inventory store/threshold/audit wrappers
are small and share the table's existing dependencies; data reads already sit inside
open bodies. Their source presence alone does not establish a heavy-graph defect.
Other code-load failure recovery and optimized comparative acceptance remain open.

Executed:13/40 actual import/controller checks after eager-import failure; existing
Job/utils10/20; AST parity for six functions and moved parser; fast237/1533, full
Dashboard types, optimized build/H02 and all six actual local bodies via existing-QA
Inventory/Services and canonical Sales smoke pass. No save/stock/draft/settings/
link/payment/work/message submission. Development Catalog script responses52→50,
encoded bodies2282436→2191680 bytes (~4.0% less), refresh3356ms, warm Catalog872ms/
Overview1169ms. Shell retained;0 blocked business writes. First navigation and
auth/context/pool costs remain above goals. Code-load recovery and pinned optimized
comparison stay open; program3/27 (11.1%) unchanged.
[Evidence](../verification/2026-10-29-dashboard-route-sheet-delivery.md).

## Sheet code recovery contract — DP-301 follow-up

Installed Next App loadable keeps a rejected React.lazy import across ordinary
error-boundary reset (actual installed-loader probe:1 test/6 assertions). Preserve
the existing Midday GlobalSheets/provider and domain controller ownership; add
one Dashboard-local code-loader recovery adapter at the existing dynamic import
sites. It must retain literal imports for Next code splitting, and must not
introduce data caching, different URL semantics or command retry.

- [x] Resolve a failed import to a local recovery component; a manual retry calls
  the code loader again rather than resetting the cached rejected React.lazy.
- [x] Keep global feedback within existing active-sheet visibility; body feedback
  stays inside the owning frame. Disable duplicate retries while pending.
- [x] Cache only successful code definitions, never props, scope or private data.
  Pending old-scope work cannot revive an unmounted owner or steal focus. Retry
  renders current props and preserves existing form/dismissal ownership.
- [x] Cover actual installed App loadable, repeated failure/recovery, current props,
  close/scope/focus and ordinary feature-render errors. Reuse prior domain checks;
  run focused source/types and existing-data UI smoke after the coherent change.

Target files: new sheets/load-sheet-code.tsx and mounted regression; existing
activated-sheet.tsx context accessor,41 global loaders and6 route body loaders.
Routes, headers, tables, filters, URL parsers, forms, API/query/mutation/invalidation
remain owned by their existing files. No new feature/table/header/form migration
is necessary for import recovery. Reference: Midday global-sheets/provider,
customer-details-sheet and error-fallback; existing EwaTrade SheetFrame/Button/
observability. Midday's route refresh alone does not retry this installed loader.
Prepared3cf06633b optimized build must remain untouched while its runtime window
is pending; source checks and dev evidence do not qualify that build or close
DP-301/003/502. Accepted program count remains3/27 (11.1%).

Implementation now wraps47 existing literal loaders, with six controller ASTs,
dynamic options and imported targets unchanged. Actual App loader6/38 passes after
five red recovery cases; global54/113, route13/40 and isolated actual Job factory
regression pass. Dashboard types and owned fast220/1483 across41 files pass. A
development build inspection confirms the nested literal imports still produce
Turbopack async loaders; its runtime drops rejected chunk resolvers. This is source
evidence, not an actual browser network-fault test. Optimized build3cf06633b stays
prepared and unchanged; the older965f64794 approval window already completed and
does not authorize a new candidate switch. [Receipt](../verification/2026-10-29-dashboard-sheet-code-recovery.md).

## Overview presence projection contract — DP-103/401

Actual getWorkspaceFeatureAvailability reproduces9 repository calls for a small
set of presence flags. Root Overview awaits these flags before composing its
sections. Replace that fan-out with one parameterized PostgreSQL EXISTS projection
inside the existing DB query boundary; retain its derive function and DTO. Midday
packages/db/queries/teams.hasTeamData is the closest joined-presence analogue.

- [x] Preserve exact Tenant/Store predicates, Catalog kind/system-role rules,
  active fixed-price/variant/availability conditions, identified-order or Tenant
  directory Customer fallback, historical Staff and active prescription settings.
- [x] Keep a single current read with no TTL/cache, schema/index or authority
  change. API protected admission and Overview request-owned caching stay put.
- [x] Prove9-to1 acquisition reduction, errors/freshness and all previous flag
  behavior. Validate actual SQL with bounded read-only inert CTE cases; no stored
  fixtures or private record scan. Compare one existing-QA projection if needed.
- [x] Run focused/types/owned source/H02 and one frozen existing-data local smoke;
  commit owned source/receipt/Brain. No provider action, restart or deployment.

Files: existing workspace-feature-availability.ts/.test.ts and a private SQL
projection module/fixtures. Route, component, table/header/form/URL/query lifetime,
API DTO/commands and invalidation need no new owners. Query parity includes odd
existing historical conditions; performance work must not silently change product
meaning. One snapshot may intentionally replace the nine independent read snapshots.
Full DP-103/401 and optimized program acceptance remain open;3/27 unchanged.

Executed: actual reader10/26 after9-call red; byte-identical derivation,46 inert
PostgreSQL cases/414boolean checks in1 read-only CTE statement; real-schema EXPLAIN
without ANALYZE validates tables/columns and plans without executing the projection.
API/owned-test and Dashboard types, fast237/1533/H02 and final canonical frozen-source
local smoke pass. Existing Overview summary/cards/recent orders/setup/store content
retained, shell retained and0 blocked business writes. Dev warm Overview1032ms
vs prior1854ms is encouraging but uncontrolled; Catalog refresh4535ms remains a
miss. Structural9-to1 reader reduction is proven; no optimized speedup/p95/release
claim. No manual restart/runtime switch/schema/provider/deployment/business action.
[Receipt](../verification/2026-10-29-dashboard-overview-presence.md).

## Catalog directory projection contract — DP-102/203/402

Catalog table currently loads the full editor graph: option groups, unit setup,
all stock sources, variant selections and offerings. Implement a separate typed
catalog.listDirectoryPage read and DB directory module. Existing listItemsPage
remains the full contract for mobile, sale/setup and Assistant consumers. Share
filter/search/keyset planning so the directory cannot fork cursor/scope semantics.
Midday Customers route/table/router and DB query boundary are the nearest analogue.

- [x] New DB select returns visible row summary only: ID/name/kind/status, live
  variant/offering counts and primary labels/price, product ID/usage/first scoped
  stock text, and current Store photo/illustration. Bound nested reads to1; retain
  full detail/form reads only at existing owners. Preserve display meaning.
- [x] Preserve Tenant/allowed-Store admission, filtering/sort/keyset/ranked search,
  displayed counts/cursor limits and error behavior. Omit unused global totalCount.
  Ranked candidates use narrow search
  fields with the existing300 cap, then hydrate only the requested directory page.
- [x] Catalog server prefetch and client infinite consumer use the identical new
  typed endpoint and inputs. Keep existing Suspense/error/filter/selection/view/
  table/columns/URL/sheet/draft ownership; no visual redesign or Workshop.
- [x] Audit Catalog/stock/Assistant mutations and invalidate the new directory key
  alongside existing full list/detail/availability keys; no stale authority or TTL.
- [x] Actual route/query regression must go red before implementation. Verify
  directory display parity, payload bounds, scope/cursor/ranked search, hydration
  and invalidation with existing package tests plus actual query observers.
- [x] Verify relevant types/fast/H01/H02, one frozen existing-data UI smoke and
  commit source/evidence/Brain. No save/business/provider/deployment/restart.

Files: DB catalog-list-query.ts/catalog-directory.ts and focused tests; existing
catalog.ts/read helpers/index; API Catalog router and existing schema, capability
manifest/coverage; Catalog route/table/columns and current mutation owners. Product
form/command owners, full Catalog DTO and mobile callers remain. Only specified
invalidation callbacks change. New directory
read is presentation of the existing Catalog read capability, without a new write
or Assistant tool. Prepared3cf build remains untouched while its window is pending.
Full DP-102/203/402 and optimized acceptance remain open; overall3/27 unchanged.


Executed: query/display11/123, actual route/table/hydration4/14, protected/staff
scope13/49; generated Prisma whole directory1statement/acquisition, no stored
fixture or write. Dashboard and API/owned-test type graphs, owned fast237/1533,
supplemental QA tooling47/195, H01/H02 and3driver checks pass. Frozen-source
existing-data local smoke passes with runtimeVerified:false. Existing Notebook
Overview/Orders/Activity first visits and warm revisits retain content; Table/Grid
and close-focus behavior work. Catalog dev refresh4054ms, warm853ms; Overview
1034ms/2382ms. Samples are uncontrolled and not causal/p95/optimized acceptance.
Substantial observed admission/pool costs keep DP-003/103 high priority. No service
restart/switch, deployment, business submission or schema/provider action.
[Receipt](../verification/2026-10-30-dashboard-catalog-directory.md). Overall3/27.


## Shared database connection reuse — DP-003/103

The installed pg default evicts idle connections after10seconds. One read-only
local comparison after that pause reproduces a new1284ms physical connection;
identical SELECT1 with a30-second idle window reuses its socket,225ms total versus
1494ms. First reads remain cold in both. This supports retaining existing sockets
across short pauses, without changing query authority or pretending connection
setup is SQL work.

- [x] Separate fixed numeric physical `connection` and saturated-start `poolBusy`
  checkout phases. Preserve Promise/callback/release/error/request ownership and
  privacy. Durations overlap; busy checkout is not a direct lock/queue-wait metric.
- [x] Apply a30-second idle timeout in both traced and ordinary Prisma adapters;
  preserve max10/min0, existing transaction limits and idle eviction. No keepalive
  SQL, background sweeps, schema, provider or authorization cache changes.
- [x] Actual installed-pool regression goes red for missing attribution; actual
  application/generated-Prisma/adapter subprocesses go red at10seconds then pass
  at30seconds for both modes. Bounded local SQL comparison retains no user data.
- [x] Final relevant types/source/H01/H02 and frozen-source existing-data smoke;
  commit only owned paths. Optimized/runtime budget acceptance remains separate.

[Receipt](../verification/2026-10-30-dashboard-pool-reuse.md). DP-003/103 and all
family acceptance remain open; this is a shared mechanism improvement,3/27 accepted.


Executed: actual config/pool/tracing/parser13/57, API production/owned-test types,
owned fast237/1533 plus QA tooling/Biome, H01 current/H02 domain-only pass and3
existing driver checks. Frozen-source canonical local web smoke passes, runtime
unverified. Dev Catalog refresh2510ms/warm841ms, Overview2484ms/warm1360ms;
initial post-login6323ms remains slow. One observed API read reports physical
connection absent and poolBusy1/314.4ms, exposing saturated-start checkout; no
causal/p95/optimized claim. Next: correlate simultaneous reads and critical-path
scope/SQL before pool-size changes. No manual restart/switch/deployment/business
submission. Existing3cf optimized build preserved; accepted3/27 unchanged.


## Closed bell count projections — DP-103/204/407

Shared bell reads full private payment/plan/website previews on every dashboard
page while closed. Replace those three owners with count projections; preserve
personal count, full open-panel readers, exact current authority and badge meaning.

- [x] Website: same unread Tenant/Store/actor count, no preview SELECT.
- [x] Plan notices: same fresh audience and unread count, no notice rows.
- [x] Pending payment: same scope/SUBMITTED predicate, onlyfive IDs, capped meaning.
- [x] Protected void inputs and same read allowlists/refusals; no command/tool grant.
- [x] Actual mounted bell starts previews only on open and stops on close. Reuse
  private generations, focus/error/cancellation and30s/60s cadence; affected command
  callbacks refresh new numeric keys alongside existing owners.
- [x] Final focused/API/types/source/H01/H02, existing-data UI and frozen smoke;
  commit only owned source/receipt/Brain. Prepared3cf optimized build preserved.

[Receipt](../verification/2026-10-30-dashboard-notification-counts.md). Broader
query lifetime/concurrency and optimized family acceptance remain; overall3/27.


Executed: count/full readers9/28, actual mounted bell/hooks37/142, protected API/
existing staff14/63, full Dashboard/API production+owned-test types and owned
fast237/1533+QA types/Biome pass. H01 current/H02 API/permissions/client/domain,
0capability/3procedure changes. Three existing driver checks pass. Frozen-source
local canonical smoke plus opt-in actual count response/closed-preview/open/close
checks pass, runtime unverified; no acknowledgements/business submissions. Private
screenshot confirms existing website preview and current Catalog. IAB controller
was unavailable; headless desktop browser used. Dev refresh2731ms, Catalog warm
831ms/Overview warm1016ms, initial post-login5518ms: no causal speedup/p95 claim.
PoolBusy2/524.8ms keeps shared concurrency/critical path priority. No manual restart,
runtime switch or deployment. Full program3/27 accepted remains unchanged.


## Measured Staff producer import boundary — DP-302/407

Current optimized15489 build succeeds but exposes two whole-project trace warnings
through Staff HTTP→jobs root→unrelated receipt/media workers. Its Staff trace has
1715files. Offline actual compiler graph reproduces1697modules/25unrelated workers.

- [x] Expose the existing staff invitation producer at a specific jobs subpath;
  shared pure job IDs and legacy root reexports stay compatible. Original helper
  body/IDs, canonical trigger/payload, matching local fallback and authority remain.
- [x] Actual producer compiler graph218modules/0unrelated workers; fixed raw output
 16565252→14334262bytes. No browser byte/latency claim. Producer3/10 and existing
  actual Staff route10/24 pass without provider calls or invitations.
- [x] Rebuild and compare actual Next trace; relevant types/source/H01/H02 and
  frozen existing-data smoke; commit source/evidence/Brain. Preserve old/current
  prepared runtime artifacts; no shared runtime switch without coordination.

[Receipt](../verification/2026-10-30-dashboard-staff-import-boundary.md). Broader
hot graphs, optimized journeys and family budgets remain; accepted3/27 unchanged.


Executed: actual Next Staff trace1715→274 files (source refs1360→47); both dynamic
whole-project warnings disappear without ignores/private-adapter changes. Normal
optimized build/type stage, API production+owned-test types, producer3/10, Staff
route10/24, owned fast237/1533+QA tooling/Biome and H01/H02 pass. Later test-only
narrowing fixes separately pass; production source/fast proof reused. Frozen-source
canonical existing-data local smoke passes, runtime unverified, no business write.
Current optimized candidate remains prepared, not served/timed. Older3cf and15489
runtime files archived; dev restored type references/running service retained.
Coordinate a new Dashboard-only timing/restoration window for this candidate;
965 approval was already executed. No deployment or manual service restart.
Overall3/27 unchanged; this does not establish optimized per-family budgets.

## Complete explicit polling inventory — DP-204

[Audit and execution subtasks](2026-10-30-dashboard-polling-audit.md), pinned to
9eb8a0c8:1,103 production source files,33 query interval properties and6 explicit
timers, including3 UI clocks. Actual retained-panel/record-reader diagnostics
reproduce hidden and refused interval work; actual PaymentsToCheck/tRPC/query
observers reproduce two identical initial first-page operations. Private payload
erasure succeeds. These are red diagnostic results, not passing acceptance or
evidence of a data leak. Conversation late-response and raw QA background refresh
remain source hypotheses requiring inert proof. Product source/prepared optimized
build unchanged; no runtime restart/deployment. Full program remains3/27 accepted.

## Assistant record descendant activity — DP-204/407

- [x] Reproduce the omitted actual answer-card descendant in the existing retained
  panel fixture, including hidden invalidation and refused interval work.
- [x] Carry optional read activity through the chat subtree. Unmount only the
  private record reader on minimize; remount/fresh-check on reopen. Reuse refusal
  interval guard while preserving focus recovery, scope and command lifetime.
- [x] Complete focused types/source/gates and canonical local smoke, commit and
  record evidence. A1 and P14's A2 behavior are implemented; other audited owners
  and per-family optimized acceptance remain. Full program stays3/27.

[Receipt](../verification/2026-10-30-dashboard-assistant-read-lifetime.md).

Executed: strengthened actual-path fixture8/64 plus isolated entry pass; full
Dashboard and explicit fixture types pass. Owned fast237/1533+QA types/Biome,
H01 current/H02 client with zero contract rows, inert browser driver3/3 and frozen
canonical local smoke pass. Sandbox Chromium registration failure is preserved;
retry outside that sandbox passes. Runtime remains unverified; no Assistant AI
submission/business write or page-speed claim. Prepared9eb8 optimized files remain
unchanged and do not include this new source. Overall3/27 accepted remains.

## Payments inbox first-page ownership — DP-203/204/405

- [x] Actual inbox/tRPC/query observers reproduce independent duplicate initial,
  focus, retry and post-review reads. Preserve page-one-only polling and loaded
  cursor refresh semantics.
- [x] Infinite first page joins the canonical query; changed-poll results are
  consumed only by the immediate refresh. Fresh mount/reconnect, private refusal,
  load-more and post-review cancellation/freshness retain authority.
- [x] Eleven actual-component tests/67 assertions, full Dashboard and explicit
  fixture/entry types pass, including obsolete-poll and offline/load-more races.
- [x] Complete owned smoke/gates and canonical local UI smoke, then commit.

[Receipt](../verification/2026-10-30-dashboard-payments-inbox-reads.md). P15/A4 is
this owner slice; remaining domain and optimized budgets stay open. Overall3/27.

Executed:11 mounted tests/67 assertions and relevant types pass; owned fast237/1533
plus QA types/Biome, H01 current/H02 client zero contract rows, frozen canonical
local smoke pass. Existing driver proof is reused unchanged. No connected inbox
fixture/report/review submission or money write; exact read counts are inert
actual-component evidence, not browser latency. Prepared9eb8 remains untouched
and excludes this source; no shared restart or deployment. Overall3/27 remains.

## Store Conversation recovery lifetime — DP-204/406

- [x] Reproduce callback/mutation render polling resets, late page/acknowledgement
  work after close, stale queued cursor and cache-clear lifetime gaps with inert
  actual hook/tRPC/query observers. No real message or watermark write.
- [x] Keep one active scope lifetime and latest callbacks. Cancel owned reads,
  stop obsolete queued work, retain applied cursor/ack retry identity and fresh
  foreground recovery. Already issued mutations may finish; active page drain stays.
- [x] Finish relevant source/types/gates and frozen local smoke, then commit.

[Receipt](../verification/2026-10-30-dashboard-conversation-recovery-lifetime.md).
T04/A5 is a demonstrated owner fix; whole polling/domain budgets remain. Overall3/27.

Executed:19 focused lifecycle/helper tests/70 assertions, six inert protected router
scope tests/13 assertions and Dashboard/owned/API fixture types pass. Only the old
router test's synthetic Session shape is repaired; production auth/API unchanged.
Owned fast237/1533+QA tooling/Biome, H01/H02 and frozen canonical local smoke pass,
runtime unverified. No real conversation/read acknowledgement, restart/deployment
or page-latency claim. Prepared9eb8 files remain separate and unchanged. Overall3/27.

## Assistant/staff refused-read intervals — DP-201/204/401/403/407

- [x] Actual component/hooks plus installed query/tRPC observers reproduce known
  refusal interval work for P18/P19/P21/P22/P23/P24/P33.
- [x] Reuse the current refusal helper at all seven sites. Retain activation,
 30s/60s cadence, empty queues, non-review/no-poll mode, focus recovery, transient
  handling and existing permission/financial/command authority.
- [x] Both mounted suites pass (21 new owner cases and16 retained Assistant
  cases), plus shared classifier checks. No live business/AI action.
- [x] Complete relevant types, owned gates and frozen local smoke; commit.

[Receipt](../verification/2026-10-30-dashboard-assistant-staff-refusal-polls.md).
A2 applies only to these owners here; remaining polling/lifetime and domain-wide
optimized budgets stay open. Full program remains3/27 accepted.

Executed:37 mounted cases across two isolated suites plus shared classifier
checks, Dashboard/owned fixture types, owned fast237/1533+QA tooling/Biome and
H01/H02 pass. Frozen canonical local smoke passes, runtime unverified; exact error/
focus proof is inert. No real AI/business/permission/approval action, shared restart,
deployment or page-speed claim. Prepared optimized9eb8 remains unchanged and
excludes later source. Other A2 owners remain; full program3/27 accepted.
