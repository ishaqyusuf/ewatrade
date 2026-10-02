import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { recordCommercialOrderPaymentInTransaction } from "../commercial-payments"
import { lockCommerceFinancialOrder } from "../customer-ledger/commerce-locks"
import { getCustomerLedgerStatement } from "../customer-ledger/reads"
import { createFinanceBook } from "./accounts"
import { postCommerceFinanceJournalInTransaction } from "./posting"
import { getFinanceAccountBalances } from "./reads"

describeWithServiceCommerceDatabase(
  "commerce financial source postings",
  () => {
    test("separates billing, completion, collections and refunds with atomic date guards", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const user = await db.user.create({
        data: {
          name: "Commerce finance QA",
          email: `commerce-finance-${runId}@example.invalid`,
        },
      })
      let tenantId: string | undefined
      let bookId: string | undefined
      try {
        const tenant = await db.tenant.create({
          data: {
            name: "Commerce finance QA",
            slug: `commerce-finance-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantId = tenant.id
        const actor = { tenantId, actorUserId: user.id }
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2026-01-01"),
        })
        bookId = book.id
        const store = await db.store.create({
          data: {
            tenantId,
            name: "Source store",
            slug: "source-store",
            status: "ACTIVE",
          },
        })
        const customer = await db.customer.create({
          data: { tenantId, name: "Source customer" },
        })
        const order = await db.commercialOrder.create({
          data: {
            tenantId,
            customerId: customer.id,
            storeId: store.id,
            clientOrderId: runId,
            payloadHash: "finance-source-fixture",
            orderNumber: "QA-1",
            currencyCode: "NGN",
            subtotalMinor: 9000,
            taxMinor: 1000,
            totalMinor: 10000,
            createdByUserId: user.id,
          },
        })
        const source = { tenantId, orderId: order.id }
        const item = await db.catalogItem.create({
          data: {
            tenantId,
            slug: "performed-service",
            name: "Performed Service QA",
            kind: "SERVICE",
            variants: { create: { key: "default", name: "Default" } },
          },
          include: { variants: true },
        })
        const variant = item.variants[0]
        if (!variant) throw new Error("Service fixture variant missing")
        const offering = await db.sellableOffering.create({
          data: {
            tenantId,
            catalogItemId: item.id,
            variantId: variant.id,
            key: "performed-service",
            name: "Performed Service QA",
            kind: "SERVICE",
            pricingPolicy: "FIXED",
            currencyCode: "NGN",
            fixedPriceMinor: 9000,
          },
        })
        const line = await db.commercialOrderLine.create({
          data: {
            orderId: order.id,
            offeringId: offering.id,
            kind: "SERVICE",
            quantity: "1",
            unitPriceMinor: 9000,
            taxMinor: 1000,
            totalMinor: 10000,
          },
        })
        const job = await db.serviceJob.create({
          data: {
            tenantId,
            storeId: store.id,
            commercialOrderId: order.id,
            clientJobId: "performed-service",
            createdByUserId: user.id,
            lines: {
              create: ["0.4", "0.6"].map((quantity) => ({
                commercialOrderLineId: line.id,
                allocationSnapshot: {},
                allocatedQuantity: quantity,
                authorizationStatus: "AUTHORIZED" as const,
                authorizationPolicy: "ON_ORDER_CONFIRMATION" as const,
                status: "READY_FOR_HANDOFF" as const,
              })),
            },
          },
        })
        const bill = () =>
          db.$transaction(
            (tx) =>
              postCommerceFinanceJournalInTransaction(tx, {
                ...source,
                event: "BILLED",
              }),
            { timeout: 30000 },
          )
        const billed = await bill()
        expect(await bill()).toEqual(billed)
        const initial = await getFinanceAccountBalances(db, {
          ...actor,
          bookId,
        })
        const initialCode = (code: string) =>
          initial.accounts.find((row) => row.code === code)?.balanceMinor
        expect(initialCode("1200")).toBe("10000")
        expect(initialCode("2250")).toBe("9000")
        expect(initialCode("2350")).toBe("1000")
        expect(initialCode("4000")).toBe("0")
        const customerAccount =
          await db.customerLedgerAccount.findUniqueOrThrow({
            where: {
              tenantId_customerId_currencyCode: {
                tenantId,
                customerId: customer.id,
                currencyCode: "NGN",
              },
            },
          })
        const statement = (snapshotSequence?: string) =>
          getCustomerLedgerStatement(db, {
            ...actor,
            accountId: customerAccount.id,
            snapshotSequence,
          })
        const billedStatement = await statement()
        expect(billedStatement.snapshotSequence).toBe("1")
        expect(billedStatement.totals.outstandingDebtMinor).toBe("10000")
        expect(billedStatement.totals.availableCreditMinor).toBe("0")
        const received = await db.$transaction(
          async (tx) => {
            const payment = await recordCommercialOrderPaymentInTransaction(
              tx,
              {
                ...source,
                actorUserId: "payment-provider",
                amountMinor: 4000,
                clientPaymentId: "provider-payment-fixture",
                method: "card",
              },
            )
            await postCommerceFinanceJournalInTransaction(tx, {
              ...source,
              event: "PAYMENT",
              paymentId: payment.id,
            })
            return payment
          },
          { timeout: 30000 },
        )
        await db.$transaction(
          (tx) =>
            postCommerceFinanceJournalInTransaction(tx, {
              ...source,
              event: "PAYMENT",
              paymentId: received.id,
            }),
          { timeout: 30000 },
        )
        const paidStatement = await statement()
        expect(paidStatement.snapshotSequence).toBe("2")
        expect(paidStatement.currentRevision).toBe("2")
        expect(paidStatement.totals).toEqual({
          debitMinor: "10000",
          creditMinor: "4000",
          allocatedMinor: "4000",
          outstandingDebtMinor: "6000",
          availableCreditMinor: "0",
          netBalanceMinor: "6000",
        })
        await db.$transaction(
          async (tx) => {
            await lockCommerceFinancialOrder(tx, source)
            await tx.commercialOrder.update({
              where: { id: order.id },
              data: { status: "COMPLETED", completedAt: new Date() },
            })
            expect(
              await postCommerceFinanceJournalInTransaction(tx, {
                ...source,
                event: "EARNED",
              }),
            ).toBeNull()
            await tx.serviceJobLine.updateMany({
              where: { serviceJobId: job.id },
              data: { status: "COMPLETED", completedAt: new Date() },
            })
            // The source completion time must not predate the performed work.
            await tx.commercialOrder.update({
              where: { id: order.id },
              data: { completedAt: new Date() },
            })
            await postCommerceFinanceJournalInTransaction(tx, {
              ...source,
              event: "EARNED",
            })
          },
          { timeout: 30000 },
        )
        await db.$transaction(
          async (tx) => {
            const refund = await recordCommercialOrderPaymentInTransaction(tx, {
              ...source,
              actorUserId: "payment-provider",
              amountMinor: 1000,
              clientPaymentId: "provider-refund-fixture",
              method: "card",
              type: "refund",
            })
            await postCommerceFinanceJournalInTransaction(tx, {
              ...source,
              event: "PAYMENT",
              paymentId: refund.id,
            })
          },
          { timeout: 30000 },
        )
        const balances = await getFinanceAccountBalances(db, {
          ...actor,
          bookId,
        })
        const code = (value: string) =>
          balances.accounts.find((row) => row.code === value)?.balanceMinor
        expect(code("1200")).toBe("7000")
        expect(code("1150")).toBe("3000")
        expect(code("1000")).toBe("0")
        expect(code("4000")).toBe("9000")
        expect(code("2250")).toBe("0")
        expect(code("2350")).toBe("1000")
        expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(
          4,
        )
        const refundStatement = await statement()
        expect(refundStatement.snapshotSequence).toBe("3")
        expect(refundStatement.totals).toEqual({
          debitMinor: "11000",
          creditMinor: "4000",
          allocatedMinor: "4000",
          outstandingDebtMinor: "7000",
          availableCreditMinor: "0",
          netBalanceMinor: "7000",
        })
        expect(code("1200")).toBe(refundStatement.totals.outstandingDebtMinor)
        const historicalStatement = await statement("2")
        expect(historicalStatement.totals).toEqual(paidStatement.totals)
        expect(historicalStatement.entries).toEqual(paidStatement.entries)
        expect(
          await db.customerLedgerAllocationRelease.count({
            where: { allocation: { accountId: customerAccount.id } },
          }),
        ).toBe(1)
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: new Date(Date.now() + 60000) },
        })
        await expect(
          db.$transaction(
            async (tx) => {
              const payment = await recordCommercialOrderPaymentInTransaction(
                tx,
                {
                  ...source,
                  actorUserId: "payment-provider",
                  amountMinor: 500,
                  clientPaymentId: "closed-period-fixture",
                  method: "card",
                },
              )
              await postCommerceFinanceJournalInTransaction(tx, {
                ...source,
                event: "PAYMENT",
                paymentId: payment.id,
              })
            },
            { timeout: 30000 },
          ),
        ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
        expect(
          await db.commercialOrderPayment.count({ where: { tenantId } }),
        ).toBe(2)
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: order.id },
            })
          ).amountPaidMinor,
        ).toBe(3000)
        const unchangedStatement = await statement()
        expect(unchangedStatement.snapshotSequence).toBe("3")
        expect(unchangedStatement.currentRevision).toBe("3")
        expect(unchangedStatement.entries).toEqual(refundStatement.entries)
        expect(unchangedStatement.totals).toEqual(refundStatement.totals)
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: null },
        })
        const concurrentPayment = (
          clientPaymentId = "concurrent-source-fixture",
          amountMinor = 500,
        ) =>
          db.$transaction(
            async (tx) => {
              const payment = await recordCommercialOrderPaymentInTransaction(
                tx,
                {
                  ...source,
                  actorUserId: "payment-provider",
                  amountMinor,
                  clientPaymentId,
                  method: "card",
                },
              )
              await postCommerceFinanceJournalInTransaction(tx, {
                ...source,
                event: "PAYMENT",
                paymentId: payment.id,
              })
              return payment
            },
            { maxWait: 10000, timeout: 30000 },
          )
        const [first, replay] = await Promise.all([
          concurrentPayment(),
          concurrentPayment(),
        ])
        expect(replay).toEqual(first)
        expect(first.amountPaidMinor).toBe(3500)
        expect(
          await db.commercialOrderPayment.count({ where: { tenantId } }),
        ).toBe(3)
        expect(
          await db.financeJournalEntry.count({
            where: {
              bookId,
              sourceKind: "COMMERCIAL_PAYMENT",
              sourceId: first.id,
            },
          }),
        ).toBe(1)
        const concurrentStatement = await statement()
        expect(concurrentStatement.snapshotSequence).toBe("4")
        expect(concurrentStatement.totals.outstandingDebtMinor).toBe("6500")
        expect(concurrentStatement.totals.availableCreditMinor).toBe("0")
        const competing = await Promise.allSettled([
          concurrentPayment("competing-payment-a", 4000),
          concurrentPayment("competing-payment-b", 4000),
        ])
        expect(
          competing.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1)
        const rejected = competing.find(
          (result) => result.status === "rejected",
        )
        expect(
          rejected?.status === "rejected" ? rejected.reason : null,
        ).toMatchObject({
          code: "INVALID_ORDER",
        })
        expect(
          await db.commercialOrderPayment.count({ where: { tenantId } }),
        ).toBe(4)
        const competingStatement = await statement()
        expect(competingStatement.snapshotSequence).toBe("5")
        expect(competingStatement.totals.outstandingDebtMinor).toBe("2500")
        expect(competingStatement.totals.availableCreditMinor).toBe("0")
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: order.id },
            })
          ).amountPaidMinor,
        ).toBe(7500)
      } finally {
        if (tenantId)
          await db.$transaction(
            async (tx) => {
              await tx.commercialOrderPayment.deleteMany({
                where: { tenantId },
              })
              await tx.customerLedgerAllocationRelease.deleteMany({
                where: { allocation: { credit: { tenantId } } },
              })
              await tx.customerLedgerAllocation.deleteMany({
                where: { credit: { tenantId } },
              })
              await tx.customerLedgerEntry.deleteMany({ where: { tenantId } })
              await tx.customerLedgerAccount.deleteMany({ where: { tenantId } })
              await tx.serviceJobLine.deleteMany({
                where: { serviceJob: { tenantId } },
              })
              await tx.serviceJob.deleteMany({ where: { tenantId } })
              await tx.commercialOrder.deleteMany({ where: { tenantId } })
              await tx.sellableOffering.deleteMany({ where: { tenantId } })
              await tx.sellableVariant.deleteMany({
                where: { catalogItem: { tenantId } },
              })
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
  },
)
