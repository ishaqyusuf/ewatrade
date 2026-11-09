# App Review owner identity and existing purchase binding

Status: **source-only submission recommendation; no account or policy change**.
Prefer a pristine EwaTrade review owner for a submission intended to exercise a
new purchase, after the exact candidate and replacement scope are reviewed.
This is not an assertion that Apple must purchase, will reject the app, or uses
any particular store identity. Apple remains3/6; mobile release remains excluded.

Root's single post-period SQL snapshot at19:54:56.024UTC9November observed the
original purchase and subscription still bound to the same owner, ACTIVE with
matching paid end10November19:26:34UTC and purchase count1. That keeps the original
owner's purchase slot occupied at that observation. Root owns the actual result
and ledger. Its19:26:00 verification occurred before the historical19:26:34 end;
do not claim post-end verification, DID_RENEW delivery or a fresh native plan.

## What the actual source does

| Surface | Evidence and consequence |
| --- | --- |
| Installed signed10 native2d4424b1525c4aa05e6ced39ce888e31d7f8140e | Its panel shows product purchase buttons gated by catalog availability, legal links, store connection and busy state. The provider refetches authority, but only blocks an already-active DIFFERENT provider; APP_STORE versus APP_STORE passes that comparison. It can call requestPurchase with this EwaTrade owner's account token. No claim is made that an Apple sheet actually completed for another identity. |
| Current committed native source, including ac82fd4e0 | [Panel](../../apps/mobile/src/components/mobile/store-subscription-panel.native.tsx) uses hasPaidPlan/!hasPaidPlan to route a paid owner to Manage and prevent a new-purchase CTA. [Provider](../../apps/mobile/src/components/mobile/store-subscription-provider.native.tsx) also refuses purchase for existing owner-plan coverage states. These guards are not installed10 evidence and need exact final-candidate acceptance. A paid review owner may therefore reach Manage rather than an initial purchase journey. |
| Server catalog | [Catalog](../../apps/api/src/trpc/routers/store-subscriptions.ts) returns checkout/legal availability AND owner permission as purchaseAvailable; it does not itself subtract the occupied native purchase slot. activeProvider/ownerCoverage are separate facts. |
| Durable binding | [Policy](../../packages/db/src/queries/owner-billing/policy.ts) refuses a different active purchase digest or provider with ACTIVE_SUBSCRIPTION_CONFLICT. Unexpired SUSPENDED also occupies the slot. [Verified application](../../packages/db/src/queries/owner-billing/purchases.ts) checks that binding before purchase upsert. The same appAccountToken identifies an owner, not an interchangeable Apple transaction chain. |
| New business or renamed login | One account/canonical subscription belongs to each immutable owner. Another business, email rename or password reset for that same owner does not create a pristine owner slot. Releasing coverage does not cancel store renewal or clear the slot. |

Thus reusing the occupied owner for a different Apple chain can fail after a
store purchase completes on10; with the newer guard, a normal initial-purchase
CTA may be unavailable instead. This is a source-backed risk, not an observed
App Review attempt or a reason to weaken binding, cancel/delete the original
purchase, transfer its receipt or add a manual paid grant.

## Bounded submission recommendation

If the final review instructions include exercising an initial software purchase,
prepare one separate real EwaTrade owner and review business with no existing
owner purchase, occupied subscription, conflicting legacy grant or shared
coverage. Use normal onboarding/current legal acceptance. Its credentials are
owner-entered privately; no account, invitation or credential is created by this
assessment. Keep the identity pristine until the intended submission exercise;
do not pre-purchase on it from the owner's Apple account to make the screen paid.

This is distinct from the ordinary isolated Preview lifecycle account proposal.
The submitted Production-origin candidate needs the exact approved Production
review exception. At a separately reviewed submission window, replace the
existing single immutable reviewer ID with the new single ID; do not append it
or expand the live allowlist merely because source supports up to five entries.
Coordinate every affected API/Dashboard/jobs reader and callback runtime through
the normal approved configuration/release/verification path. Candidate, exact
identity, timing, affected settings and readback must be concrete before approval.
No such replacement is authorized or performed here.

Replacing that exception affects the old owner: [environment projection](../../packages/db/src/queries/owner-billing/review-environment.ts)
will no longer apply its Production-to-Sandbox reviewer exception, and the
[notification gateway](../../apps/api/src/billing/store-notifications.ts) forwards
nonreviewer Sandbox notifications toward Preview. It is not a harmless credential
swap and does not promise continued old-owner Sandbox access or local processing
of its later events. Finish or explicitly bound the original-chain observation
work before that change, and document rollback to the original single ID.
Preserve the original user, account, purchase/coverage history, signed10 artifact,
baseline/intent/results and private custody. Do not cancel, revoke, delete or
reassign anything to make room.

A clean EwaTrade owner reduces the known preoccupied-owner collision; it does
not guarantee that every Apple store identity is unoccupied. After that owner
gets its first genuine chain, a later different chain can meet the same policy
again. Do not promise automatic receipt switching. StoreKit recovery can also
surface old receipts from the device's store identity when a different EwaTrade
owner signs in; binding must continue to refuse reassignment. Do not sign into
the new owner on the original phone or use Restore as an unreviewed setup test.
No Apple-store credentials are requested or supplied by this proposal.

If the intended review is limited to already-paid feature access, keeping the
current owner can preserve that demonstration, subject to actual candidate
acceptance. Its existing plan/Manage view must not be described as evidence that
a different store identity can complete a fresh initial purchase. Root should
resolve that review objective when preparing the final handoff, without asking
for another purchase now.

## Verification and Brain impact

Exact installed2d files and current source were compared offline. The existing
pure policy test for another active purchase/store refusal and expired-slot
replacement passed1test/4assertions. Binding-before-persistence, catalog gating,
current-versus-installed CTA guards, environment/notification effects and
source hashes are retained privately in
/private/tmp/ewatrade-app-review-owner-binding-source-assessment-2026-11-09.evidence.json.
No app/device, database, provider, account, form, allowlist or configuration action
occurred. Links/mapping/diff and unchanged prior QA-source comparison pass;
previous offline doctor/core51tests254assertions/QA-tooling types are reused only
for their original scope. No App Review or lifecycle acceptance is added.

Brain impact: local .brain/features/native-store-billing.md,
.brain/features/owner-wide-billing.md and .brain/tasks/in-progress.md.
