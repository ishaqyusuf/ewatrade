import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import { enrollOwnerBusiness } from "./commands"
import { projectOwnerBusinessAccess } from "./policy"
import {
  createPrismaOwnerBillingRepository,
  getOrCreateOwnerBillingAccount,
  readOwnerCoverageSnapshot,
} from "./prisma-repository"
import { applyVerifiedOwnerSubscription } from "./purchases"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(180_000)
;(enabled ? describe : describe.skip)(
  "App Review sandbox on guarded Development fixture",
  () => {
    test("persists Sandbox facts only for approved Apple owner and rechecks coverage under the account lock", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../../client")
      const id = randomUUID()
      const ownerId = `review-${id}`
      const ordinaryOwnerId = `ordinary-${id}`
      const tenantId = `review-business-${id}`
      const now = new Date()
      let accountId: string | undefined
      let ordinaryAccountId: string | undefined
      const reviewConfig = {
        APP_ENV: "production",
        DEV_PROFILE: "prod",
        STORE_BILLING_ENVIRONMENT: "production",
        OWNER_BILLING_ENABLED: "true",
        STORE_BILLING_ENABLED: "true",
        APP_STORE_REVIEW_SANDBOX_ENABLED: "true",
        APP_STORE_REVIEW_OWNER_IDS: JSON.stringify([ownerId]),
      }
      try {
        await prisma.user.createMany({
          data: [
            { id: ownerId, email: `${ownerId}@owner-billing.test` },
            {
              id: ordinaryOwnerId,
              email: `${ordinaryOwnerId}@owner-billing.test`,
            },
          ],
        })
        await prisma.tenant.create({
          data: {
            id: tenantId,
            slug: tenantId,
            name: "App Review Billing QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "owner-billing.test",
            qaMarkedAt: now,
            users: { create: { userId: ownerId, role: "OWNER" } },
          },
        })
        accountId = (await getOrCreateOwnerBillingAccount(prisma, ownerId)).id
        ordinaryAccountId = (
          await getOrCreateOwnerBillingAccount(prisma, ordinaryOwnerId)
        ).id
        const verify = (
          overrides: Partial<
            Parameters<typeof applyVerifiedOwnerSubscription>[1]
          > = {},
          config = reviewConfig,
        ) =>
          applyVerifiedOwnerSubscription(
            prisma,
            {
              accountToken: accountId ?? "",
              actorUserId: ownerId,
              expectedEnvironment: "production",
              provider: "app_store",
              purchaseId: `apple-review-${id}`,
              productId: "com.ewatrade.owner.starter.monthly",
              planId: "starter",
              environment: "sandbox",
              expiresAt: new Date(now.getTime() + 86_400_000),
              observedAt: now,
              status: "active",
              cancelAtPeriodEnd: false,
              ...overrides,
            },
            config,
          )
        await expect(
          verify({
            accountToken: ordinaryAccountId,
            actorUserId: ordinaryOwnerId,
          }),
        ).rejects.toThrow("PURCHASE_BINDING_MISMATCH")
        await expect(
          verify(
            {},
            { ...reviewConfig, APP_STORE_REVIEW_SANDBOX_ENABLED: "false" },
          ),
        ).rejects.toThrow("PURCHASE_BINDING_MISMATCH")
        await expect(verify({ actorUserId: ordinaryOwnerId })).rejects.toThrow(
          "OWNER_REQUIRED",
        )
        await expect(
          verify({ provider: "play_store", latestOrderId: `GPA.review-${id}` }),
        ).rejects.toThrow("PURCHASE_BINDING_MISMATCH")
        expect((await verify()).applied).toBe(true)
        expect((await verify()).applied).toBe(true)
        const persisted =
          await prisma.ownerBillingSubscription.findUniqueOrThrow({
            where: { accountId },
          })
        expect(persisted.environment).toBe("sandbox")
        expect(persisted.provider).toBe("APP_STORE")
        expect(
          await prisma.ownerBillingPurchase.count({ where: { accountId } }),
        ).toBe(1)
        const repository = createPrismaOwnerBillingRepository(prisma)
        const command = { accountId, actorUserId: ownerId, tenantId }
        const context = {
          environment: "production" as const,
          now: () => now,
          reviewConfig,
        }
        await expect(
          enrollOwnerBusiness(repository, command, {
            ...context,
            reviewConfig: {},
          }),
        ).rejects.toThrow("SUBSCRIPTION_REQUIRED")
        expect(
          (await enrollOwnerBusiness(repository, command, context)).access
            .planId,
        ).toBe("starter")
        const snapshot = await readOwnerCoverageSnapshot(
          prisma,
          { accountId, tenantIds: [tenantId], environment: "production", now },
          reviewConfig,
        )
        expect(snapshot?.environment).toBe("sandbox")
        expect(
          snapshot && projectOwnerBusinessAccess(snapshot, tenantId).planId,
        ).toBe("starter")
        const closed = await readOwnerCoverageSnapshot(
          prisma,
          { accountId, tenantIds: [tenantId], environment: "production", now },
          {},
        )
        expect(
          closed && projectOwnerBusinessAccess(closed, tenantId).planId,
        ).toBe("free")
        expect(
          (
            await enrollOwnerBusiness(repository, command, {
              ...context,
              reviewConfig: {},
            })
          ).access.planId,
        ).toBe("free")
        // Owner loss still defeats the exception, including existing coverage.
        await prisma.membership.updateMany({
          where: { tenantId, userId: ownerId },
          data: { role: "ADMIN" },
        })
        const lost = await readOwnerCoverageSnapshot(
          prisma,
          { accountId, tenantIds: [tenantId], environment: "production", now },
          reviewConfig,
        )
        expect(lost && projectOwnerBusinessAccess(lost, tenantId).planId).toBe(
          "free",
        )
        await expect(
          enrollOwnerBusiness(repository, command, context),
        ).rejects.toThrow("BUSINESS_OWNER_REQUIRED")
        expect(
          await prisma.ownerBusinessCoverage.count({
            where: { accountId, activeTenantId: tenantId },
          }),
        ).toBe(1)
      } finally {
        for (const account of [accountId, ordinaryAccountId].filter(
          (value): value is string => Boolean(value),
        )) {
          await prisma.billingProviderEvent.deleteMany({
            where: { payload: { path: ["accountId"], equals: account } },
          })
          await prisma.ownerBusinessCoverage.deleteMany({
            where: { accountId: account },
          })
          await prisma.ownerBillingSubscription.deleteMany({
            where: { accountId: account },
          })
          await prisma.ownerBillingPurchase.deleteMany({
            where: { accountId: account },
          })
          await prisma.ownerBillingAccount.deleteMany({
            where: { id: account },
          })
        }
        await prisma.tenant.deleteMany({ where: { id: tenantId } })
        await prisma.user.deleteMany({
          where: { id: { in: [ownerId, ordinaryOwnerId] } },
        })
        expect(
          await prisma.user.count({
            where: { id: { in: [ownerId, ordinaryOwnerId] } },
          }),
        ).toBe(0)
        expect(await prisma.tenant.count({ where: { id: tenantId } })).toBe(0)
      }
    })
  },
)
