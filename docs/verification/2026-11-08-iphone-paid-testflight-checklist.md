# iPhone paid TestFlight acceptance — in progress

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

## Build10 checkpoint — 8 November 2026

Installed private1.0.0(10), EAS50f69a74-5dae-4d0a-b481-9ad6164146f4, native source
2d4424b1525c4aa05e6ced39ce888e31d7f8140e, runtime
018c6c66e7e614408870451b744e5befac86a851. Last accepted matching Production API
deployment is dpl_CRXkzyZQrtHSew3SWAFeuhv1tRyT; the exact signed bundle uses that
canonical Production origin. This checkpoint makes no new deployment claim.

Owner confirms Restore purchases is visible, tapped Starter, cancelled Apple's
confirmation and reports the purchase did not complete. At19:22:14.218Z, an exact
reviewer-owner/business Production read-only transaction verifies:

- Existing owner billing account; zero verified owner purchases/subscriptions.
- Zero coverage-history or active-coverage rows for the reviewer business.
- Zero legacy Tenant subscriptions or store purchases for that business.
- Canonical current plan remains Free, source owner_billing_free.

The helper rechecks current ACTIVE OWNER membership and uses the strict Production
profile/database isolation loader. It reads only scoped billing/access facts,
never receipt tokens or credentials; no writes, provider calls or model requests.
Two initial local helper schema-name errors produced no accepted result; after
matching the real Membership model/compound key, the read completed successfully.
Sanitized evidence is retained privately as
`ewatrade-reviewer-after-cancel.evidence.json`; no identity IDs are copied here.

This accepts the **Starter cancellation/no-grant check**, not a purchase, restore,
coverage, refund or lifecycle result. Product prices and Restore visibility are
confirmed; policy-link behavior and exact storefront ISO remain open. The owner
has been asked to perform one licensed Starter Sandbox purchase and report the
app result before business enrollment or repeated purchase. Apple remains2/6.
The remaining sequence below is still required; successful UI alone cannot grant
acceptance without verified transaction/binding/environment and durable state.

Use only the new exact build after its signature, service origins, native IAP,
permissions and Apple processing have been accepted. Historical build 6 is not
this candidate. Record the actual build number, EAS ID, source SHA, runtime and
Production API deployment before starting. Public checkout stays closed.

## Account setup

Install the accepted build through the existing owner-only TestFlight group.
Sign in to EwaTrade with the approved reviewer login and the dedicated password
entered directly by the owner. The reviewer workspace must start on Free.
The EwaTrade login, Apple Account and Sandbox tester are separate identities.

[Apple's Sandbox instructions](https://developer.apple.com/documentation/storekit/in-app_purchase/testing_in-app_purchases_with_sandbox)
confirm TestFlight purchases use Sandbox. For controlled lifecycle scenarios,
install first, then sign out of Media & Purchases and sign into the existing
Sandbox tester under Settings → Developer → Sandbox Apple Account. This requires
Developer Mode. Do not sign out of the device's iCloud account. Media & Purchases
sign-out can affect access to purchased content; use a test device where possible.
Enter all credentials directly on the phone, never in chat or evidence files.

## Owner and coordinator sequence

1. Open the plan screen from the owner account. Confirm Starter, Growth and Pro
   load with localized monthly prices and accessible Terms/Privacy links. Check
   the displayed storefront against the configured territory, not phone region.
2. Cancel one purchase confirmation. It must grant no paid entitlement or coverage.
3. Complete one licensed Sandbox subscription purchase. The coordinator must
   verify the actual Apple transaction and persisted Sandbox environment, owner
   binding, plan/period and coverage. A successful UI alone is insufficient.
4. Restart/sign in again, then use **Restore purchases** with the same owner and
   store account. Existing entitlement must restore without a duplicate charge,
   subscription or coverage grant. Repeating restore must be idempotent.
5. Use **Manage store subscriptions**. Exercise renewal and cancellation through
   Sandbox controls. Match verified notification/transaction facts to the durable
   period, cancellation state and effective workspace plan.
6. Exercise failed renewal/recovery and refund/revocation separately. Check the
   five-day application courtesy against verified retry/expiry facts, with no
   replay extension or outage-based paid grant. Do not equate accelerated Sandbox
   time or a TEST notification with five real days of acceptance.
7. Check owner/business switching and a separate ordinary/staff session with
   existing approved data. A store receipt must not move to another owner; staff
   must not purchase. Ordinary public checkout remains denied. Do not create
   fixtures or transfer ownership to manufacture these results.
8. After verified expiry/revocation, confirm Free fallback preserves existing
   records and permissions while enforcing new-admission limits. Accept only
   actual applicable coverage; do not infer populated-limit behavior from an
   empty reviewer workspace.

Capture timestamps, sanitized transaction/delivery references, expected/actual
results and server evidence for each case. Keep signed payloads, account-binding
identifiers, passwords and tokens private. Record unsupported or unavailable
scenarios as open. Only the checkpoint above records executed results;
Apple remains 2/6.

Public review, the approved legal snapshot, positive-data privacy acceptance and
public rollout remain separate gates after this private validation.
