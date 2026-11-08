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

## Separate Android evidence

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

## Next reviewable store step

Upload the exact inspected AAB36 only to the existing internal-testing draft,
then verify Google's processing/permissions and whether subscription creation is
unlocked. This is distinct from rollout, review submission, price activation or
charges. Browser upload confirmation is pending; no new artifact was uploaded.
Bank readiness remains a paid-launch requirement. Keep public/native purchase
scope closed until the existing signed/target/legal/store gates are accepted.

Android paid acceptance remains1/8, Apple's separate2/6 unchanged. The source and
artifact receipts above are reused; this is a documentation-only reconciliation.
Brain impact: local native-store-billing, QA accelerator and current-task pointers.


Documentation verification: offline doctor passed; owned-path plan selects core
with zero unknown paths; local file links and whitespace pass. Existing source,
canonical Preview and exact AAB inspection evidence are reused for this docs-only
change. No application source or new acceptance test was added.
