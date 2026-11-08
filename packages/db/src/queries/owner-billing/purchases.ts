import { createHash } from "node:crypto"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { RetailOpsPaidPlanId } from "../retail-ops-subscription-plans"
import {
  storeOrderDigest,
  storePurchaseDigest,
  storeVoidedOrderEventId,
} from "../store-subscriptions"
import {
  type OwnerBillingEnvironment,
  OwnerBillingPolicyError,
  type OwnerBillingSubscription,
  type OwnerPurchaseBinding,
  assertBillingOwner,
  assertOwnerPurchaseBinding,
} from "./policy"
import {
  mapOwnerBillingSubscription,
  runOwnerBillingTransaction,
  toDurableBillingProvider,
} from "./prisma-repository"
import {
  type AppStoreReviewConfig,
  resolveOwnerBillingEnvironment,
} from "./review-environment"
import { findPendingOwnerWebCheckout } from "./web-checkout-journal"

function payloadRecord(payload: Prisma.JsonValue | null | undefined) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : null
}

async function readOwnerAccount(
  tx: Prisma.TransactionClient,
  accountId: string,
) {
  const account = await tx.ownerBillingAccount.findUnique({
    where: { id: accountId },
    select: { id: true, ownerUserId: true },
  })
  if (!account) throw new OwnerBillingPolicyError("PURCHASE_BINDING_MISMATCH")
  const owner = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "User" WHERE "id" = ${account.ownerUserId} FOR SHARE`
  return { ...account, ownerIsActive: owner.length === 1 }
}

/**
 * Persists one verified owner receipt (purchase, restore or provider
 * notification) under the account lock. Store verification happens before
 * this call; the binding assertion never trusts client facts by itself.
 * A notification has no actor; purchase and restore pin the paying owner.
 */
export async function applyVerifiedOwnerSubscription(
  db: PrismaClient,
  input: {
    accountToken: string
    actorUserId?: string
    expectedEnvironment: OwnerBillingEnvironment
    provider: "app_store" | "play_store"
    purchaseId: string
    linkedPurchaseId?: string
    latestOrderId?: string
    productId: string
    planId: RetailOpsPaidPlanId
    environment: OwnerBillingEnvironment
    expiresAt: Date
    observedAt: Date
    status: "active" | "cancelled"
    cancelAtPeriodEnd: boolean
  },
  reviewConfig?: AppStoreReviewConfig,
) {
  if ((input.planId as string) === "free")
    throw new Error("Free is not a store subscription plan.")
  const provider = toDurableBillingProvider(input.provider)
  const purchaseDigest = storePurchaseDigest(input.provider, input.purchaseId)
  const latestOrderDigest =
    input.provider === "play_store" && input.latestOrderId
      ? storeOrderDigest(input.latestOrderId)
      : null
  if (
    input.provider === "play_store" &&
    input.status === "active" &&
    !latestOrderDigest
  )
    throw new Error("Play subscription has no current paid order.")
  const linkedDigest =
    input.provider === "play_store" && input.linkedPurchaseId
      ? storePurchaseDigest(input.provider, input.linkedPurchaseId)
      : null
  return runOwnerBillingTransaction(db, input.accountToken, async (tx) => {
    const account = await readOwnerAccount(tx, input.accountToken)
    if (input.actorUserId) assertBillingOwner(account, input.actorUserId)
    const expectedEnvironment = resolveOwnerBillingEnvironment(
      input.expectedEnvironment,
      account.ownerUserId,
      input.provider,
      reviewConfig,
    )
    const existing = await tx.ownerBillingPurchase.findUnique({
      where: { provider_purchaseDigest: { provider, purchaseDigest } },
      select: { accountId: true, environment: true, verifiedAt: true },
    })
    const legacy = existing
      ? null
      : await tx.storeSubscriptionPurchase.findUnique({
          where: { provider_purchaseDigest: { provider, purchaseDigest } },
          select: { tenantId: true },
        })
    if (existing && existing.verifiedAt > input.observedAt)
      return { applied: false as const }
    const binding = (accountId: string, digest: string, environment: string) =>
      ({
        scope: "owner",
        accountId,
        provider: input.provider,
        purchaseDigest: digest,
        environment: environment as OwnerBillingEnvironment,
      }) satisfies OwnerPurchaseBinding
    const linked = linkedDigest
      ? await tx.ownerBillingPurchase.findUnique({
          where: {
            provider_purchaseDigest: { provider, purchaseDigest: linkedDigest },
          },
          select: { accountId: true, environment: true },
        })
      : null
    const currentRow = await tx.ownerBillingSubscription.findUnique({
      where: { accountId: account.id },
      select: { ...subscriptionColumns, verifiedAt: true },
    })
    const current = currentRow ? mapOwnerBillingSubscription(currentRow) : null
    if (
      input.status === "active" &&
      process.env.WEB_BILLING_ENVIRONMENT &&
      !(
        currentRow?.provider === provider &&
        currentRow.purchaseDigest === purchaseDigest
      )
    ) {
      const pendingWeb = await findPendingOwnerWebCheckout(tx, account.id)
      if (pendingWeb)
        throw new OwnerBillingPolicyError("ACTIVE_SUBSCRIPTION_CONFLICT")
    }

    // An older receipt of this account (for example the one a Play upgrade
    // replaced) may still notify. Record its facts without displacing the
    // canonical subscription; it can never become the current one while inactive.
    const historical =
      input.status !== "active" &&
      current !== null &&
      current.purchaseDigest !== purchaseDigest
    const voided = latestOrderDigest
      ? await tx.billingProviderEvent.findUnique({
          where: {
            provider_eventId: {
              provider: "PLAY_STORE",
              eventId: storeVoidedOrderEventId(input.latestOrderId ?? ""),
            },
          },
          select: { tenantId: true, payload: true },
        })
      : null
    const voidedPayload = payloadRecord(voided?.payload)
    if (
      voided &&
      (voided.tenantId !== null ||
        voidedPayload?.accountId !== account.id ||
        voidedPayload.purchaseDigest !== purchaseDigest)
    )
      throw new OwnerBillingPolicyError("PURCHASE_BINDING_MISMATCH")
    if (historical) {
      if (
        legacy ||
        (existing && existing.accountId !== account.id) ||
        (existing && existing.environment !== input.environment) ||
        input.environment !== expectedEnvironment
      )
        throw new OwnerBillingPolicyError("PURCHASE_BINDING_MISMATCH")
    } else {
      assertOwnerPurchaseBinding({
        account,
        environment: expectedEnvironment,
        verifiedAccountToken: input.accountToken,
        verifiedEnvironment: input.environment,
        provider: input.provider,
        purchaseDigest,
        existingBinding: legacy
          ? { scope: "legacy_tenant", tenantId: legacy.tenantId }
          : existing
            ? binding(existing.accountId, purchaseDigest, existing.environment)
            : null,
        linkedPurchaseDigest: linkedDigest,
        linkedBinding: linked
          ? binding(linked.accountId, linkedDigest ?? "", linked.environment)
          : null,
        currentSubscription: current,
        now: input.observedAt,
      })
    }
    await tx.ownerBillingPurchase.upsert({
      where: { provider_purchaseDigest: { provider, purchaseDigest } },
      create: {
        accountId: account.id,
        provider,
        purchaseDigest,
        latestOrderDigest,
        productId: input.productId,
        environment: input.environment,
        expiresAt: input.expiresAt,
        verifiedAt: input.observedAt,
      },
      update: {
        latestOrderDigest,
        productId: input.productId,
        expiresAt: input.expiresAt,
        verifiedAt: input.observedAt,
      },
    })
    // Annotated so `facts` keeps the enum union instead of a widened string.
    const status: OwnerBillingSubscription["status"] =
      voided || input.status !== "active" ? "CANCELLED" : "ACTIVE"
    const cancelAtPeriodEnd = status === "ACTIVE" && input.cancelAtPeriodEnd
    // Observed-time ordering: an older read never overwrites a newer one.
    const stale = Boolean(
      currentRow && currentRow.verifiedAt > input.observedAt,
    )
    if (!historical && !stale) {
      const facts = {
        provider,
        environment: input.environment,
        purchaseDigest,
        planId: input.planId,
        status,
        currentPeriodEndsAt: input.expiresAt,
        cancelAtPeriodEnd,
        cancelledAt: status === "CANCELLED" ? input.observedAt : null,
        cancellationReason: voided
          ? "play_voided_order"
          : status === "CANCELLED"
            ? "store_inactive"
            : null,
        verifiedAt: input.observedAt,
      }
      await tx.ownerBillingSubscription.upsert({
        where: { accountId: account.id },
        create: { accountId: account.id, ...facts },
        update: facts,
      })
    }
    const eventId = createHash("sha256")
      .update(
        JSON.stringify([
          account.id,
          purchaseDigest,
          latestOrderDigest,
          input.productId,
          input.expiresAt.toISOString(),
          status,
          cancelAtPeriodEnd,
        ]),
      )
      .digest("hex")
    // Owner receipts are account-scoped: the shared ledger row has no Tenant.
    await tx.billingProviderEvent.upsert({
      where: {
        provider_eventId: { provider, eventId: `owner-store:${eventId}` },
      },
      create: {
        provider,
        eventId: `owner-store:${eventId}`,
        type: "owner_subscription_updated",
        status: "PROCESSED",
        processedAt: input.observedAt,
        payload: {
          accountId: account.id,
          purchaseDigest,
          latestOrderDigest,
          planId: input.planId,
          status,
          canonical: !historical && !stale,
        },
      },
      update: {},
    })
    return {
      applied: !historical && !stale,
      status,
      planId: input.planId,
    }
  })
}

const subscriptionColumns = {
  accountId: true,
  provider: true,
  environment: true,
  purchaseDigest: true,
  planId: true,
  status: true,
  currentPeriodEndsAt: true,
} as const

/**
 * Records a signed Play void for an owner receipt before acknowledging RTDN.
 * Only the provider's current paid order cancels access; an old refund never
 * cancels a newer renewal that another verified read has already persisted.
 */
export async function recordOwnerPlayVoidedOrder(
  db: PrismaClient,
  input: {
    accountToken: string
    purchaseId: string
    orderId: string
    latestOrderId: string
    observedAt: Date
  },
) {
  if (!input.orderId || !input.latestOrderId)
    throw new Error("Play voided order cannot be matched to a paid order.")
  const purchaseDigest = storePurchaseDigest("play_store", input.purchaseId)
  const orderDigest = storeOrderDigest(input.orderId)
  const eventId = storeVoidedOrderEventId(input.orderId)
  return runOwnerBillingTransaction(db, input.accountToken, async (tx) => {
    const account = await readOwnerAccount(tx, input.accountToken)
    const purchase = await tx.ownerBillingPurchase.findUnique({
      where: {
        provider_purchaseDigest: { provider: "PLAY_STORE", purchaseDigest },
      },
      select: { accountId: true, latestOrderDigest: true },
    })
    if (purchase && purchase.accountId !== account.id)
      throw new OwnerBillingPolicyError("PURCHASE_BINDING_MISMATCH")
    const event = await tx.billingProviderEvent.upsert({
      where: { provider_eventId: { provider: "PLAY_STORE", eventId } },
      create: {
        provider: "PLAY_STORE",
        eventId,
        type: "store_subscription_voided_order",
        status: "PROCESSED",
        processedAt: input.observedAt,
        payload: { accountId: account.id, purchaseDigest, orderDigest },
      },
      update: {},
      select: { tenantId: true, payload: true, type: true },
    })
    const payload = payloadRecord(event.payload)
    if (
      event.tenantId !== null ||
      event.type !== "store_subscription_voided_order" ||
      payload?.accountId !== account.id ||
      payload.purchaseDigest !== purchaseDigest ||
      payload.orderDigest !== orderDigest
    )
      throw new OwnerBillingPolicyError("PURCHASE_BINDING_MISMATCH")
    const currentOrder =
      input.orderId === input.latestOrderId &&
      purchase?.latestOrderDigest === orderDigest
    if (currentOrder) {
      await tx.ownerBillingSubscription.updateMany({
        where: {
          accountId: account.id,
          provider: "PLAY_STORE",
          purchaseDigest,
          status: "ACTIVE",
        },
        data: {
          status: "CANCELLED",
          cancelAtPeriodEnd: false,
          cancelledAt: input.observedAt,
          cancellationReason: "play_voided_order",
        },
      })
    }
    return { currentOrder }
  })
}
