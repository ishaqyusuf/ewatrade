import type { RetailOpsPaidPlanId } from "../retail-ops-subscription-plans"
import { OWNER_BILLING_OFFERS, OWNER_BILLING_QUOTA_SCOPE } from "./offers"

export type OwnerBillingEnvironment = "production" | "sandbox"
export type OwnerBillingProvider = "app_store" | "play_store"

export type OwnerBillingAccount = {
  id: string
  ownerUserId: string
  ownerIsActive: boolean
}

export type OwnerBillingSubscription = {
  accountId: string
  provider: OwnerBillingProvider
  environment: OwnerBillingEnvironment
  purchaseDigest: string
  planId: RetailOpsPaidPlanId
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED"
  currentPeriodEndsAt: Date
}

export type OwnerBusinessCoverage = {
  accountId: string
  tenantId: string
  enrolledAt: Date
}

export class OwnerBillingPolicyError extends Error {
  constructor(
    public readonly code:
      | "OWNER_REQUIRED"
      | "BUSINESS_OWNER_REQUIRED"
      | "COVERAGE_CONFLICT"
      | "BUSINESS_LIMIT_REACHED"
      | "SUBSCRIPTION_REQUIRED"
      | "PURCHASE_BINDING_MISMATCH"
      | "ACTIVE_SUBSCRIPTION_CONFLICT"
      | "ALLOWANCE_REACHED"
      | "INVALID_STATE",
  ) {
    super(code)
    this.name = "OwnerBillingPolicyError"
  }
}

export function assertBillingOwner(
  account: OwnerBillingAccount,
  actorUserId: string,
) {
  if (
    !account.id ||
    !account.ownerUserId ||
    !account.ownerIsActive ||
    account.ownerUserId !== actorUserId
  )
    throw new OwnerBillingPolicyError("OWNER_REQUIRED")
}

export function currentOwnerSubscription(input: {
  account: OwnerBillingAccount
  subscription: OwnerBillingSubscription | null
  environment: OwnerBillingEnvironment
  now: Date
}) {
  const { account, subscription, environment, now } = input
  if (
    !account.id ||
    !account.ownerUserId ||
    !account.ownerIsActive ||
    !subscription ||
    subscription.accountId !== account.id ||
    subscription.environment !== environment ||
    !["app_store", "play_store"].includes(subscription.provider) ||
    !["starter", "growth", "pro"].includes(subscription.planId) ||
    !subscription.purchaseDigest ||
    subscription.status !== "ACTIVE" ||
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(subscription.currentPeriodEndsAt.getTime()) ||
    subscription.currentPeriodEndsAt <= now
  )
    return null
  return subscription
}

export type OwnerCoverageSnapshot = {
  account: OwnerBillingAccount
  subscription: OwnerBillingSubscription | null
  coverage: readonly OwnerBusinessCoverage[]
  /** Fresh active OWNER memberships in active Tenants, derived by the server. */
  ownedTenantIds: readonly string[]
  environment: OwnerBillingEnvironment
  now: Date
}

function ownedCoverage(snapshot: OwnerCoverageSnapshot) {
  const seen = new Set<string>()
  for (const row of snapshot.coverage) {
    if (
      row.accountId !== snapshot.account.id ||
      !row.tenantId ||
      !Number.isFinite(row.enrolledAt.getTime()) ||
      seen.has(row.tenantId)
    )
      throw new OwnerBillingPolicyError("INVALID_STATE")
    seen.add(row.tenantId)
  }
  const owned = new Set(snapshot.ownedTenantIds)
  // Stable ordering preserves the earliest enrolled businesses on a downgrade.
  // Saved coverage and business data stay intact; the owner may remove coverage.
  return snapshot.coverage
    .filter((row) => owned.has(row.tenantId))
    .toSorted(
      (a, b) =>
        a.enrolledAt.getTime() - b.enrolledAt.getTime() ||
        (a.tenantId < b.tenantId ? -1 : a.tenantId > b.tenantId ? 1 : 0),
    )
}

/** A plan projection only; this never grants membership, Store or data access. */
export function projectOwnerBusinessAccess(
  snapshot: OwnerCoverageSnapshot,
  tenantId: string,
) {
  const owned = ownedCoverage(snapshot)
  const subscription = currentOwnerSubscription(snapshot)
  const businessLimit = subscription
    ? OWNER_BILLING_OFFERS[subscription.planId].businesses
    : 0
  const coveredTenantIds = owned
    .slice(0, businessLimit)
    .map((row) => row.tenantId)
  const overLimitTenantIds = owned
    .slice(businessLimit)
    .map((row) => row.tenantId)
  const reason = !snapshot.ownedTenantIds.includes(tenantId)
    ? ("not_owner" as const)
    : !subscription
      ? ("inactive_subscription" as const)
      : !owned.some((row) => row.tenantId === tenantId)
        ? ("uncovered" as const)
        : !coveredTenantIds.includes(tenantId)
          ? ("over_business_limit" as const)
          : ("covered" as const)
  const planId =
    reason === "covered" && subscription ? subscription.planId : "free"
  return {
    planId,
    reason,
    businessLimit,
    coveredTenantIds,
    overLimitTenantIds,
    quotaScope: OWNER_BILLING_QUOTA_SCOPE,
    limits: OWNER_BILLING_OFFERS[planId],
  }
}

export function decideOwnerBusinessEnrollment(
  snapshot: OwnerCoverageSnapshot,
  input: {
    actorUserId: string
    tenantId: string
    existingCoverage: OwnerBusinessCoverage | null
  },
) {
  assertBillingOwner(snapshot.account, input.actorUserId)
  if (!input.tenantId || !snapshot.ownedTenantIds.includes(input.tenantId))
    throw new OwnerBillingPolicyError("BUSINESS_OWNER_REQUIRED")
  if (input.existingCoverage) {
    if (
      input.existingCoverage.tenantId !== input.tenantId ||
      input.existingCoverage.accountId !== snapshot.account.id
    )
      throw new OwnerBillingPolicyError("COVERAGE_CONFLICT")
    const stored = snapshot.coverage.find(
      (row) => row.tenantId === input.tenantId,
    )
    if (
      !stored ||
      stored.enrolledAt.getTime() !==
        input.existingCoverage.enrolledAt.getTime()
    )
      throw new OwnerBillingPolicyError("INVALID_STATE")
    ownedCoverage(snapshot)
    return "unchanged" as const
  }
  const subscription = currentOwnerSubscription(snapshot)
  if (!subscription) throw new OwnerBillingPolicyError("SUBSCRIPTION_REQUIRED")
  const owned = ownedCoverage(snapshot)
  if (owned.some((row) => row.tenantId === input.tenantId))
    throw new OwnerBillingPolicyError("INVALID_STATE")
  if (owned.length >= OWNER_BILLING_OFFERS[subscription.planId].businesses)
    throw new OwnerBillingPolicyError("BUSINESS_LIMIT_REACHED")
  return "enroll" as const
}

/** Usage must be read for this exact Tenant under the admitting domain's lock. */
export function assertOwnerBusinessAllowance(
  snapshot: OwnerCoverageSnapshot,
  input: {
    tenantId: string
    usage: { tenantId: string; count: number }
    resource: "products" | "ordersPerMonth" | "staff"
    quantity: number
  },
) {
  if (
    !["products", "ordersPerMonth", "staff"].includes(input.resource) ||
    input.usage.tenantId !== input.tenantId ||
    !Number.isSafeInteger(input.usage.count) ||
    input.usage.count < 0 ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    !Number.isSafeInteger(input.usage.count + input.quantity)
  )
    throw new OwnerBillingPolicyError("INVALID_STATE")
  const access = projectOwnerBusinessAccess(snapshot, input.tenantId)
  if (access.reason === "not_owner")
    throw new OwnerBillingPolicyError("BUSINESS_OWNER_REQUIRED")
  const limit = access.limits[input.resource]
  if (limit !== null && input.usage.count + input.quantity > limit)
    throw new OwnerBillingPolicyError("ALLOWANCE_REACHED")
  return access
}

export type OwnerPurchaseBinding = {
  scope: "owner"
  accountId: string
  provider: OwnerBillingProvider
  purchaseDigest: string
  environment: OwnerBillingEnvironment
}

/** Call only after canonical server-side store verification, never on client facts. */
export function assertOwnerPurchaseBinding(input: {
  account: OwnerBillingAccount
  environment: OwnerBillingEnvironment
  verifiedAccountToken: string
  verifiedEnvironment: OwnerBillingEnvironment
  provider: OwnerBillingProvider
  purchaseDigest: string
  existingBinding:
    | OwnerPurchaseBinding
    | { scope: "legacy_tenant"; tenantId: string }
    | null
  linkedPurchaseDigest: string | null
  linkedBinding: OwnerPurchaseBinding | null
  currentSubscription: OwnerBillingSubscription | null
  now: Date
}) {
  const ownsBinding = (binding: OwnerPurchaseBinding, digest: string) =>
    binding.accountId === input.account.id &&
    binding.provider === input.provider &&
    binding.purchaseDigest === digest &&
    binding.environment === input.environment
  if (
    !input.account.ownerIsActive ||
    !input.account.id ||
    !input.account.ownerUserId ||
    input.verifiedAccountToken !== input.account.id ||
    input.verifiedEnvironment !== input.environment ||
    !["app_store", "play_store"].includes(input.provider) ||
    !input.purchaseDigest ||
    !Number.isFinite(input.now.getTime()) ||
    (input.existingBinding &&
      (input.existingBinding.scope !== "owner" ||
        !ownsBinding(input.existingBinding, input.purchaseDigest))) ||
    (input.linkedPurchaseDigest &&
      (input.provider !== "play_store" ||
        !input.linkedBinding ||
        !ownsBinding(input.linkedBinding, input.linkedPurchaseDigest))) ||
    (!input.linkedPurchaseDigest && input.linkedBinding)
  )
    throw new OwnerBillingPolicyError("PURCHASE_BINDING_MISMATCH")
  if (
    input.currentSubscription &&
    (input.currentSubscription.accountId !== input.account.id ||
      input.currentSubscription.environment !== input.environment ||
      !Number.isFinite(
        input.currentSubscription.currentPeriodEndsAt.getTime(),
      ) ||
      !["app_store", "play_store"].includes(
        input.currentSubscription.provider,
      ) ||
      !["starter", "growth", "pro"].includes(
        input.currentSubscription.planId,
      ) ||
      !["ACTIVE", "SUSPENDED", "CANCELLED"].includes(
        input.currentSubscription.status,
      ) ||
      !input.currentSubscription.purchaseDigest)
  )
    throw new OwnerBillingPolicyError("INVALID_STATE")
  // A suspended provider subscription can recover. It still occupies the
  // purchase slot until its period ends or the provider confirms cancellation.
  const current =
    input.currentSubscription &&
    input.currentSubscription.status !== "CANCELLED" &&
    input.currentSubscription.currentPeriodEndsAt > input.now
      ? input.currentSubscription
      : null
  if (
    current &&
    (current.provider !== input.provider ||
      (current.purchaseDigest !== input.purchaseDigest &&
        current.purchaseDigest !== input.linkedPurchaseDigest))
  )
    throw new OwnerBillingPolicyError("ACTIVE_SUBSCRIPTION_CONFLICT")
}
