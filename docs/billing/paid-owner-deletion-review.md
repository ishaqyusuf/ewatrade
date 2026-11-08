# Paid-owner account deletion review

Engineering policy and operator procedure, approved by the owner on 8 November
2026 (`call_b39c80b5c31642e79861f1e0a66ebd6c`: “Approve policy and
implementation”). This is source implementation approval. It does not approve
processing an existing account, activating flags, deploying a schema, cancelling
a subscription or publishing legal terms. The shared mobile disclosure draft
remains the single legal-copy draft.

## Approved treatment

Revoke account access and minimize the personal profile using the existing
verified-subject workflow. Retain only necessary billing records for payment
reconciliation, refunds/disputes, receipt anti-replay or an applicable record
obligation. Each retained category needs controller authority, a purpose,
necessity and basis evidence, an actual expiry or bounded hold, an accountable
reviewer and the next review date. Review within twelve calendar months, or
earlier if a deadline or shorter policy requires it. Holds require a legal-hold
or unresolved-dispute basis and review within ninety days.

These are review ceilings, not universal billing deletion periods. The policy
does not extend the separate privacy-case ninety-day/contact, twelve-month/review
and twenty-four-month/evidence periods to financial records. It does not replace
existing approved commercial accounting or clinical policies. The operator must
resolve expired/unnecessary data under the applicable record-specific process;
the review command never silently renews a deadline or automatically purges
financial records.

Apple, Google and Paystack cancellation remains a separate provider process.
Expiry, refunded access or a `CANCELLED` projection does not prove that renewal
has stopped. A minimized profile with retained receipt linkage is retained
personal data; it is not anonymous or fully erased. A requester notice must
explain the retained categories, reasons and separate cancellation route. Local
results cannot certify erasure by an external provider.

## Supported source scope

The bounded inventory covers the subject's immutable owner account, purchases,
current subscription, current/released coverage, attributed checkouts, durable
tenant-less Paystack checkout/charge/binding/refund events, Play refund cases and
responses, and historical Tenant billing candidates. It follows checkout IDs,
order/account digests and actor attribution even when the compatibility checkout
row has been removed. Provider payloads, customer/subscription codes, checkout
links and encrypted custody material stay inside the processor; operator
inventory responses contain identifiers, counts and hashes.

The current positive processor supports reviewed owner billing. Other owners'
coverage, unallocated legacy Tenant plans/invoices/purchases, contradictory or
unsupported provider records, unknown environments, oversized scope and
unresolved checkout/refund dispatches remain explicit blockers. A retained
category decision does not establish ownership of someone else's business.
Each family is capped at 500 records; truncation fails review instead of proving
no data. This is not whole-database deletion acceptance.

## Operator sequence

All operations are `accountPrivacy` platform-admin procedures. Ordinary business
owners, merchant assistants and clients cannot supply an operator identity or
policy override.

1. Complete independent subject verification and account/membership revocation.
   `inspectSubscriptions({requestId})` returns current scope and blockers.
2. If the sole blocker is `CHECKOUT_LINK_MINIMIZATION_REQUIRED`, explicitly invoke
   `minimizeSubscriptionLinks` with the current `expectedInventoryDigest`. It
   clears terminal checkout/return/cancel URLs and journal checkout links only;
   it preserves provider references/codes, receipts, amounts and entitlements.
   Inspect again and use the new digest. Pending/uncertain/shared cases cannot
   take this path.
3. `reviewSubscriptions` requires the current inventory and approved policy
   digests, controller evidence, all four explicit confirmations, and exactly
   one decision for each present family. Each decision records purpose,
   necessity/basis evidence digests, expiry or hold, and next review. Evidence
   digests refer to restricted reviewed material; they are not proof that an
   external provider completed a request.
4. Advance the existing `CONFIRM_SUBSCRIPTIONS` workflow stage. It consumes a
   valid current review and writes `RETENTION_APPROVED`; it never invents the
   operator's decision. Empty accounts retain the independently checked
   `NOT_APPLICABLE` path. Profile processing and completion recheck current
   scope. A late receipt, changed environment, refund, journal or superseded/
   expired review invalidates stale evidence. Reinspect/review and reconfirm
   before proceeding. Workflow inspection returns stale billing evidence to
   `CONFIRM_SUBSCRIPTIONS`. A canonical old empty outcome can become positive
   only after fresh review. If the profile was already minimized, the processor
   reuses the existing exact profile-minimization proof and actual cleared
   profile/auth state; it never restores the original login or skips identity
   verification. Concurrent reviews serialize; an old review cannot
   overwrite the current one on replay.
5. Complete the remaining profile, external-processor and reviewed/delivered
   notice stages. A changed domain outcome after notice delivery invalidates
   that older notice under the existing completion timestamp guard. This does
   not authorize automatic resend or bypass the case-specific notice approval
   and single-attempt rules. No new command sends a message or changes provider
   state.

The independent `AccountPrivacySubscriptionReview` ledger has no deletion-case,
Tenant or User cascade. `subscriptionRetentionReviews` lists current due duties
in bounded pages. `inspectSubscriptionRetention({reviewId})` and
`reassessSubscriptions` support the next explicit review even after case evidence
has expired. They derive the subject/case from an existing current review,
require fresh source/policy evidence and preserve superseded decisions. They do
not restore account access or rewrite a completed case's historical outcome.

## Default-off configuration and rollout

Existing `ACCOUNT_PRIVACY_PROCESSING_ENABLED`,
`ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED` and the approved policy version
remain required. The positive path additionally requires:

- `ACCOUNT_PRIVACY_SUBSCRIPTION_RETENTION_ENABLED=true`;
- `ACCOUNT_PRIVACY_SUBSCRIPTION_POLICY_JSON`, a strict object with matching
  `version`, `mode: MINIMUM_NECESSARY_BILLING_RETENTION`, approved timestamp,
  approved document SHA-256, `maximumReviewMonths: 12`, `maximumHoldDays: 90`;
- `ACCOUNT_PRIVACY_APPROVED_SUBSCRIPTION_POLICY_SHA256`, matching the parsed
  policy's canonical sorted-key SHA-256 (`subscriptionPrivacyDigest`).

All three new names are declared dormant in release configuration; no real
target values or fabricated approval JSON were installed. A deployment must
apply the generated additive migration before using the positive path. Source
tests/Development fixtures do not activate processing or establish hosted
deletion/provider delivery acceptance. An exact live-case authorization remains
separate from this engineering approval.

Verification: [paid-owner privacy receipt](../verification/2026-11-08-paid-owner-privacy.md).
