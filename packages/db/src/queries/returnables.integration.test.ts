import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { createCommercialOrder } from "./commercial-orders"
import { setCatalogProductUsage } from "./product-usage"
import {
  listReturnableBalances,
  listReturnableMovements,
  readOrderReturnables,
  recordReturnableMovement,
} from "./returnables"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)
;(enabled ? describe : describe.skip)(
  "returnables ledger on guarded Neon development",
  () => {
    test("issues with orders, returns against the customer and guards balances", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const id = randomUUID()
      const tenantId = randomUUID()
      const otherTenantId = randomUUID()
      const userId = randomUUID()
      try {
        for (const [tid, slug] of [
          [tenantId, `returnables-${id}`],
          [otherTenantId, `returnables-other-${id}`],
        ])
          await prisma.tenant.create({
            data: {
              id: tid,
              slug,
              name: "Returnables QA",
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              dataClassification: "QA",
              qaSourceDomain: "returnables.test",
              qaMarkedAt: new Date(),
            },
          })
        await prisma.user.create({
          data: { id: userId, email: `returnables-${id}@example.test` },
        })
        await prisma.membership.create({
          data: { role: "OWNER", status: "ACTIVE", tenantId, userId },
        })
        const store = await prisma.store.create({
          data: { name: "Farm", slug: `farm-${id}`, tenantId },
        })
        const customer = await prisma.customer.create({
          data: { name: "Mama Tola Stores", tenantId },
        })
        const other = await prisma.customer.create({
          data: { name: "Chidi Supermart", tenantId },
        })
        const foreign = await prisma.customer.create({
          data: { name: "Other business", tenantId: otherTenantId },
        })
        const crate = await prisma.catalogItem.create({
          data: {
            kind: "PRODUCT",
            name: "Egg crate",
            slug: `egg-crate-${id}`,
            status: "ACTIVE",
            tenantId,
            product: { create: { usage: "RETURNABLE" } },
          },
          include: { product: true },
        })
        const eggs = await prisma.catalogItem.create({
          data: {
            kind: "PRODUCT",
            name: "Big eggs",
            slug: `big-eggs-${id}`,
            status: "ACTIVE",
            tenantId,
            product: { create: { usage: "FOR_SALE" } },
          },
        })
        const order = await createCommercialOrder(prisma, {
          actorUserId: userId,
          clientOrderId: `returnables-${id}`,
          customerId: customer.id,
          lines: [
            {
              amountMinor: 48_000_000,
              custom: "quick_sale",
              description: "80 crates",
            },
          ],
          schemaVersion: 1,
          storeId: store.id,
          tenantId,
        })
        const scope = { tenantId }
        const base = {
          actorUserId: userId,
          catalogItemId: crate.id,
          customerId: customer.id,
          scope,
          tenantId,
        }

        const issued = await recordReturnableMovement(prisma, {
          ...base,
          clientMovementId: `issue-${id}`,
          kind: "ISSUED",
          orderId: order.id,
          quantity: 58,
        })
        expect(issued.storeId).toBe(store.id)
        expect(issued.orderNumber).toBe(order.orderNumber)
        // Replay is idempotent; changed content under the same identity is refused.
        const replay = await recordReturnableMovement(prisma, {
          ...base,
          clientMovementId: `issue-${id}`,
          kind: "ISSUED",
          orderId: order.id,
          quantity: 58,
        })
        expect(replay.id).toBe(issued.id)
        await expect(
          recordReturnableMovement(prisma, {
            ...base,
            clientMovementId: `issue-${id}`,
            kind: "ISSUED",
            orderId: order.id,
            quantity: 59,
          }),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })

        // Opening balance with no order.
        await recordReturnableMovement(prisma, {
          ...base,
          clientMovementId: `opening-${id}`,
          kind: "ISSUED",
          quantity: 20,
          storeId: store.id,
        })
        let balances = await listReturnableBalances(prisma, { tenantId })
        expect(balances).toHaveLength(1)
        expect(balances[0]).toMatchObject({
          customerName: "Mama Tola Stores",
          itemName: "Egg crate",
          orderCount: 1,
          out: 78,
        })

        // Only Returnable items, the right customer, and never more than is out.
        await expect(
          recordReturnableMovement(prisma, {
            ...base,
            catalogItemId: eggs.id,
            clientMovementId: `eggs-${id}`,
            kind: "ISSUED",
            quantity: 1,
          }),
        ).rejects.toMatchObject({ code: "RETURNABLE_NOT_FOUND" })
        await expect(
          recordReturnableMovement(prisma, {
            ...base,
            clientMovementId: `wrong-customer-${id}`,
            customerId: other.id,
            kind: "ISSUED",
            orderId: order.id,
            quantity: 1,
          }),
        ).rejects.toMatchObject({ code: "ORDER_CUSTOMER_MISMATCH" })
        await expect(
          recordReturnableMovement(prisma, {
            ...base,
            clientMovementId: `foreign-${id}`,
            customerId: foreign.id,
            kind: "ISSUED",
            quantity: 1,
          }),
        ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" })
        await expect(
          recordReturnableMovement(prisma, {
            ...base,
            clientMovementId: `over-${id}`,
            kind: "RETURNED",
            quantity: 79,
          }),
        ).rejects.toMatchObject({ code: "RETURNABLE_OVER_BALANCE" })

        // Concurrent returns cannot overdraw: one of two 50s must fail.
        const racing = await Promise.allSettled([
          recordReturnableMovement(prisma, {
            ...base,
            clientMovementId: `race-a-${id}`,
            kind: "RETURNED",
            quantity: 50,
          }),
          recordReturnableMovement(prisma, {
            ...base,
            clientMovementId: `race-b-${id}`,
            kind: "RETURNED",
            quantity: 50,
          }),
        ])
        expect(racing.filter((r) => r.status === "fulfilled")).toHaveLength(1)

        await recordReturnableMovement(prisma, {
          ...base,
          clientMovementId: `lost-${id}`,
          kind: "WRITTEN_OFF",
          note: "Broken in transit",
          orderId: order.id,
          quantity: 3,
        })
        balances = await listReturnableBalances(prisma, { tenantId })
        expect(balances[0]?.out).toBe(25)
        // First in, first back: the 53 cleared all of the order's 58 but 5,
        // so the oldest item still out is from the order.
        expect(balances[0]?.oldestOutAt).toBe(issued.occurredAt)

        const forOrder = await readOrderReturnables(prisma, {
          orderId: order.id,
          scope,
          tenantId,
        })
        expect(forOrder.items).toEqual([
          {
            catalogItemId: crate.id,
            issued: 58,
            itemName: "Egg crate",
            returned: 0,
            writtenOff: 3,
          },
        ])
        const history = await listReturnableMovements(prisma, {
          customerId: customer.id,
          tenantId,
        })
        expect(history.movements).toHaveLength(4)
        expect(
          await listReturnableBalances(prisma, { tenantId: otherTenantId }),
        ).toEqual([])

        // Order creation issues returnables in the same transaction, once.
        const withCrates = {
          actorUserId: userId,
          clientOrderId: `returnables-order-${id}`,
          customerId: other.id,
          lines: [
            {
              amountMinor: 6_000_000,
              custom: "quick_sale" as const,
              description: "10 crates",
            },
          ],
          returnables: [{ catalogItemId: crate.id, quantity: 10 }],
          schemaVersion: 1,
          storeId: store.id,
          tenantId,
        }
        const crateOrder = await createCommercialOrder(prisma, withCrates)
        await createCommercialOrder(prisma, withCrates)
        const otherBalance = await listReturnableBalances(prisma, {
          customerId: other.id,
          tenantId,
        })
        expect(otherBalance[0]?.out).toBe(10)
        expect(
          (
            await readOrderReturnables(prisma, {
              orderId: crateOrder.id,
              scope,
              tenantId,
            })
          ).items[0]?.issued,
        ).toBe(10)
        await expect(
          createCommercialOrder(prisma, {
            ...withCrates,
            clientOrderId: `returnables-walkin-${id}`,
            customerId: undefined,
          }),
        ).rejects.toMatchObject({ code: "INVALID_ORDER" })
        await expect(
          createCommercialOrder(prisma, {
            ...withCrates,
            clientOrderId: `returnables-eggs-${id}`,
            returnables: [{ catalogItemId: eggs.id, quantity: 1 }],
          }),
        ).rejects.toMatchObject({ code: "RETURNABLE_NOT_FOUND" })
        expect(
          await prisma.commercialOrder.count({
            where: { clientOrderId: `returnables-eggs-${id}`, tenantId },
          }),
        ).toBe(0)

        // An item with history stays Returnable.
        await expect(
          setCatalogProductUsage(prisma, {
            actorUserId: userId,
            expectedUpdatedAt: crate.product?.updatedAt ?? new Date(),
            itemId: crate.id,
            tenantId,
            usage: "FOR_SALE",
          }),
        ).rejects.toMatchObject({ code: "RETURNABLE_IN_USE" })
      } finally {
        await prisma.returnableMovement.deleteMany({
          where: { tenantId: { in: [tenantId, otherTenantId] } },
        })
        await prisma.commercialOrder.deleteMany({
          where: { tenantId: { in: [tenantId, otherTenantId] } },
        })
        await prisma.tenant.deleteMany({
          where: { id: { in: [tenantId, otherTenantId] } },
        })
        await prisma.user.deleteMany({ where: { id: userId } })
      }
    })
  },
)
