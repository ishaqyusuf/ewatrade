# Local Storefront and Dashboard performance acceptance

Completed 29 October 2026 in the existing `main` checkout. Owner authorized local
implementation and testing only. Both batches delivered:12/12 plan packages.
[Phased plan and Midday contract](../plans/web-navigation-performance.md).
No push, deployment, provider change, new fixtures or business submission.

## Source and ownership

Storefront source milestones: `03d755291`, `5c8d39b3f`, `4b61b3e28`,
`a4f18eae6`, `12210ce3d`, `3d4f4e84d`. Dashboard: `2817b8373`, `ebcfa7bd7`,
`8d7fc141b`. Timing/acceptance tooling: `fce260191`, `4f88d0091`, `bf0dce71e`.
Final browser smoke candidate HEAD `955706139ccdf458e1192e3fa38f3d7bf88340df`
includes a concurrent owner's documentation commit after Dashboard `8d7fc141b`.
Unrelated staged explainers and concurrent dirty files were preserved. Verification
uses explicit owned paths; it does not accept unrelated work in this busy checkout.

## Delivered boundaries

- Storefront: one verified published Host/business/release context per request;
  session scope omits catalog, stock and category reads. Exact detail and
  non-catalog route projections, page-scoped pins and overlapping independent
  reads reduce unnecessary work. Release/hash/pin/runtime, plan cap, stock/price,
  host admission, LIVE/QA and customer-proof rules remain authoritative.
- Delivery: narrow package exports, separate Commerce editorial body, selected
  SSR-enabled feature chunks, shared quantity control, persistent shell/bag,
  pending-link feedback and production item intent prefetch capped at2 URLs.
  Development, data-saving/2G and private routes do not speculate.
- Dashboard: request-local session/legal, Tenant and forwarding context; direct
  configured API transport, caller-aware15s read deadline and one joined current
  membership/Store-access projection. Shell loading boundary and independent
  Overview reads; optional global sheets and URL-owned order/stock forms defer
  their code/mounting. Existing command authorization, scope-cache generation,
  hydration identity, retry and financial/concurrency checks remain unchanged.

No shared stale authorization cache, API contract, Prisma/schema, migration,
database index, provider action or assistant capability was introduced.

## Validation

- Offline QA doctor passed. Root fast plan inspected; final
  `bun run test:quick --files <owned paths>` passed225 tests/1224 assertions,
  source mapping, QA tooling types, formatting and the mapped source groups.
  This intentionally excludes concurrent foreign changes. Fast smoke is separate
  from feature/type/browser acceptance.
- Focused tests: Storefront authority/session/cap/detail refusal suite27/159;
  feature/template extraction suites33/241 then23/151; bounded prefetch/navigation
  policy4/23. Dashboard context/retry/logging/Overview/navigation/sales helpers
  37/298; final joined membership/context plus existing Tenant/Store-access
  regressions27/76. Suites overlap and counts must not be summed.
- Full Storefront and Dashboard TypeScript checks and optimized production builds
  pass. Final Dashboard build follows the joined membership change. Expected
  generated `next-env.d.ts` production route references restored to their exact
  prebuild development bytes. Existing Next middleware deprecation, dynamic
  filesystem tracing and localstorage warnings are not fixed by this change.
- Assistant H01 coverage current in local app mode; H02 impact check against
  `31ca217c3` passes with no capability/procedure changes. The comparison also
  includes concurrent commits; the owned impact record describes this task.
- Storefront browser script:2 passed,1 explicitly skipped dedicated photo-origin
  case. Real click navigation, Back, native fallback, delayed loading, shell/bag
  retention and existing390px shared checks pass. No browser errors or writes.
  The dedicated photo-origin case is not claimed as executed; existing policy
  assertions and concurrent photo ownership remain separate.
- Canonical existing-data local smoke passed after final source change:
  `bun run qa:smoke --target local --surface web --config <private local config>`.
  QA login, populated Catalog, sale draft total and cancellation pass. Optional
  timing session retains Dashboard shell and opens/cancels both deferred Overview
  forms. Zero business submissions or attempted blocked business mutations.
  Smoke driver tests2/2 also pass, including mutation blocking.

Canonical private receipt:
`.scratch/qa-release/smoke-955706139ccdf458e1192e3fa38f3d7bf88340df-local-web.json`.
Status passed; `runtimeVerified=false`; local dirty-checkout evidence cannot
qualify a release. No shared dev-runtime restart or optimized-runtime claim.
Representative Storefront and Dashboard screenshots inspected. Dashboard sidebar
expands as its existing hover/focus overlay; the shell retains the70px content
offset. This task does not redesign that behavior.

## Measured observations and limits

The plan contains the before/after table. Storefront About warm observations fell
from2319–2328ms to810–824ms; Shop from2312–2325ms to1823–1824ms. Home remains
variable at1860–2358ms. Dashboard final post-login shell6487ms, first Catalog3935ms,
first Overview2566ms, warm Catalog895ms and Overview1373ms. Baseline initial7037ms,
warm Catalog1389ms and Overview1595ms. Intermediate initial7704ms illustrates noise.
Login-to-shell includes authentication and is not LCP. Each Storefront route has
only2 warm samples; Dashboard has1 warm sample per route in each session.

Observed About improvement is clear within these local sessions. Statistical
significance, production gains, bundle-byte reduction, INP and tail percentiles
are not established. First compilation, remote database latency and concurrent
development affect results. Final optional browser resource counts are diagnostic
without a comparable baseline. Sub-second goals remain unmet for Home/Shop,
Dashboard Overview and initial loading. Follow-up server spans and a separately
measured local optimized runtime are recorded in the plan and Brain backlog.

Private logs/metrics/screenshots/source hashes are under
`/tmp/ewatrade-web-performance-20261028/`: `storefront-before`, `storefront-final`,
`dashboard-before`, `dashboard-complete`, `quick-web-complete.log`,
`storefront-final-build.log`, `dashboard-final-build.log`, type/focused logs and
`source-complete.json`. Temporary artifacts may expire; this receipt preserves
the relevant conclusions without copying credentials or QA account secrets.

## Brain impact

Updated local project memory: `.brain/features/web-navigation-performance.md`,
`.brain/decisions/2026-10-28-web-navigation-performance.md`, `.brain/BRAIN.md`,
`.brain/system/architecture.md`, `.brain/api/permissions.md`, task in-progress/done/
backlog, and `.brain/qa/2026-10-29-web-navigation-performance.md`. Brain is ignored
by repository policy and remains local; tracked plan/receipt/impact record preserve
the reviewable implementation history.
