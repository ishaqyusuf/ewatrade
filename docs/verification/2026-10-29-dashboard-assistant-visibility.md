# Dashboard retained Assistant visibility —29 October2026

Partial DP-202/204/407 work under the [full program](../plans/2026-10-29-dashboard-performance-program.md).
Primary checkout; private parent/source/lock hashes in `assistant-visibility-source.json`
under `/tmp/ewatrade-dashboard-program-20261029/`. Foreign staged work preserved.

## Cause and change

GeneralChat passed its `active` flag only to URL synchronization. Once initialized,
the minimized widget retained enabled availability/history queries,60s pending-review
and voice-capability polling, and an auto-start effect that could create an empty
conversation after the widget became hidden.

The actual data hook now takes `active=true`. Idle reads follow visibility; pending
commands or a known durable run keep their read owner active until finalization.
Feature availability/permission is still a separate server-derived fact. Auto-start
requires visibility even when cached or late history says no conversation exists.
Pending-review and optional voice-capability queries follow the visible owner.
The component, draft, ready files, recorder, streaming SDK and command/recovery
callbacks stay mounted. Scope reset, fresh command checks, attachment jobs and
stream finalization are unchanged. Full Assistant-page callers default to active.

## Regression and validation

- Before correction, the actual mounted source fixture had2 passes/2 failures.
  Minimized reads continued (including actual poll callbacks); cached empty history
  started an unwanted conversation. Source scheduling was not inferred from text.
- After correction,5 cases/28 assertions pass using real GeneralChat, its hook,
  GeneralComposer/VoiceComposer and real QueryClient/QueryObserver browser semantics.
  Inert tRPC/SDK/recorder/presentation boundaries perform no network/provider/DB action.
  Only60s poll timers are accelerated to15ms. Assertions cover actual requests after
  hidden invalidation/poll ticks, unsent draft/ready-file retention, recorder lifetime,
  late history, pending cancellation finalization, and recovery then return to idle.
- The isolated test wrapper prevents process-wide module doubles/window/timers leaking
  into ordinary tests. Existing mounted WhatsApp/chat attachment-switch test passes.
  No change to the native implementation is implied by that regression receipt.
- Owned-path fast smoke237 tests/1531 assertions across45 files passes; its mapping
  omits the new mounted wrapper, executed separately. Unrelated staged documents/
  Agent Chat excluded. Full Dashboard source types and5-file Biome/whitespace pass.
  Dashboard tsconfig excludes tests; fixture behavior is proved through Bun execution.
- Desktop IAB: restored the same existing QA owner profile after its prior session
  expired. Read an existing saved chat, opened that exact chat in the widget, typed
  `Local draft retention check — not sent`, minimized and reopened. The exact draft
  remained visible. Cleared the draft and minimized afterward. No Send, confirmation,
  conversation creation, business fixture or provider action performed.
- A first old-chat click did not produce the expected navigation and the session
  then redirected to login; this is not counted as a passed journey. The final
  verified flow used an on-screen saved-chat entry after fresh QA login.
- Screenshot `assistant-visibility-proof.jpg`, boolean UI receipt
  `assistant-visibility-ui.json`, red/fixture/existing/quick/types logs are private in
  the dated directory. Browser proof covers visible retention, while request/poll
  behavior is proved at the real mounted QueryObserver boundary. No production
  request-rate or navigation-speed improvement is claimed from these checks.
- Prepared optimized build965f64794 remains preserved while Dashboard-only runtime
  switch approval is pending. New optimized-runtime acceptance is still open.

## Midday conformance and remaining work

Reference `components/document-details.tsx` uses open-owned query activation;
`hooks/use-job-status.ts` owns conditional job polling and terminal/error stops.
EwaTrade keeps those boundaries in its existing hooks/composer. Pending-command/run
continuity is an explicit domain requirement: do not hide it by unmounting the VM
or cancelling recovery. Existing UI wrappers, URL history and layered commands stay.

DP-204 still includes other polling/cancellation/visibility owners. DP-202/407 and
all remaining family/budget acceptance remain open. Overall3/27 (11.1%) unchanged.
No API/schema/permission contract changed; H01 current source evidence retained.
H02 client/evaluation record must pass before commit. Brain feature/task/BRAIN
updated locally. No service restart, deployment, push or provider operation.
