# Inbox and conversation queue polling — 30 October 2026

Local DP-201/204/406 slice; parent `734e4ebfd`. Full program remains
**3/27 accepted**. No deployment or application restart. Private evidence root:
`/tmp/ewatrade-dashboard-program-20261029/inbox-polls-*`.

## Findings and scope

The historical polling ledger identifies four readers here:

| Ledger | Reader | Current cadence |
| --- | --- | --- |
| P17 | `serviceCommerce.storeConversationQueue` |5s, no background interval |
| P25 | `storefrontRequests.counts` |30s |
| P26 | `storefrontRequests.orders`, selected list |30s |
| P27 | `storefrontRequests.services`, selected list |30s |

Actual mounted owners reproduce12 failures: four readers × FORBIDDEN,
UNAUTHORIZED and NOT_FOUND each issue another operation on the next interval.
Private payload erasure already works; `retry:false` does not stop a later
numeric interval. Red log: `inbox-polls-red.log`. Nine healthy scheduling/tab
cases already pass before the change.

The healthy tab investigation found no duplicate inactive list owner. The actual
Inbox conditional, real nuqs URL hooks and installed testing adapter mount only
the selected list. Returning retains its required fresh mount read. Counts are
shared for both tab badges; they are not unused prefetch. No activation/cache
change is justified by this evidence.

## Change and preserved contracts

Both components reuse `readPollInterval(query.state.error, cadence)` at these
four sites. Known refusals stop interval work while the observer remains enabled
for focus/current invalidation/reopen recovery. Transients retain cadence. Empty
queues/zero badges still poll. Existing query activation, keys, inputs, Store
selection, filters, pagination, freshness/GC, retry policy, background behavior,
URLs, selected details, drafts, commands and API permissions remain unchanged.
The Website inbox retains its zero-stale/always-fresh mount policy and current
cache lifetime.

Midday's job reader ties polling to activation/terminal/error state. EwaTrade
retains its narrower existing three-code refusal classifier and transient
recovery, applying that current policy to these owners. This does not alter job,
provider, proof or acknowledgement lifecycles, or close the remaining audit sites.

## Mounted proof and limitations

The isolated fixture runs actual StorefrontRequestsInbox and ConversationWorkspace,
the real nuqs state hooks/testing adapter, installed tRPC options/client and app
QueryClient/observers, mounted with React DOM. A minimal XML DOM hosts these
behavioral tests. UI primitives, conversation table presentation, view persistence,
auth transport and returned data are inert ports. Tab handlers invoke the actual
Inbox state transition; this is not native pointer/keyboard/browser evidence.
The SDK refuses unknown operations and mutations. No live DB, stored business
fixture, message, confirmation, sale, quote, payment or provider action runs.

All31 cases/175 assertions pass:

- Twelve known-refusal cases verify cleared query data and rendered row/badge,
  stopped interval work, focus recovery and polling resumption.
- Four transient cases retain interval recovery, and four background/offline cases
  verify no transport work while paused and one resumed operation before the next
  scheduled read. The real query observer drives these signals.
- Four invalidation cases can refresh a refused observer; this invokes query
  invalidation directly, not an actual business command or UI submit.
- Four empty cases retain healthy queue/badge cadence.
- The normal tab case verifies selected-only mounting, no inactive-list ticks and
  fresh return. Two refused-visit cases verify unmounted observers stop work and
  reopening still obtains current data rather than remaining disabled.

Production5s/30s callbacks are driven deterministically through their installed
observers; they are not real-time request-rate or browser latency samples. Error
ports cover the shared classifier, not a claim that every endpoint emits all
three refusal codes in a live account. Selected detail forms and business writes
are unchanged and are not exercised. Current global known-refusal erasure is
reused; this change adds interval guards, not a new permission decision.

Final source/platform checks and remaining acceptance follow below.

## Final source and local verification

Dashboard and explicit fixture/entry type graphs pass. The isolated entry passes
all31 inner cases. The owned fast plan selects eight paths, core/web/domain/mobile
and zero unknown mappings; foreign staged work is excluded. Fast checks pass237
tests/1,533 assertions plus QA tooling types/Biome. H01 is current in local mode
with an unusable DB sentinel; H02 passes for client with zero capability/procedure
rows changed. `qa:doctor --offline` and `git diff --check` pass.

Frozen canonical local smoke passes01:46:12–01:46:34UTC: exact QA account,
populated Catalog, sale draft item/total and cancellation without submission.
Fourteen source/classifier/cache/params/helper/lock hashes match afterward. Copy:
`inbox-polls-smoke-passed.json`, `runtimeVerified:false`. This smoke does not visit
the inbox or queue, reproduce permission errors, or establish optimized parity.
Exact owner erasure/interval/tab/recovery proof remains the inert mounted fixture.
No live grant mutation, selected detail submit, business write, provider effect,
application restart or deployment.

Prepared optimized9eb8 manifest hashes remain unchanged and exclude this source.
Its pending timing/restoration request remains open. Remaining WhatsApp, domain,
attachment and special job owners keep their audit obligations. Full DP-201/204/406
and the program remain open at3/27 accepted.
