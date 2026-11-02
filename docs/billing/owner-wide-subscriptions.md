# Owner-wide subscriptions: durable adapter, cutover pending

`@ewatrade/db/owner-billing` has pure policy functions, transactional commands and,
since 2 November 2026, a durable Prisma adapter wired to the catalog, purchase,
restore, notification, signup and canonical entitlement readers. All of that
wiring is **off** unless `OWNER_BILLING_ENABLED=true` and
`STORE_BILLING_ENVIRONMENT` is `sandbox` or `production`. The existing
Tenant-bound billing implementation and launch grants remain the active source
authority until the reviewed cutover. Do not enable checkout or the switch on the
basis of local checks.

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

## Durable adapter (local development only, 2 November 2026)

Schema `packages/db/prisma/models/owner-billing.prisma`, migration
`20261102192301_owner_billing_persistence`, applied only to the local
`ewatrade_qa_v1` development database:

- `OwnerBillingAccount`: UUID id is the opaque store account token; unique,
  immutable `ownerUserId` (one account per owner, one owner per account).
- `OwnerBillingPurchase`: every verified owner receipt; unique
  `(provider, purchaseDigest)` binds a purchase to one account.
- `OwnerBillingSubscription`: unique `accountId`, the one canonical
  subscription, with `verifiedAt` for observed-time ordering.
- `OwnerBusinessCoverage`: enrollment history. `activeTenantId` is unique and set
  only while current, so one active coverage per Tenant and released rows remain.

`createPrismaOwnerBillingRepository(db).transaction` takes advisory locks on the
account and then the Tenant (always that order), share-locks the owner `User` and
the owner's `Membership`/`Tenant` rows (`FOR SHARE`) so ownership changes wait,
re-reads every fact after the locks under ReadCommitted, relies on the database
unique indexes and rolls back completely on any failure. Enrollment and release
use it. `applyVerifiedOwnerSubscription` and `recordOwnerPlayVoidedOrder` take the
same account lock, refuse legacy Tenant receipts and foreign or second
subscriptions, keep an older notification for a replaced receipt from displacing
the current one, and let only the current paid order's void cancel access. Owner
ledger rows in `BillingProviderEvent` have no Tenant and carry `accountId`.

Wiring behind the switch:

- `reconcileStoreSubscription` routes a receipt whose token names an owner
  account to the owner adapter (purchase, restore, Apple/Play notifications and
  Play voids). Purchase/restore pass the actor, which must be the account owner.
- `storeSubscriptions.catalog` gives an account token only to an `OWNER`
  membership, bound to that user's own account, and reports `ownerCoverage`;
  `enrollBusiness` and `releaseBusiness` run the commands.
- `completeOwnerSignup` enrolls the businesses it just created after commit
  while slots remain; failures are logged and never fail the signup.
- The canonical entitlement reader (snapshot, tenant plan, order/product/report
  allowance and dashboard navigation features) raises a covered business to the
  owner plan with that offer's per-business products/orders/staff. It never
  lowers a higher legacy, manual or launch grant.
- An owner billing account now requires software-subscription privacy review.
- Synchronous plan readers (`resolveRetailOpsPlanId`,
  `projectRetailOpsPlanFeatures`) take an optional `ownerPlanId` that raises the
  Tenant-bound plan and never lowers it. Their async callers fetch it with
  `getRetailOpsOwnerPlanId(s)` (batched `getOwnerCoveredPlanIds`), which
  returns nothing without a query while the switch is off. Wired: tenant
  context, workspace read preference, Dashboard workspace list, public
  storefront projection, site factory and customer messages, storefront
  orders, site authority, attachments, Activity finance scope, notification
  fanout and order-reminder jobs. Current coverage also keeps a business whose
  Tenant-bound store receipt lapsed from being taken offline by the store
  access gate. The coverage read is unlocked: a projection only, like the async
  reader, so a concurrent owner change can be one read behind.

## Account privacy (2 November 2026)

- The platform-admin `reviewDetail` `billingReviewInventory` adds
  `ownerBilling` (canonical subscription provider/status/period end, receipt
  and coverage counts; `null` without an account) and `ownerCoverageRecords`
  (coverage rows the subject enrolled or released, or that cover a Tenant they
  belonged to). No purchase digests, order IDs or prices are selected.
- `confirmNoAccountPrivacySubscriptions` refuses `NOT_APPLICABLE` while the
  subject has an owner account or any such coverage row, and adds both counts
  to its evidence digest. The completion gate rechecks the account and
  user-attributed coverage by verified subject ID after User removal.
- Retention reuses the existing reviewed `SOFTWARE_SUBSCRIPTIONS` disposition
  (`RETENTION_APPROVED`, erasure or anonymization); no billing retention
  period exists or is introduced. Profile disposition anonymizes, not deletes,
  the User, so the `Restrict` owner relation keeps the account and its
  receipts until that review. A numeric retention period for owner receipts
  and coverage history is an owner decision.

## Ownership transfer (design, pending)

There is no business ownership-transfer command in the product yet. When a
Tenant's OWNER changes, the previous owner's coverage row goes stale: the
projection already stops giving that Tenant a paid tier and frees the old
owner's slot, but `activeTenantId` stays held, so the new owner's enrollment is
refused with `COVERAGE_CONFLICT`. The path it needs:

1. An explicit `releaseStaleOwnerCoverage(tenantId, actor)` command, called by
   the future transfer command or by the new owner. It locks both accounts in
   ascending id order and then the Tenant (extending the account-then-Tenant
   order), share-locks memberships, and verifies the old account's owner has no
   current OWNER membership in that Tenant.
2. It sets `releasedAt`, `releasedByUserId` and clears `activeTenantId`,
   never touching the old account's purchases or subscription. The new owner
   then enrolls through the normal command.
3. Owner decision: who may release another account's stale coverage (new
   owner, platform admin only, or the transfer command alone) and whether a
   transfer should enroll automatically.

## Cutover still required (owner-gated)

1. Inspect existing accounts, receipts, grants and migration state once on the
   selected authorized target after service restoration. Apply the migration there
   only through the normal guarded commands. No target was touched.
2. Decide the versioned cutover: what happens to launch grants, existing
   Tenant-bound receipts and `limitsSnapshot` rows; whether signup still writes a
   launch grant; and whether paid product caps (currently not enforced for paid
   plans) are enforced. Reconcile durable plan rows and mobile mirrors with the
   offer; Pro's unlimited products currently keeps the legacy numeric cap.
3. Synchronous plan readers are wired (above). Before enabling, review any new
   `resolveRetailOpsPlanId` caller: one that passes no `ownerPlanId` silently
   reads Tenant-bound authority only.
4. Decide a retention period for owner receipts and coverage history, if one is
   wanted beyond the reviewed disposition. Implement the ownership-transfer
   release path above; the account owner is never inferred from membership.
5. The mobile client must use the owner token, `ownerCoverage`, enroll and
   release. Then verify on a non-production target, build and test the exact
   signed Android candidate and complete merchant, legal/refund, Data safety and
   review gates. No push, deployment or provider activation follows.

## Verification

`packages/db/src/queries/owner-billing/owner-billing.test.ts` keeps the in-memory
port model (no Prisma client). It is not evidence of PostgreSQL behavior.
`owner-billing.integration.test.ts` runs only with the verified local profile
(`RUN_DATABASE_INTEGRATION_TESTS=1`) against `ewatrade_qa_v1`: it proves the
database refuses a second active coverage row, concurrent enrollments on a
one-business plan grant exactly one slot, release keeps history, legacy and
foreign receipts are refused, older reads never overwrite newer ones, an old
void does not cancel a newer renewal, and the entitlement reader overlay. It
also checks that the batched `getOwnerCoveredPlanIds` reader agrees with it.
`retail-ops-subscriptions.test.ts` covers the synchronous overlay (raises,
never lowers, outlives a lapsed receipt, no query while off) and the privacy
tests cover the owner inventory, certification refusal and completion recheck.

Run the existing `qa:doctor --offline`, planned/scoped `test:quick`, strict module
types and H01/H02 gates. Use a minimal environment with an unusable DB sentinel;
never copy Production credentials to make an offline check pass. Preserve existing
unchanged Android configuration/source evidence and reserve actual signed-device
purchase tests for the later candidate.
