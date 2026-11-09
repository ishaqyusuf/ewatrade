# Controlled Sandbox lifecycle account setup — 9 November 2026

Status: **offline proposal only; execution is not authorized by this document**.
No sign-out/login, device inspection, toggle, history clear, purchase, Restore,
provider/database call, flag, build, deployment or owner question was performed.
Root owns the next approval and phone handoff. I03 acceptance remains intact;
this prepares the account-control boundary for open I05 lifecycle work.

## Established facts and unresolved attribution

- Original signed10 Starter is a genuine verified Sandbox purchase, bound to the
  original EwaTrade reviewer owner. Normal coverage restoration was observed as
  Active Starter/covered1of1, and the actual Settings/API-backed restoration read
  agreed. See the [coverage receipt](2026-11-09-coverage-release-free-reenroll.md).
- The original purchase preceded a controlled Sandbox-tester login. Its saved
  daily period is consistent with default TestFlight renewal. Neither fact
  identifies the Apple Account that owns that chain or proves which tester can
  control it. EwaTrade's appAccountToken identifies its billing owner, not an
  Apple login. No fresh current paid-period response is claimed by this proposal.
- Manage opened Apple's subscriptions page, but the original product was absent.
  Root's later physical Developer inspection saw UI Automation OFF, one paired
  Mac and normal testing sections, without a Sandbox account entry in the views
  inspected. That is a bounded observation, not an exhaustive absence finding.
  UI Automation is not established as a prerequisite for Sandbox account setup;
  do not enable it, Developer Mode, or other settings as a speculative fix.
- Whether the designated existing Sandbox tester has any subscription history,
  another active EwaTrade chain, or unrelated active Sandbox subscriptions is
  unresolved. No account inspection or transaction-history census was made here.

Root's current official TestFlight-document read reports Media & Purchases
sign-out followed by Sandbox Apple Account sign-in for controllable TestFlight
tests. This packet uses that supplied primary-source context without another
online request. See [Apple's TestFlight guide](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight/)
and [Sandbox test guide](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox).
Existing [build10 observations](2026-11-09-build10-finish-and-lifecycle-sequence.md)
retain the saved management and period evidence.

Signing into a tester is **not evidence of migrating, transferring or exposing
the original purchase**. This preparation establishes no supported migration
mechanism. Subsequent purchases under a controlled tester can be a different
chain. Do not label an empty tester history a lost purchase, or buy again to
populate it. A new subscription is not needed if the original chain can actually
be identified and controlled; that remains unknown before setup inspection.

## Source constraints: a second same-owner purchase is not isolation

References use accepted b0 backend source and exact installed2d native source.

| Boundary | Source-backed consequence |
| --- | --- |
| Owner account and canonical subscription | [Owner billing models](../../packages/db/prisma/models/owner-billing.prisma) have one account per immutable owner and one canonical subscription per account; purchase history can contain more than one receipt. Changing business does not create an independent owner purchase slot. |
| Active or suspended original | [Purchase-slot policy](../../packages/db/src/queries/owner-billing/policy.ts) retains an unexpired non-CANCELLED native subscription's slot, including SUSPENDED. Different purchase digest/provider is refused by assertOwnerPurchaseBinding with ACTIVE_SUBSCRIPTION_CONFLICT. Cancel-at-period-end does not itself expire valid paid time. Releasing business coverage does not clear the subscription slot. |
| New chain on the same EwaTrade owner | [Verified application](../../packages/db/src/queries/owner-billing/purchases.ts) checks binding/conflict before persisting the new purchase. The same appAccountToken proves the same owner; it does not authorize two independent active Apple chains. Apple may complete a new Sandbox purchase before EwaTrade rejects its verification. Do not deliberately create that conflict to test a lifecycle. |
| Historical and current chains | Inactive facts for a different historical digest can be saved without displacing the current subscription; older observations cannot overwrite newer canonical facts. A surviving canonical paid chain can keep the business paid while another receipt fails or expires. There is no generic highest-tier/union-of-entitlements acceptance rule. Source does not promise safely interchangeable purchase chains. |
| Exact Apple status selection | [Apple verifier](../../apps/api/src/billing/apple-subscriptions.ts) selects exactly one status matching the looked-up originalTransactionId and independently verifies transaction/renewal signatures. It does not select whichever unrelated entitlement looks active. A matching product label alone cannot correlate a provider control to the original chain. |
| Native multiple-entitlement recovery | Installed2d provider passes the current catalog account token to Apple requestPurchase. Restore/foreground recovery uses [mapped-purchase reconciliation](../../apps/mobile/src/lib/store-purchase-reconciliation.ts), iterating every available mapped purchased item. Same-provider purchase is not an Apple-chain-isolation guard. A final success message, visible Starter card or resolved Restore does not prove every receipt's state or identify the chain affected by a tester control. |

The existing pure policy test “another active purchase or store is refused;
expired subscription can be replaced” covers the conflict and suspended-slot
boundary in [owner-billing.test.ts](../../packages/db/src/queries/owner-billing/owner-billing.test.ts).
Original verified binding/history/coverage must be retained; no deletion, manual
grant, receipt reassignment, cancellation or expiry is proposed to make room.

## One finite proposal: account setup and inspection only

The concrete approval scope for root to present is: **one owner-operated change
of this iPhone's Media & Purchases/Sandbox testing identity, solely to inspect
the designated existing tester's management view, with no purchase or lifecycle
control**. This affects Apple store/media sign-in on this device. It may interrupt
access to purchased media/downloads or normal store activity while signed out.
It does not require signing out of iCloud or EwaTrade and does not by itself
cancel a store subscription, release coverage or delete business data. There is
no promise that the original Starter will become controllable.
Natural renewals/expiry and already-authorized server notifications are not
frozen by account inspection. Preserve their real results; do not promise a
fixed paid period or repair a legitimate state change with a grant.

Before root asks for that approval, resolve privately which existing Media &
Purchases account will be restored and which existing Sandbox tester is intended.
The owner must have their credentials/verification access available privately;
never request passwords, codes or account screenshots in chat. Unknown credentials,
another person's tester or a required account reset means stop before sign-out.
No new tester creation, credential change or agreement acceptance is included.

After approval of that exact scope, root sequences this one attempt:

1. Preserve the accepted original purchase/coverage evidence. Confirm the current
   original owner/business and active plan through an agreed normal observation
   if needed at execution; the historical paid end is not a fresh guarantee.
   Fully terminate EwaTrade before the Apple-account setup. Do not release it or
   repeatedly Restore. Closing it prevents its normal foreground recovery from
   being mistaken for a passive account inspection.
2. Owner signs out of **Media & Purchases only**, leaving iCloud and EwaTrade
   identity untouched. Owner then follows Apple's documented existing Sandbox
   Apple Account sign-in path under Developer, only if that path is actually
   present. Credentials and system confirmations stay with the owner.
3. Inspect that tester's existing Manage subscriptions/history once. Record the
   app/product, available dates/status and which controls are actually present,
   without changing renewal speed, Allow Purchases & Renewals, cancellation,
   grace, country or history. Do not open an Apple purchase sheet to make an
   account entry appear. No exhaustive history export is required.
4. Establish whether any visible EwaTrade entry unambiguously correlates to the
   original chain using available legitimate facts: original purchase time,
   product/group, period and transaction reference if the UI supplies one.
   Product/price alone and EwaTrade appAccountToken are insufficient. An exact
   transaction ID need not be invented or demanded from a UI that omits it;
   unresolved correlation means the original control case stays unproved.
5. Stop after that inspection and report the actual branch below. Do not run a
   failure/cancel/refund control. Keep EwaTrade closed during this account-only
   phase: reopening can automatically verify/finish available receipts and is a
   separate reviewed follow-through. Bound the inspection to one attempt, at
   most ten minutes; do not keep trying alternate logins or purchase prompts.

If the documented entry is still absent, sign-in fails, another account/terms
screen intervenes, or the target is ambiguous, stop. The owner returns to the
same original Media & Purchases account through normal login; no iCloud logout,
history reset, permission toggle or repeated setup loop. By default the owner
ends the finite inspection by signing out of the Sandbox tester and restoring
that original Media & Purchases sign-in. Keeping a controlled tester session for
a separately reviewed next case requires an explicit continuation choice; do
not leave a long unexplained account-sign-out hold. Reopening EwaTrade afterward
can trigger normal recovery; record that effect under its own approved scope.
If the original Media & Purchases login cannot be restored normally, stop and
report the actual access issue. No credential reset or alternate account is
authorized as an automatic rollback shortcut.

## Branch after inspection; no implicit purchase approval

| Actual outcome | Permitted next proposal |
| --- | --- |
| Original chain is unambiguously identified and its intended tester controls are present | No replacement purchase is needed. Prepare one named lifecycle case on that existing chain, exact account-wide effect, expected signed facts and recovery/stop conditions. The owner separately approves/performs consequential store controls. Failure/recovery should precede destructive cancellation/refund scenarios; see the existing build10 lifecycle sequence. |
| Tester entry/history exists but original chain cannot be correlated, or history is empty | Original remains a valid preserved purchase; controllability is unresolved. Do not assume migration or buy under the restored owner. Natural original-chain renewal can still be observed under a later bounded read case. Controlled failure/recovery needs a separately scoped controllable chain if the original cannot be controlled. |
| No documented sign-in/management path, unavailable credentials, or unexpected system requirement | No account-control acceptance and no new purchase. Return to the original store identity; report the actual missing capability. Do not infer a new public publishing requirement or enable settings by guesswork. |

If a separate controlled chain is needed, **do not buy it on this active reviewer
owner**, even with a different Apple tester or another business. Do not cancel,
refund or wait for presumed expiry simply to evade the conflict while claiming
the original protected. Natural renewal can keep its slot occupied; the old
historical end is not clearance to replace it.

The lower-impact candidate to assess separately is an existing approved ordinary
Preview owner with no conflicting owner purchase, an appropriate dedicated tester,
and an **actually verified Preview-capable native client**. Preview's separate
database/account token and normal Sandbox profile are required. Current signed10
has fixed Production origins and cannot be retargeted by signing into a Preview
identity. No compatible current Preview native artifact/isolated owner has been
established by this packet. Reuse a qualifying existing client if available; a
new build is a conditional capability question, not an automatic requirement,
and no public App Store publication is needed merely to create Sandbox tests.
The exact existing Preview actor must have current OWNER membership, satisfy its
normal legal/checkout gates and have no conflicting subscription or legacy grant;
none of those facts is manufactured by this plan. Do not change flags or seed a
new target merely to turn this unresolved alternative into a passing test.

Ordinary Sandbox notifications may use the existing fixed Production-to-Preview
relay; actual ordinary dispatch remains unexecuted/deferred under I03. A future
Preview lifecycle case must name and verify its real reader/notification path,
without claiming that source presence is delivery proof. It cannot be relabelled
as the original Production-reviewer chain's signed10 lifecycle acceptance.

Another Production review owner is not an approved isolation shortcut: the live
policy names exactly one immutable reviewer. Source supports a bounded allowlist,
but does not authorize expanding it, creating a new target, reassigning a receipt
or changing flags. Any such alternative needs its own concrete approval and
normal release/verification scope. None is requested or executed here.

## Verification and Brain impact

This is a preparation deliverable, not account setup, a migration, another store
purchase, provider-control acceptance or a new I05 pass. Source review uses the
accepted backend binding/slot/verifier policy and exact installed2d recovery
behavior, with earlier signed/runtime evidence reused. The original purchase,
coverage history, actual Free/read/restoration proofs and inconclusive timing
condition remain intact. No global ledger or score is changed by this proposal.

Offline doctor passed. The existing pure active-purchase/suspended-slot conflict
test passed1test/4assertions with no database/provider access. The new document's
quick plan maps to core with no unknown paths; unchanged prior core51tests/
254assertions plus QA tooling evidence is reused after source comparison. Accepted
backend equality, exact installed native/helper review, binding-before-persistence,
chain selection, proposal stop boundaries, relative links and owned diff checks
pass. Private mode0600 source audit:
`/private/tmp/ewatrade-controlled-sandbox-account-setup-source-audit-2026-11-09.evidence.json`.
These checks qualify the proposal, not actual account setup or lifecycle behavior.

Brain impact: local `.brain/features/native-store-billing.md`,
`.brain/features/owner-wide-billing.md` and `.brain/tasks/in-progress.md`.
No source, schema, API, permission, credential or configuration change.
