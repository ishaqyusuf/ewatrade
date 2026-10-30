# Dashboard Order-change completion read effects —30 October2026

DP-203/403/404/405/406/501 slice under the [full27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Parent `4b86b0ccc`; five owned source/test/impact files and lock frozen for local
smoke. Program remains **4/27 (14.8%)**, all59 routes/nine families. No native
financial command, business fixture, service restart, provider or deployment.

## Confirmed causes

The actual shared Order refresh hook has three reproduced problems:

1. Its awaited message-preview key omitted Order identity. An active held preview
   for another Order could block this Order's completion callback.
2. After current Order/detail/timeline/change-controls/Activity reads succeeded,
   deferred whole-Orders invalidation made those same reads stale again.
3. Mutable financial/Customer readers were only marked stale, and related Service
   readers were omitted. Actual cache observers remain unchanged after completion.
   The enclosing Finance route only starts Overview balance/owed/spending prefetch
   on document requests; soft router refresh is not proof of those mounted readers
   updating. Scoped Catalog detail keys also cannot consume an ordinary route key.

Five actual-hook cases yield three failures and two passing barrier/error cases
before product correction. This is read-owner reproduction, not a live financial
command, rendered-money correctness or optimized server-latency measurement.

## Implementation contract

The hook still waits for current `orders.get`, timeline, change controls and
Activity. Message-preview prefix now includes `orderId`, covering its event/source
variants without waiting on another Order's preview. All five current owners use
existing `Promise.allSettled` semantics: required reads settle before completion,
while failure retains the current error rather than pretending success data.

A small application helper then performs deferred work, outside the completion
promise. The conservative Orders/Catalog/Inventory/Customer/search stale markers
remain, except successful just-refreshed current Order keys are not marked stale
again. SDK public `matchQuery` respects their actual partial key identity. Other
Order keys and failed/pending current reads remain invalidated for recovery.

The second background stage actively refreshes cached Order directory, scoped
Catalog detail, Customer history, Service job/ordinary+infinite queues/stage counts
and mutable Finance/Customer Ledger readers. Known loaded successful fixed
statements retain the existing Finance/Customer snapshot rules. Latest/failed/
pending/absent/unrecognized keys remain refreshable. Pure contact directory keeps
a stale marker without eager reload. No uncached dependency is started.

Completion does not wait for background finance/list work. Later `router.refresh`
remains after background settlement, including failures. Existing route-owned
stock/directory/shell refresh is preserved. No routing, native callback, money/
stock payload, command, pricing, approval, refund/recovery, permissions, transaction,
query-key or stale/gc TTL change. Mutable Finance/Ledger prefixes remain broad;
remaining report/other-command dependencies and full DP-203 are still open.

Inspected Midday Customer-form explicit effects/thin orchestration inform the
application helper. EwaTrade's fresh read, scoped Catalog and native financial
contracts determine this boundary; no optimistic money or global cache reset.

## Verification

- Actual hook renders through React SSR/QueryClientProvider; real QueryObservers,
  SDK options/keys and controlled focus drive invalidation. Router is an inert
  completion marker, and every API operation/business command throws. Numeric
  data markers are not domain DTOs. Final **5 cases/52 assertions** pass.
- Held current Order prevents completion and list work until it settles. Held
  unrelated preview no longer delays completion or starts its own read. Successful
  current reads stay fresh, another retained Order remains stale and a controlled
  focus transition adds no current read. Failed current Order remains errored and
  invalidated while list/route recovery still settles.
- Nine active financial/Customer/Service/scoped-Catalog markers refresh once;
  a held balance does not delay the completion promise. Later route refresh waits
  for that background stage. Loaded fixed Customer/Finance statement markers stay
  uninvalidated; contact directory stays loaded and stale. Actual error erasure,
  private scope admission and financial money/transaction behavior reuse unchanged
  source evidence; these numeric markers do not independently verify them.
- Final wrappers/classifier regression **9 cases/74 assertions** passes, with
  child fixtures isolated to prevent module-mock contamination. Dashboard and
  fixture type graphs pass. Initial SDK QueryFilters/InvalidateFilters option
  placement and branded fixture data-key typing were corrected without assertions.
- Owned five-path quick plan/check passes **237/1533 across45 files**, QA tooling
  types and Biome, zero unknown mappings. Foreign Agent Chat/staged explainers are
  excluded. Reviewed H02 passes one client record, zero API/capability deltas;
  unchanged H01/API authority evidence reused. No dependency added.
- Seven native/caller/route/key owners remain byte-identical: OrderOverview,
  money/amend/approval dialogs, FinanceRoute/Overview and Catalog scoped-key owner.
  No financial callback or server implementation is edited.

QA availability200 precedes one passed canonical local development smoke,
**14:49:24.219Z–14:49:48.178Z**: existing QA login, Catalog, draft item/total and
Cancel without submission. Frozen five owned files and lock still match. The
canonical browser flow is general navigation sanity; inert hook proof exercises
completion without submitting any business command. No additional financial UI,
provider, fixture or service change. Runtime identity remains unverified.

No new refresh/warm sample, causal speedup, p95, complete family or budget
acceptance. Earlier abf8aae83/KRKy optimized timings predate this client slice.
Private `/tmp/ewatrade-dashboard-program-20261029/order-refresh-*` retains red/
green/focused/type/quick/H02/parity logs, source hashes, availability and receipt.
Brain current checkpoints, quick Orders and Service Commerce updated locally;
no API/schema/ADR update is required for this application-cache-only behavior.

All23 open program tickets remain. Next scheduling candidate is sequential fresh
QA-session proof and legal status in `createTRPCContext`, after the same candidate
session is known. Require actual Hono critical-path/refusal/error proof before
parallelizing; native writes and fresh admission remain authoritative. Resume
measured Activity/Finance context/control work, broader invalidation/application
and all original lifecycle/family/optimized criteria within the same27 tickets.
