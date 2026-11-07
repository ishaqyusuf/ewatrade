# Android paid-at-launch continuation — 7 November 2026

Owner reaffirmed paid business-owner subscriptions from day one. Staff do not
subscribe separately. Monthly Starter/Growth/Pro: Nigeria NGN 5,000/15,000/30,000;
comparable Africa baseline and 20% higher reference outside Africa. Store-returned
territory prices, tax and price points determine the actual displayed charge.
No paid app download, trial, annual offer or automatic customer charge is implied.

The 6 November free-first plan is superseded. Its purchase-disabled implementation
remains closed until the paid candidate is ready; simply flipping its flag would
expose unfinished integration. The native IAP plugin/autolinking and Android
Billing permission also remain disabled; restore them deliberately for the paid
candidate after integration, then verify its exact signed manifest. No activation or release is authorized by this file.

## Retained Android release checklist

These are the existing A01–A08 milestones, not a new free-launch denominator.
**1/8 accepted (12.5%)** remains the recorded release position. Historical evidence
within each row must be reused only where source/platform/target still match.

| ID | State | Current evidence and remaining acceptance |
| --- | --- | --- |
| A01 Console/artifact/device identity | Accepted historical baseline | Correct app/package and prior signed artifact/device established; freeze and re-identify the new paid candidate before release. |
| A02 API/access availability | Open | October quota outage was subsequently restored; don't repeat the obsolete outage diagnosis. Fresh target/candidate access proof is still required. Legal/deletion preflight passed 7 November. |
| A03 Offers and Play merchant readiness | Open | Owner prices/territory rule known. Merchant/tax/bank requirements and actual subscription/base-plan IDs, localized totals and eligible offers need Console evidence and owner action where binding. |
| A04 Server/provider/terms | Open | Verification, owner purchase reconciliation, RTDN/void/refund and privacy guards exist. Need authenticated target outcomes and paid legal publication; current public copy still says no software subscriptions. |
| A05 Paid entitlements/native integration | Open | Durable owner adapter/coverage/readers and local migration exist since 2 November; old “no adapter” notes are historical. Native lifetime safeguards and explicit owner coverage controls are wired and pass focused source checks. Native visual/signed acceptance, offer/cap parity, grant/signup cutover and downgrade behavior remain. |
| A06 Signed candidate/money acceptance | Open | Prior free/local and Play33/35 evidence is insufficient for paid purchase, restore, replacement, renewal, failed renewal, cancellation, refund and account/business switching. |
| A07 Data safety | Open | Current source inventory/disclosure draft prepared. Active SDK/provider/transport, location decision, signed permissions and positive deletion evidence remain. |
| A08 Review and release | Open | Reviewer access/material, separately authorized internal distribution/submission/rollout and existing gates remain. |

## Source implementation order

1. Fence native checkout/recovery against retired account/business/session state;
   require a fresh mapped catalog and verified purchase before acknowledgement.
2. Complete the native owner-account and explicit business coverage experience,
   preserving server ownership and per-business permissions. Do not claim one
   business receipt covers an owner's separate businesses. Source controls and
   confirmation are now wired; native visual and signed acceptance remain.
3. Reconcile approved Free 10/50, Starter 100/2 staff, Growth 1000/10 staff and Pro
   unlimited-products/50 staff with the actual shared catalog, nullable limits,
   admissions and mobile mirror. Business coverage remains 1/3/10. Keep existing
   grants/data and queued commands; versioned signup/cutover must be explicit.
4. Implement/accept the requested five-day failed-renewal handling and retained
   surplus restrictions. Cancellation keeps verified paid access through its end;
   refunds/revocations and provider failures are separate. Select stable retained
   usable items/staff and recovery rules before applying restrictions. No silent
   deletion, bulk archiving or guessed nonpayment.
5. Finish paid privacy/retention and exact legal snapshot, then the target/store
   setup and signed acceptance steps above. Preserve all current release gates.

## Android grace-period evidence

Google's current [subscription configuration schema](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions)
accepts grace durations from 0 days through the lesser of 30 days and the billing
period. This supports preparing a five-day monthly configuration; it is not proof
that this app's Console base plans are configured that way. Verify each actual
base plan, account-hold setting and licensed-test result before promising it.

Google's [subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions)
requires access during verified grace and removes entitlement during account hold.
Current `projectGoogleSubscription` admits ACTIVE/IN_GRACE_PERIOD/CANCELED through
verified expiry and rejects other states. Keep provider-authoritative expiry;
do not invent five days from an API outage or cut short a longer verified period.
These official sources were checked 7 November. iOS's separate constraints are not
resolved by Android's available duration.

## Current packets

- [Owner adapter, coverage and cutover](owner-wide-subscriptions.md)
- [Historical provider/offer worksheet](android-paid-launch-offline-packet.md)
- [Current safety/privacy review](../releases/android-safety-privacy-review-2026-11-07.md)
- [Native lifetime source evidence](../verification/2026-11-07-android-billing-lifetime.md)

No worktree/branch switch, push, deployment, provider activation, destructive
data operation or binding store declaration follows from these preparations.
