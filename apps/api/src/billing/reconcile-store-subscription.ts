import type { PrismaClient } from "@ewatrade/db"
import {
  applyVerifiedStoreSubscription,
  recordPlayVoidedOrder,
} from "@ewatrade/db/queries"
import { verifyAppleSubscription } from "./apple-subscriptions"
import { verifyGoogleSubscription } from "./google-subscriptions"
import { projectStoreEntitlement } from "./store-entitlement"
import { resolveStorePlan } from "./store-products"

export async function reconcileStoreSubscription(
  db: PrismaClient,
  input: {
    store: "app_store" | "play_store"
    purchaseId: string
    tenantId?: string
    voidedOrderId?: string
  },
) {
  const observedAt = new Date()
  const purchase =
    input.store === "app_store"
      ? await verifyAppleSubscription(input.purchaseId)
      : await verifyGoogleSubscription(input.purchaseId)
  const binding = await db.storeBillingAccount.findUnique({
    where: { id: purchase.accountToken },
    select: { tenantId: true },
  })
  if (!binding || (input.tenantId && binding.tenantId !== input.tenantId))
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
