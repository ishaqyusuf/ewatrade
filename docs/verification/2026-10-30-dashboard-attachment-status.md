# Attachment status read budget —30 October2026

Local DP-204/407, polling-audit P28/A2 implementation. Parent `86804a85b`.
[Full program](../plans/2026-10-29-dashboard-performance-program.md) remains
**4/27 accepted (14.8%)**, all59 routes/nine families. No deployment, service
restart, provider action, business fixture, upload, transcription or chat submission.

## Cause and implementation

`useSetupAttachments` polled `attachments.list` every1.5s as long as any local item
was reading. Known refusals and healthy indefinitely PROCESSING/empty responses
left that interval alive. Its existing Retry transcription calls a mutation that
can enqueue processing; it cannot safely stand in for read-only status recovery.

Automatic status polling now has a **120s browser read window** starting when the
first pending file enters reading. Partial completion keeps that deadline. Known
FORBIDDEN/UNAUTHORIZED/NOT_FOUND stops intervals through the existing helper;
transients retain recovery within the window. Deadline/refusal does not mark a
file FAILED, remove it, enqueue processing or cancel an upload/job. Pending files
still block Send until the server returns READY/FAILED or the owner removes them.
This budget is a client resource bound, not a measured server processing SLO.

The current composer shows a small status notice and **Check again**. This calls
only `status.refetch({cancelRefetch:false})`, so a concurrent in-flight check is
shared, and explicitly rearms one bounded window. Retry transcription remains
solely for the existing server-reported retryable FAILED state. Status freshness
is0 so focus/reconnect can obtain current results even after automatic polling
stops. A late READY response or a fresh focus read can still finish the draft;
a still-processing focus result after the deadline does not restart intervals.

The read now opts into the installed tRPC abort signal on unmount. A pending GET
can be cancelled when its owner leaves; already admitted server work may finish.
The deadline alone does not cancel that GET or committed processing. Empty reading
sets remove the timer/interval. No global retry/cache/TTL policy, scope/key/input,
upload/storage/processing/remove/retry command or API/schema change.

Byte comparisons confirm unchanged pending recovery, per-row READY/FAILED and
editable transcript handling, upload intent/PUT, analytics attribution, unmount
original cleanup, remove/takeReady, existing mutation retries, busy/Send guards
and command bodies. The composer differs only by the new read-status notice and
one formatting change. Midday `use-job-status.ts` supplies explicit active/terminal/
error ownership; the existing EwaTrade content-generation owner supplies the local
two-minute read-budget precedent. EwaTrade original/proof/processing authority is
preserved; no WhatsApp conversation case, provider or native behavior changes.

## Verification

- Actual hook/QueryClient/SDK observers reproduce six failures before the change
  (2pass/6fail): three refusal intervals, the unbounded window, absent recovery
  state and absent composer recovery action. A stronger unmount check separately
  reproduces the missing SDK abort opt-in (12pass/1fail).
- Final **13 mounted cases/117 assertions** and isolated wrapper pass. They cover
  all three known refusals, transient recovery, explicit read-only window rearming,
  late READY/focus recovery, partial completion without a deadline reset, empty
  reading set, committed late delivery after timeout, unmount abort plus ignored
  late transcript, once-only editable audio transcript and server FAILED handling.
  The actual SetupComposer/attachment chip renders Check again, uses its parent
  recovery callback, then renders the current READY summary without that notice.
- DOM/UI/recorder/analytics and observable transport are inert ports. Text nodes
  keep browser-like nodeValue/data coherence so rendered updates are inspectable.
  Rows use the real router output type and list results respect requested IDs.
  Every case asserts zero fetches and query-only RPC operations. No fixture file,
  real bytes, microphone, command, provider or backend state is created. This is
  actual client owner/composer proof, not live upload/transcription acceptance.
- Full Dashboard and explicit fixture/entry TypeScript graphs pass. Fixture-only
  readonly DOM/optional-signal typing was corrected; target fixture/types/Biome
  pass afterward. Owned four-path quick plan/check passes237 tests/1533 assertions
  plus QA tooling types, with zero unknown mappings. Foreign Agent Chat/staged
  explainers excluded. Final Biome and owned whitespace pass. H01 unchanged valid
  coverage evidence reused; H02 passes with zero capability/procedure row deltas.
- First canonical smoke failed at login **12:33:04.342Z–12:33:35.132Z**, before any
  journey checks: screenshot has the regular form without QA Quick Fill. A fixed-
  field local availability probe subsequently returned HTTP200/available:true.
  Exact first-run cause is unproven. No source, policy, grant or process was changed
  to obtain availability. Same Dashboard/API/Storefront/Marketing listener PIDs
  remained present. Both failed and successful receipts are retained privately.
- Same frozen-source canonical existing-data retry passes **12:35:23.332Z–
  12:35:46.148Z**: QA login/profile, populated Catalog, existing sale-draft total/
  cancel and navigation/sheet cancellation, zero business submissions. Source/lock
  hashes unchanged across both attempts. `runtimeVerified:false`; development
  evidence, no release qualification. The canonical journey does not exercise
  attachment processing; bounded/error/recovery UI proof is the inert composer.

Private evidence `/tmp/ewatrade-dashboard-program-20261029/attachment-status-*`:
red/final/wrapper/types/quick/H02 logs, frozen four-source/lock hashes, byte-parity
checks, initial failed and final passed receipts. No credentials, real actor/Store
IDs, SQL, private request bodies or profile payloads enter tracked evidence. Root
optimized `zMN4q6wxzuTfj0KPK4a8Y` is unchanged and excludes this later source slice;
no optimized latency ratio or dashboard-wide improvement claim.

P28/A2 budget/refusal/recovery is implemented. Aggregate requests/focus/reconnect
costs and full DP-204/407 acceptance remain open. The historical39-site inventory
stays pinned; a newly added one-shot deadline is not another network interval.
Brain BRAIN/task/QA/navigation, Setup Assistant and voice notes updated locally.
No API/schema/durable architecture change: API docs, migration and new ADR are
not required. Other23 tickets remain open.
