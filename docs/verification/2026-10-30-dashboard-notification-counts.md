# Closed-bell count projections — 30 October 2026

Partial DP-103/204/407 in the [27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Parent e11f87d9. Primary checkout; local only, no deployment/provider/schema change
or business submission. Program acceptance remains3/27 (11.1%).

## Confirmed cost and implementation

The shared shell bell fetched full pending payment claims, plan-change notices
and website-request previews while closed, although it displayed only numbers.
Opening mounted separate private preview readers. Three fresh count projections
now own the closed bell; open panels retain their full DTOs and current readers.
Personal business-notification unreadCount already used a count and is unchanged.

Website count shares the full reader's exact Tenant/permitted Store/unread-by-actor
predicate and omits its preview SELECT. Plan-change count reuses current notice
membership/recipient/account/Store/creator admission and the identical unread
predicate, omitting notice rows. Pending-payment count selects only up tofive IDs
with the same SUBMITTED/order scope; it preserves the existing badge's capped
five visible claims, rather than silently switching to a total count. No receipt,
payer/amount/reference, title/description or customer preview is serialized for
those three badges. Where they were allowed, the closed-bell source removes two
preview queries and narrows the remaining payment SELECT; audience reads remain.

Protected context and domain checks remain fresh. The two banking reads mirror
existing scoped-staff read grants, without writes. Website count retains the old
website-notifications scoped-staff refusal. Inputs are void/strict; client-supplied
authority is rejected. No existing full endpoint/DTO/tool/command is changed.
Coverage remains form-only via the existing banking/website-request rules.

Badge hooks retain private mount generations,0freshness/retention, fresh mount,
abort ownership and30s payment/60s other cadence. Fresh rejection clears payloads
and stops repeated intervals; focus recovery and transient failures behave as
before. Open full previews retain their fresh independent owners; closed ones
unmount. Website acknowledgements refresh the new count through the existing
callback. Plan dismissal refreshes its preview and numeric key after settling;
payment review refreshes its existing list and the numeric badge. Bank settings'
existing banking-prefix invalidation covers the new keys. No optimistic business
write or global invalidation is added.

Midday hook/UI separation and notification query/invalidation ownership inspected.
Existing EwaTrade notification/event, banking and website DB modules retain domain
authority; no new framework, realtime service or UI redesign.

## Verification

- DB count/full-reader tests9/28 pass after preview-cost failures; exact filters,
  boundedfive IDs, empty state, fresh audience refusal and error identity covered.
  One initial failure also exposed an incomplete error fixture; its inert preview
  port was corrected. This fixture correction is not a production bug fix.
- Actual mounted bell/hooks/cache37/142 pass. Closed bell fetches only numeric
  endpoints, open starts previews, close stops them; focused/refused/error/cancel/
  mount input behavior covered. Accelerated timer fixtures emit nonfatal act
  warnings; this is hook/owner evidence, not browser timing or native acceptance.
- Actual protected API and existing staff checks14/63 pass: numeric DTOs,
  authenticated Tenant/Store, current sales visibility, strict forged input,
  missing/denied/revoked/foreign-QA refusal and unchanged website scoped denial.
  Database/network boundaries inert; no stored fixtures or business commands.
- Full Dashboard types and API production/owned-test graph pass. One test's enum
  literal was widened by inference; typing the actual order scope fixes its type
  check without changing production. Owned fast237/1533 plus QA tooling/Biome pass;
  the scope excludes unrelated staged explainers/Agent Chat. H01 generated/current;
  H02 covers API/permissions/client/domain with0capability/3procedure rows changed.
- Three existing browser-driver checks pass. The canonical runner's local-only
  optional bell check reuses the selected Owner QA profile, validates the actual
  numeric response shapes/cap and0browser preview requests while closed, then
  opens/reads/closes full previews. It performs no acknowledgement/action. The
  private screenshot shows the existing website request and loaded empty activity
  list, with badge1 and existing Catalog table underneath. IAB control was
  unavailable; this is desktop headless browser evidence, not an IAB interaction.
- Final frozen-source canonical existing-data local web smoke passes. Receipt is
  copied privately before documentation changes and remains runtimeVerified:false.
  Login/profile, populated Catalog, draft item/total/cancel, shell retention and
  order/stock sheet dismissal pass. No manual service restart/switch, deployment
  or business submission. Four prepared optimized3cf manifests remain unchanged.

The bounded development run reports initial post-login shell5518ms, Catalog full
refresh2731ms, first Catalog1966ms/warm831ms and Overview1045ms/warm1016ms.
Compared with the previous2510ms refresh, these uncontrolled observations establish
no speedup or regression attribution/p95. The new bell assertions wait outside
navigation timing windows. One observed API read has6SQL calls/1246.4ms and
poolBusy2/524.8ms within pool524.9ms, request1776.3ms/context627.1ms. Phases overlap;
browser readiness does not capture every server-to-server/background request and
this API read cannot be assigned to the count queries from these aggregate facts.
Structural preview removal is verified; shared admission/concurrency remains open.

Private evidence: /tmp/ewatrade-dashboard-program-20261029/notification-counts-*.
Brain impact: project/task/feature pointers and API endpoints/contracts/permissions.
No database schema/relationship/migration changed, so no push/migrate is applicable.
Broader query lifetime, admission/pool concurrency and optimized per-family budgets
remain open. Count projection alone does not close the full27-ticket program.
