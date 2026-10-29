# Dashboard performance program

Owner authorized execution on29 October2026 by “proceed” after the complete
six-phase,27-ticket roadmap in this chat. Current primary checkout; local commits,
implementation and testing only. No push, deployment, provider changes, paid
resources or business submissions. Preserve concurrent work and existing approvals.

This is the durable scope for the active goal, including across chat continuations.
Do not substitute the earlier navigation batch or Catalog correction for completion
of this program. Work-package progress and measured performance acceptance are
separate. Start:0/27. Evidence belongs in the execution log below and linked receipts.

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
