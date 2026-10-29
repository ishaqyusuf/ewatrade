# Dashboard presentation prefetch ownership —29October2026

Partial DP-104 under the [full program](../plans/2026-10-29-dashboard-performance-program.md).
Parent e5fa0ccd3, current primary checkout, owned source hashes retained privately.
Local implementation/testing only. No restart, runtime switch, deployment, schema,
provider operation, business submission or new database fixture.

## Reproduced barrier and implementation

Nine actual route functions waited for presentation prefetch before returning their
existing loading owners: Settings Channels, Compliance, Bookings/quotes, Receipts,
Returns, Stores and WhatsApp messages; Conversations; full Order detail. The red
regression held every presentation query pending:13 tests passed and9 loading-owner
cases failed. That prevented a route's own loading/error UI from handling the read.

These prefetches now start without waiting for completion. Existing QueryClient
pending hydration and render-owned streaming transport handle the results. Query
inputs/counts, allowed Store fallback, manager/role/pharmacy checks, open-sheet data,
metadata, component/provider ownership and existing error behavior remain. Selected
Conversations timeline now starts without waiting for the queue to finish. Order
misses continue to render inside the page; no new notFound/redirect is introduced.

This changes scheduling only. Setup's ownerSignupSetup wait and the prescription
workspace-access decision remain ordered. No protected clinical data starts ahead
of access. Existing channels client all-query loading/error gate is still separate
work: returning the route earlier does not make every section independent. No query
freshness/retention/invalidation, mutation or API authority was changed.

## Verification

- Actual route functions with real QueryClient prefetch22 tests/64 assertions pass
  after9 red cases. All9 return before gated data resolves and schedule the same
  query counts. Signed-out routes start no reads. Manager/pharmacy admission,
  operator omission of manager-only settings, permitted Store input/fallback and
  open booking offering/limit100 request dependency pass. UI/auth/RPC boundaries are
  inert; this proves route control flow, not React/browser timing or live authority.
  Run separately because module mocks are process-wide.
- Owned-path fast source smoke237 tests/1531 assertions across45 files, QA tooling
  types/Biome, full Dashboard source types and H02 pass. Foreign staged explainers
  and Agent Chat excluded. H01 router is unchanged; current source coverage reused.
  API production graph and optimized build evidence belong to preceding transport
  commit e5fa0ccd3; no newer optimized-runtime latency acceptance is claimed.
- Desktop IAB, same existing QA owner: Receipt settings renders its current header,
  settings and sample preview after navigation/full refresh. No switch, text, Store
  selector or save control changed; no settings/payment/order/provider submission.
  Running Dashboard remains development mode. Screenshot route-presentation-proof.jpg.
- Canonical existing-data local web smoke passes in the frozen-source window:
  exact QA profile, populated Catalog and existing sale draft total/cancel with
  zero business submissions. Log and copied receipt retained as route-presentation-smoke*.
  Receipt identifies e5fa0ccd3 plus dirty source hashes; this post-run documentation
  update and commit follow the completed gate. Local runtime identity remains
  unverified and never qualifies release.

Private evidence: /tmp/ewatrade-dashboard-program-20261029/route-presentation-*.
The focused route test is not in the fast mapping and ran explicitly; no unsupported
mapping was hidden. Prior streaming6/40 covers pending hydration/ready-sibling/fresh
refusal/cancellation and owner isolation without re-running unchanged transport.

## Remaining work and Brain impact

Program accepted count stays3/27 (11.1%). Client section gates, useful prefetch input/
activation proof, per-family errors/scope changes, optimized timings and calibrated
budgets remain DP-102/104/401–409/501–503. Route return is a distinct milestone from
loaded data and final page speed. Brain BRAIN, navigation feature and in-progress
pointers updated locally. No public endpoint/input/DTO/permission/schema/relationship/
migration change; existing streaming ADR covers this scheduling pattern.
