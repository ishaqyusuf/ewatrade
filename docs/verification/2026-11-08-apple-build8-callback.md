# Build 8 and controlled Apple callback — 8 November 2026

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

Last accepted web/API rollout: `e047ed676fff074a4ec8e0627ddc3e579b9a7448`, normal
Preview smoke and Production health passed8November. Jobs remain6a4948c8; actual
Dashboard/jobs paid-reader parity remains open. Apple remains **2/6 (33.3%)**.
See the [verification receipt](2026-11-08-apple-purchase-verification.md).
Earlier checkpoints below retain their historical scope.

## Superseding deployed callback checkpoint

Corrected combined source `2d4424b1525c4aa05e6ced39ce888e31d7f8140e` passed canonical
Preview API `dpl_GVYSQNTJUaG6YjFQ4kAFAYuDsRc9` and matching Dashboard
`dpl_vt2bS6JSDdnbQgWc18Ythchhd11q` existing-data smoke. Receipt
`.scratch/qa-release/smoke-2d4424b1525c4aa05e6ced39ce888e31d7f8140e-preview-web.json`
verifies target/runtime identity, populated catalog and a cancelled sale draft;
no submitted sale, payment or manufactured fixture. Normal Production exited0:

| Component | Exact corrected deployment |
| --- | --- |
| Dashboard | dpl_14LrYhkGKPG6yUtBjJiXmDQE5wyJ |
| Marketing | dpl_9dBpP56qgN5D3FD6uW1YdLUTiiGn |
| API | dpl_CRXkzyZQrtHSew3SWAFeuhv1tRyT |

Canonical aliases are READY at that source; API SQL-backed health200. Schema
already synchronized through the earlier ordinary2e push, not a claim that the
migration-history ledger was applied. Jobs remain unchanged. Public checkoutfalse,
WEB activation unchanged, seven reviewer-only API settings effective. Cross-runtime
Dashboard/jobs paid-reader consistency remains open.

Previously genuine signed Sandbox TEST replays200 through corrected Production.
App Store Connect Sandbox and Production URLs both saved as
`https://api.ewatrade.com/webhooks/store/apple`, with reload readback. Fresh Apple
Sandbox TEST delivery reports SUCCESS at1794161244304 (18:07:24.304Z on8November),
and full Sandbox signature/bundle/type verification passes. Private captures and
sanitized local receipts are retained outside Git. No keys/payloads copied here.
TEST is receiver proof only: ordinary Sandbox relay, purchase/server API lookup,
renewal/grace/refund, owner binding and business coverage are not accepted by it.

Private signed10 supersedes8 for billing; see
[actual iOS entry-point follow-through](2026-11-08-ios-billing-entrypoints.md).
The sections below preserve the earlier503 and its investigation rather than
rewriting it as an earlier success. Apple stays2/6.

Apple acceptance remains **2/6**. This records private testing preparation, not
paid-lifecycle acceptance or public launch approval.

## Signed app

- EAS e699c62f-4db6-4614-ae7c-2181d713bc2e, native source
  8f158ba9fa7fa815a1ea7927ee63649404bd92cb, version1.0.0/build8.
- Store distribution, testflight-production profile/channel, registered bundle
  com.ewatrade.app/teamZXC78SPCV4. Runtime018c6c66e7e614408870451b744e5befac86a851.
- Downloaded exact artifact SHA256 is retained privately. Deep/strict codesign,
  profile e32ce490-198e-42da-86a4-6ad7aa1eb128 and existing certificate fingerprint
  232A54B6244A2BDAA910844B709D1EE5B9BA4399 pass. No device list/debug entitlement.
- Production API/dashboard/web origins in JS, StoreKit linkage and ExpoIap/OpenIAP
  binary markers verified. Stripped symbol-table lookup alone was inconclusive;
  explicit native module markers provide the separate linkage evidence.
- No location usage keys. This does not prove all SDKs collect no location.
- Guarded exact submission c8e75eb2-ef5f-4ed4-ad60-10025e867e8f exited0. Apple
  processed build6447d652-122b-4873-895b-b28d962e5ee4, Ready to Submit. Existing
  EwaTrade Preview Internal groupfca0f39a-400c-4349-86dc-636eed0cfed5 has one tester;
  only that group assigned. Instructions saved. No external group/invite/review.

## First backend rollout and failing signed callback

Clean candidate2e1ee7e722aef00370e4e968f40e7803a2778688 passed284/1813 bounded
source checks. Normal Preview database push succeeded. API
 dpl_ApCHXYH2JmZASHwXY5yKBHDC9dpH and Dashboard
 dpl_4wanotGTiKanXMeWPYEEaGMJJvgD became Ready at that source. First automatic
web smoke refused older Dashboard; retry waited for the same existing build.
A restricted-browser launch attempt produced no UI evidence. Canonical qa:smoke
with browser launch access passed with both runtime IDs verified, same config/hash.
No payment/sale/fixture was submitted and no redeploy was used to retry smoke.

Canonical Production release exited0: additive privacy review table/four indexes
synchronized through ordinary db:push; no data-loss/reset flag or manual SQL.
This does not assert migration-history deployment. Ready targets:

| Component | Deployment |
| --- | --- |
| Dashboard | dpl_5TCeeHKdR5Movemkkq5QbFJLSpK7 |
| Marketing | dpl_3Bgfxc68ZDNaPYjWWcQzpydBH5Nb |
| API | dpl_AHaA4TdfNLthNBGxGX1Fs9U7rJis |

Canonical api.ewatrade.com matched exact source/deployment and SQL-backed health200.
Seven reviewer settings were saved before this deployment; public checkoutfalse,
WEB activation unchanged. Dashboard owner-billing/runtime warnings remain open;
jobs were not deployed and are not inferred from API settings.

Replay of a genuine previously captured Apple Sandbox TEST returned503. No store
transaction, charge or entitlement exists in that TEST. Real installed SDK with
online checks reproduced Production INVALID_APP_IDENTIFIER(3), while full Sandbox
verification succeeded for TEST/com.ewatrade.app with appAppleId absent. Apple's
SDK validates numeric app identity before environment, so environment-only fallback
never reaches the mandatory independent Sandbox verifier for this valid payload.

## Bounded source correction

Under existing enabled review scope, only SDK INVALID_APP_IDENTIFIER or
INVALID_ENVIRONMENT may dispatch to full Sandbox envelope verification. The second
verifier still validates Apple's certificate/signature, exact bundle and Sandbox
environment; nested transactions are independently verified. No untrusted decoded
claim selects a grant. Foreign bundle, Production payload with wrong numeric ID,
invalid certificate, outage and disabled policy refuse. Lookup fallback is still
only HTTP404/API4040010. No coverage/purchase/schema/permission contract changed.

Three new regressions went red before the correction. Focused verifier/relay/
checkout/reviewer-policy tests pass19/176 with an unusable DB sentinel and no
provider/DB writes. The SDK identity-order seam begins after signature validation;
it is not a cryptographic test. Separately, the corrected function with real SDK,
online verification and the genuine private signed capture passes locally as
Sandbox TEST without a transaction. Neither is deployed callback acceptance.

Correction rollout, fresh Apple-to-gateway TEST, real iPhone password/product/
purchase/restore/lifecycle/coverage, public cross-runtime consistency, approved
privacy/legal snapshot and App Review remain open. Apple's saved Sandbox URL is
still Preview; no callback mutation was performed after the failed probe.

## Artifact privacy facts

The root manifest declares14 linked functionality data categories and no tracking.
Embedded GoogleSignIn9.2.0 declares8 categories, including coarse location and
some analytics purposes. [Google's disclosure guidance](https://developers.google.com/identity/sign-in/ios/app-privacy)
says the SDK may collect user ID and IP-derived general location for fraud checks.
These are SDK declarations/provider evidence, not measured customer traffic or a
GPS permission. Do not infer blanket no-location/no-analytics from root manifest
or permission removal. Reconcile the existing shared legal draft; no duplicate
policy, effective snapshot or store privacy publication is approved here.

## Correction source validation

Offline doctor passed. Owned six-path fast smoke passed284/1813 with no unknown
mapping, QA tooling types and Biome; this is a scoped source check. API TypeScript
passed. Apple subscription regression8/56 and focused callback/readiness/reviewer
policy19/176 passed. H01 current at local800/604 and H02 passed. No DB schema,
coverage lock, public API contract or native file changed, so prior relevant DB/
native evidence is retained with its limits; no additional DB fixture was created.
Brain impact recorded in native-store-billing, mobile-production-release, API
contracts/permissions, the existing reviewer ADR, BRAIN and tasks/in-progress.
