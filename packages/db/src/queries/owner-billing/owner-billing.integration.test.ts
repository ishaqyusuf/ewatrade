import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import { getRetailOpsTenantPlan } from "../retail-ops-subscriptions"
import { storePurchaseDigest } from "../store-subscriptions"
import { enrollOwnerBusiness, removeOwnerBusiness } from "./commands"
import { OwnerBillingPolicyError } from "./policy"
import {
  createPrismaOwnerBillingRepository,
  getOrCreateOwnerBillingAccount,
  getOwnerBusinessAccess,
  getOwnerCoveredPlanIds,
} from "./prisma-repository"
import {
  applyVerifiedOwnerSubscription,
  recordOwnerPlayVoidedOrder,
} from "./purchases"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(180_000)

const policyCode = (error: unknown) =>
  error instanceof OwnerBillingPolicyError ? error.code : String(error)
;(enabled ? describe : describe.skip)(
  "Owner-wide billing durable adapter on guarded Neon fixture",
  () => {
    test("enforces unique coverage, serialized enrollment, history and receipt binding", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../../client")
      const id = randomUUID()
      const now = new Date()
      const at = (ms: number) => new Date(now.getTime() + ms)
      const ownerId = `owner-billing-${id}`
      const tenantIds = ["a", "b", "c"].map((key) => `${key}-${id}`)
      const legacyPurchaseId = `fixture-legacy-${id}`
      const purchaseId = `fixture-owner-${id}`
      const order = `GPA.fixture-owner-${id}`
      const nextOrder = `GPA.fixture-owner-next-${id}`
      let accountId: string | null = null
      try {
        await prisma.user.create({
          data: { id: ownerId, email: `${ownerId}@owner-billing.test` },
        })
        for (const tenantId of tenantIds) {
          await prisma.tenant.create({
            data: {
              id: tenantId,
              slug: `owner-billing-${tenantId}`,
              name: "Owner Billing QA",
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              dataClassification: "QA",
              qaSourceDomain: "owner-billing.test",
              qaMarkedAt: now,
              // An explicit Free grant: owner coverage may raise, never lower.
              metadata: {
                retailOps: {
                  subscription: { planId: "free", status: "active" },
                },
              },
              users: { create: { userId: ownerId, role: "OWNER" } },
            },
          })
        }
        const [tenantA, tenantB, tenantC] = tenantIds as [
          string,
          string,
          string,
        ]
        accountId = (await getOrCreateOwnerBillingAccount(prisma, ownerId)).id
        expect((await getOrCreateOwnerBillingAccount(prisma, ownerId)).id).toBe(
          accountId,
        )
        const repository = createPrismaOwnerBillingRepository(prisma)
        const context = { environment: "sandbox" as const, now: () => at(0) }
        const enroll = (tenantId: string) =>
          enrollOwnerBusiness(
            repository,
            { accountId: accountId ?? "", actorUserId: ownerId, tenantId },
            context,
          )

        expect(await enroll(tenantA).catch(policyCode)).toBe(
          "SUBSCRIPTION_REQUIRED",
        )

        const verify = (
          overrides: Partial<
            Parameters<typeof applyVerifiedOwnerSubscription>[1]
          > = {},
        ) =>
          applyVerifiedOwnerSubscription(prisma, {
            accountToken: accountId ?? "",
            actorUserId: ownerId,
            expectedEnvironment: "sandbox",
            provider: "play_store",
            purchaseId,
            latestOrderId: order,
            productId: "fixture.starter.monthly",
            planId: "starter",
            environment: "sandbox",
            expiresAt: at(30 * 86_400_000),
            observedAt: at(1_000),
            status: "active",
            cancelAtPeriodEnd: false,
            ...overrides,
          })

        // A legacy Tenant receipt is never accepted as an owner receipt.
        await prisma.storeSubscriptionPurchase.create({
          data: {
            tenantId: tenantA,
            provider: "PLAY_STORE",
            purchaseDigest: storePurchaseDigest("play_store", legacyPurchaseId),
            productId: "fixture.starter.monthly",
            environment: "sandbox",
            expiresAt: at(30 * 86_400_000),
          },
        })
        expect(
          await verify({ purchaseId: legacyPurchaseId }).catch(policyCode),
        ).toBe("PURCHASE_BINDING_MISMATCH")
        // Another user cannot purchase or restore onto this account.
        expect(
          await verify({ actorUserId: `someone-${id}` }).catch(policyCode),
        ).toBe("OWNER_REQUIRED")

        expect((await verify()).applied).toBe(true)
        // An older provider read never overwrites the newer one.
        expect((await verify({ observedAt: at(500) })).applied).toBe(false)

        expect((await enroll(tenantA)).action).toBe("enroll")
        expect((await enroll(tenantA)).action).toBe("unchanged")

        // Starter covers one business. Concurrent enrollments serialize on the
        // account lock and exactly one more slot is never granted.
        await removeOwnerBusiness(repository, {
          accountId,
          actorUserId: ownerId,
          tenantId: tenantA,
        })
        const raced = await Promise.all(
          [tenantB, tenantC].map((tenantId) =>
            enroll(tenantId).then(
              (result) => result.action,
              (error) => policyCode(error),
            ),
          ),
        )
        expect(raced.toSorted()).toEqual(["BUSINESS_LIMIT_REACHED", "enroll"])
        const winner = raced[0] === "enroll" ? tenantB : tenantC
        expect(
          (
            await getOwnerBusinessAccess(prisma, {
              tenantId: winner,
              environment: "sandbox",
            })
          )?.reason,
        ).toBe("covered")
        const previousRuntime = {
          enabled: process.env.OWNER_BILLING_ENABLED,
          environment: process.env.STORE_BILLING_ENVIRONMENT,
        }
        const tenantPlan = async (tenantId: string) => {
          process.env.OWNER_BILLING_ENABLED = "true"
          process.env.STORE_BILLING_ENVIRONMENT = "sandbox"
          try {
            return await getRetailOpsTenantPlan(prisma, { tenantId })
          } finally {
            for (const [key, value] of [
              ["OWNER_BILLING_ENABLED", previousRuntime.enabled],
              ["STORE_BILLING_ENVIRONMENT", previousRuntime.environment],
            ] as const) {
              if (value === undefined) Reflect.deleteProperty(process.env, key)
              else process.env[key] = value
            }
          }
        }
        const covered = await tenantPlan(winner)
        expect(covered.plan.id).toBe("starter")
        expect(covered.subscription.source).toBe("owner_subscription")
        expect(covered.plan.limits.staff).toBe(2)
        expect(covered.plan.limits.ordersPerMonth).toBeNull()
        expect((await tenantPlan(tenantA)).plan.id).toBe("free")
        // The batched reader behind the synchronous plan projections agrees.
        expect(
          await getOwnerCoveredPlanIds(prisma, {
            tenantIds: [winner, tenantA],
            environment: "sandbox",
          }),
        ).toEqual(new Map([[winner, "starter"]]))
        // Without the switch the Tenant-bound authority is unchanged.
        expect(
          (await getRetailOpsTenantPlan(prisma, { tenantId: winner })).plan.id,
        ).toBe("free")

        // Release keeps history; the database refuses a second active row.
        expect(
          await prisma.ownerBusinessCoverage.count({
            where: { tenantId: tenantA },
          }),
        ).toBe(1)
        expect(
          await prisma.ownerBusinessCoverage
            .create({
              data: {
                accountId,
                tenantId: winner,
                activeTenantId: winner,
                enrolledAt: at(0),
                enrolledByUserId: ownerId,
              },
            })
            .then(
              () => "created",
              (error: { code?: string }) => error.code,
            ),
        ).toBe("P2002")

        // An old void does not cancel a newer renewal; the current void does.
        await verify({ latestOrderId: nextOrder, observedAt: at(2_000) })
        expect(
          await recordOwnerPlayVoidedOrder(prisma, {
            accountToken: accountId,
            purchaseId,
            orderId: order,
            latestOrderId: order,
            observedAt: at(2_500),
          }),
        ).toEqual({ currentOrder: false })
        await recordOwnerPlayVoidedOrder(prisma, {
          accountToken: accountId,
          purchaseId,
          orderId: nextOrder,
          latestOrderId: nextOrder,
          observedAt: at(3_000),
        })
        expect(
          (
            await getOwnerBusinessAccess(prisma, {
              tenantId: winner,
              environment: "sandbox",
            })
          )?.reason,
        ).toBe("inactive_subscription")
        expect((await tenantPlan(winner)).plan.id).toBe("free")
        // Replaying the voided order keeps it cancelled.
        await verify({ latestOrderId: nextOrder, observedAt: at(4_000) })
        expect(
          (
            await prisma.ownerBillingSubscription.findUniqueOrThrow({
              where: { accountId },
              select: { status: true, cancellationReason: true },
            })
          ).cancellationReason,
        ).toBe("play_voided_order")
      } finally {
        if (accountId) {
          await prisma.billingProviderEvent.deleteMany({
            where: { payload: { path: ["accountId"], equals: accountId } },
          })
          await prisma.ownerBusinessCoverage.deleteMany({
            where: { accountId },
          })
          await prisma.ownerBillingSubscription.deleteMany({
            where: { accountId },
          })
          await prisma.ownerBillingPurchase.deleteMany({ where: { accountId } })
          await prisma.ownerBillingAccount.delete({ where: { id: accountId } })
        }
        await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } })
        await prisma.user.deleteMany({ where: { id: ownerId } })
      }
    })
  },
)
