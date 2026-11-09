# Build10 finishing evidence and remaining owner sequence — 9 November 2026

Preparation only. No new device action, provider request, database query, purchase,
Restore, release, build, OTA or deployment occurred. Apple remains **2/6**.
Root/source owns the single pending Dashboard password sign-in; this packet adds
no question or immediate phone action. It supplies the next cases after that
handoff, individually, rather than authorizing a batch of provider changes.

## Exact candidate and saved evidence

Installed candidate remains private1.0.0(10), native source
`2d4424b1525c4aa05e6ced39ce888e31d7f8140e`, EAS
`50f69a74-5dae-4d0a-b481-9ad6164146f4`, runtime
`018c6c66e7e614408870451b744e5befac86a851`. Reused artifact/signature receipts bind
IPA SHA256 `eb80bdb6c4bf52a93ab27ea4fe6cc52fec3c7a4bd1a201f33dfbaa9c00b63354`,
valid signature, linked StoreKit/native IAP and Production origins. The saved
distribution entitlement has get-task-allow false. This audit did not re-inspect
the connected phone, archive or signature. Last accepted live backend is
`e1626301dd3aef0925ac9cda3b2140c9cfc04012`; later local/source changes do not replace
either deployed candidate.

The pinned dependency is expo-iap3.4.13; package.json and bun.lock are unchanged
from build10. The installed dependency version agrees. The reconciliation helper
and its existing10 tests are also byte-identical; reuse their prior source proof,
not another run. Current provider source has later pending/error wording absent
from10; that wording is not installed acceptance.

Accepted saved outcomes remain cancellation/no-grant, the original signed Sandbox
purchase recovery, explicit business enrollment, and one Restore preserving the
original purchase/period and same coverage row. At the last saved Restore check
08:39:19Z, purchase count1, correct-owner coverage1, Starter/owner_subscription;
verification advanced to08:37:17Z. The original period end last proved was
**9 November 2026,20:26:34 Africa/Lagos** (19:26:34Z), with renewal enabled. This
is a historical boundary to observe, not a new renewal or current-state claim.
Default TestFlight renewal is daily; controlled Sandbox renewal settings differ.
[Apple TestFlight guidance](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight).
The saved24-hour period is consistent with that default, but is not Apple-account
identity proof. Our appAccountToken binds the EwaTrade owner; it does not identify
the Apple login or prove that this chain has the Sandbox tester's failure controls.

## What build10 actually does

Git source references below are relative to exact2d4424b1, not current line numbers:

- `apps/mobile/src/lib/store-purchase-reconciliation.ts`: line20 awaits verify;
  line25 awaits finish; line33 refreshes. Failed verify stops before finish.
  Lifetime checks surround these awaits. A finish rejection sets storeFinished=false
  but still refreshes verified server access; refresh failure is a separate outcome.
- `apps/mobile/src/components/mobile/store-subscription-provider.native.tsx`:
  line173 supplies finishTransaction({purchase,isConsumable:false}); reconciliation
  requires purchased state, mapped product and a purchase reference. Owner/session/
  business/cache fences retire old callbacks. A switch after native work already
  started cannot undo that work; it prevents subsequent wrong-lifetime effects.
- Restore at line347 loads fresh catalog, obtains available purchases and reconciles
  mapped purchased items. The helper's restored result is an iteration outcome;
  the controller can catch verification/finish errors without rejecting the outer
  Promise. A resolved Restore or coverage callback alone is not a success receipt.
- Recovery at line383 also runs when billing connects and on app foreground.
  Returning to the app may therefore verify/finish the existing receipt without
  pressing Restore. Do not promise a phone-view sequence makes no StoreKit calls.
- The provider is restricted to authenticated OWNER/business context (line455).
  This is source evidence; it does not replace a real staff/account-switch case.
- The panel's Manage button at line159 calls deepLinkToSubscriptions. In pinned
  SDK source, index.ts770 dispatches iOS to modules/ios.ts378, which opens
  `https://apps.apple.com/account/subscriptions`. It does not call the SDK's separate
  showManageSubscriptionsIOS method or open app-owned Sandbox controls.

The SDK's JS finishTransaction awaits the native call and returns void; the Swift
bridge awaits OpenIAP finishing before returning success. Its getAvailablePurchases
defaults to active items, not an unfinished-queue snapshot. Apple distinguishes
[current entitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)
from [unfinished transactions](https://developer.apple.com/documentation/storekit/transaction/unfinished).
An active item being restorable does not prove finishing failed.

## Native finish proof boundary

No saved evidence contains a native finish-return or unfinished-queue observation.
The original private native-runtime JSONL capture has zero lines. Server verification,
Starter, slot1 and an Apple success sheet do not prove StoreKit finishing. An exact
fresh success-message branch could support a bridge-return inference, but not queue
emptiness; stale messages or a later successful receipt can hide earlier outcomes.
The owner did not report such a scoped branch, so it remains open.

The SDK contains getPendingTransactionsIOS, but build10 app source has no caller or
viewer. No StoreKit refund-sheet entry point is present either. Native logging
defaults off outside DEBUG, and no enabling override was found in the app; no
retrospective SDK log is promised. Existing signed-device/console access would
need to provide a matching observation. Otherwise a future diagnostic build needs
its own explicit mobile authorization, which is currently excluded.

Do not call clearTransactionIOS, finish from an ad-hoc bridge, or Apple's server
[Finish Transaction endpoint](https://developer.apple.com/documentation/appstoreserverapi/finish-transaction)
to manufacture native acceptance. Server finishing is a different state-changing
path and would not prove this installed client's call. No such action was made.

## Remaining sequence and the boundary before each action

Use the original chain first; read-only scope checks precede provider changes.
Failure/recovery, if controllable, precedes cancellation/refund so those actions
do not destroy the renewal scenario. The coordinator sends only the next relevant
case when its access/target is ready; the table itself is not approval to execute.
Existing action-specific authorization persists and must not be requested again.
Where it already covers the named target/effect below, reuse it; where it does
not, obtain only that missing decision. Device access and the owner's final phone
confirmation are separate from permission to prepare or inspect the case.

| Order / case | Minimal owner action | Required access or exact additional decision | Evidence and stop condition |
| --- | --- | --- | --- |
| 1. Manage, observation only | In build10 on the original owner/business, tap Manage store subscriptions once; view the existing Starter entry and return. Do not cancel, resubscribe, buy, Restore or release. | Existing unlocked phone and original store account; any system password/Face ID entered directly by owner. Navigation is already within read-only acceptance scope. | Record which Apple screen opens, product/period/renewal state and whether it is the original test subscription. If absent or ambiguous, stop; do not sign out of Media & Purchases to guess another history. |
| 2. Existing business/account/staff scope | Use only existing approved EwaTrade business/account selectors and permitted staff login; keep the Apple account unchanged, then return to the original owner/business. Do not press purchase or Restore. | First resolve real Production targets from approved records. Saved reviewer capture contains one business and no staff target; Preview QA identities do not establish Production membership. Owner handles normal login; no password resend or fixture creation. | Same owner: another uncovered business must not auto-enroll or consume another slot. Another owner must not acquire the receipt. Staff may retain authorized business operations but must lack owner purchase/coverage controls. Foreground recovery may occur; match durable binding/coverage separately. If no eligible existing target exists, that case stays open. |
| 3. Natural renewal | Leave the original already-enabled renewal unchanged; after a genuine event, return and refresh the app once. | No new provider-control approval or purchase. Observe the next actual boundary using the existing chain; do not adjust device/server time. | Verified DID_RENEW/transaction facts, later paid end, same owner/chain and coverage; repeated delivery cannot duplicate grants. Last saved period end above is not an observed renewal. |
| 4. Failed renewal then recovery, conditional branch | Only if the original subscription belongs to the identified Sandbox tester: Settings → Developer → Sandbox Account → Manage → Account Settings; owner disables Allow Purchases & Renewals, then later reenables it for recovery. | Before each toggle, exact owner approval for that tester and account-wide effect on all its active Sandbox subscriptions; owner performs the control. Confirm same chain first. If TestFlight used the Media & Purchases identity, switching tester does not migrate it. Any separate licensed test chain needs separate purpose-specific approval and cannot replace this purchase's evidence. | Wait for verified billing-error/retry state, then a genuine recovery; preserve period anchoring, binding and coverage. Do not submit another purchase as recovery. [Apple failure/recovery instructions](https://developer.apple.com/documentation/storekit/testing-failing-subscription-renewals-and-in-app-purchases). |
| 5. Apple grace configuration, only if needed for its own case | No tap is requested now. Prepare Sandbox-only configuration separately. | Saved8November metadata showed Apple grace unconfigured. Enabling it is a new app-wide provider setting: owner must approve exact duration, eligible renewals and Sandbox-only scope before confirmation. Never select Production+Sandbox as a testing shortcut. | This tests Apple grace, not the application's separate five-day contribution. [Apple configuration](https://developer.apple.com/help/app-store-connect/manage-subscriptions/enable-billing-grace-period-for-auto-renewable-subscriptions). |
| 6. Cancellation / expiry | After renewal/recovery evidence is preserved, owner confirms Cancel Renewal only for the identified existing Sandbox Starter subscription, then returns without repurchasing. | Named cancellation approval for this test subscription and owner control of Apple's final confirmation. Do not automate a consequential financial control. | Verified renewal-off state while the valid paid period remains; later genuine expiry and current Free admission limits. Cancel is not a billing failure and must not create five days. No immediate Free claim merely from the cancel tap. |
| 7. Refund / revocation, last | No refund tap is prescribed for build10; its StoreKit refund sheet is not implemented. First identify a legitimate supported Sandbox control for this transaction, if available. | Exact existing Sandbox transaction/product, chosen approved/declined outcome, explicit case approval and owner submission. No guessed button path, real-money refund, new purchase, consumption-data submission or history reset. A new native refund entry point would require separately authorized implementation/build. | Approved REFUND/revocation must remove paid admission, retain records and deny courtesy; REFUND_DECLINED is distinct. Xcode local simulations cannot accept TestFlight server delivery. [Apple refund tests](https://developer.apple.com/documentation/storekit/testing-refund-requests). |
| 8. Five-day and Free/retained-data follow-through | Observe actual verified lifecycle and refresh the same existing workspace; do not release it to simulate lapse. | Real elapsed application time and pre-existing eligible records. No additional provider mutation is required just to observe. If over-Free-limit records do not already exist, record that gap rather than create fixtures to pass. | Free admission tier/limits, no receipt transfer/new grant, existing data and role access retained. Acceleration alone does not prove five real days; detailed source expectations follow. |

Do not clear Sandbox purchase history: Apple documents that deletion as
[irreversible](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings/).
It would destroy this chain's test provenance and is not refund/expiry evidence.
No device signing, credential entry, account switch or provider change was executed
by this preparation.

## Correct expected expiry and courtesy facts

Livee162 apple-subscriptions.ts215–260 requires fully verified status/renewal facts.
The five-day contribution is anchored to last paid expiresDate, never lookup time;
it requires billing retry/grace status, isInBillingRetryPeriod=true,
expirationIntent=BILLING_ERROR, autoRenewStatus=1 and no revocation. Voluntary
cancellation, missing status and network/verifier failures cannot start it.
Effective expiry is the maximum of paid expiry, valid Apple grace expiry and that
eligible five-day anchor. A longer verified Apple grace period may therefore
outlast the application contribution. Fresh later status and revocation still
matter; do not treat accelerated Sandbox minutes as five days of licensed proof.

For the versioned owner cohort, getRetailOpsTenantPlan returns current Free
admission limits after lapse, while getRetailOpsOwnerPlanIds can intentionally
retain Starter for operations on existing records. Thus a future diagnostic
planId=free/source=owner_billing_free with ownerPlanId=starter can be correct.
Do not "repair" that retained tier into a loss of existing-record access, and do
not mistake it for paid capacity. Voluntary Release changes enrollment and is a
different case from lapse. Exact source: retail-ops-subscriptions.ts withOwnerBusinessCoverage
and owner-billing/policy.ts projectOwnerBusinessAccess; unchanged from livee162.

## Verification and remaining acceptance

Saved-proof assertions bind the exact native artifact, dependency pin, unchanged
helper/test bytes, zero-line capture and saved Restore outcome. Source audit is
`/private/tmp/ewatrade-build10-finish-lifecycle-source-audit-2026-11-09.evidence.json`.
No new physical or provider-control subcase closes from this review. Existing
source ordering/lifetime safeguards are reused; existing cancellation/recovery/
enrollment/Restore/jobs acceptance is preserved. Offline doctor passed. Quick smoke scoped to exactly the two owned documentation
paths passed51tests/254assertions plus QA tooling types; unrelated mobile-age work
was excluded. Local links, saved-proof assertions and owned diff checks passed.
No source/native test was rerun. These checks qualify this documentation only.

Brain impact: `.brain/features/native-store-billing.md` and
`.brain/tasks/in-progress.md` updated locally. No source, schema, API, permission,
provider setting, legal snapshot or deployment changed by this work. Root owns shared legal and
input reconciliation; its paid publication gate remains intact.
