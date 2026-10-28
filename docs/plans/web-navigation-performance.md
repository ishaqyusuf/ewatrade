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

- [ ] S0 Baseline: preserve ownership, record local navigation and query-cost repro.
- [x] S1 Authority: lightweight published Host/Tenant/Site/Store context; customer
  scope without listing/stock/category reads; preserve all eligibility checks.
- [ ] S2 Route projections: shell/about/account/checkout/receipt/detail request only
  their needed resources; share request context and metadata reads.
- [ ] S3 Read pipeline: remove redundant work and overlap independent reads;
  retain plan cap, query-bound cursors, stock/price semantics and public DTO bounds.
  Add indexes/read models only if measured evidence requires them.
- [ ] S4 Delivery: narrow measured package imports and split optional feature code
  while preserving renderer pins, SSR, template previews and persistent state.
- [ ] S5 Navigation policy: bounded intent prefetch and useful pending feedback;
  retain URL ownership, privacy/no-store and photo-revocation/fallback semantics.
  Media/shared caching changes require evidence and an explicit freshness contract.
- [ ] S6 Acceptance: focused source/security/types/build, existing-data browser/smoke,
  before/after receipt, Brain updates and owned commits.

### Batch 2 — Dashboard

- [ ] D0 Baseline: inspect current shared layout/providers and measure existing QA
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
