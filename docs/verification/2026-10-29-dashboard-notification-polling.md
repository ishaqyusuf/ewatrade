# Dashboard notification polling —29October2026

Partial DP-204/407 under the [full program](../plans/2026-10-29-dashboard-performance-program.md).
Primary checkout, parent e4784759e plus owned source/lock hashes retained privately.
Local implementation/testing only. No service restart/runtime switch, deployment,
provider change, business submission, alert read/archive/dismissal or new connected
fixture. Program accepted count remains3/27 (11.1%).

## Reproduced waste and correction

Three shared bell reads used unconditional intervals: unread activity count and
payment-plan notices60s, pending payment reports30s. A known access refusal already
cleared their old private payload, yet the interval kept sending the same refused
read. The website-request hook already stopped401/403 polling, providing the local
pattern. Actual mounted-hook tests reproduced6 refusal/recovery failures before fix;
for example2 observed reads grew to6 while a previously successful owner was refused
under an accelerated test clock. This is request-count proof, not a live speed/cost ratio.

Four hooks now live in hooks/use-business-notification-reads.ts, following the
inspected Midday use-notifications/notification-center split. Presentation, exact
inputs/limits, generated SDK keys, private mount generations and action callbacks
are retained. A shared isRejectedRead helper expresses the existing query-cache
FORBIDDEN/UNAUTHORIZED/NOT_FOUND erasure policy; notification interval resolvers
stop on those codes. The website path now also stops the same NOT_FOUND refusal.
Observers remain enabled: focus/new mount/explicit refetch can recheck fresh access,
and successful reads resume the existing cadence. Network/server/other domain
errors retain cadence.0 freshness/retention, fresh mount, abort signal and website
panel poll:false remain. No broad TTL, shared private cache or command shortcut.

## Executed evidence and limits

- Mounted actual hooks with real makeQueryClient/useQuery observers21 tests/
  80 assertions pass. Each hook tests fresh refusal clearing data/stopping interval,
  focus recovery/resumed success, transient continuation, independent mount cache
  keys/canonical SDK input and cancellation. Website panel stays interval/focus
  inactive and reopening gets a fresh owner. The existing inert DOM adapter uses
  microtask query notification scheduling and accelerates only30s/60s intervals
  to18ms; no network/database/provider/command/credential is involved. Run separately
  because module mocks/DOM/timer adapters are process-wide.
- Rejection policy and existing retry checks6 tests/65 assertions pass, including
  all three codes, real TRPCClientError, malformed/other failures and unchanged retry
  behavior. Actual server transport/hydration/refusal/cancellation regression6/40
  passes after the shared cache classifier extraction. Separate Bun processes keep
  their distinct host/mocks isolated.
- Offline doctor, owned fast237 tests/1531 assertions across45 files, QA tooling
  types/Biome and full Dashboard source types pass. No unmapped paths. New mounted/
  policy/transport tests run explicitly outside that mapping. Foreign explainers/
  Agent Chat excluded. H02 passes1 client record,0 capability/procedure deltas;
  API/router unchanged and current H01 evidence reused.
- Desktop IAB existing QA owner: current bell opens/closes/reopens and displays
  its unchanged unread website request and empty activity state. A short locator
  observation expired on reopen; the next AX read confirmed the loaded panel.
  No alert/Mark read/Dismiss/Preferences/financial/provider action invoked. Final
  screenshot notification-poll-proof.jpg; panel left closed, unread count preserved.
  Refused/failed/focus timing is proved in mounted tests, not by manipulating live
  memberships or waiting a broad connected timer matrix. No page-speed/p95 claim.
- Canonical existing-data local web smoke passes in the frozen-source window:
  exact QA profile, populated Catalog and existing sale draft total/cancel with
  zero business submissions. Log/receipt copied as notification-poll-smoke* before
  this post-run documentation update/commit. Receipt identifies e4784759e plus dirty
  source hashes. Runtime identity remains unverified; no release qualification.

Private evidence: /tmp/ewatrade-dashboard-program-20261029/notification-poll-*.
No new optimized build/runtime proof or all-dashboard polling acceptance claimed.
The [query policy contract](../plans/2026-10-29-dashboard-query-policy.md) records
Midday conformance, scope and the remaining owner-by-owner audit obligation.

## Remaining scope and Brain impact

Other polling/activation owners, compact badge projections and duplicate preview
reads, full family attribution, initial refresh latency and optimized budgets remain
open. Successful polling still performs required fresh reads; this slice only stops
repeating an already-refused optional notification read. Financial/stock/clinical/
link/status/command authority stays server-derived and unchanged.

Brain BRAIN, web-navigation-performance, business-activity-notifications and
in-progress pointers updated locally. No public input/DTO/procedure/permission,
financial notification policy, schema/relationship/migration or new architecture
changed; no database push or ADR is required. Assistant capabilities unchanged.
