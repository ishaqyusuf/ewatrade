# Dashboard render-owned streaming reads —29 October2026

Partial DP-003/102/103/104 under the [full program](../plans/2026-10-29-dashboard-performance-program.md).
Primary checkout, parent d901eadd8 plus owned hashes in the private evidence directory.
Local implementation/testing only; no deployment, provider change, schema/migration,
new business fixture or business submission. Accepted program count remains3/27 (11.1%).

## Reproduced causes and correction

The actual Dashboard server client used a module-global httpBatchLink. A ready query
was held behind a deliberately blocked sibling. A separate concurrent-owner test
also reproduced two render owners sharing one transport batch and the first owner's
headers/results under an isolated RSC host cache adapter. This is an architectural
source/transport reproduction, not evidence of a live cross-account incident.

The server client is now React.cache-owned per render request and uses the installed
tRPC httpBatchStreamLink. One owner's independent results can resolve as ready;
queries in that owner's batch still share one fresh API context/legal/Tenant read.
The request-context promise is captured once per owner. Direct configured API origin,
forwarded headers, no-store and merged15s/caller-abort deadline are preserved.
The browser client, mutation/body transport and all domain authority remain unchanged.

Midday's actual local server reference uses independent httpLink operations and
nonblocking prefetch. EwaTrade retains batching to avoid multiplying its fresh API
admission work, while streaming removes the batch's ready-result barrier. This does
not remove explicit route awaits or an all-panel client pending gate. Access-before-
clinical-data and other genuine dependencies must remain ordered.

Existing PERFORMANCE_TRACE diagnostics originally ended when the streaming response
was constructed, missing later SQL/procedure work. The optional API middleware now
tracks body completion/error/cancellation with a frozen numeric snapshot. Streaming
headers expose responseSetup only; full request/phase work is in the completed fixed
server trace. Cancellation reports partial work, not successful completion. One
reader passes chunks through without buffering or retaining response content. Status,
headers/cookies, byte stream, errors and cancellation reasons are preserved; exporter
failure cannot fail the operation. Hono's header replacement behavior and tRPC11's
application/json plus chunked JSONL representation are covered explicitly.

## Executed evidence

- Red-capable actual server-client/Hono/tRPC/protected-middleware regression6 tests/
  40 assertions passes. It covers ready-before-blocked, one shared fresh authority
  read per owner, distinct concurrent owners, pending hydration consumed by a real
  QueryObserver without another fetch, Superjson Date fidelity, fresh refusal clearing
  an earlier payload and opted-in cancellation. RSC cache/Next headers are simulated
  with AsyncLocalStorage; no external database/provider is used. Run separately
  because module mocks/global fetch are process-wide.
- Focused response-tracing, existing tracing, privacy parser, forwarding/deadline and
  retry checks21 tests/109 assertions pass across5 files. Cancellation initially
  exposed a read.done race, fixed by recording cancellation intent before awaiting
  the underlying reader. Real Hono tests cover merged timing, security/cache headers,
  multiple cookies,204/no-body and default-off behavior.
- Owned-path fast source smoke237 tests/1531 assertions across45 files passes,
  including QA tooling types/Biome; foreign staged explainers/Agent Chat excluded.
  The new transport regression is deliberately separate from that smoke scope.
- Full Dashboard source types and the full imported API production-entrypoint type
  graph pass. This is not a whole API test-fixture graph type claim. Optimized
  Next16.4.3 Dashboard build passes; generated next-env change restored guardedly.
  Build manifests retained. The new build was prepared only; the shared Dashboard
  remains in development mode, and the earlier approved965f64794 runtime window is closed.
- H01 source coverage is current; H02 passes1 reviewed record with0 capability and
  0 procedure changes. No assistant command/permission/confirmation contract changed.
- Anonymous read-only local API probe negotiates JSONL: setup timing present, no
  misleading full request timing, UNAUTHORIZED preserved in the envelope. HTTP200
  for the envelope is not authorized success. No auth/session material retained in
  tracked evidence.
- Desktop IAB existing QA owner: normal Quick Fill sign-in restored an expired
  session, Reports navigation and full refresh render the loaded30-day chart and
  stock content. Screenshot server-stream-proof.jpg retained privately. No export,
  setup, order, payment or other business command submitted. No service restart or
  runtime switch. The earlier launcher log file did not advance during this UI
  window, so no endpoint-level live trace attribution or speedup is claimed.
- Canonical existing-data local web smoke passes in the frozen-source window:
  exact QA profile, populated Catalog and existing sale draft total/cancel, with
  zero business submissions. Log and copied receipt retained as server-stream-smoke*.
  Local runtime identity remains unverified and cannot qualify a release. Receipt
  was copied before this post-run documentation update/commit; source code stayed
  frozen through the run. No further optimized-runtime acceptance is implied.

Private evidence: /tmp/ewatrade-dashboard-program-20261029/server-stream-*.
Red/green transport/owner/cancellation histories, source tests/types/build, H01/H02,
prepared build manifests, fixed diagnostics and screenshot are retained together.

## Remaining acceptance and Brain impact

The52 direct prefetch sites/22 owners still need per-family runtime identity/count
proof; Settings/Conversations/Order detail include explicit awaited presentation
prefetches. Channels also has an all-query pending/error gate. These are DP-104
work, not fixed by changing transport. Reports activation/payload costs, context
admission cost, polling owners, budgets and all family acceptance stay open. No
blanket TTL, authorization cache or cross-request result reuse was introduced.

Brain feature, task, BRAIN, API contracts, architecture and a render-request streaming
ADR are updated locally. No database schema/relationships/migrations, public input/
DTO/procedure or permission contract changed; no migration or database push required.
