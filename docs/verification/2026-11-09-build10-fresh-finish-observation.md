# Build10 fresh native finish-return observation — 9 November 2026

Status: **OBSERVED PASS for the bounded native finish-return subcase**. On
9 November,17:51–17:52 Africa/Lagos (16:51–16:52Z), the source-chat coordinator
viewed the physical phone through DeviceHub and recorded the exact success message
after the owner's confirmed fresh close/reopen. No new purchase, manual Restore,
coverage change, mobile build or deployment was performed for this observation.
Normal startup recovery can verify and finish an existing purchase. Broader I05
and lifecycle acceptance remain open; Apple remains2/6 (33.3%).

## Physical observation and provenance

The owner answered “ready” after the coordinator's single instruction to terminate
the app in the app switcher and reopen installed signed10 under the original
reviewer/EwaTrade Review business. Termination and unchanged identity are attributed
to that completed owner instruction, not independently inferred from a screenshot.
The coordinator then saw the live exact text:

> Your store subscription has been verified. Review this business's current plan and coverage below.

The same screen showed Release this business; Starter$3.99, Growth$9.99 and Pro$22.99
monthly offers; Restore purchases, Manage store subscriptions, Terms and Privacy.
The current top plan card, slot count and business identity header were outside
the captured view. No new claim about those values follows from this image.
The Release control alone does not prove the paid period remains active.

This accepts at least one mapped, authenticated current-lifetime reconciliation
whose native finish promise returned successfully, using the pinned source proof
below. It does not establish an exact transaction ID, that all callbacks finished,
an empty unfinished queue or the first historical finish. Refresh promises fulfilled;
fresh current plan/coverage requires its separate visible/server evidence.

Private mode0600 screenshot, with hardware inspector hidden:
`/private/tmp/ewatrade-build10-fresh-finish-2026-11-09.png`.
Distinct observed receipt, including screenshot hash and attribution:
`/private/tmp/ewatrade-build10-fresh-finish-observed-2026-11-09.evidence.json`.
The earlier source-audit receipt remains unchanged. Do not repeat the phone action.

## Accepted scope and exact candidate

A fresh, current-lifetime message can establish that **at least one authenticated,
mapped-purchase reconciliation awaited native finish successfully**. It need not
prove the whole unfinished queue empty. No new diagnostic build is necessary for
this bounded positive subcase.

Reuse the accepted installed private1.0.0(10), native source
`2d4424b1525c4aa05e6ced39ce888e31d7f8140e`, EAS
`50f69a74-5dae-4d0a-b481-9ad6164146f4`, runtime
`018c6c66e7e614408870451b744e5befac86a851` and signed IPA receipt in the
[build10 sequence](2026-11-09-build10-finish-and-lifecycle-sequence.md).
The accepted web/API runtime is b0e29c66d; it does not replace this native source.
Current local mobile wording/layout changes are not installed10 evidence.

## Why fresh message state is meaningful

References here use exact2d source line numbers, not the changing checkout:

- `store-subscription-provider.native.tsx:44` initializes message with
  useState(null). It has no storage, query-cache, session-profile or server-message
  hydration. Its setters supply local literals; the exact success text has one
  producer in signed source, at194.
- The provider is mounted in root `_layout.tsx:516`, outside individual screens.
  Navigating away/back, locking the phone or returning from Apple settings does
  not reset that state. A real app-switcher termination then fresh process launch
  clears it. Inspect the live page after startup, not the old app-switcher image.
- Provider459 keys the controller to owner/business. Setter74 calls isCurrent:
  mounted state, session/cache generations, user/business and OWNER role must
  still match. `completeStorePurchase` repeats its lifetime fence around every
  await. A retired invocation cannot supply this message to a new owner/business.
- Reconcile150–183 requires a mapped purchased item and purchase reference, then
  passes that reference to server verification and the same Purchase to native
  finishTransaction({purchase,isConsumable:false}). Verification rejection skips
  finish; a finish rejection sets storeFinished=false. Refresh has its own result.
- Auto-recovery380–411 starts on connection with configured product IDs and on
  foreground. It refetches mappings and lists available purchases before the same
  reconciliation. No manual Restore or new purchase is needed to start this case.

Pinned expo-iap3.4.13 source index.ts698 and installed build/index.js458 both
await ExpoIapModule.finishTransaction. ExpoIapModule.swift103–119 awaits OpenIAP
before returning true; the Podfile.lock/podspec pin is openiap1.3.15. The inspected
local OpenIAP module's finish path awaits the matching-ID pending transaction,
current entitlement or unfinished transaction; a missing ID throws. This supports
an awaited native finish-return inference from the app branch, not an independent
transaction log or queue snapshot. Package pin/lock/helper source evidence is
reused; no archive/device inspection or native test was repeated.

Two important qualifications:

- Active available purchases are not unfinished transactions. The JS wrapper
  defaults onlyIncludeActiveItemsIOS=true. Finishing an already-finished active
  item can be idempotent; success does not establish that it was unfinished before
  this attempt or prove when its first historical finish happened.
- Refresh awaits query invalidation promises. Pinned TanStack queryClient uses
  active-query refetches and swallows refetch errors unless throwOnError is set;
  build10 sets no such option. A fulfilled refresh promise therefore does not
  independently prove every query refetched successfully. Read visible current
  plan/coverage separately; native finish-return does not require pretending that
  cache invalidation proves a fresh subscription snapshot.

## Single controlled owner action — completed; retained protocol

Fully swipe EwaTrade away in the iPhone app switcher, reopen the existing signed10
app, keep the original reviewer owner/EwaTrade Review business, open Plan & billing,
scroll to the message above Restore purchases and leave it visible. The owner
supplies phone taps; coordinator may view the live screen through existing access.

Do not press Restore, buy, Manage, cover/release, sign in/out, change store/tester
identity or alter provider controls. Do not repeat cold launches until green. If
a credential, update, setup or unexpected identity screen blocks the path, stop
and record it rather than changing the case. Allow one bounded observation while
the live page/prices settle; no new message is an inconclusive result.

This is not passive read-only inspection: normal startup recovery may perform
the already-authorized verification, native finish and refresh of an existing
purchase. It does not authorize a new purchase or provider/account control.

## Exact branches and permitted conclusions

| Fresh live observation | Conclusion for this invocation | What stays open |
| --- | --- | --- |
| “Your store subscription has been verified. Review this business's current plan and coverage below.” | Verification returned, native finish awaited successfully, refresh promises fulfilled and current-lifetime setter ran. Accept the bounded native finish-return subcase for at least one mapped purchase. | Exact transaction ID, all callbacks/queue, first historical finish; fresh visible plan/coverage is recorded separately. |
| “Your subscription was verified. Reopen Plan & billing to refresh its current status and business coverage.” | The branch requires storeFinished=true but refreshed=false. It also supports native finish-return; refresh/display acceptance is incomplete. | Refresh and current displayed state; same identity/queue limits as above. |
| “Your subscription was verified, but the store could not finish processing it. Use Restore purchases to retry.” | Verification returned but that invocation's native finish promise rejected. Record a failed finish attempt. | Do not obey the copy by starting another Restore in this case. Preserve original purchase and investigate only the observed boundary. |
| “Your purchase is awaiting verification. Check your store purchase history and use Restore purchases to retry verification.” | That invocation failed before successful reconciliation; no native-finish pass. | No new purchase or repeated Restore; other callbacks are not classified from this message. |
| Store unavailable, missing purchase reference, recovery error, other text, no text, or Starter/slot1 alone | No positive native finish-return inference. Auto-recovery silently returns for some empty/unavailable catalogue/history outcomes. Missing success is inconclusive, not proof native finishing never occurred. | Record the exact observation and stop; no automatic diagnostic-build requirement or repeated-action loop. |

Success can overwrite another callback's earlier failure, and later errors can
overwrite success. The accepted assertion is existential: at least one fresh
same-lifetime invocation reached the branch. Absence of an error is never proof
that every callback or pending transaction succeeded.

## Evidence to record and transaction identity limit

Record owner-confirmed true termination/relaunch, observation time in Lagos/UTC,
installed candidate reference, original visible owner/business, exact first/final
message visible in this finite attempt, and visible plan/coverage. A coordinator
screen observation is attributed as such; an owner report alone stays attributed
to the owner. Do not record credentials, opaque account/transaction IDs or signed
receipts in public documentation. Do not manufacture an absent message.

The UI text names no transaction. The saved08:39 scoped proof of one original
durable purchase/coverage, continued original identity and no new purchase give
context; they are not a fresh native transaction-ID measurement. A natural renewal
or other valid mapped receipt could be reconciled. Do not invent an exact original
transaction ID or all-receipts success from this text. If a later acceptance case
separately requires exact-ID correlation or global queue inventory, assess its
own evidence seam then. Those stronger assertions are not prerequisites for this
bounded positive finish-return case and do not authorize a diagnostic build.

Current source/tests already cover verify-before-finish, failure separation and
retired-lifetime fencing. Their accepted unchanged evidence is reused. This
documentation update adds no implementation, repeated device test or live call.
Offline doctor passed. Quick smoke scoped to exactly these two owned documents
passed51tests/254assertions plus QA tooling types; unrelated assistant/AI source
work was excluded. Pinned source/SDK assertions, local links and diff checks pass.
Private mode0600 audit:
`/private/tmp/ewatrade-build10-fresh-finish-source-audit-2026-11-09.evidence.json`.
Those earlier checks qualify the protocol/source proof, not the physical outcome.
The coordinator's later live observation above supplies the bounded actual result;
it does not convert source tests into broader lifecycle acceptance.

This observed-result update passed offline doctor, quick smoke scoped to the four
owned acceptance documents (51 tests/254 assertions plus QA tooling types), eleven
relative-link checks and diff checks. Unrelated finance/catalog changes were
excluded and preserved. Existing native source/test proof was reused; no further
device or provider request was made to update the receipt.

Brain impact: local `.brain/features/native-store-billing.md` and
`.brain/tasks/in-progress.md`. No API, permission, schema or provider change.
