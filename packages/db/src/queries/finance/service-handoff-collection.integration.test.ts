import { randomUUID } from "node:crypto"

import { expect, test } from "bun:test"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { recordServiceHandoff } from "../service-work"
import { createFinanceBook, createFinanceMoneyAccount } from "./accounts"
import { getFinanceAccountBalances } from "./reads"

describeWithServiceCommerceDatabase("service handoff receiving account", () => {
  test("the collected balance lands in the chosen account once; a wrong-method account rolls the handoff back", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const user = await db.user.create({
      data: {
        email: `service-handoff-collection-${suffix}@example.invalid`,
        name: "Service handoff collection QA",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          dataClassification: "QA",
          enabledModes: ["MERCHANT"],
          name: "Service handoff collection QA",
          slug: `service-handoff-collection-${suffix}`,
          type: "MERCHANT",
          users: {
            create: { role: "OWNER", status: "ACTIVE", userId: user.id },
          },
        },
      })
      tenantId = tenant.id
      const actor = { tenantId: tenant.id, actorUserId: user.id }
      const store = await db.store.create({
        data: {
          name: "Handoff QA",
          slug: `handoff-${suffix}`,
          status: "ACTIVE",
          tenantId: tenant.id,
        },
      })
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      bookId = book.id
      const cash = await db.financeAccount.findFirstOrThrow({
        where: { bookId: book.id, purpose: "CASH" },
      })
      const palm = await createFinanceMoneyAccount(db, {
        ...actor,
        bookId: book.id,
        code: "1110",
        name: "Palm Pay",
        purpose: "BANK",
      })
      const item = await db.catalogItem.create({
        data: {
          kind: "SERVICE",
          name: "Laundry",
          slug: `laundry-${suffix}`,
          status: "DRAFT",
          tenantId: tenant.id,
          service: { create: {} },
        },
      })
      const variant = await db.sellableVariant.create({
        data: {
          catalogItemId: item.id,
          isDefault: true,
          key: "default",
          name: "Laundry",
          status: "DRAFT",
        },
      })
      const offering = await db.sellableOffering.create({
        data: {
          catalogItemId: item.id,
          currencyCode: "NGN",
          fixedPriceMinor: 1_000,
          key: "laundry",
          kind: "SERVICE",
          name: "Laundry",
          pricingPolicy: "FIXED",
          status: "DRAFT",
          tenantId: tenant.id,
          variantId: variant.id,
          serviceOffering: {
            create: {
              authorizationPolicy: "ON_ORDER_CONFIRMATION",
              workPolicy: "TRACKED",
            },
          },
        },
      })
      const order = await db.commercialOrder.create({
        data: {
          amountPaidMinor: 0,
          clientOrderId: `handoff:${suffix}`,
          createdByUserId: user.id,
          currencyCode: "NGN",
          orderNumber: `QA-handoff-${suffix}`,
          payloadHash: `qa:handoff:${suffix}`,
          paymentStatus: "PENDING",
          status: "CONFIRMED",
          storeId: store.id,
          subtotalMinor: 1_000,
          tenantId: tenant.id,
          totalMinor: 1_000,
          lines: {
            create: {
              kind: "SERVICE",
              offeringId: offering.id,
              quantity: "1",
              totalMinor: 1_000,
              unitPriceMinor: 1_000,
            },
          },
        },
        include: { lines: true },
      })
      const orderLine = order.lines[0]
      if (!orderLine) throw new Error("Order fixture has no line")
      const job = await db.serviceJob.create({
        data: {
          clientJobId: `handoff-job:${suffix}`,
          commercialOrderId: order.id,
          createdByUserId: user.id,
          storeId: store.id,
          tenantId: tenant.id,
        },
      })
      await db.serviceJobLine.create({
        data: {
          allocatedQuantity: "1",
          allocationSnapshot: { fixture: "service-handoff-collection" },
          authorizationPolicy: "ON_ORDER_CONFIRMATION",
          authorizationSource: "order_confirmation",
          authorizationStatus: "AUTHORIZED",
          authorizedAt: new Date(),
          commercialOrderLineId: orderLine.id,
          serviceJobId: job.id,
          status: "READY_FOR_HANDOFF",
        },
      })
      const handoff = (moneyAccountId: string) => ({
        actorUserId: user.id,
        clientCommandId: `handoff:${suffix}:${moneyAccountId}`,
        expectedRevision: job.revision,
        jobId: job.id,
        note: "Collected by customer",
        payment: {
          amountMinor: 1_000,
          method: "bank_transfer" as const,
          moneyAccountId,
        },
        tenantId: tenant.id,
      })
      const collections = () =>
        db.financeJournalEntry.count({
          where: { bookId: book.id, sourceKind: "COMMERCIAL_ORDER_COLLECTION" },
        })
      const balance = async (accountId: string) =>
        (
          await getFinanceAccountBalances(db, { ...actor, bookId: book.id })
        ).accounts.find((row) => row.id === accountId)?.balanceMinor

      // Cash accounts take only cash: nothing is collected or handed over.
      await expect(recordServiceHandoff(db, handoff(cash.id))).rejects.toThrow()
      expect(await collections()).toBe(0)
      expect(
        (await db.serviceJob.findUniqueOrThrow({ where: { id: job.id } }))
          .handedOffAt,
      ).toBeNull()

      const input = handoff(palm.id)
      const result = await recordServiceHandoff(db, input)
      expect(result.handedOffAt).toBeInstanceOf(Date)
      expect(await recordServiceHandoff(db, input)).toMatchObject({
        id: job.id,
      })
      expect(await collections()).toBe(1)
      expect(await balance(palm.id)).toBe("1000")
      expect(await balance(cash.id)).toBe("0")
      const payment = await db.commercialOrderPayment.findFirstOrThrow({
        where: { orderId: order.id },
      })
      expect(payment.moneyAccountId).toBe(palm.id)
    } finally {
      if (tenantId)
        await db.$transaction(
          async (tx) => {
            await tx.serviceJob.deleteMany({ where: { tenantId } })
            await tx.commercialOrderPayment.deleteMany({ where: { tenantId } })
            await tx.commercialServiceFulfillment.deleteMany({
              where: { tenantId },
            })
            await tx.commercialOrder.deleteMany({ where: { tenantId } })
            await tx.catalogItem.deleteMany({ where: { tenantId } })
            if (bookId) {
              await tx.financeCommand.deleteMany({ where: { bookId } })
              await tx.financeJournalLine.deleteMany({ where: { bookId } })
              await tx.financeJournalEntry.deleteMany({ where: { bookId } })
              await tx.financeAccount.deleteMany({ where: { bookId } })
              await tx.financeBook.delete({ where: { id: bookId } })
            }
            await tx.tenant.delete({ where: { id: tenantId } })
          },
          { timeout: 30000 },
        )
      await db.user.delete({ where: { id: user.id } })
    }
  }, 300000)
})
