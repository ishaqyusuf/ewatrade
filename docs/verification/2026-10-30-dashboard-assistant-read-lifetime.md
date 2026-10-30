# Dashboard Assistant record-read lifetime — 30 October 2026

Local DP-204/407 slice following the [interval audit](../plans/2026-10-30-dashboard-polling-audit.md).
Parent: `23fa8e7c2`; source/lock hashes and command logs are kept privately under
`/tmp/ewatrade-dashboard-program-20261029/`. No deployment or shared runtime switch.
The full performance program remains **3/27 accepted**.

## Cause and change

Quick Assistant retains its chat while minimized to preserve history, drafts and
in-flight command results. Its activity flag reached the root hook and composer,
but answer-card record links were descendants without that activity contract.
Their fixed 15-second Tenant-context interval continued while the panel was hidden
and after known refusals, even though the app correctly erased refused payloads.

A small local read-activity context follows `GeneralChat.active`. Only the private
record reader consumes it. Minimizing unmounts that reader/observer and cancels an
unshared in-flight read through its existing AbortSignal. Reopening mounts a fresh
reader, captures the current cache generation and waits for a new authorized
context response before exposing a record link. History, drafts, recorder state,
command completion and bounded streamed-run recovery keep their existing owners.

The reader reuses `readPollInterval` to stop repeated FORBIDDEN, UNAUTHORIZED and
NOT_FOUND intervals. It remains mounted while visible so focus/manual recovery is
possible; transient errors retain interval recovery. Zero freshness/retention,
fresh mount, current Tenant/Store matching and safe record URL construction remain.
There is no new permission, procedure, TTL, business command or visual redesign.

Midday references inspected: `hooks/use-job-status.ts` for activation/terminal/error
polling, `components/chat/chat-context.tsx` for local subtree context. Existing
EwaTrade `ActivatedSheet` also keeps controller state distinct from active reads.
This adopts lifecycle ownership, not Midday's cadence or an optimistic cache.

## Actual-path regression

The existing isolated visibility fixture now runs the actual QuickAssistantPanel,
QuickAssistantContent, GeneralChat, GeneralThread, GeneralAnswerCard and
OpenAssistantReadRecord with the real app QueryClient and installed observers.
SDK/RPC/data, recorder and unrelated handoff/presentation ports are inert. Unlike
the earlier visibility fixture, the answer card is no longer stubbed out. Unlike
the original private diagnostic, the reader is placed through the real descendant
chain rather than directly inside a mocked content slot.

Before the product fix, the strengthened regression reproduced continued hidden
reads (5→9), repeated refused reads (3→6), and no cancellation on minimize. The
private red log is `assistant-record-visibility-red.log`. Production 15s/60s optional
intervals are accelerated only for the source fixture. There is no page-latency
claim from those timings.

After the fix, eight fixture tests / 64 assertions pass, covering:

- Hidden interval/invalidation work stops while the panel and unsent draft remain.
- Reopen captures a new generation and withholds the old link during a delayed
  context read; a different active Store refuses the original link.
- All three known refusal classes erase the private context and stop intervals;
  focus can obtain a fresh result and resume polling.
- Transient errors keep interval recovery; minimize aborts the pending private
  read and a late resolution cannot expose a hidden link.
- Existing hidden auto-start, late history, pending command completion and
  streamed-run recovery regressions continue to pass.

Entry point:
`bun --env-file=/dev/null test ./apps/dashboard/src/components/general-assistant/use-general-assistant-visibility.mounted.test.ts`.
The fixture itself can be run explicitly to expose its individual test results.
This is inert mounted source proof, not a connected Assistant history/AI submission.

## Verification and remaining acceptance

Dashboard production types and the explicit owned fixture graph pass. The latter
first exposed the existing fixture fetch stub's missing Bun `preconnect` property;
its port now explicitly refuses preconnect and its full graph passes. The entry
test passes after that test-only fix. Owned fast source smoke passes 237 tests /
1,533 assertions plus QA tooling types/Biome, across the selected core/web/domain/
mobile groups, with no unknown mappings. Foreign staged explainer/chat changes
are excluded explicitly. H01 is current under `APP_ENV=local` with an inert DB
sentinel; H02 passes for client only, zero capability/procedure changes.

Canonical existing-data local web smoke passes: QA login/exact account, populated
Catalog, sale draft item/total and cancellation without submission. Source/lock
hashes were frozen across the 00:13:00–00:13:21 UTC execution. Its copied receipt is
`assistant-read-smoke-passed.json`, with `runtimeVerified:false`; local checkout
identity is not proof of an optimized runtime. It exercises the standard path,
not a seeded Assistant answer or AI submission. Exact record lifecycle/failure
proof is the inert actual-path fixture above.

The first smoke attempt failed before page work because the filesystem sandbox
denied Chromium's macOS Mach-port registration. The existing inert driver checks
then pass 3/3 outside that sandbox, followed by the canonical smoke retry. The
failed receipt is retained as `assistant-read-smoke-failed.json`. No product fix,
browser flag, shared-service restart or weakened write guard was used to pass.

All four prepared optimized manifest hashes remain unchanged. The prepared `9eb8a0c8`
build remains intact and **does not include this source change**. Development
source may advance independently; optimized family timings still require their
separately coordinated runtime window. This slice does not complete the remaining
polling owners, Finance duplicate reads, DP-204, DP-407 or the full program.
