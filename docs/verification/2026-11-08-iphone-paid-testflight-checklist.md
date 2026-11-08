# iPhone paid TestFlight acceptance — prepared, not executed

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
scenarios as open. No result is claimed by this preparation; Apple remains 2/6.

Public review, the approved legal snapshot, positive-data privacy acceptance and
public rollout remain separate gates after this private validation.
