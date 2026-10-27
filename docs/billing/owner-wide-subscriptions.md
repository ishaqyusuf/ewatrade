# Owner-wide subscriptions: offline preparation

The Android paid-launch branch prepares `@ewatrade/db/owner-billing`. The module
has pure policy functions and commands taking a transactional repository port.
It has **no live Prisma adapter, router, signup hook or notification wiring**.
The existing Tenant-bound billing implementation and launch grants remain active
source authority until the reviewed cutover. Do not enable checkout on the basis
of these offline checks.

## Commercial contract

Prices are NGN per month: Starter 5,000, Growth 15,000 and Pro 30,000. Store offers
must still use the actual localized price/renewal/offer token returned by Play.
`OWNER_BILLING_OFFERS` stages these approved quantities independently of the legacy
catalog; it is not a new default or activation switch.

| Plan | Separate owner businesses | Catalog items per business | Monthly orders per business | Staff per business |
| --- | ---: | ---: | ---: | ---: |
| Free | 1 | 10 | 50 | 0 |
| Starter | 1 | 100 | Unlimited | 2 |
| Growth | 3 | 1,000 | Unlimited | 10 |
| Pro | 10 | Unlimited | Unlimited | 50 |

The owner confirmed separate catalog/order/staff allowances for each business on
27 October 2026. A business is a Tenant, not a Store within one Tenant. Existing
Store limits must not be repurposed into this business cap. AI quantities, token
packs, trials and annual offers are not introduced here.

## Prepared behavior

- `enrollOwnerBusiness` rechecks the paying User and current active OWNER
  membership in an active Tenant inside the transaction. An Admin cannot act as
  another User's billing owner. Retrying an existing enrollment consumes no slot.
- Only current, unexpired, ACTIVE verified store subscription facts in the
  expected environment authorize new coverage. Expired/suspended/cancelled
  subscriptions confer no paid plan. A renewal can reuse saved coverage.
  Use existing `projectStoreEntitlement` when mapping provider state: turning off
  auto-renewal alone preserves access through the verified paid period.
- Coverage requires current ownership at projection time. Ownership removal does
  not transfer the subscription or erase coverage history. Stale coverage does
  not consume an eligible business slot; another account cannot silently take it.
- On downgrade, eligible coverage is ordered by enrollment time, then Tenant ID.
  Only the first 1/3/10 receive the paid tier. Extra saved rows remain intact and
  new enrollment is refused while at/over the cap. The owner can explicitly
  release coverage; no business records, edits, history or queued commands are
  deleted. Removing coverage never cancels the provider subscription.
- `assertOwnerBusinessAllowance` accepts usage for the exact same Tenant, safe
  nonnegative integer counts and a positive integer admission quantity. It
  refuses only new admissions beyond that business's allowance. Domain commands
  must retain their own membership/permission, usage-count and concurrency locks.
  Monthly order counts continue to use the canonical UTC calendar-month window.
- `assertOwnerPurchaseBinding` accepts facts only after existing server-side store
  verification. It checks opaque account token, exact owner/provider/purchase
  binding and environment. It refuses legacy Tenant receipts as owner receipts,
  foreign restores and a second unexpired subscription, including a suspended
  subscription that can recover. Play replacements require an exact verified
  linked receipt on the same account. This assertion does not verify a signature,
  process an event, charge a customer, or grant an entitlement by itself.

These policies project a tier, not business data access. Session, membership,
roles, Store scope and all existing domain checks remain independently required.
No assistant tool, prompt, client plan ID or client coverage list may grant access.

## Durable adapter and cutover still required

1. After service restoration, inspect existing accounts, receipts, grants and
   migration state once on the selected authorized target. Do not assume empty
   purchases, rewrite existing tokens or copy plans into Tenant metadata.
2. Add reviewed durable owner account/subscription/coverage persistence through
   normal Prisma generation and migrate/push commands. No Prisma schema or
   migration is changed by this offline preparation. Require one immutable billing
   owner per account, one account per owner, unique provider purchase identity,
   one canonical subscription per account and unique active Tenant coverage.
   Retain release/enrollment history. Ownership transfer requires a separate
   explicit reconciliation path; never infer transfer from a membership change.
3. Implement `OwnerBillingRepository.transaction`: lock account and Tenant in a
   deterministic order; serialize with ownership/membership changes; re-read all
   authority and subscription facts; enforce the unique constraints; roll back
   completely on failure. Enrollment and release must use that same lock protocol.
4. Use existing provider verification, event/order/void ledger, observed-time
   ordering and refund authority when persisting the canonical subscription.
   An old refund must not cancel a newer paid renewal. Binding assertions alone
   do not establish notification/replay correctness. Notifications are not actor
   purchases; purchase initiation still requires the authenticated paying owner.
5. Wire catalog/purchase/restore, notification/refund processing, signup and each
   domain entitlement/allowance reader to the same account and current coverage.
   Pin purchase recovery to its original actor/account; business switching cannot
   reinterpret an in-flight receipt. Preserve legacy/manual/launch grants through
   an explicit versioned cutover and preserve business records above a new limit.
   The staged offer intentionally omits unapproved feature/Store/AI policy changes.
   Reconcile durable plan rows/limitsSnapshot and mobile mirrors with the staged
   offer; changing a static label alone cannot override saved authority. Add new
   billing records to the canonical account privacy inventory/export/retention
   workflow before activation, preserving its existing financial-record policy.
6. Verify actual database uniqueness/locks, account changes, existing-receipt
   compatibility, notification ordering and cutover on a non-production target.
   Then build and test the exact signed Android billing candidate and complete
   merchant, legal/refund, Data safety and review gates. Android35 lacks native
   IAP and cannot prove this candidate. No push, deployment or provider activation
   follows from source verification.

## Offline verification

The focused test file is
`packages/db/src/queries/owner-billing/owner-billing.test.ts`. It imports no Prisma
client or provider module. Its serialized in-memory port exercises command
ordering, conflicting admissions, retry and rollback behavior. That is a test of
the port model, **not evidence of PostgreSQL constraints or isolation**.

Run the existing `qa:doctor --offline`, planned/scoped `test:quick`, strict module
types and H01/H02 gates. Use a minimal environment with an unusable DB sentinel;
never copy Production credentials to make an offline check pass. Preserve existing
unchanged Android configuration/source evidence and reserve actual signed-device
purchase tests for the later candidate.
