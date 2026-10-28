# Local web navigation performance

Owner authorized phased implementation on 28 October 2026. Batch 1 is Storefront;
Batch 2 is Dashboard overall navigation and initial page loading. Use the current
checkout and commit each coherent phase. No push, deployment, publication,
provider configuration, paid resource, fixture creation or financial submission.

## Evidence and scope

Local `next dev` compiles routes on demand and does not represent production
prefetch/optimization behavior. Record first visits separately from warm repeats.
Measure useful destination content, not just URL changes or loading indicators.
Use existing QA data and the root QA/browser tools. Keep measurements bounded;
report sample count, median/range and source/runtime limitations. Never claim
production improvement from development timings. Retain source hashes when other
owners change the shared checkout during execution.

Initial source findings: the storefront layout, metadata and pages share a broad
catalog loader; session scope invokes that loader separately; paid listings may
aggregate stock before pagination; factory counts and pins run serially; feature
dispatchers import all customer journeys. React cache is request-local. Existing
Next navigation, persistent shell/bag and loading/error boundaries are reused.

## Midday lessons incorporated

- One request-scoped context/query identity for shared authority and metadata;
  no second browser fetch for already supplied route data.
- Start independent reads early. Place loading/error boundaries at real data
  boundaries; a parent must not await optional work before rendering them.
- Route-specific projections, including public receipt-by-capability reads.
- Explicit package subpath exports; measure development compilation and browser
  chunks before applying experimental import optimization.
- Separate optional code splitting from mounting/query activation. Preserve SSR
  for meaningful content and the one persistent business-scoped bag owner.
- URL owns search/filter/sort/pagination; server resources, transient UI and bag
  state have distinct owners. Preserve matching server/client query semantics.
- Explicit resource freshness/retry/invalidation. No blanket stale interval for
  stock, payment or identity. Keep canonical transaction-time write checks.
- Intent-based bounded prefetch, never an unrestricted catalog sweep.
- Preserve type/build gates; do not copy Midday's ignored build errors, broad
  menu prefetch, infrastructure assumptions or global client-only rendering.

References: local Midday `apps/dashboard/src/trpc/{server,query-client,request-context}`,
Customers page, public invoice route, global-sheets provider, website startpage,
and UI/invoice package exports. Inspect installed Next.js docs before API changes.

## Stable phased checklist

Each item is one work package. Progress is completed packages / 12, not test
coverage or production acceptance. Conditional optimizations finish with an
explicit evidence-based decision if changing them would add cost or weaken policy.

### Batch 1 — Storefront

- [x] S0 Baseline: preserve ownership, record local navigation and query-cost repro.
- [x] S1 Authority: lightweight published Host/Tenant/Site/Store context; customer
  scope without listing/stock/category reads; preserve all eligibility checks.
- [x] S2 Route projections: shell/about/account/checkout/receipt/detail request only
  their needed resources; share request context and metadata reads.
- [x] S3 Read pipeline: remove redundant work and overlap independent reads;
  retain plan cap, query-bound cursors, stock/price semantics and public DTO bounds.
  Add indexes/read models only if measured evidence requires them.
- [x] S4 Delivery: narrow measured package imports and split optional feature code
  while preserving renderer pins, SSR, template previews and persistent state.
- [x] S5 Navigation policy: bounded intent prefetch and useful pending feedback;
  retain URL ownership, privacy/no-store and photo-revocation/fallback semantics.
  Media/shared caching changes require evidence and an explicit freshness contract.
- [ ] S6 Acceptance: focused source/security/types/build, existing-data browser/smoke,
  before/after receipt, Brain updates and owned commits.

### Batch 2 — Dashboard

- [x] D0 Baseline: inspect current shared layout/providers and measure existing QA
  login, initial shell, representative route transition and warm return.
- [ ] D1 Request context: deduplicate auth/Tenant/Store/context and preserve matching
  server/client query identity, current scope, revocation and post-write freshness.
- [ ] D2 Critical rendering: remove unnecessary serial layout/page dependencies;
  start independent reads early and isolate optional loading/error work.
- [ ] D3 Delivery and navigation: narrow measured imports/optional global features,
  avoid mount-time query fanout, retain navigation/state/freshness contracts.
- [ ] D4 Acceptance: focused checks and local production build, one existing-data
  navigation/smoke session, measurement comparison, Brain updates and owned commits.

## Intended data flow

```text
Request -> verified request-local authority -> required route projection -> render
                                           -> independent required reads in parallel
Customer token -> session validation -------^ (no catalog listing)
Persistent shell/bag ----------------------------> retained across soft navigation
Canonical writes -> fresh locked policy/price/stock/idempotency -> targeted refresh
```

## Acceptance and failure matrix

| Boundary | Required evidence |
| --- | --- |
| About/account/receipt shell | No general listing or stock aggregation |
| Session scope | No catalog/category/stock reads; expired/foreign scope refused |
| Host/publication | Verified custom host, LIVE/QA separation, exact active Store/release |
| Listing/detail | Existing cap, cursor binding, availability, price and photo eligibility |
| Navigation | Useful content ready; shell/bag retained; Back/filter state correct |
| Slow/failing reads | Existing bounded loading, error and retry behavior |
| Optional chunks | Meaningful content remains server rendered; no missing styles |
| Dashboard context | No permission downgrade or cross-Tenant query-cache reuse |
| Money/concurrency | Canonical commands/checks unchanged; no real submission in smoke |
| Measurements | Source/target/sample count; cold compilation separated from warm reads |

Initial goals: feedback within 100 ms where feasible, warm navigation under one
second on the pinned local profile, zero general listing/stock reads for non-catalog
routes. These are engineering targets, not achieved results or production SLOs.
Reuse valid unchanged evidence. Run scoped `test:quick --files` because this is a
busy checkout; disclose exclusions. Relevant application types/build and assistant
H01/H02 gates remain separate from source smoke. No deployment is implied.

## Execution log

- Setup: existing main checkout; unrelated staged explainers and concurrent
  storefront/notification work preserved. Offline doctor passed. Whole-checkout
  smoke plan exposes foreign unmapped notification paths; owned-scope verification
  will not claim acceptance of those paths.
- S1: real repository-path regression reproduced an unnecessary catalog read for
  customer scope (including before a tampered-release refusal). Server-only empty
  catalog projection removes listing/stock/category work. Focused existing scope,
  public admission/cap/cursor tests: 23 passed / 138 assertions; Storefront full
  TypeScript check and owned formatting passed. No write-authority/schema change.
- S0 timing mode extends the existing navigation browser test. Exact flagship QA
  host,9 transitions,1 document,0 writes/errors. First visits Shop2396/About3983/
  Home2370 ms; six warm samples2312–2350 ms, median2326.5 ms. Explicit1000 ms goal
  correctly fails. Private artifact:
  `/tmp/ewatrade-web-performance-20261028/storefront-before/performance.json`.
  Anonymous run includes S1 source (no customer cookie); compilation partially
  warmed by selector repairs. This is development evidence, not production proof.

- S2: request-local business context shared by layout/page/metadata; non-catalog
  frames omit listings, paid detail reads only the eligible item, capped detail
  checks bounded ID membership, and photo pins follow the requested page. Release
  integrity is checked before resources. Focused34/271 and Storefront types pass.

- S3: render sessions reuse current request authority without another Tenant/Site/
  Store chain; all command callers retain the fresh default resolver. Presentation
  counts are request-memoized with primitive scope keys, and counts/pins overlap.
  New session/cap/detail/scope tests10/39 and Storefront types pass. Narrow DB scope
  export avoids editing the concurrently owned query barrel. Index/read-model
  changes are deferred: removing entire unused reads is proven; no query plan yet
  justifies schema/compute changes on the constrained shared database.

- S4: explicit UI subpath exports adopted in14 owned storefront modules; public
  exports remain compatible. Commerce editorial body is separate from the legacy
  full renderer. Live shell/context use narrow exports and selected account,
  checkout, receipt and detail journeys use SSR-enabled dynamic imports. The bag's
  quantity control no longer imports the whole Product journey. Existing template
  static rendering/pin/parity/shell/feature tests pass (33/241, then23/151 after
  control extraction), Storefront types and full production build pass; optimized
  compilation6.2s. No comparative bundle-byte improvement is claimed yet. Existing
  middleware deprecation remains. Foreign shared-feature edits preserved.

- S3 measured follow-up: verified Host now resolves the primary Site, exact Store,
  Tenant/subscription and active release in one joined query instead of3 sequential
  reads. Explicit relation ownership, duplicate-primary, hash/pin/runtime and plan
  checks retained. Focused scope/cap/detail/source tests27/159 and types pass.
- S5: selected-link pending feedback uses Next useLinkStatus with no layout shift;
  production intent prefetch is capped at2 unique public item URLs per visit,
  disabled for data-saving/2G and development, and excludes receipt/account/private
  URLs. Policy/navigation tests4/23 and types pass. No shared page/media caching or
  provider change: current evidence does not justify weakening revocation/freshness.
- Storefront browser acceptance after delivery/join:9 timed transitions plus
  retained-shell/in-memory-bag/Back/loading/responsive session passed,0 writes/errors.
  Warm Shop1823–1824/About810–824/Home1860–2358 ms. About meets the initial goal;
  listings/Home do not. Source/remote database/streaming costs remain explicit;
  no production speedup or statistically reliable tail percentile is claimed.

- S6 source: owned-path fast smoke225/1224, final Storefront production build and
  types pass; H01 current and H02 passes with0 capability/procedure changes.
  Concurrent local-QA photo adapter moved LIVE/provider admission into an OR
  branch; its stale projection assertion is aligned with that guard, not weakened.
  Final canonical smoke receipt is pending shared with D4.
- D0: existing canonical web smoke now optionally writes local navigation timing
  artifacts, preserving its single-JSON stdout protocol. Existing QA login,
  catalog, sale-draft total and cancellation completed with0 business writes;
  initial shell7037/7097 ms, warm Catalog1389/1474 and Overview1595/1493 ms.
  First receipt rejected extra diagnostic stdout (fixed); second rejected source
  changes during its run. These are diagnostic observations, not passed receipts.
  No deployment/retry-by-deployment. Final acceptance will hold source steady.

## Midday migration contract and conformance checklist

- References: Midday Customers route/trpc request-context/server/query-client;
  website layout/startpage; public invoice route; global-sheets provider.
- Storefront files: DB public-storefront/factory-loader/customer-scope, app
  storefront-pages/factory/layout/route metadata, runtime feature dispatcher and
  template dispatch. Keep route entrypoints thin and scope in DB repositories.
- Dashboard files: lib session/tenant, trpc server/request-context/query-client,
  shell layout/loading boundary, optional global-sheets and assistant loaders.
- Required: request-local authority, matching route/query identity, independent
  reads, loading/error ownership, bounded optional features and focused QA.
- Preserved: URL search/filter/sort/detail state, persistent bag/form state,
  existing headers/open buttons/sheets/table actions/mutation invalidation.
- Tables, columns, bulk bars and form-to-sheet redesign are intentionally omitted:
  this task changes navigation/loading, not those established interactions.
- No new API/schema, scope from client input, stale shared authorization cache,
  package-to-app dependency or blanket client-only rendering. Final acceptance
  audits every changed boundary against this contract and the failure matrix.
