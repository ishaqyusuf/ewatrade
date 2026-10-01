import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { readPlayReviewerTarget } from "./play-reviewer-entitlement"
import { processRetailOpsBillingProviderEvent } from "./retail-ops-subscriptions"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function reviewGrantEvent(input: {
  eventId: string
  now: Date
  subscriptionId: string
  tenantId: string
}) {
  return {
    eventId: input.eventId,
    metadata: { purpose: "play_review", action: "grant" },
    provider: "manual" as const,
    subscription: {
      billingSubscriptionId: input.subscriptionId,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      currentPeriodEndsAt: new Date(input.now.getTime() + 30 * 86_400_000),
      currentPeriodStartsAt: input.now,
      planId: "pro" as const,
      status: "active" as const,
      tenantId: input.tenantId,
    },
    tenantId: input.tenantId,
    type: "subscription_activated" as const,
  }
}
;(enabled ? describe : describe.skip)(
  "Play review entitlement on a guarded Neon fixture",
  () => {
    test("rejects an intervening purchase and cannot overwrite a concurrent store subscription", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const [{ PrismaPg }, { PrismaClient }] = await Promise.all([
        import("@prisma/adapter-pg"),
        import("../../generated/prisma/client"),
      ])
      const databaseUrl = process.env.EWATRADE_DATABASE_URL
      if (!databaseUrl) throw new Error("The guarded database URL is missing.")
      const writer = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }),
        transactionOptions: { maxWait: 10_000, timeout: 30_000 },
      })
      const id = randomUUID()
      const tenantId = randomUUID()
      const userId = randomUUID()
      const ownerEmail = `review-${id}@example.test`
      const slug = `ewatrade-review-${id}`
      const now = new Date()
      let userCreated = false
      let tenantCreated = false
      let planId: string | null = null

      try {
        await prisma.user.create({
          data: {
            id: userId,
            email: ownerEmail,
            emailVerified: true,
            name: "Review QA Owner",
          },
        })
        userCreated = true
        await prisma.tenant.create({
          data: {
            id: tenantId,
            slug,
            name: "EwaTrade Review Demo",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "play-reviewer-entitlement.test",
            qaMarkedAt: now,
          },
        })
        tenantCreated = true
        const membership = await prisma.membership.create({
          data: { tenantId, userId, role: "OWNER", status: "ACTIVE" },
        })
        const plan = await prisma.subscriptionPlan.create({
          data: {
            key: `qa-review-${id}`,
            name: "Review QA Plan",
            limits: {},
          },
        })
        planId = plan.id

        const input = {
          action: "grant" as const,
          expectedOwnerEmail: ownerEmail,
          tenantId,
        }
        expect(
          (await readPlayReviewerTarget(prisma, input)).target.tenantId,
        ).toBe(tenantId)

        await prisma.membership.update({
          where: { id: membership.id },
          data: { status: "SUSPENDED" },
        })
        await expect(
          prisma.$transaction((tx) => readPlayReviewerTarget(tx, input), {
            isolationLevel: "Serializable",
            maxWait: 10_000,
            timeout: 30_000,
          }),
        ).rejects.toThrow("verified active demo owner")
        await prisma.membership.update({
          where: { id: membership.id },
          data: { status: "ACTIVE" },
        })

        await expect(
          prisma.$transaction(
            async (tx) => {
              const { target } = await readPlayReviewerTarget(tx, input)
              const result = await processRetailOpsBillingProviderEvent(
                tx,
                reviewGrantEvent({
                  eventId: `play-review-control:${id}`,
                  now,
                  subscriptionId: target.subscriptionId,
                  tenantId,
                }),
              )
              expect(result.providerEvent.status).toBe("processed")
              throw new Error("ROLLBACK_ONLY_CONTROL")
            },
            {
              isolationLevel: "Serializable",
              maxWait: 10_000,
              timeout: 30_000,
            },
          ),
        ).rejects.toThrow("ROLLBACK_ONLY_CONTROL")
        expect(
          await prisma.billingProviderEvent.count({ where: { tenantId } }),
        ).toBe(0)

        const ready = deferred()
        const resume = deferred()
        const contender = prisma
          .$transaction(
            async (tx) => {
              await readPlayReviewerTarget(tx, input)
              ready.resolve()
              await resume.promise
              const { target } = await readPlayReviewerTarget(tx, input)
              const result = await processRetailOpsBillingProviderEvent(
                tx,
                reviewGrantEvent({
                  eventId: `play-review-race:${id}`,
                  now,
                  subscriptionId: target.subscriptionId,
                  tenantId,
                }),
              )
              if (result.providerEvent.status !== "processed") {
                throw new Error("The review grant was not processed.")
              }
              // Never commit a test grant, including if the race guard regresses.
              throw new Error("ROLLBACK_ONLY_UNEXPECTED_GRANT")
            },
            {
              isolationLevel: "Serializable",
              maxWait: 10_000,
              timeout: 30_000,
            },
          )
          .then(
            () => new Error("ROLLBACK_ONLY_UNEXPECTED_COMMIT"),
            (error: unknown) => error,
          )

        await ready.promise
        try {
          await writer.$transaction(
            async (tx) => {
              await tx.storeSubscriptionPurchase.create({
                data: {
                  tenantId,
                  provider: "PLAY_STORE",
                  purchaseDigest: `qa-review-${id}`,
                  productId: "qa.review.fixture",
                  environment: "sandbox",
                  expiresAt: new Date(now.getTime() + 30 * 86_400_000),
                },
              })
              await tx.tenantSubscription.create({
                data: {
                  tenantId,
                  planId: plan.id,
                  provider: "PLAY_STORE",
                  billingSubscriptionId: `qa-review-${id}`,
                  status: "ACTIVE",
                  limitsSnapshot: {},
                },
              })
            },
            {
              isolationLevel: "Serializable",
              maxWait: 10_000,
              timeout: 30_000,
            },
          )
        } finally {
          resume.resolve()
        }

        const conflict = await contender
        expect(conflict).toBeInstanceOf(Error)
        const code =
          conflict instanceof Error && "code" in conflict ? conflict.code : null
        const guarded =
          conflict instanceof Error &&
          (conflict.message.includes("store purchase") ||
            conflict.message.includes("current transaction is aborted"))
        if (code !== "P2034" && !guarded) {
          const message =
            conflict instanceof Error
              ? conflict.message.slice(0, 180)
              : String(conflict)
          throw new Error(
            `Unexpected race result: code=${String(code)} ${message}`,
          )
        }
        expect(
          await prisma.tenantSubscription.findUniqueOrThrow({
            where: { tenantId },
            select: { provider: true },
          }),
        ).toEqual({ provider: "PLAY_STORE" })
        expect(
          await prisma.billingProviderEvent.count({ where: { tenantId } }),
        ).toBe(0)
      } finally {
        if (tenantCreated) {
          await prisma.billingProviderEvent.deleteMany({ where: { tenantId } })
          await prisma.tenant.delete({ where: { id: tenantId } })
        }
        if (userCreated) await prisma.user.delete({ where: { id: userId } })
        if (planId)
          await prisma.subscriptionPlan.delete({ where: { id: planId } })
        await writer.$disconnect()
        await prisma.$disconnect()
      }
    })
  },
)
