import type { PrismaClient } from "@ewatrade/db"
import {
  applyVerifiedOwnerSubscription,
  isAppStoreReviewOwner,
  ownerBillingRuntime,
  recordOwnerPlayVoidedOrder,
} from "@ewatrade/db/owner-billing"
import {
  applyVerifiedStoreSubscription,
  recordPlayVoidedOrder,
} from "@ewatrade/db/queries"
import { verifyAppleSubscription } from "./apple-subscriptions"
import { verifyGoogleSubscription } from "./google-subscriptions"
import {
  type VerifiedStoreEntitlement,
  projectStoreEntitlement,
} from "./store-entitlement"
import { resolveStorePlan } from "./store-products"

export async function reconcileStoreSubscription(
  db: PrismaClient,
  input: {
    store: "app_store" | "play_store"
    purchaseId: string
    tenantId?: string
    /** The authenticated purchaser; notifications have none. */
    actorUserId?: string
    voidedOrderId?: string
    /** Server-only context from an already verified Apple notification. */
    appleNotification?: {
      environment: "production" | "sandbox"
      accountToken: string
    }
  },
) {
  const observedAt = new Date()
  const notifiedOwner =
    input.store === "app_store" &&
    input.appleNotification?.environment === "sandbox"
      ? await db.ownerBillingAccount.findUnique({
          where: { id: input.appleNotification.accountToken },
          select: { ownerUserId: true },
        })
      : null
  const purchase =
    input.store === "app_store"
      ? await verifyAppleSubscription(
          input.purchaseId,
          isAppStoreReviewOwner(input.actorUserId) ||
            isAppStoreReviewOwner(notifiedOwner?.ownerUserId),
        )
      : await verifyGoogleSubscription(input.purchaseId)
  if (
    input.appleNotification &&
    (input.store !== "app_store" ||
      purchase.environment !== input.appleNotification.environment ||
      purchase.accountToken !== input.appleNotification.accountToken)
  )
    throw new Error(
      "Apple notification binding does not match the verified purchase.",
    )
  const binding = await db.storeBillingAccount.findUnique({
    where: { id: purchase.accountToken },
    select: { tenantId: true },
  })
  if (!binding)
    return reconcileOwnerStoreSubscription(db, input, purchase, observedAt)
  // Legacy business receipts have no reviewer exception. Never grant sandbox
  // coverage to an ordinary Production Tenant through this older path.
  if (purchase.environment !== process.env.STORE_BILLING_ENVIRONMENT)
    throw new Error("Purchase environment does not match.")
  if (input.tenantId && binding.tenantId !== input.tenantId)
    throw new Error("Purchase workspace binding does not match.")
  const planId = resolveStorePlan(purchase.provider, purchase.productId)
  if (input.voidedOrderId) {
    if (input.store !== "play_store" || !purchase.latestOrderId)
      throw new Error("Voided Play order cannot be matched to a paid order.")
    await recordPlayVoidedOrder(db, {
      tenantId: binding.tenantId,
      accountToken: purchase.accountToken,
      purchaseId: input.purchaseId,
      orderId: input.voidedOrderId,
      latestOrderId: purchase.latestOrderId,
      observedAt,
    })
  }
  const result = await applyVerifiedStoreSubscription(db, {
    ...purchase,
    ...projectStoreEntitlement(purchase),
    observedAt,
    planId,
    tenantId: binding.tenantId,
  })
  return { ...result, expiresAt: purchase.expiresAt }
}

/**
 * The receipt's opaque account token names an owner-wide account, never a
 * Tenant, so switching business cannot reinterpret an in-flight receipt.
 * A purchase or restore must come from that account's own owner.
 */
async function reconcileOwnerStoreSubscription(
  db: PrismaClient,
  input: Parameters<typeof reconcileStoreSubscription>[1],
  purchase: VerifiedStoreEntitlement,
  observedAt: Date,
) {
  const runtime = ownerBillingRuntime()
  const account = runtime
    ? await db.ownerBillingAccount.findUnique({
        where: { id: purchase.accountToken },
        select: { id: true },
      })
    : null
  if (!runtime || !account || (input.tenantId && !input.actorUserId))
    throw new Error("Purchase workspace binding does not match.")
  const planId = resolveStorePlan(purchase.provider, purchase.productId)
  if (input.voidedOrderId) {
    if (input.store !== "play_store" || !purchase.latestOrderId)
      throw new Error("Voided Play order cannot be matched to a paid order.")
    await recordOwnerPlayVoidedOrder(db, {
      accountToken: account.id,
      purchaseId: input.purchaseId,
      orderId: input.voidedOrderId,
      latestOrderId: purchase.latestOrderId,
      observedAt,
    })
  }
  const entitlement = projectStoreEntitlement(purchase)
  const result = await applyVerifiedOwnerSubscription(db, {
    accountToken: account.id,
    actorUserId: input.actorUserId,
    expectedEnvironment: runtime.environment,
    provider: purchase.provider,
    purchaseId: purchase.purchaseId,
    linkedPurchaseId: purchase.linkedPurchaseId,
    latestOrderId: purchase.latestOrderId,
    productId: purchase.productId,
    planId,
    environment: purchase.environment,
    expiresAt: purchase.expiresAt,
    observedAt,
    status: entitlement.status,
    cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
  })
  return { applied: result.applied, expiresAt: purchase.expiresAt }
}
