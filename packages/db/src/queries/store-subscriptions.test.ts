import { describe, expect, test } from "bun:test"
import { BillingProvider } from "../../generated/prisma/enums"
import {
  applyVerifiedStoreSubscription,
  assertStorePurchaseTransition,
  getCurrentStoreBillingState,
  storePurchaseDigest,
} from "./store-subscriptions"

const now = new Date("2026-09-24T16:00:00.000Z")
const active = {
  provider: BillingProvider.PLAY_STORE,
  billingSubscriptionId: "old-digest",
  status: "ACTIVE",
  currentPeriodEndsAt: new Date("2026-10-24T16:00:00.000Z"),
}
const proposed = {
  provider: BillingProvider.PLAY_STORE,
  tenantId: "business-one",
  purchaseDigest: "new-digest",
  linkedDigest: "old-digest",
  linkedTenantId: "business-one",
  active,
  now,
}

describe("verified Play subscription replacement", () => {
  test("allows a new Play purchase linked to this business's active purchase", () => {
    expect(() => assertStorePurchaseTransition(proposed)).not.toThrow()
  })
  test("rejects a linked token verified for another business", () => {
    expect(() =>
      assertStorePurchaseTransition({
        ...proposed,
        linkedTenantId: "business-two",
      }),
    ).toThrow("another workspace")
  })
  test("rejects an unknown linked purchase", () => {
    expect(() =>
      assertStorePurchaseTransition({ ...proposed, linkedTenantId: null }),
    ).toThrow("not verified")
  })
  test("rejects a new purchase without a link to the active one", () => {
    expect(() =>
      assertStorePurchaseTransition({
        ...proposed,
        linkedDigest: null,
        linkedTenantId: null,
      }),
    ).toThrow("another active subscription")
  })
  test("rejects a link to an older unrelated purchase", () => {
    expect(() =>
      assertStorePurchaseTransition({
        ...proposed,
        linkedDigest: "stale-digest",
      }),
    ).toThrow("another active subscription")
  })
  test("a repeat verification of the same purchase is idempotently admissible", () => {
    expect(() =>
      assertStorePurchaseTransition({
        ...proposed,
        purchaseDigest: "old-digest",
        linkedDigest: null,
        linkedTenantId: null,
      }),
    ).not.toThrow()
  })
})

describe("store purchase environment custody", () => {
  const purchase = {
    tenantId: "business-one",
    accountToken: "billing-account-one",
    provider: "play_store" as const,
    purchaseId: "purchase-one",
    latestOrderId: "order-one",
    productId: "ewatrade.pro.monthly",
    planId: "pro" as const,
    environment: "production" as const,
    purchasedAt: now,
    expiresAt: new Date("2026-10-24T16:00:00.000Z"),
    observedAt: now,
    status: "active" as const,
    cancelAtPeriodEnd: false,
  }

  test("rejects re-verification when the saved purchase has another environment", async () => {
    let writes = 0
    const db = {
      $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
        work({
          storeBillingAccount: {
            findUnique: async () => ({ id: purchase.accountToken }),
          },
          storeSubscriptionPurchase: {
            findUnique: async () => ({
              tenantId: purchase.tenantId,
              environment: "sandbox",
              verifiedAt: new Date("2026-09-23T16:00:00.000Z"),
            }),
            upsert: async () => {
              writes++
            },
          },
        }),
    }
    await expect(
      applyVerifiedStoreSubscription(db as never, purchase),
    ).rejects.toThrow("environment changed")
    expect(writes).toBe(0)
  })

  test("rejects a Play replacement linked to a purchase from another environment", async () => {
    let writes = 0
    let reads = 0
    const db = {
      $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
        work({
          storeBillingAccount: {
            findUnique: async () => ({ id: purchase.accountToken }),
          },
          storeSubscriptionPurchase: {
            findUnique: async () => {
              reads++
              return reads === 1
                ? null
                : { tenantId: purchase.tenantId, environment: "sandbox" }
            },
            upsert: async () => {
              writes++
            },
          },
          tenantSubscription: {
            findUnique: async () => ({
              ...active,
              billingSubscriptionId: storePurchaseDigest(
                "play_store",
                "previous-purchase",
              ),
            }),
          },
        }),
    }
    await expect(
      applyVerifiedStoreSubscription(db as never, {
        ...purchase,
        linkedPurchaseId: "previous-purchase",
      }),
    ).rejects.toThrow("environment does not match")
    expect(writes).toBe(0)
    expect(reads).toBe(2)
  })
})

describe("current store billing catalog state", () => {
  test("does not advertise an active store provider without a paid period end", async () => {
    for (const provider of [
      BillingProvider.APP_STORE,
      BillingProvider.PLAY_STORE,
    ]) {
      let purchaseReads = 0
      const db = {
        tenantSubscription: {
          findUnique: async () => ({
            provider,
            billingSubscriptionId: "purchase-digest",
            status: "ACTIVE",
            currentPeriodEndsAt: null,
          }),
        },
        storeSubscriptionPurchase: {
          findUnique: async () => {
            purchaseReads++
            return { productId: "pro", tenantId: "business-one" }
          },
        },
      }
      expect(
        await getCurrentStoreBillingState(db as never, "business-one", now),
      ).toEqual({ activeProvider: null, activePlayProductId: null })
      expect(purchaseReads).toBe(0)
    }
  })

  test("still exposes the current verified Play product during paid access", async () => {
    const db = {
      tenantSubscription: {
        findUnique: async () => active,
      },
      storeSubscriptionPurchase: {
        findUnique: async () => ({
          productId: "ewatrade.pro.monthly",
          tenantId: "business-one",
        }),
      },
    }
    expect(
      await getCurrentStoreBillingState(db as never, "business-one", now),
    ).toEqual({
      activeProvider: BillingProvider.PLAY_STORE,
      activePlayProductId: "ewatrade.pro.monthly",
    })
  })
})
