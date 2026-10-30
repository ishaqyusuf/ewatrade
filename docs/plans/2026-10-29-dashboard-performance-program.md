# Dashboard performance program

Owner authorized this complete six-phase,27-ticket program by “proceed” on
29October2026. Scope: all59 Dashboard page entrypoints across nine families,
following the inspected Midday patterns and existing EwaTrade domain authority.
Current primary checkout; local implementation, tests and commits only. No push,
deployment, provider changes, paid resources or business submissions.

This remains the durable scope across goal continuations. Individual source slices
and passing smoke runs do not replace full ticket acceptance. **3/27 tickets are
accepted (11.1%)**: DP-001, DP-002 and DP-101. All27 acceptance criteria below are
preserved verbatim. Historical contracts and evidence remain authoritative in the
[complete pre-consolidation history](2026-10-30-dashboard-performance-program-history-c119f31b.md).
That file records earlier runtime/build states; its “current” labels are historical.

## Current assessment and phase order

Midday patterns have been applied in request-local context ownership, streamed
independent reads, retained details, selective loading, polling activation,
optional code delivery and narrower database projections. Adoption and verification
remain uneven. Current local results still miss the proposed refresh/warm budgets;
this program is not complete.

Latest source slices: shared workspace admission `683b8712d`, Activity page/count
`c119f31b3`, and the current Activity filter projection. Activity list and filter
projections each use one SELECT instead of two, under their existing locked
RepeatableRead scopes. Warm Activity request SQL17→15 agrees with those changes.
Search, cursor, scope, exact money, API/UI and freshness policies remain.

The current root optimized Dashboard artifact is **b636ec94a**, Next16.4.3 BUILD_ID
`9_xXHBCwpx3JFUo5UurJb`; it was reused with the updated separately running hot API.
It is not a newly compiled full-stack candidate or certified API revision. The
approved Dashboard-only window passed18 readiness actions; development mode was
restored, API/Storefront/Marketing unchanged. `runtimeVerified:false` remains.
[Latest evidence](../verification/2026-10-30-dashboard-activity-filter-projection.md).

| Family | Latest refresh | Latest warm return |
| --- | ---: | ---: |
| Overview | 2150ms | 1057ms |
| Catalog | 2207ms | 1820ms |
| Orders | 4561ms | 1314ms |
| Customers | 1362ms | 2319ms |
| Finance | 3707ms | 2832ms |
| Website requests | 2530ms | 812ms |
| Activity | 3513ms | 4615ms |
| General | 1301ms | 1316ms |
| Reports | 6540ms | 816ms |

Single samples of representative content readiness, not p95 or whole-family
acceptance. Activity previously4205/3103ms: refresh is lower, return higher despite
fewer SQL statements. Its warm context increased631.7→1089.2ms and auth211.9→653.7ms;
aggregate SQL work also rose. Phases overlap; the numbers are not additive. Reports
and Orders refresh outliers reinforce the need for attribution, not another blanket
freshness-window increase. No favorable-only sample selection or speedup claim.

| Phase | Tickets | Accepted | Remaining outcome |
| --- | --- | --- | --- |
|0 Evidence |001–003 |2/3 |Comparable costs, variable-wait attribution and calibrated budgets |
|1 Shared boot |101–104 |1/4 |Hydration consumption, shorter critical path, independent loading |
|2 Query lifecycle |201–204 |0/4 |Retention, precise invalidation and bounded background work |
|3 Delivery/rendering |301–304 |0/4 |Code/import/tools and interaction acceptance |
|4 Domain rollout |401–409 |0/9 |Each family's read/state/access/freshness budgets |
|5 Acceptance |501–503 |0/3 |Behavior, regression budgets and requirement-by-requirement audit |

Next execution order, within the same27 tickets:

1. **DP-003/103:** attribute the variable Activity list/filter, auth/QA and database
   waits with fixed numeric phases. Separate backend work from browser/SSR delay;
   retain privacy-safe diagnostics and avoid unnecessary connected sweeps.
2. **DP-102/104/407:** inspect Activity's server-to-client initial loading edge and
   filter ownership. Any useful document prefetch must preserve current mount
   admission, exact scope/key consumption, refusal erasure and fresh returns.
3. **DP-405/407, then409/403:** remaining Finance metadata/spending and Activity
   costs, followed by the observed Reports/Orders refresh outliers. Inspect real
   query plans and caller work before indexes, read models or infrastructure.
4. **DP-201–204 and301–304:** finish lifecycle/invalidation/polling and code/interaction
   contracts for all owners. Source slices already implemented need scoped behavior
   and performance acceptance, not repeated speculative rewrites.
5. **DP-501–503:** repeated comparable optimized samples, Back/tab/draft/error/scope/
   revocation journeys, per-family regression budgets and all27-ticket audit.

## Current implementation evidence

- [Workspace admission projection](../verification/2026-10-30-dashboard-workspace-scope-projection.md):
  exact per-GET identity, canonical policy, fresh mutation/recovery paths.
- [Activity page/count](../verification/2026-10-30-dashboard-activity-page-projection.md):
  bounded page/count, snapshot/cursor/authority and native PostgreSQL equivalence.
- [Activity filters and combined runtime](../verification/2026-10-30-dashboard-activity-filter-projection.md):
  bounded people/availability, native comparisons, latest readiness and restoration.
- [Finance independent document reads](../verification/2026-10-30-dashboard-finance-independent-prefetch.md):
  current Book identity binding, independent early work and canonical cache keys.
- [Finance snapshot guard](../verification/2026-10-30-dashboard-finance-snapshot-admission.md):
  joins only under existing RepeatableRead; ReadCommitted shortcut rejected.
- [All earlier implementation contracts and milestones](2026-10-30-dashboard-performance-program-history-c119f31b.md):
  QA proof/SDK joins, sheets/recovery/import boundaries, Overview, Catalog directory,
  pool reuse, notification counts, explicit polling inventory, Assistant records,
  Payments inbox, Store Conversation recovery and refused-read intervals.

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

Earlier milestones and implementation contracts remain in the
[archived execution log](2026-10-30-dashboard-performance-program-history-c119f31b.md).
