import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { emptyCatalogAiPolicy } from "@ewatrade/utils/catalog-ai-images"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { reserveAssistantWhatsAppTransportInTransaction } from "../assistant-whatsapp/usage"
import {
  assertCatalogAiAllowanceInTransaction,
  assertCatalogAiSpendInTransaction,
  catalogAiUsage,
  claimCatalogAiImage,
  readCatalogAiImages,
  settleCatalogAiImage,
  startCatalogAiImage,
} from "./jobs"
import { loadCatalogAiPolicy, lockCatalogAiPolicy } from "./policy"

setDefaultTimeout(120_000)
describeWithServiceCommerceDatabase(
  "Catalog AI quota and WhatsApp monthly invariants",
  () => {
    test("real transactions admit only one final image reservation and retain lifetime delivery history", async () => {
      const { prisma: db } = await import("../../client")
      const tenant = await db.tenant.findFirst({
        where: {
          id: "cmuv4c0450001z49kd8k5o0s1",
          dataClassification: "QA",
          isActive: true,
        },
        select: {
          id: true,
          users: {
            where: { role: "OWNER", status: "ACTIVE" },
            take: 1,
            select: { userId: true },
          },
          stores: {
            where: { status: "ACTIVE" },
            take: 1,
            select: { id: true },
          },
        },
      })
      const actorUserId = tenant?.users[0]?.userId
      const storeId = tenant?.stores[0]?.id
      if (!tenant || !actorUserId || !storeId)
        throw new Error(
          "The existing local Jawdah QA profile is required; no fixture business is created.",
        )
      const scope = { tenantId: tenant.id, storeId, actorUserId }
      const contextKey = `quota-check-${randomUUID()}`
      const policy = emptyCatalogAiPolicy()
      const lifetime = await catalogAiUsage(db, tenant.id, policy)
      policy.generation.allowance.period = "monthly"
      const monthly = await catalogAiUsage(db, tenant.id, policy)
      policy.generation.allowance.period = "lifetime"
      const limit = lifetime.used + lifetime.reserved + 1
      policy.generation.allowance.images = limit
      try {
        const attempt = () =>
          db.$transaction(
            async (tx) => {
              await assertCatalogAiAllowanceInTransaction(tx, tenant.id, policy)
              return tx.catalogAiImageJob.create({
                data: {
                  ...scope,
                  clientOperationId: randomUUID(),
                  contextKey,
                  payloadHash: "local-integration",
                  mode: "generate",
                  facts: { kind: "PRODUCT", name: "Quota metadata check" },
                  note: "",
                  policySnapshot: policy,
                  policyRevision: 0,
                  model: policy.generation.model,
                  reservedCostMicros: 1,
                  state: "UNCERTAIN",
                },
              })
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        const results = await Promise.allSettled([attempt(), attempt()])
        expect(
          results.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1)
        expect(
          results.filter((result) => result.status === "rejected"),
        ).toHaveLength(1)
        expect(await catalogAiUsage(db, tenant.id, policy)).toMatchObject({
          used: lifetime.used,
          reserved: lifetime.reserved + 1,
          remaining: 0,
        })
        await db.catalogAiImageJob.updateMany({
          where: { tenantId: tenant.id, contextKey },
          data: {
            state: "DELIVERED",
            deliveredAt: new Date("2026-01-15T00:00:00Z"),
            completedAt: new Date(),
            costMicros: 1,
          },
        })
        expect(await catalogAiUsage(db, tenant.id, policy)).toMatchObject({
          used: lifetime.used + 1,
          reserved: lifetime.reserved,
          remaining: 0,
        })
        policy.generation.allowance.period = "monthly"
        expect(await catalogAiUsage(db, tenant.id, policy)).toMatchObject({
          used: monthly.used,
          reserved: monthly.reserved,
          remaining: limit - monthly.used - monthly.reserved,
        })
        const retainedCostId = `retained-cost-${randomUUID()}`
        await db.catalogAiProviderCost.create({
          data: { id: retainedCostId, reservedCostMicros: 1 },
        })
        try {
          await db.catalogAiImageJob.deleteMany({
            where: { tenantId: tenant.id, contextKey },
          })
          expect(
            await db.catalogAiProviderCost.findUnique({
              where: { id: retainedCostId },
            }),
          ).not.toBeNull()
          await db.$transaction(
            async (tx) => {
              await lockCatalogAiPolicy(tx)
              const today = new Date()
              today.setUTCHours(0, 0, 0, 0)
              const [settled, unresolved, queued] = await Promise.all([
                tx.catalogAiProviderCost.aggregate({
                  where: { createdAt: { gte: today } },
                  _sum: { costMicros: true },
                }),
                tx.catalogAiProviderCost.aggregate({
                  where: { costMicros: null, id: { not: retainedCostId } },
                  _sum: { reservedCostMicros: true },
                }),
                tx.catalogAiImageJob.aggregate({
                  where: { state: "QUEUED" },
                  _sum: { reservedCostMicros: true },
                }),
              ])
              const effective = {
                maxRequestMicros: 1,
                dailyCapMicros:
                  (settled._sum.costMicros ?? 0) +
                  (unresolved._sum.reservedCostMicros ?? 0) +
                  (queued._sum.reservedCostMicros ?? 0) +
                  1,
              }
              await expect(
                assertCatalogAiSpendInTransaction(tx, effective),
              ).rejects.toMatchObject({ code: "LIMIT" })
              await tx.catalogAiProviderCost.update({
                where: { id: retainedCostId },
                data: { costMicros: 0 },
              })
              await assertCatalogAiSpendInTransaction(tx, effective)
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        } finally {
          await db.catalogAiProviderCost.delete({
            where: { id: retainedCostId },
          })
        }
        expect(
          await readCatalogAiImages(db, { ...scope, contextKey }),
        ).toMatchObject({ canGenerate: true })
        await expect(
          startCatalogAiImage(db, {
            ...scope,
            tenantId: "foreign-business",
            contextKey,
            clientOperationId: randomUUID(),
            facts: {
              kind: "PRODUCT",
              name: "Forbidden",
              description: "",
              category: "",
            },
            note: "",
          }),
        ).rejects.toMatchObject({ code: "PHOTO_ACCESS_DENIED" })
        // A revoked/deleted actor must not leave queued/review rows blocking recovery.
        for (const state of ["QUEUED", "PENDING_REVIEW"]) {
          const job = await db.catalogAiImageJob.create({
            data: {
              ...scope,
              actorUserId: "revoked-local-check",
              clientOperationId: randomUUID(),
              contextKey,
              payloadHash: "revoked-scope",
              mode: "generate",
              facts: { kind: "PRODUCT", name: "Private metadata" },
              note: "",
              policySnapshot: policy,
              policyRevision: 0,
              model: policy.generation.model,
              reservedCostMicros: 1,
              state,
              outputAssetId: state === "PENDING_REVIEW" ? randomUUID() : null,
            },
          })
          if (state === "QUEUED") await claimCatalogAiImage(db, job.id)
          else await settleCatalogAiImage(db, job.id)
          expect(
            (
              await db.catalogAiImageJob.findUniqueOrThrow({
                where: { id: job.id },
              })
            ).state,
          ).toBe("FAILED")
        }
      } finally {
        await db.catalogAiImageJob.deleteMany({
          where: { tenantId: tenant.id, contextKey },
        })
      }
    })
    test("the last WhatsApp monthly slot is atomic and never resets existing minute/day limits", async () => {
      const { prisma: db } = await import("../../client")
      const tenant = await db.tenant.findFirst({
        where: {
          id: "cmuv4c0450001z49kd8k5o0s1",
          dataClassification: "QA",
          isActive: true,
        },
        select: {
          id: true,
          users: {
            where: { role: "OWNER", status: "ACTIVE" },
            take: 1,
            select: { userId: true },
          },
        },
      })
      const userId = tenant?.users[0]?.userId
      if (!tenant || !userId)
        throw new Error("Existing local QA owner required.")
      const { policy } = await loadCatalogAiPolicy(db)
      const cap = policy.whatsapp.monthlyMessages
      if (cap < 1)
        throw new Error(
          "The monthly cap is disabled; this fixture does not change policy to manufacture a pass.",
        )
      // Private metadata only in a distant, unique month; no message/provider runs.
      const now = new Date(
        Date.UTC(4000 + Math.floor(Math.random() * 1000), 0, 1),
      )
      const scope = { tenantId: tenant.id, userId }
      await db.assistantWhatsAppMonthlyUsage.create({
        data: { tenantId: tenant.id, monthStartedAt: now, attempts: cap - 1 },
      })
      try {
        const attempt = () =>
          db.$transaction(
            (tx) =>
              reserveAssistantWhatsAppTransportInTransaction(
                tx,
                scope,
                "deliveryAttempts",
                now,
              ),
            { maxWait: 10_000, timeout: 30_000 },
          )
        const results = await Promise.all([attempt(), attempt()])
        expect(results.filter((result) => result.allowed)).toHaveLength(1)
        expect(results.filter((result) => !result.allowed)).toHaveLength(1)
        const monthly =
          await db.assistantWhatsAppMonthlyUsage.findUniqueOrThrow({
            where: {
              tenantId_monthStartedAt: {
                tenantId: tenant.id,
                monthStartedAt: now,
              },
            },
          })
        expect(monthly.attempts).toBe(cap)
        expect(
          await db.assistantWhatsAppUsageBucket.count({
            where: { ...scope, windowStartedAt: now, deliveryAttempts: 1 },
          }),
        ).toBe(2)
      } finally {
        await db.assistantWhatsAppUsageBucket.deleteMany({
          where: { ...scope, windowStartedAt: now },
        })
        await db.assistantWhatsAppMonthlyUsage.delete({
          where: {
            tenantId_monthStartedAt: {
              tenantId: tenant.id,
              monthStartedAt: now,
            },
          },
        })
      }
    })
  },
)
