# Play merchant, artifact and Data safety readiness — 8 November 2026

## Verified current state

The owner directly selected and submitted the existing ZEROES AND ONE TECH HUB
NIG LIMITED organization payments profile. Live Payments dashboard subsequently
showed earnings and Add payment method, replacing Create payments profile.
The owner explicitly deferred the payout-bank step. Its live wire form requires
a Nigerian USD bank account, exact bank-statement holder name, bank/SWIFT/account
information. No bank details were entered or saved by the agent. No bank account,
current tax compliance or representative authority was inferred from CAC records.

The user-created document review chat recovered company originals and matched
legal name/registered address. It found bank ownership/details, current additional
tax documents and signed representative authority gaps. Private originals remain
outside Git; no raw bank/tax/identity identifiers are committed here.

## Evidence before the authorized upload (historical)

- Canonical Preview source7ba0fd68c passed the existing full journey, receipt
  `2bd3d2fd-2dc9-40c0-9731-4ff36eb88b69`, clean/runtimeVerified. Exact build35 /
  update01a1bab9-f367-76b4-8e52-786bf41fab39 checked before and after. Catalog,
  NGN2500 draft total, cancellation, closed billing and final sign-out passed.
- Play's active internal release is33 (15 October); latest uploaded AAB35 is
  inactive/draft, uploaded26October, artifact4860244733634546279. Its displayed
  15-permission list lacks BILLING and still contains coarse/fine location.
- Subscriptions is now accessible but exposes Upload a new APK, not Create
  subscription. The merchant-profile gate is cleared; products/base plans are
  still uncreated. Missing Billing in the uploaded artifact is a concrete
  prerequisite, not a reason to fabricate product mappings.
- Coordinator's [private signed AAB36](2026-11-08-android-production-artifact.md)
  has exact registered package/source, BILLING, packaged ExpoIap/OpenIAP/BillingClient,
  no location permissions, and valid bundle/signature integrity.
- Local `keytool -printcert -jarfile` SHA256 matches the Upload key copied from
  Play Console's App signing page (not the separate app-signing key):
  `61:53:76:C3:C2:03:52:20:23:0F:D6:45:C2:70:63:00:26:BD:0D:FF:BB:62:72:2B:88:CF:10:39:6A:D5:40:9E`.
  This verifies upload-key correspondence, not Google's artifact acceptance.

No duplicate cloud build or native smoke was run. Exact prior acceptance and
artifact proof are reused. The private artifact is not installed or uploaded by
this reconciliation; paid purchase/restore/renewal/grace/refund/switching remain.

## Data safety readback and remaining evidence

Dashboard remains10/11 with Data safety incomplete. The existing draft reached
step2/5 without editing answers. Observed saved selections: collection Yes;
username/password, username/other authentication and OAuth; deletion URL
`https://www.ewatrade.com/delete-account`. These are observed draft values, not
new acceptance of all flows. All-data encryption-in-transit is unanswered; Next
is disabled. Optional partial-data deletion is also unanswered.

No response was invented to advance the form. The existing source inventory in
[the privacy review](../releases/android-safety-privacy-review-2026-11-07.md)
still supplies proposed categories; exact enabled SDK/hosted provider/transport,
sharing exceptions, retention and positive paid-owner deletion proof must be
reconciled before declaration. The verified AAB36 permission inventory supersedes
old location-permission observations for that artifact, but neither permissions
nor native linkage prove actual collection or all-data encryption.

The attempted CSV export did not complete and reset the browser tool. No CSV
import, declaration answer edit, Save draft, review submission or policy acceptance
was performed. The visible questionnaire was recovered and inspected directly.

## Authorized upload and product drafts — completed 8 November

Owner explicitly answered “Upload build 36 to the draft”. Immediately before
upload, the inspected file's SHA256 was rechecked:
`0c2527f3cfbb54ce377d5417c25cbf513192e1daac10c366f4256dc5aff4dde3`
(94,591,815 bytes). Google completed upload/optimization and displayed **36 (1.0.0)**
in the existing internal-testing release5. The release name is
`1.0.0 (36) - billing validation`. Save as draft returned **Changes saved**.
No Next/confirmation/rollout or review submission was performed. Active internal
release33 is unchanged. Local proof: `/private/tmp/ewatrade-play-build36-uploaded-draft.jpg`.

Subscriptions then exposed **Create subscription**, clearing the Billing-artifact
prerequisite. The following three products were created and read back from the
saved list, each showing **0 active base plans**:

| Product | Product ID |
| --- | --- |
| EwaTrade Starter | `com.ewatrade.owner.starter.monthly` |
| EwaTrade Growth | `com.ewatrade.owner.growth.monthly` |
| EwaTrade Pro | `com.ewatrade.owner.pro.monthly` |

These match Apple's saved IDs. No hosted mapping or checkout flag was changed.
Local list proof: `/private/tmp/ewatrade-play-three-subscription-drafts.jpg`.

## Base-plan save failure — unresolved

Starter's `monthly` auto-renewing form was prepared with Monthly billing and the
requested five-day grace. Bulk localization used NGN6,000 outside Africa and
NGN5,000 for the twelve separately listed African markets. Google's bulk
conversion added tax/price-point adjustments (Nigeria displayed NGN5,370); a
subsequent direct NGN5,000 price edit did not persist in the readback. Other grouped
African countries still need separate baseline overrides. **None of these prices
or base-plan settings is accepted or saved.** Do not use this incomplete table as
an actual offer or mapped catalog.

Save returned **Your changes couldn't be saved** without a field-specific reason.
Excluding New countries/regions and trying an explicit valid 55-day hold with the
five-day grace did not resolve it. Automatic account hold was restored in the
unsaved form; it still displayed 53 days, another unresolved readback discrepancy.
No unsupported root cause (bank verification, grace duration or billing linkage)
is inferred. Browser console logs contained no additional error. The form was
preserved in its existing tab; root/Apple were informed. Local error capture:
`/private/tmp/ewatrade-starter-base-plan-save-error.jpg`.

Google's [current schema](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions)
still permits five days for a monthly plan, with combined grace/hold between30
and60 days. Its [Console instructions](https://support.google.com/googleplay/android-developer/answer/140504)
distinguish product creation, base-plan save and activation. Rechecked8November;
these references do not establish the cause of this app's failed save.

Next: resolve the actual Console save error, finish all three inactive monthly
base plans, reconcile exact Nigeria totals and every African/global region, then
merge actual Play mappings without replacing Apple entries. Bank readiness,
signed money lifecycle, truthful Data safety and paid legal remain open. Public
checkout remains closed. Android acceptance stays1/8; the separate Apple
position is maintained by its owner in the shared index. This milestone changes
provider drafts and documentation only; no application source/build/deploy or
paid acceptance test was added. Brain impact: native-store-billing, QA accelerator
and current-task pointers.


Documentation verification: offline doctor passed; owned-path plan selects core
with zero unknown paths; local file links and whitespace pass. Existing source,
canonical Preview and exact AAB inspection evidence are reused for this docs-only
change. No application source or new acceptance test was added.


## Fresh price-editor diagnosis — 8 November follow-up

A fresh Growth `monthly` auto-renewing/five-day form isolated one temporary
Nigeria draft region before any plan save. Editing its price to NGN15,000 then
saving the price popup returned **An unexpected error has occurred. Please try
again. (540F8949)**. This identifies a failure in the price editor before base-plan
save; it does not prove a specific bank, permission, currency or grace cause.
The price/plan/temporary one-region selection is unsaved, and no Nigeria-only
launch or active offer was established. Both forms remain open for investigation.
Screenshot: `/private/tmp/ewatrade-play-price-editor-error-540F8949.jpg`.

The existing release coordinator is checking already configured Publisher API
capability/status without exposing credentials or making duplicate Console edits.
No new service-account access or provider activation is authorized by that check.
Apple separately reports its updated agreement is Active and I01 restored; use
its owner-maintained checklist instead of the earlier reopened I01 observation.
