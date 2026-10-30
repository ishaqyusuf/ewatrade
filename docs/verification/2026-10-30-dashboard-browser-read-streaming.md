# Dashboard browser read streaming

30 October 2026. Local source parent `5518bde5a`, primary checkout. Partial
DP-003/103/104 and all browser-backed family tickets. Full program remains
**3/27 accepted (11.1%)**. No deployment, provider or application database changes.

## Reproduced gap and implementation

Midday's browser provider uses `httpBatchStreamLink`; EwaTrade's server provider
already streamed, but its browser provider still used `httpBatchLink`. A ready
query could not resolve until every sibling in that HTTP batch completed. This
coupled independent primary/optional reads across the dashboard.

The red test renders the actual Dashboard provider to obtain its configured
browser client, then executes its HTTP links through actual Hono/tRPC/protected
middleware and QueryClient. A fast result remains blocked after300ms while a
sibling is deliberately held. The old transport also times out waiting for that
ready result in the refusal-isolation case. Auth/database/network/reporting ports
are inert; this is a transport reproduction, not a live slow-query simulation.

Ordinary queries now use the installed streaming batch link. Existing private
body-query classification remains exact; Studio preview stays a POST body.
Mutations retain the original non-streaming HTTP batch link and fresh POST
admission. Query batching still shares one fresh GET-local context instead of
multiplying auth/legal/Tenant reads. No new dependency or custom stream parser.

Headers, analytics, logger filtering, provider lifetime, QueryClient ownership,
cache generation/clearing, query keys/retry/freshness, GET-local authorization and
domain/command APIs are unchanged. No Activity prefetch or mount-lifetime change.
Streaming does not remove explicit route awaits or all-panel pending/error gates.

## Verification

- Actual provider/SDK/Hono regression:6 tests/34 assertions pass. Ready-before-
  blocked plus one shared fresh authority context; Superjson Date fidelity;
  rejected query erases its prior payload without discarding ready sibling;
  next request rechecks changed actor/refusal; private preview POST and two
  batched commands retain3 independent POST authority reads; single opted-in
  abort and cancellation without aborting a still-observed sibling. These do
  not prove every possible completed-sibling/network lifetime interleaving.
- Isolated wrapper passes; process separation prevents provider/global-fetch
  mocks affecting other suites. Existing body transport, analytics, rejection
  classification and retry9 tests/75 assertions pass. No live command submitted.
- Full Dashboard types and the owned fixture type graph pass. Optimized Next16.4.3
  build passes, compiled7.8s and all required type checks. Only fixture DTO typing
  and Bun fetch.preconnect support needed correction during verification.
- Explicit three-owned-path quick plan/check passes237 tests/1,533 assertions,
  QA tooling types and Biome. Mapping reports no unknown paths. The transport
  regression runs separately because the smoke mapping is not feature acceptance.
  Foreign Agent Chat/staged explainers excluded. Existing unchanged QA-driver,
  API authority and server-stream evidence reused; no whole-API fixture rerun.
- Cache generation/clearing, header derivation, provider scope, analytics and
  logger source byte-identical outside the transport split. API/server transport,
  procedure/permission/command, query policy and source files unchanged.
  H01 coverage inputs unchanged; valid evidence reused. H02 reviewed.

No application schema/index/migration, query cache or authority shortcut. No
application or disposable PostgreSQL fixture needed for this slice.

## Optimized local window

Built from `5518bde5a` plus browser client SHA256
`c64c882730152ed9fc9ceb1167c7c453933be5277461088b78a45670ecb0c873`,
lock and three owned hashes pinned. BUILD_ID `o7zCuLrMZYHJOvlfCX3EM`.
The previous optimized artifact is preserved privately. Required generated Next
type references were restored guardedly; app config remains unchanged.

Canonical existing-data local smoke passes2026-10-30T10:18:06.286Z–10:19:30.594Z,
including all18 route-readiness actions, two isolated Activity GETs, exact QA
profile, existing Catalog row and sale draft total/cancel. Zero business
submissions, fixtures, grants, messages or provider effects. Source/lock/four
manifests match through the copied passed receipt. `runtimeVerified:false`:
this is local evidence, not release/runtime certification.

| Family | Refresh | Warm return |
| --- | ---: | ---: |
| Overview |986ms |1077ms |
| Catalog |1892ms |817ms |
| Orders |2411ms |820ms |
| Customers |2796ms |1329ms |
| Finance |3603ms |2336ms |
| Website requests |2482ms |822ms |
| Activity |3593ms |2631ms |
| General |1053ms |1324ms |
| Reports |2552ms |825ms |

Single action-to-content samples, not p95, CWV or per-family acceptance. Activity
previous3654/2600ms is similar; other families vary in both directions. No causal
dashboard-wide speedup claim from this pass. The controlled transport test proves
removal of the batch-wide completion barrier.

Many readiness windows end with HTTP requests still in flight. The observer counts
only completed requests/bytes/phases; absent API groups do not mean no API work.
Streaming headers expose setup timing only; full trace work is emitted on body
completion/error/cancel. These are not substitutes for completed server diagnostics.

Isolated non-streaming diagnostic GETs: filters1753ms/list1813ms, SQL8 each.
List context638.4ms, admission245.9ms, page SQL264.1ms, transaction-control624.4ms.
API domain work is unchanged; overlapping phases cannot be summed.

Dashboard7260(dev)→11509(optimized)→12607(dev). Development restored through root
launcher; API48226, Storefront46668 and Marketing90981 remain unchanged. Trusted-CA
doctor passes. Optimized manifests and prior Dashboard config/type references
are preserved after restoration. No API restart, TLS bypass or deployment.

Private evidence: `/tmp/ewatrade-dashboard-program-20261029/browser-stream-*`:
red/green/fixture/policy/type/quick/build logs, build inputs/manifests,
`browser-stream-smoke-passed.json`, family diagnostics and restoration evidence.

## Remaining program and Brain impact

The prior aggregate document timing (~1.24s) did not establish an exact per-query
client-start timeline. That finer startup attribution remains open. Activity's
mount-owned fresh reads require a deliberate consumption/authority contract before
server prefetch; no stale hydration is introduced to make a benchmark pass.

Next: actual initial-read start/ready timeline, remaining request/control cost,
explicit all-panel gates, then lifecycle/code-delivery/interaction and all-family
budget acceptance. No additional ticket is closed by this source slice.

Brain current pointers, web-navigation feature, architecture, API transport notes
and existing streaming ADR updated locally. Public DTOs/permissions and database
schema remain unchanged; no database documentation/migration update required.
