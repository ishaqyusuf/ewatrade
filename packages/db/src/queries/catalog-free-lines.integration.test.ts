import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import {
  createCommercialOrder,
  fulfillCommercialOrderProducts,
} from "./commercial-orders"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)
;(enabled ? describe : describe.skip)(
  "catalog-free order lines on guarded Neon development",
  () => {
    test("records a quick sale and additional costs without a Catalog, fulfilled and paid", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const id = randomUUID()
      const tenantId = randomUUID()
      const userId = randomUUID()
      try {
        await prisma.tenant.create({
          data: {
            id: tenantId,
            slug: `catalog-free-${id}`,
            name: "Catalog-free QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "catalog-free-lines.test",
            qaMarkedAt: new Date(),
          },
        })
        await prisma.user.create({
          data: { id: userId, email: `catalog-free-${id}@example.test` },
        })
        await prisma.membership.create({
          data: { role: "OWNER", status: "ACTIVE", tenantId, userId },
        })
        const store = await prisma.store.create({
          data: { name: "Main", slug: `main-${id}`, tenantId },
        })
        const base = {
          actorUserId: userId,
          schemaVersion: 1,
          storeId: store.id,
          tenantId,
        }

        for (const [index, description] of [undefined, " \t\n"].entries()) {
          await expect(
            createCommercialOrder(prisma, {
              ...base,
              clientOrderId: `catalog-free-${id}-blank-${index}`,
              lines: [{ custom: "quick_sale", amountMinor: 500, description }],
            }),
          ).rejects.toMatchObject({ code: "INVALID_ORDER" })
        }
        expect(
          await prisma.commercialOrder.count({ where: { tenantId } }),
        ).toBe(0)
        expect(await prisma.catalogItem.count({ where: { tenantId } })).toBe(0)

        const paid = await createCommercialOrder(prisma, {
          ...base,
          clientOrderId: `catalog-free-${id}-1`,
          fulfillNow: true,
          initialPayment: {
            amountMinor: 75_000,
            clientPaymentId: `catalog-free-${id}-pay`,
            method: "cash",
          },
          lines: [
            { amountMinor: 60_000, custom: "quick_sale", description: "Rice" },
            {
              amountMinor: 10_000,
              custom: "additional_cost",
              description: "Delivery",
            },
            { amountMinor: 5_000, custom: "additional_cost" },
          ],
        })
        expect(paid.totalMinor).toBe(75_000)
        expect(paid.status).toBe("COMPLETED")
        expect(paid.paymentStatus).toBe("PAID")
        expect(paid.lines.map((line) => line.customLine)).toEqual([
          { description: "Rice", kind: "quick_sale" },
          { description: "Delivery", kind: "additional_cost" },
          { description: null, kind: "additional_cost" },
        ])
        expect(
          paid.lines.map((line) => line.snapshot?.catalogItemName),
        ).toEqual(["Rice", "Additional cost", "Additional cost"])
        expect(paid.lines[2]?.snapshot?.variantName).toBe("(no description)")

        // The hidden items are provisioned once per business, not per order.
        const open = await createCommercialOrder(prisma, {
          ...base,
          clientOrderId: `catalog-free-${id}-2`,
          lines: [
            {
              amountMinor: 2_500,
              custom: "quick_sale",
              description: "More rice",
            },
          ],
        })
        expect(open.status).toBe("CONFIRMED")
        expect(open.lines[0]?.snapshot?.catalogItemName).toBe("More rice")
        expect(
          await prisma.catalogItem.count({
            where: { systemRole: { not: null }, tenantId },
          }),
        ).toBe(2)

        const fulfilled = await fulfillCommercialOrderProducts(prisma, {
          actorUserId: userId,
          clientOperationId: `catalog-free-${id}-fulfil`,
          orderId: open.id,
          schemaVersion: 1,
          tenantId,
        })
        expect(fulfilled).toEqual({
          fulfilledLineCount: 1,
          status: "COMPLETED",
        })

        await expect(
          createCommercialOrder(prisma, {
            ...base,
            clientOrderId: `catalog-free-${id}-3`,
            lines: [{ amountMinor: 0, custom: "quick_sale" }],
          }),
        ).rejects.toThrow("amount above zero")
      } finally {
        // Performance evidence restricts Order deletion, so remove it first.
        await prisma.commercialServiceFulfillment.deleteMany({
          where: { tenantId },
        })
        await prisma.tenant.deleteMany({ where: { id: tenantId } })
        await prisma.user.deleteMany({ where: { id: userId } })
        await prisma.$disconnect()
      }
    })
  },
)
