import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { BillingProvider } from "../../generated/prisma/enums"
import {
  type RetailOpsPaidPlanId,
  processRetailOpsBillingProviderEvent,
  projectDurableReviewerAccess,
  projectDurableStoreAccess,
} from "./retail-ops-subscriptions"

export function getStoreBillingAccount(db: PrismaClient, tenantId: string) {
  return db.storeBillingAccount.upsert({
    where: { tenantId },
    create: { tenantId },
    update: {},
    select: { id: true },
  })
}

export async function getCurrentStoreBillingState(
  db: PrismaClient,
  tenantId: string,
  now = new Date(),
) {
  const subscription = await db.tenantSubscription.findUnique({
    where: { tenantId },
    select: {
      provider: true,
      status: true,
      currentPeriodEndsAt: true,
      billingSubscriptionId: true,
    },
  })
  if (
    !subscription ||
    subscription.status !== "ACTIVE" ||
    projectDurableStoreAccess(subscription, now) === false ||
    projectDurableReviewerAccess(subscription, now) === false ||
    (subscription.currentPeriodEndsAt &&
      subscription.currentPeriodEndsAt <= now)
  ) {
    return { activeProvider: null, activePlayProductId: null }
  }
  if (
    subscription.provider !== BillingProvider.PLAY_STORE ||
    !subscription.billingSubscriptionId
  ) {
    return { activeProvider: subscription.provider, activePlayProductId: null }
  }
  const purchase = await db.storeSubscriptionPurchase.findUnique({
    where: {
      provider_purchaseDigest: {
        provider: BillingProvider.PLAY_STORE,
        purchaseDigest: subscription.billingSubscriptionId,
      },
    },
    select: { productId: true, tenantId: true },
  })
  return {
    activeProvider: subscription.provider,
    activePlayProductId:
      purchase?.tenantId === tenantId ? purchase.productId : null,
  }
}

export function storePurchaseDigest(provider: string, purchaseId: string) {
  return createHash("sha256").update(`${provider}:${purchaseId}`).digest("hex")
}

export function storeOrderDigest(orderId: string) {
  return createHash("sha256").update(`play-order:${orderId}`).digest("hex")
}

export function storeVoidedOrderEventId(orderId: string) {
  return `store-void:${storeOrderDigest(orderId)}`
}

/** Records a signed Play void before acknowledging RTDN or re-verifying access. */
export async function recordPlayVoidedOrder(
  db: PrismaClient,
  input: {
    tenantId: string
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
  const providerCurrentOrder = input.orderId === input.latestOrderId
  return db.$transaction(
    async (tx) => {
      const account = await tx.storeBillingAccount.findUnique({
        where: { tenantId: input.tenantId },
        select: { id: true },
      })
      if (account?.id !== input.accountToken)
        throw new Error("Voided Play purchase workspace binding changed.")
      const purchase = await tx.storeSubscriptionPurchase.findUnique({
        where: {
          provider_purchaseDigest: {
            provider: BillingProvider.PLAY_STORE,
            purchaseDigest,
          },
        },
        select: { tenantId: true, latestOrderDigest: true },
      })
      if (purchase && purchase.tenantId !== input.tenantId)
        throw new Error("Voided Play purchase belongs to another workspace.")
      const event = await tx.billingProviderEvent.upsert({
        where: {
          provider_eventId: {
            provider: BillingProvider.PLAY_STORE,
            eventId: storeVoidedOrderEventId(input.orderId),
          },
        },
        create: {
          provider: BillingProvider.PLAY_STORE,
          eventId: storeVoidedOrderEventId(input.orderId),
          type: "store_subscription_voided_order",
          status: "PROCESSED",
          tenantId: input.tenantId,
          processedAt: input.observedAt,
          payload: { purchaseDigest, orderDigest },
        },
        update: {},
        select: { tenantId: true, payload: true, type: true },
      })
      if (
        event.tenantId !== input.tenantId ||
        event.type !== "store_subscription_voided_order" ||
        !event.payload ||
        typeof event.payload !== "object" ||
        Array.isArray(event.payload) ||
        event.payload.purchaseDigest !== purchaseDigest ||
        event.payload.orderDigest !== orderDigest
      )
        throw new Error("Voided Play order identity changed.")
      // The provider read occurred before this transaction. Another verified
      // renewal may already have advanced this purchase to a newer paid order.
      const currentOrder =
        providerCurrentOrder && purchase?.latestOrderDigest === orderDigest
      if (currentOrder) {
        await tx.tenantSubscription.updateMany({
          where: {
            tenantId: input.tenantId,
            provider: BillingProvider.PLAY_STORE,
            billingSubscriptionId: purchaseDigest,
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
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
}

export function assertStorePurchaseTransition(input: {
  provider: BillingProvider
  tenantId: string
  purchaseDigest: string
  linkedDigest: string | null
  linkedTenantId: string | null
  active: {
    provider: BillingProvider
    billingSubscriptionId: string | null
    status: string
    currentPeriodEndsAt: Date | null
  } | null
  now: Date
}) {
  if (input.linkedDigest && input.linkedTenantId !== input.tenantId) {
    throw new Error(
      "The replaced Play purchase belongs to another workspace or was not verified.",
    )
  }
  const replacesCurrent = Boolean(
    input.linkedDigest &&
      input.active?.provider === input.provider &&
      input.active.billingSubscriptionId === input.linkedDigest,
  )
  if (
    input.active?.billingSubscriptionId &&
    input.active.billingSubscriptionId !== input.purchaseDigest &&
    input.active.status === "ACTIVE" &&
    (!input.active.currentPeriodEndsAt ||
      input.active.currentPeriodEndsAt > input.now) &&
    !replacesCurrent
  ) {
    throw new Error(
      "This workspace already has another active subscription. Resolve it before assigning this purchase.",
    )
  }
}

export async function applyVerifiedStoreSubscription(
  db: PrismaClient,
  input: {
    tenantId: string
    accountToken: string
    provider: "app_store" | "play_store"
    purchaseId: string
    linkedPurchaseId?: string
    latestOrderId?: string
    productId: string
    planId: RetailOpsPaidPlanId
    environment: "production" | "sandbox"
    expiresAt: Date
    purchasedAt: Date
    observedAt: Date
    status: "active" | "cancelled"
    cancelAtPeriodEnd: boolean
  },
) {
  const provider =
    input.provider === "app_store"
      ? BillingProvider.APP_STORE
      : BillingProvider.PLAY_STORE
  // Free is never sold; refuse a mis-typed mapping instead of downgrading.
  if ((input.planId as string) === "free")
    throw new Error("Free is not a store subscription plan.")
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
  return db.$transaction(
    async (tx) => {
      const account = await tx.storeBillingAccount.findUnique({
        where: { tenantId: input.tenantId },
      })
      if (!account || account.id !== input.accountToken)
        throw new Error("This store purchase belongs to another workspace.")
      const existing = await tx.storeSubscriptionPurchase.findUnique({
        where: { provider_purchaseDigest: { provider, purchaseDigest } },
      })
      if (existing && existing.tenantId !== input.tenantId)
        throw new Error(
          "This store purchase is already assigned to another workspace.",
        )
      if (existing && existing.environment !== input.environment)
        throw new Error("Store purchase environment changed.")
      if (existing && existing.verifiedAt > input.observedAt)
        return { applied: false }
      const active = await tx.tenantSubscription.findUnique({
        where: { tenantId: input.tenantId },
        select: {
          provider: true,
          billingSubscriptionId: true,
          status: true,
          currentPeriodEndsAt: true,
        },
      })
      const linkedDigest =
        input.provider === "play_store" && input.linkedPurchaseId
          ? storePurchaseDigest(input.provider, input.linkedPurchaseId)
          : null
      const linked = linkedDigest
        ? await tx.storeSubscriptionPurchase.findUnique({
            where: {
              provider_purchaseDigest: {
                provider,
                purchaseDigest: linkedDigest,
              },
            },
            select: { tenantId: true, environment: true },
          })
        : null
      if (linked && linked.environment !== input.environment)
        throw new Error("Linked Play purchase environment does not match.")
      assertStorePurchaseTransition({
        provider,
        tenantId: input.tenantId,
        purchaseDigest,
        linkedDigest,
        linkedTenantId: linked?.tenantId ?? null,
        active,
        now: input.observedAt,
      })
      const voidedOrder = input.latestOrderId
        ? await tx.billingProviderEvent.findUnique({
            where: {
              provider_eventId: {
                provider: BillingProvider.PLAY_STORE,
                eventId: storeVoidedOrderEventId(input.latestOrderId),
              },
            },
            select: { tenantId: true, payload: true },
          })
        : null
      if (voidedOrder && voidedOrder.tenantId !== input.tenantId)
        throw new Error("Voided store order belongs to another workspace.")
      if (
        voidedOrder &&
        (!voidedOrder.payload ||
          typeof voidedOrder.payload !== "object" ||
          Array.isArray(voidedOrder.payload) ||
          voidedOrder.payload.purchaseDigest !== purchaseDigest)
      )
        throw new Error("Voided store order purchase binding changed.")
      const status = voidedOrder ? "cancelled" : input.status
      await tx.storeSubscriptionPurchase.upsert({
        where: { provider_purchaseDigest: { provider, purchaseDigest } },
        create: {
          provider,
          purchaseDigest,
          latestOrderDigest,
          tenantId: input.tenantId,
          productId: input.productId,
          environment: input.environment,
          expiresAt: input.expiresAt,
          verifiedAt: input.observedAt,
        },
        update: {
          productId: input.productId,
          latestOrderDigest,
          expiresAt: input.expiresAt,
          verifiedAt: input.observedAt,
        },
      })
      const eventId = createHash("sha256")
        .update(
          JSON.stringify([
            purchaseDigest,
            latestOrderDigest,
            input.productId,
            input.expiresAt.toISOString(),
            status,
            voidedOrder ? false : input.cancelAtPeriodEnd,
          ]),
        )
        .digest("hex")
      const result = await processRetailOpsBillingProviderEvent(tx, {
        provider: input.provider,
        eventId: `store:${eventId}`,
        type: "subscription_updated",
        tenantId: input.tenantId,
        subscription: {
          tenantId: input.tenantId,
          planId: input.planId,
          billingSubscriptionId: purchaseDigest,
          billingCustomerId: account.id,
          currentPeriodStartsAt: input.purchasedAt,
          currentPeriodEndsAt: input.expiresAt,
          status,
          cancelAtPeriodEnd: voidedOrder ? false : input.cancelAtPeriodEnd,
        },
      })
      if (result.providerEvent.status === "failed")
        throw new Error("Store subscription reconciliation failed.")
      if (input.provider === "play_store" && status === "active") {
        await tx.tenantSubscription.updateMany({
          where: {
            tenantId: input.tenantId,
            provider: BillingProvider.PLAY_STORE,
            billingSubscriptionId: purchaseDigest,
            status: "ACTIVE",
          },
          data: { cancelledAt: null, cancellationReason: null },
        })
      }
      return { applied: true }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
}
