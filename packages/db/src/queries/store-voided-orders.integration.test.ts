import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import {
  applyVerifiedStoreSubscription,
  recordPlayVoidedOrder,
  storeOrderDigest,
  storePurchaseDigest,
} from "./store-subscriptions"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)
;(enabled ? describe : describe.skip)(
  "Play voided renewal on guarded Neon fixture",
  () => {
    test("blocks a voided current order through replay and restores a later paid renewal", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const id = randomUUID()
      const tenantId = randomUUID()
      const now = new Date()
      const purchaseId = `fixture-purchase-${id}`
      const currentOrder = `GPA.fixture-current-${id}`
      const nextOrder = `GPA.fixture-next-${id}`
      const purchasedAt = new Date(now.getTime() - 86_400_000)
      const expiresAt = new Date(now.getTime() + 30 * 86_400_000)
      let created = false
      try {
        await prisma.tenant.create({
          data: {
            id: tenantId,
            slug: `store-void-${id}`,
            name: "Store Voided Order QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "store-voided-orders.test",
            qaMarkedAt: now,
          },
        })
        created = true
        const account = await prisma.storeBillingAccount.create({
          data: { tenantId },
        })
        const verify = (
          latestOrderId: string,
          observedAt: Date,
          environment: "sandbox" | "production" = "sandbox",
        ) =>
          applyVerifiedStoreSubscription(prisma, {
            tenantId,
            accountToken: account.id,
            provider: "play_store",
            purchaseId,
            latestOrderId,
            productId: "fixture.pro.monthly",
            planId: "pro",
            environment,
            purchasedAt,
            expiresAt,
            observedAt,
            status: "active",
            cancelAtPeriodEnd: false,
          })
        const subscription = () =>
          prisma.tenantSubscription.findUniqueOrThrow({
            where: { tenantId },
            select: { status: true, cancellationReason: true },
          })
        const status = async () => (await subscription()).status

        await verify(currentOrder, new Date(now.getTime() + 1_000))
        expect(await status()).toBe("ACTIVE")
        await expect(
          verify(currentOrder, new Date(now.getTime() + 1_500), "production"),
        ).rejects.toThrow("environment changed")
        await expect(
          applyVerifiedStoreSubscription(prisma, {
            tenantId,
            accountToken: account.id,
            provider: "play_store",
            purchaseId: `fixture-replacement-${id}`,
            linkedPurchaseId: purchaseId,
            latestOrderId: `GPA.fixture-replacement-${id}`,
            productId: "fixture.pro.monthly",
            planId: "pro",
            environment: "production",
            purchasedAt,
            expiresAt,
            observedAt: new Date(now.getTime() + 1_600),
            status: "active",
            cancelAtPeriodEnd: false,
          }),
        ).rejects.toThrow("environment does not match")
        expect(await status()).toBe("ACTIVE")
        await recordPlayVoidedOrder(prisma, {
          tenantId,
          accountToken: account.id,
          purchaseId,
          orderId: currentOrder,
          latestOrderId: currentOrder,
          observedAt: new Date(now.getTime() + 2_000),
        })
        expect(await status()).toBe("CANCELLED")
        await verify(currentOrder, new Date(now.getTime() + 3_000))
        expect(await status()).toBe("CANCELLED")
        await verify(nextOrder, new Date(now.getTime() + 4_000))
        expect(await status()).toBe("ACTIVE")
        expect((await subscription()).cancellationReason).toBeNull()
        expect(
          await recordPlayVoidedOrder(prisma, {
            tenantId,
            accountToken: account.id,
            purchaseId,
            orderId: currentOrder,
            // This is a provider response fetched before the newer renewal.
            latestOrderId: currentOrder,
            observedAt: new Date(now.getTime() + 4_500),
          }),
        ).toEqual({ currentOrder: false })
        expect(await status()).toBe("ACTIVE")
        await recordPlayVoidedOrder(prisma, {
          tenantId,
          accountToken: account.id,
          purchaseId,
          orderId: currentOrder,
          latestOrderId: nextOrder,
          observedAt: new Date(now.getTime() + 5_000),
        })
        expect(await status()).toBe("ACTIVE")
        const purchase =
          await prisma.storeSubscriptionPurchase.findUniqueOrThrow({
            where: {
              provider_purchaseDigest: {
                provider: "PLAY_STORE",
                purchaseDigest: storePurchaseDigest("play_store", purchaseId),
              },
            },
            select: { latestOrderDigest: true },
          })
        expect(purchase.latestOrderDigest).toBe(storeOrderDigest(nextOrder))
      } finally {
        if (created) {
          await prisma.billingProviderEvent.deleteMany({ where: { tenantId } })
          await prisma.tenant.delete({ where: { id: tenantId } })
        }
      }
    })
  },
)
