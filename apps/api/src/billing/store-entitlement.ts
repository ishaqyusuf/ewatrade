export type VerifiedStoreEntitlement = {
  provider: "app_store" | "play_store"
  purchaseId: string
  linkedPurchaseId?: string
  latestOrderId?: string
  productId: string
  accountToken: string
  expiresAt: Date
  purchasedAt: Date
  revoked: boolean
  autoRenew: boolean
  environment: "production" | "sandbox"
}

export function projectStoreEntitlement(
  entitlement: VerifiedStoreEntitlement,
  now = new Date(),
) {
  if (
    !Number.isFinite(entitlement.expiresAt.getTime()) ||
    !Number.isFinite(entitlement.purchasedAt.getTime())
  )
    throw new Error("Invalid store subscription dates.")
  const active = !entitlement.revoked && entitlement.expiresAt > now
  return {
    status: active ? ("active" as const) : ("cancelled" as const),
    cancelAtPeriodEnd: active && !entitlement.autoRenew,
  }
}
