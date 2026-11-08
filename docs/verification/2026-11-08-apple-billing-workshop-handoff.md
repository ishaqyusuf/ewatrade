# Apple billing and Workshop chat handoff — 8 November 2026

The owner explicitly requested separate chats for billing deployment and the
Plan & billing Workshop. Both use the current EwaTrade checkout, without worktrees
or branch changes. Creation was followed by compact progress snapshots confirming
both chats are active and have started their assigned work.

| Chat | Owner scope |
| --- | --- |
| `01a1bcab-cc78-74e1-b58f-2fe679c1341d` · Apple billing deployment and purchase verification | Recover the existing signed10 Starter Sandbox purchase; server verification/reconciliation, normal deployment and signed acceptance. |
| `01a1bcaf-470c-7bf2-bce4-4ff54a73485e` · Plan and billing Workshop — owner subscriptions | Static Workshop revisions and full UI scenario coverage, with current top plan card and Usage preserved. |

The source chat `01a1b178-b8d1-7762-96ef-8d075367d795` handed over private payment
evidence and will not perform concurrent payment-runtime edits or duplicate live
probes. Android remains separate. The deployment chat owns subsequent live status;
this file records the handoff checkpoint rather than claiming later recovery.

## Purchase evidence transferred

Private1.0.0(10), exact source2d4424b1525c4aa05e6ced39ce888e31d7f8140e, is the
installed signed candidate. Starter cancellation/no-grant passed. The owner then
completed one licensed Apple Sandbox purchase and received “You are all set”.
EwaTrade instead reports awaiting verification, remains Free after refresh, and
one Restore attempt produced no visible recovery.

At19:27:00.512Z, the exact reviewer Production read-only check found zero verified
owner purchases, no subscription/coverage and canonical owner_billing_free access.
Vercel browser logs confirm build10 POST verifyPurchase400 BAD_REQUEST on current
Production deployment dpl_CRXkzyZQrtHSew3SWAFeuhv1tRyT and Apple webhook503.
The failure is not accepted as a completed purchase, restore or coverage grant.

A bounded read-only Apple Sandbox notification-history request recovered one
SUBSCRIBED Starter purchase at19:39:16.951Z. Full SDK Sandbox notification and
transaction signature/bundle verification pass; appAccountToken exactly matches
the existing reviewer owner's billing account. Apple's delivery attempt is
UNSUCCESSFUL_HTTP_RESPONSE_CODE. The initial optional notification-type filter
returned4000018; removing that filter made the single bounded retry succeed.
This query error is distinct from the actual purchase verification error.

The signed payload, transaction references and account IDs remain private in
`/private/tmp/ewatrade-reviewer-apple-purchase-capture.private.json`, passed only to
the deployment chat. No receipt IDs, credentials or payloads are copied here or
sent to the Workshop. No database writes, provider mutation, manual paid grant,
second purchase or new key creation occurred during this recovery investigation.

Vercel CLI authentication was unavailable. Its automatic device-login process was
cancelled (exit130), and its own authorization tab was closed. Read-only existing
browser access succeeded. An account security-notice reminder change was rejected
by automatic approval and was not applied; read-only log navigation remained usable.
iPhone Mirroring became locked, so the owner supplied the app's actual message.

Apple acceptance remains **2/6 (33.3%)** at handoff. Public checkoutfalse, WEB
activation unchanged, no public submission or private TestFlight OTA bypass.
Genuine TEST delivery, real Apple purchase signatures and verified durable EwaTrade
subscription/coverage are separate proofs. Follow the deployment chat's later
commit/release evidence before claiming recovery or acceptance.

## Workshop scope transferred

Keep the **existing top plan card and Usage section exactly as currently
implemented, including order and presentation**. Redesign only **Owner
subscriptions downward**. Earlier unselected v3 options that reordered those
upper sections are superseded as proposals by this correction. No revision has
been selected or implemented in native source.

Continue the same [Workshop](https://workshop.localhost/ewatrade/legacy/mobile-ui-audit/android-2026-08-24/business-subscription),
using stable a/b/c direction keys and immutable revisions. Preserve historic d/v1,
all prior revisions, shared components and complete flows. The dedicated chat has
the exact current revision IDs, source paths and screenshot references. Three
meaningful lower-section arrangements should use identical sample content and
upper UI. Opus5.5/high remains the requested default, with bounded input permissions
and the standing automatic takeover rule; preserve actual authorship provenance.

The handoff requires an explicit scenario-to-state/interaction mapping covering:

- Free/no owner plan, all three localized monthly offers and renewal disclosure.
- Catalog/price loading, partial prices, absent billing periods and availability
  gates; offline and refresh-error states with/without a saved snapshot.
- Owner purchase authority and staff/admin read-only states.
- Simulated purchase confirmation/cancel, pending approval and store errors.
- Awaiting verification, verified/store-finish failure and refresh recovery.
- Verified owner plan but uncovered business; explicit enrollment processing,
  failure/retry and success; covered, full-slot and over-limit states.
- Release coverage confirmation/cancel/processing/failure/success, preserving data
  and making clear store renewal is unaffected.
- Restore processing/success/none/catalog failure/verification failure and
  idempotent retry; Manage store subscriptions opening/failure.
- Provider conflict, owner/account/business switching and stale result refusal.
- Verified retry/grace, cancelled renewal with remaining paid access, expiry,
  refund/revocation, Free fallback and retained records above current limits.
- Current legal acceptance, policy links/missing pages/open failure, with new
  purchase vs restore authority preserved; localized currency and long price text.

These are **local preview states**, not provider/native acceptance. No live calls,
fixtures, charges, legal publication or product implementation are authorized by
the Workshop. Owner selection of an exact revision precedes native implementation.

## Verification and Brain impact

Both chat starts were observed. Handoff facts reuse the actual scoped Production
read, signed Apple capture and Vercel UI evidence; no repeated money tests were
manufactured. Documentation whitespace/local-link checks pass. This handoff adds
no application code, API contract, permission or schema change. Local Brain task
handoff note and current-task pointer record the two owners and scope; subsequent
runtime/design evidence belongs to their chats.
