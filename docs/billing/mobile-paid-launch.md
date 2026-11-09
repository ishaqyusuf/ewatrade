# Shared Apple and Android paid launch

## Play regional drafts saved — 9 November 2026

All three existing Play products now have saved/reloaded monthly Draft base plans,
five-day grace and automatic55-day hold. Nigeria is exactly NGN5,000/15,000/30,000;
Africa uses the agreed baseline and other regions the20%higher NGN reference,
subject to actual store conversion/tax/price points. No base plan is activated.

Country alignment is verified for **173 named app targets and173 available
base-plan countries each**. The stored catalog has522 named prices:519available
(3×173) plus3retained but unavailable Central African Republic prices. China,
Cuba, Iran and Sudan lack named paid prices in this account and are excluded from
the unsubmitted app-country draft. Future countries and Rest of World remain off.
Country-specific compliance is still open; these draft settings are not public
availability, merchant readiness, licensed payment or rollout acceptance.

The original price-save error no longer reproduces; its cause is not established.
Google case6-1181000042003 was last read Open. Canonical artifacts are the
[regional receipt](../verification/2026-11-09-play-regional-plans.md),
[522-row price table](play-regional-prices-2026-11-09.csv) and
[three product mappings](play-subscription-products.json), committed0d1fb464c.
Mappings are prepared documentation, not installed runtime configuration.
**Android1/8 and Apple2/6 remain unchanged.** Earlier checkpoints retain their
dated scope; the phase table and current receipts carry the latest status.

## Starter enrollment and Restore confirmed — 9 November 2026

The original TestFlight Starter Sandbox purchase is verified and saved. The owner
then enrolled this business in the installed TestFlight app and reports Starter
survives refresh. Exact scoped read-only checks confirm one purchase, one active
coverage row belonging to the same owner, one of one owner slots used, and the
canonical business plan Starter. The owner-reported first tap appeared ineffective;
second tap succeeded. Available CDN evidence shows one enrollment POST200; the
first-tap cause remains unproven and is an open QA note.

After one requested Restore and refresh, the owner reports one of one slots still
in use. The second scoped read proves verification advanced while the original
purchase/period, same enrollment row and Starter plan remained unchanged; no
purchase or coverage duplication. Native StoreKit finish, further coverage/account
switching and paid lifecycle acceptance remain separate open checks.

The coverage card intentionally remains visible for managing owner enrollment.
Release frees this business's slot and returns it to Free limits while preserving
records; store renewal continues until cancelled separately in the store. The
owner's requested Restore/Release floating-sheet progress/success/close/refresh/top
flow was handed to the existing billing Workshop thread, with its exact revision
review boundary retained. No live release action or mobile publication occurred.

Final reader-check candidate `e1626301d` passed normal Preview/matching smoke and
Production health9November. Dashboard/Marketing/API are exacte162; both jobs
projects promoted20261109.2. Production retains the exact existing reviewer1,
Preview billing remains off. Actual hosted jobs execution now confirms the existing
reviewer business as Starter/owner_subscription with owner-plan Starter; the empty
Preview run correctly stays disabled. Actual signed-in Dashboard SSR, Free fallback
and native/lifecycle checks remain open. Apple remains **2/6 (33.3%)**. See the [reader activation receipt](../verification/2026-11-09-billing-reader-runtime-activation.md) for the precise proof boundary.
See the [verification receipt](../verification/2026-11-08-apple-purchase-verification.md).
Actual task-local evidence: [hosted reader check](../verification/2026-11-09-billing-reader-job-check.md).
Earlier checkpoints below retain their historical scope.

This is the single current decision, ownership and phase index for the mobile
launch. Both chats read/update it and reuse the linked evidence. Platform packets
retain provider-specific facts and history; they do not override these decisions.
Commercial/domain detail lives in [owner-wide subscriptions](owner-wide-subscriptions.md).
No credentials, receipts containing personal data, identity documents or secrets
belong in this file.

## Owner decisions — current as of 8 November 2026

| Decision | Agreed direction |
| --- | --- |
| Launch model | Paid owner subscriptions from day one; staff do not subscribe separately. No paid-download assumption, trial or annual offer. |
| Prices | Monthly Nigeria baseline Starter NGN5,000, Growth NGN15,000, Pro NGN30,000. Comparable Africa baseline, +20% reference elsewhere; actual localized store offers/taxes/price points control checkout. |
| Geography | Broad international launch wherever the store, paid products and applicable country requirements support it. This supersedes the earlier Nigeria-first instruction and its unsubmitted Play targeting draft. Record exclusions and their concrete blockers; do not silently retain Nigeria-only or claim every country is accepted. |
| Addresses | Manual native address entry at launch. Source cf831c187 removes automatic lookup and blocks Android location permissions; exact signed behavior remains to verify. Shared web geocoding is separate and must be disclosed accurately. |
| Support | Reuse public support@ewatrade.com and the existing founders@ewatrade.com forwarding/operational contact. No duplicate mailboxes or separate platform support systems. Owner named admin@zeroesandone.com.ng as backup with a12-hour initial response target; monitored routing/delivery remains unverified. |
| Grace/downgrade | Five days total requested; afterward keep existing records/staff usable and block new additions above current Free limits. Play uses actual configured grace/verified expiry. Apple needs its separately approved server/application courtesy implementation; do not shorten verified store access or invent grace from an outage. |
| Publication | Publish publicly after store approval and all required release checks. This decision is settled; do not ask it again. It does not waive store checks, personal verification or binding-agreement boundaries. |
| Autonomy | Move directly to the next authorized phase when ready. If one dependency is blocked, continue independent work. Coordinate directly between Apple and Android chats and ask each shared question only once. |
| Checkout | Current project checkout only; no worktrees. Preserve other authors' changes, commit owned completed work, and coordinate the frozen release candidate with the release owner. |

## Ownership and coordination

| Owner | Scope |
| --- | --- |
| Apple chat `01a1b178-b8d1-7762-96ef-8d075367d795` | Apple products/prices, Apple credentials/notifications, Apple-specific grace implementation and signed StoreKit/review acceptance. Coordinate shared entitlement edits before changing Android projection. |
| Android chat `01a1b653-baf1-7ef0-bd1d-be20656b2c86` | Play products/territories/grace/notifications and signed Play acceptance; initial author of this shared index and common safety/privacy evidence reconciliation. |
| Password recovery chat `01a1b704-65c8-7412-b430-8a98b63e24c4` | Shared Dashboard authentication recovery. Reuse its source and acceptance; mobile chats do not duplicate those edits. |
| Billing deployment chat `01a1bcab-cc78-74e1-b58f-2fe679c1341d`, current release executor | The previous release chat `01a1b651-ec49-7fc1-9d95-a6ef06cb29c2` is archived. The billing deployment chat now coordinates the shared candidate and normal Preview/Production execution; do not start duplicate deployments. |

Root `AGENT_CHAT.md` is the shared operational log. Direct Apple/Android messages
are owner-authorized. Before overlapping edits, read the log and claim exact paths.
Each author updates only its own evidence/status; shared decision changes must
reflect owner instructions, not assumptions. After a milestone, write its exact
commit/check/target and pass the next dependency to its owner without asking the
user to repeat it.

## Phase queue and current evidence

| Phase | Current state | Next action |
| --- | --- | --- |
| 1. Shared contract and core source | Owner limits, coverage, versioned signup and retained-record downgrade implemented (0bd862763; verification daf00b5f0). Manual native addresses implemented cf831c187. | Reuse valid checks. Apple courtesy source and platform-specific runtime readiness are implemented with23billing tests/136assertions, scoped259/1679, API types and H01/H02 passing; signed acceptance remains open. Completed Play policy is unchanged. |
| 2. Store products and configuration | Apple three monthly products/175price schedules saved; controlled reviewer API source now deployed at e1626301d, with original Sandbox Starter purchase, enrollment and one Restore durably verified. Public checkout stays closed. Play merchant profile linked, payout bank deferred; existing AAB36 remains in its internal-testing draft. All3monthly base plans are saved/reloaded Draft with5day grace/55dayhold,173available country sets each,519available prices plus3retained unavailable prices. Product mappings are documented, not installed. | Complete native finish/scope/lifecycle and Dashboard SSR/Free cases. For Play, finish approved merchant/license/security-access inputs and the reviewed registered-package/isolated-Preview test path before exact licensed acceptance or activation. Country-specific compliance remains open; draft country/pricing saves do not accept public territories. |
| 3. Shared runtime, legal and operations | Production Dashboard/Marketing/API exact e1626301d READY after matching Preview smoke; SQL-backed API health200. Both jobs20261109.2 exact e162. Dashboard/jobs reader configuration is deployed; actual hosted reviewer Starter read passes in a read-only jobs transaction and Preview correctly stays disabled. Actual signed-in Dashboard SSR and Free fallback remain open. Public checkoutfalse/WEB unchanged; common legal/privacy and operations still unaccepted. | Complete the existing reviewer Dashboard sign-in and a source-backed SSR postcondition; do not infer proof from menu links or an API-backed plan card. Verify paid/Free scope, lifecycle, monitored support, retained-record deletion and actual recipient/retention facts without generating reminders or duplicating paid tests. |
| 4. Signed acceptance | Android A01–A08:1/8; Apple I01–I06:2/6 currently accepted after fresh8November readback restored I01; products/prices I02 remain complete. Source/config tests do not close these gates. | Freeze exact candidates, inspect permissions/native linkage and run licensed purchase/restore/renewal/grace/refund/switching tests. Reuse platform-valid evidence only. |
| 5. Submission and publication | Public release after approval/checks is authorized. Neither platform has paid-release acceptance yet. | Complete truthful store declarations/reviewer access, submit accepted candidates, follow review and publish through existing release authority. |

Do not add the two platform denominators into a fabricated combined score.
Changing a country draft or finishing source code does not close a signed gate.

## One shared outstanding-input list

- Play organization payments profile is linked. Owner deferred payout-bank setup;
  finish the bank and any requested verification before paid launch. Do not re-ask
  for the already completed profile selection or agreement submission.
- Actual monitored operational backup and response-time commitment are not yet
  recorded. Primary owner and existing support aliases are known; do not re-ask
  their identity or create duplicate inboxes.
- Any reviewer workspace, sandbox identities or country-specific business facts
  must first be sought in existing configuration/evidence. Never invent an answer
  or ask both chats independently for the same fact.
- New paid services, binding agreements and additional sensitive access retain
  their specific authorization requirements. Routine work and publication already
  approved above do not need another generic approval.

## Latest coordination and Play readback

Apple acknowledged direct coordination and adopted the manual-address/support
decisions. Its three products use IDs `com.ewatrade.owner.pro.monthly`,
`com.ewatrade.owner.growth.monthly` and `com.ewatrade.owner.starter.monthly`.
Its regional tables can round the20% reference increase to the same local price
point; report actual store prices rather than claiming an exact local increase.
Apple completed those tables; [525actual country prices](apple-regional-prices-2026-11-07.csv) and [exact mappings](apple-subscription-products.json) are retained. Target Apple configuration is installed (Preview sandbox/Production production, checkout false in both), with no deployment. Existing STORE_BILLING_ENABLED is untouched. Android must merge Play mappings without replacing Apple entries. Apple courtesy source is committed aea81ba0; signed lifecycle proof remains Apple-owned. Both Apple server-notification URLs are saved for the existing Production/Preview API origins; live canary waits for deployment. Owner-created Nigeria sandbox tester is verified. ExpoIap/OpenIAP link into a successful unsigned Preview simulator build; this does not establish signed store acceptance.

Subsequent common release `bf9bc356` deployed database, Dashboard, Marketing, API
and jobs; receipt `5d961377e` supersedes the earlier no-deployment statement.
Checkout is still closed. The Apple TEST notification received503 with the current
receiver gate, so signed delivery is not accepted. Controlled App Review Sandbox
source is now prepared after that release: exact server-owned reviewer User-ID
allowlist, real Sandbox facts retained, existing locks/role/binding checks, and a
bounded one-way signed notification relay to Preview. Google and ordinary
Production mismatch rejection remain. New flags default false; no live flag,
notification URL or deployment changed in this phase. Dedicated reviewer signup
is a human handoff; source/Development tests do not raise Apple beyond2/6.
See the [Apple packet](apple-paid-launch-2026-11-07.md#controlled-app-review-sandbox--source-prepared-after-common-deployment).

Android navigation/readiness diagnostics are owned by the Android chat. Its
[receipt](../verification/2026-11-07-android-navigation-readiness.md) distinguishes
transient accessibility timing, sign-out harness issues and an observed ANR;
do not assume a persistent dock regression or count diagnostics as release smoke.

Latest coordinated release `6a4948c8` is now deployed; receipt `79fad7564` records
healthy Production Dashboard/Marketing/API/jobs and unchanged synchronized DBbf9.
The earlier503 Apple result above is superseded for Preview: the genuine signed
Sandbox TEST delivered SUCCESS at22:40:33WAT, exact API deployment
dpl_BY9LBysYJSevcEgbrA4VniDv9ZyT. Only Preview STORE_BILLING_ENABLED changed
false→true; owner/reviewer/forward flags remain absent, Production billing settings,
public checkout/native purchase scope and both saved URLs unchanged. This accepts
receiver delivery only, never paid lifecycle or Production relay; Apple stays2/6.
Final matched-config web smoke passes. On that candidate, Android verified
OTA/build/catalog/New sale but the final retry failed a sign-out confirmation
selector. The repair is committed in `3ac9a217`; its device acceptance remains open.
Android stays1/8 and native publication remains excluded.
Reviewer signup can be completed from the owner's phone; no new duplicate input
request. [Exact release evidence](../plans/2026-11-07-full-production-release.md#corrected-appleandroid-handoff-released--7-november-2026).

Latest Android handback is receipt `45969d111`: source `3ac9a217` passed the
normal candidate source checks (283 tests / 1,796 assertions) and published only
compatible Preview OTA group `5b0fdf2d-129e-46f2-9b35-90f53ff74f8a` on build 35.
Approved emulator-5554 recovery preserved user data; emulator-5560 was untouched.
Full smoke failed view-hierarchy transport before reaching the repaired selector;
receipt `35aa5085-6fc5-4e49-be65-406df9ca8069` is failed/runtime-unverified. Package
lookup works, but final ActivityManager and screenshot checks timed out. No runner
remains. Obtain concretely responsive approved Android services, then retry the
matching candidate/config with `qa:smoke`; do not redeploy merely to retry or
substitute another device. Production `6a4948c8` / DB `bf9bc356` and both platform denominators
are unchanged. [Android confirmation evidence](../verification/2026-11-07-android-signout-confirmation.md#coordinated-preview-retry--latest-handback).

Android changed the pending Nigeria-only selection to all177named Play countries/
regions, leaving **Rest of World unselected** so unspecified territories are not
implicitly included. Publishing overview confirms **Add177countries/regions**;
Send app for review remains disabled because required app setup is incomplete.
This is an international availability draft, not evidence every country's paid
offer or additional verification is ready. Existing unrelated drafts are untouched.

Fresh Play Subscriptions readback explicitly requires a Google Payments merchant
account before the page is accessible. No profile setup, contract, subscription
product, financial data, charge, review submission or release was performed.
The next Play product phase depends on owner completion; independent common
privacy/operations and Apple work continue. [Receipt](../verification/2026-11-07-shared-mobile-launch.md).

## Evidence and detailed checklists

- [Shared owner contract](owner-wide-subscriptions.md)
- [Implemented limits and retained-record policy](owner-plan-limits-and-downgrade.md)
- [Android checklist](android-paid-launch-2026-11-07.md)
- [Apple checklist and provider evidence](apple-paid-launch-2026-11-07.md)
- [Android manual-address and historical Nigeria draft receipt](../verification/2026-11-07-android-launch-decisions.md)
- [Shared safety/privacy review](../releases/android-safety-privacy-review-2026-11-07.md)
- [One shared paid billing/privacy draft](../releases/mobile-permissions-disclosure-draft-2026-11-07.md) — advanced after Play merchant setup blocked product creation; exact publication remains gated by the listed evidence and approval holds.
- [Deployment coordinator checkpoint](../plans/2026-11-07-full-production-release.md)

Territory checks use each provider's actual current availability and prices.
Google's [supported distribution locations](https://support.google.com/googleplay/android-developer/answer/10532353?hl=en)
and [country-specific requirements](https://support.google.com/googleplay/android-developer/answer/6223646?hl=en)
were checked7November. Broad preference is not evidence that merchant verification,
required disclosures or every territory's paid offering is already accepted.


## Android continuation after merchant linkage — 8 November 2026

Canonical Preview journey passed source7ba0fd68c/receipt2bd3d2fd with runtime
verified before/after. This accepts the closed-checkout journey, not paid store
transactions. Owner-approved exact AAB36 processed in Google Play and release5
was saved as draft, without rollout. Create subscription unlocked; Starter,
Growth and Pro products now exist with the same IDs as Apple and0 active base
plans. Starter monthly/five-day base-plan save failed with a generic Console
error; a fresh Growth price popup also returned error540F8949 before plan save.
Price/grace/territory settings and actual Play mapping remain unaccepted.
The unsaved form is preserved and the release coordinator/Apple were informed.
No checkout/financial activation, new build/deploy or Data safety submission.
Bank remains deferred; provider/transport/retention/deletion evidence stays open.
Android1/8 remains; Apple's separate current position is maintained by its owner.
See [current evidence](../verification/2026-11-08-play-merchant-artifact-readiness.md)
and [exact AAB](../verification/2026-11-08-android-production-artifact.md).


### Android independent privacy phase — 8 November 2026

The [Google specialist report](../releases/play-subscription-price-support-request-2026-11-08.md)
is submitted/Pending, case ID not yet assigned; do not create a duplicate.
While pricing is unresolved, Android advanced [exact36 SDK/transport evidence](../verification/2026-11-08-android-sdk-transport.md):
manifest and eleven unchanged source paths reviewed without a new build or test.
This closes the bounded static evidence task, not all-data encryption, final Data
safety or signed paid acceptance. Next: exact hosted provider/analytics/media
choices, retention/positive paid-owner deletion and one complete legal snapshot.
Apple owns its active Production TestFlight candidate; no overlapping native/EAS
edits or duplicate executor. Bank setup remains owner-deferred; no new input is
needed for the current read-only privacy reconciliation.


### Paid-owner privacy source and disclosure reconciliation — 8 November 2026

Owner-approved policy/source is committed as `49df03a06`: explicit retained billing
review, current-scope proof and independent review duties now exist. Source/
Development acceptance is complete; live paid-owner fulfillment, provider result
and notice remain open. See the [operator procedure](paid-owner-deletion-review.md)
and [source receipt](../verification/2026-11-08-paid-owner-privacy.md).

The [single shared legal draft](../releases/mobile-permissions-disclosure-draft-2026-11-07.md)
now reflects that retention policy and its remaining operational hold. It is not
a new approved/effective snapshot. The [shared privacy appendix](../releases/android-safety-privacy-review-2026-11-07.md#paid-owner-source-and-current-provider-metadata--8-november-2026)
records bounded API/Trigger/DB observations and API-specific provider references,
separating current settings from final deployed behavior. WhatsApp media/manual
receipt processing switches are off; other in-app media, analytics, provider roles
and worker billing coverage still require their own evidence.

Apple's immutable build 8 archive is accepted for remote compilation at source
`8f158ba9f`; this is not TestFlight/paid-flow acceptance. No new Android build,
Console declaration, public checkout, legal publication or live privacy activation
was performed. Android 1/8, Apple 2/6 and preparation 3/4 remain unchanged here.
[Documentation receipt](../verification/2026-11-08-privacy-disclosure-reconciliation.md).


### SDK disclosure and corrected release follow-up — 8 November 2026

The [same shared draft](../releases/mobile-permissions-disclosure-draft-2026-11-07.md)
now includes Google Sign-In network/IP-derived general-location wording. Signed
build 8's SDK declarations include linked coarse location and some analytics
purposes beyond the root manifest; they are not a location permission or measured
traffic. The [shared appendix](../releases/android-safety-privacy-review-2026-11-07.md#signed-sdk-and-corrected-backend-follow-up--8-november-2026)
records exact artifact scope, provider guidance and the separate Android hold.

The corrected backend candidate `2d4424b15` passed matching Preview smoke and
Production API rollout. A genuine captured signed Sandbox TEST replay now
returns200; the saved Apple callback URL remains UNKNOWN after a failed save/
interrupted browser, with fresh canary and purchase still pending. Build8 proved
login, not paid controls. Replacement build10/source2d has accepted archive ID
`50f69a74-5dae-4d0a-b481-9ad6164146f4`; its signature/native scope and 20-manifest
structural equality with build 8 are now verified, including GoogleSignIn 9.2.0.
Signed paid UI and purchase/restore remain pending; App Store upload is running
at this checkpoint. Root owns Apple routing and IAP. No store privacy declaration,
legal publication or live privacy activation occurs in this documentation lane.

## Apple private signed10 and gateway checkpoint — 8 November 2026

Apple remains **2/6 (33.3%)**, Android **1/8 (12.5%)**. Exact signed10/native
source2d4424b1525c4aa05e6ced39ce888e31d7f8140e is processed in the existing
one-tester internal group. Owner confirmed password login (unchanged source) and
installed10; Mirroring shows Starter$3.99, Growth$9.99 and Pro$22.99 every month.
Corrected callback Production replay200 and fresh genuine Apple Sandbox TEST
delivery SUCCESS pass. Owner confirms Restore is visible and cancelled Starter;
the exact reviewer Production read verifies zero purchases/subscriptions/coverage
and effective Free access afterward. Cancellation/no-grant passes. Actual purchase,
coverage, restore and lifecycle acceptance are still open. Ordinary Sandbox relay is not accepted
by a TEST event. Public checkout remains false; no WEB activation or public review.

Billing Workshop continues the documented approved MUI-B026 Compact Plan Ledger A
in the shared catalog, preserving August history and current build10 context.
New previews are unselected and not native implementation; they do not replace
the signed candidate or authorize a release. Setup input diagnosis on the existing
reviewer workspace finds a SKIPPED conversation/no running request and a visible
Continue setup action, rather than a payment-driven disable. The owner confirmed
typing works after Continue setup on installed10; no assistant settings/data or
native code were changed. Model response and record creation were not tested.

[Signed candidate](../verification/2026-11-08-production-testflight-paid-candidate.md) ·
[Callback evidence](../verification/2026-11-08-apple-build8-callback.md) ·
[Workshop and Setup diagnosis](../verification/2026-11-08-iphone-setup-and-billing-workshop.md).
