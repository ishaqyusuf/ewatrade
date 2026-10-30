# Payments inbox read ownership — 30 October 2026

Local DP-203/204/405 slice following [P15 / A4 in the polling audit](../plans/2026-10-30-dashboard-polling-audit.md).
Parent source: `5a4dc128c`. Full program remains **3/27 accepted**. No deployment,
shared runtime switch, money write, customer report or connected fixture creation.
Private evidence root: `/tmp/ewatrade-dashboard-program-20261029/`.

## Cause and change

Payments to Check had two independent initial operations for the same
`businessBanking.pendingReports({limit:20})` result: the infinite list and its
first-page arrival observer. The actual mounted component with installed tRPC
client/options and query observers reproduces two operations. Focus, retry and
post-review refresh also duplicated that first read. HTTP batching may combine
operations; two operations are not necessarily two HTTP requests.

The infinite list now obtains page one through the canonical first-page query
using `queryClient.fetchQuery`, with zero freshness/retention and cancellation.
Its always-fresh mount still requests current authority even if that canonical
key already contains data. The arrival observer therefore does not independently
refetch on mount. Both owners join the same pending operation. Later pages retain
their existing cursor, size, fresh transport and AbortSignal.

The 30-second arrival poll remains page-one-only. An unchanged first-page signature
does not reread loaded pages. When a completed poll changes that signature, the
immediate list refresh consumes that already admitted first page and rereads the
loaded cursor pages once. The temporary result is cleared in the same call; if
the refresh pauses offline, it must obtain a fresh first page when it resumes.
No TTL or cross-request cache is added. The installed query state's update counter
distinguishes responses arriving in the same millisecond, including during a
pending Load more operation.

Post-review refresh first cancels obsolete pending-report reads, then invalidates
the same list/preview family with `cancelRefetch:false`. This permits the two
owners to join one **new** first-page read, without accepting a pre-command poll.
The existing numeric badge is invalidated too; the selected review stays mounted
and its callback still awaits the list refresh. No review command/confirmation or
canonical Order payment code changes.

The arrival observer also reuses the existing refusal interval helper. Known
refusal stops interval work; the app's current rejected-payload erasure and fresh
focus/manual recovery remain. Transient errors retain recovery. API-derived
Tenant/Store/creator scope, role checks, private receipt access and current writes
remain authoritative. UI layout, amounts, labels, selection and pagination are
unchanged.

A strengthened refusal test also checks an interval-only failure while a later
page is still loading. The old behavior hid the rows but left the infinite
projection cached. The inbox now cancels that derived read and clears its payload
on a known first-page refusal, following the existing QueryCache erasure pattern.
A late cursor result cannot restore it; focus still obtains current rows. This
adds no request or business permission. The separate red evidence is
`payments-inbox-refusal-copy-red.log`.

Midday sources inspected: Customers data table's typed query options/flattening
and `hooks/use-update-transaction-category.tsx` using `queryClient.fetchQuery`.
EwaTrade retains its financial zero-freshness policy and explicit page-one-only
polling exception instead of adopting a general directory TTL.

## Actual component regression

New isolated entry:
`apps/dashboard/src/components/business-banking/payments-to-check.mounted.test.ts`.
It runs the actual PaymentsToCheck, installed tRPC client/options, app QueryClient
and observers. Only SDK transport/data, URL selection, selected review and
presentation ports are inert. The selected review port invokes the real existing
post-review refresh callback, not a payment command. Observer interval callbacks
are triggered deterministically; no production 30-second wait or page-time claim.

Before the product fix, the strengthened regression reproduces initial reads2
instead of1; changed-poll/focus/review reads3 instead of2 with one loaded tail;
and retry reads2 instead of1. Unchanged polling already avoids tail reads.
`payments-inbox-red.log` retains the red execution. Eleven tests / 67 assertions
now pass, covering:

- Initial first-page read1; Load more reads only its next cursor.
- Unchanged poll reads1; changed poll reads first+loaded tail once each.
- Focus and post-review refresh read first+loaded tail once each; badge refresh
  and selected review retention remain.
- Interval-only refusal hides and erases both private query payloads, cancels a
  pending cursor result, stops interval work and can recover current rows on
  focus. Transient retry remains fresh.
- Unmount cancels the shared first read; another mount does not reuse obsolete
  rows. A pre-existing canonical cache does not replace the fresh mount.
- Post-review cancellation rejects an older in-flight poll and its late result.
- A paused refresh does not consume the pre-reconnect result; a new arrival during
  Load more wins even when query response timestamps share the same millisecond.

Full Dashboard types and the explicit fixture/entry type graph pass. API/DB/
financial commands are unchanged; no connected money mutation is needed to prove
this client scheduling change. Owned source/gate/UI evidence is recorded below.

Owned fast source smoke passes 237 tests / 1,533 assertions plus QA tooling types
and Biome. The explicit plan selects core/web/domain/mobile groups with no unknown
mappings; foreign chat/explainer changes are excluded. H01 is current with explicit
local router mode and an inert DB sentinel. H02 passes for client, with zero
capability/procedure changes. Canonical local web smoke passes QA login/exact
account, populated Catalog, sale draft item/total and cancel without submission.
The final 00:27:35–00:27:55 UTC execution preserves source/lock hashes; copied receipt:
`payments-inbox-smoke-passed.json`, `runtimeVerified:false`. Chromium uses the
previously verified outside-sandbox permission for macOS process registration.
No shared service is restarted. Exact inbox operation/race proof remains the
mounted fixture, not a connected report/review submission or optimized timing.
The earlier pre-erasure smoke and source hashes are preserved separately under
`payments-inbox-before-erasure-*`; they are not used as final-source proof.
Relevant types were rerun after the erasure change. The final type annotation
uses an unknown error at the custom query-cache boundary, preserving the actual
RPC error without assuming it has the native Error interface.

## Scope of remaining acceptance

This does not close Finance, all mutation dependencies, all polling owners or the
27-ticket program. The prepared optimized `9eb8a0c8` build remains intact and does
not include this slice or the later Assistant fix. Development source can advance
independently; optimized route-family timing retains its coordinated service
window. Source operation counts cannot establish page latency or production p95.
