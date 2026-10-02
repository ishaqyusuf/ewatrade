import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { listCommercialOrderPaymentsPage } from "../commercial-payments"
import { createFinanceBook } from "../finance/accounts"
import { postCommerceFinanceJournalInTransaction } from "../finance/posting"
import { getFinanceAccountBalances } from "../finance/reads"
import { releaseCustomerLedgerAllocation } from "./allocation-releases"
import { applyCustomerLedgerCredit } from "./allocations"
import { getCustomerLedgerStatement } from "./reads"
import { recordCustomerLedgerReceipt } from "./receipts"

describeWithServiceCommerceDatabase(
  "held customer credit Order commands",
  () => {
    test("receipt, allocation and partial/full release reconcile without duplicated cash", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const user = await db.user.create({
        data: {
          name: "Order credit QA",
          email: `order-credit-${runId}@example.invalid`,
        },
      })
      let tenantId: string | undefined
      let bookId: string | undefined
      try {
        const tenant = await db.tenant.create({
          data: {
            name: "Order credit QA",
            slug: `order-credit-${runId}`,
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
            name: "Credit store",
            slug: "credit-store",
            status: "ACTIVE",
          },
        })
        const customer = await db.customer.create({
          data: { tenantId, name: "Credit customer" },
        })
        const order = await db.commercialOrder.create({
          data: {
            tenantId,
            storeId: store.id,
            customerId: customer.id,
            clientOrderId: runId,
            payloadHash: "order-credit-fixture",
            orderNumber: "QA-1",
            currencyCode: "NGN",
            subtotalMinor: 10000,
            totalMinor: 10000,
            createdByUserId: user.id,
          },
        })
        await db.$transaction(
          (tx) =>
            postCommerceFinanceJournalInTransaction(tx, {
              tenantId: tenant.id,
              orderId: order.id,
              event: "BILLED",
            }),
          { maxWait: 10000, timeout: 30000 },
        )
        const account = await db.customerLedgerAccount.findUniqueOrThrow({
          where: {
            tenantId_customerId_currencyCode: {
              tenantId,
              customerId: customer.id,
              currencyCode: "NGN",
            },
          },
        })
        const charge = await db.customerLedgerEntry.findUniqueOrThrow({
          where: {
            tenantId_sourceKind_sourceId: {
              tenantId,
              sourceKind: "COMMERCIAL_ORDER_BILLED",
              sourceId: order.id,
            },
          },
        })
        const cash = await db.financeAccount.findFirstOrThrow({
          where: { bookId, code: "1000" },
        })
        const receipt = await recordCustomerLedgerReceipt(db, {
          ...actor,
          bookId,
          accountId: account.id,
          moneyAccountId: cash.id,
          clientCommandId: "held-deposit",
          amountMinor: "5000",
          method: "CASH",
          description: "Funds held for later settlement",
        })
        const credit = await db.customerLedgerReceipt.findUniqueOrThrow({
          where: { id: receipt.id },
        })
        const apply = {
          ...actor,
          bookId,
          accountId: account.id,
          expectedRevision: "2",
          clientCommandId: "apply-order-credit",
          creditEntryId: credit.entryId,
          chargeEntryId: charge.id,
          amountMinor: "1000",
        }
        const allocation = await applyCustomerLedgerCredit(db, apply)
        expect(await applyCustomerLedgerCredit(db, apply)).toEqual(allocation)
        await expect(
          applyCustomerLedgerCredit(db, {
            ...apply,
            clientCommandId: "stale-allocation",
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        const payment = await db.commercialOrderPayment.findUniqueOrThrow({
          where: { customerAllocationId: allocation.id },
        })
        expect(payment.method).toBe("CUSTOMER_CREDIT")
        expect(payment.amountMinor).toBe(1000)
        const allocatedOrder = await db.commercialOrder.findUniqueOrThrow({
          where: { id: order.id },
        })
        expect(allocatedOrder.amountPaidMinor).toBe(1000)
        expect(allocatedOrder.paymentStatus).toBe("PARTIALLY_PAID")
        const balances = () =>
          getFinanceAccountBalances(db, { ...actor, bookId: book.id })
        const afterAllocation = await balances()
        const balance = (rows: typeof afterAllocation, purpose: string) =>
          rows.accounts.find((row) => row.purpose === purpose)?.balanceMinor
        expect(balance(afterAllocation, "CASH")).toBe("5000")
        expect(balance(afterAllocation, "RECEIVABLE")).toBe("9000")
        expect(balance(afterAllocation, "CUSTOMER_ADVANCE")).toBe("4000")
        expect(balance(afterAllocation, "SALES")).toBe("0")
        const statement = (snapshotSequence?: string) =>
          getCustomerLedgerStatement(db, {
            ...actor,
            accountId: account.id,
            snapshotSequence,
          })
        const settledStatement = await statement()
        expect(settledStatement.snapshotSequence).toBe("3")
        expect(settledStatement.totals.outstandingDebtMinor).toBe("9000")
        expect(settledStatement.totals.availableCreditMinor).toBe("4000")
        const release = {
          ...actor,
          bookId,
          accountId: account.id,
          allocationId: allocation.id,
          expectedRevision: "3",
          clientCommandId: "partial-release",
          amountMinor: "400",
          reason: "Correct the selected charge",
        }
        const partial = await releaseCustomerLedgerAllocation(db, release)
        expect(await releaseCustomerLedgerAllocation(db, release)).toEqual(
          partial,
        )
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: order.id },
            })
          ).amountPaidMinor,
        ).toBe(600)
        await expect(
          releaseCustomerLedgerAllocation(db, {
            ...release,
            clientCommandId: "excess-release",
            expectedRevision: "4",
            amountMinor: "601",
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: new Date(Date.now() + 60000) },
        })
        await expect(
          releaseCustomerLedgerAllocation(db, {
            ...release,
            clientCommandId: "closed-release",
            expectedRevision: "4",
            amountMinor: "600",
          }),
        ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
        expect((await statement()).snapshotSequence).toBe("4")
        expect(
          await db.customerLedgerAllocationRelease.count({
            where: { allocationId: allocation.id },
          }),
        ).toBe(1)
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: null },
        })
        await releaseCustomerLedgerAllocation(db, {
          ...release,
          clientCommandId: "remaining-release",
          expectedRevision: "4",
          amountMinor: "600",
        })
        const releasedOrder = await db.commercialOrder.findUniqueOrThrow({
          where: { id: order.id },
        })
        expect(releasedOrder.amountPaidMinor).toBe(0)
        expect(releasedOrder.paymentStatus).toBe("PENDING")
        const afterRelease = await balances()
        expect(balance(afterRelease, "CASH")).toBe("5000")
        expect(balance(afterRelease, "RECEIVABLE")).toBe("10000")
        expect(balance(afterRelease, "CUSTOMER_ADVANCE")).toBe("5000")
        expect(balance(afterRelease, "SALES")).toBe("0")
        expect((await statement("3")).totals).toEqual(settledStatement.totals)
        const collections = await listCommercialOrderPaymentsPage(db, {
          tenantId,
          defaultCurrencyCode: "NGN",
        })
        expect(collections.items).toHaveLength(0)
        expect(collections.totalCount).toBe(0)
      } finally {
        if (tenantId)
          await db.$transaction(
            async (tx) => {
              await tx.commercialOrderPayment.deleteMany({
                where: { tenantId },
              })
              await tx.customerLedgerCommand.deleteMany({ where: { tenantId } })
              await tx.customerLedgerAllocationRelease.deleteMany({
                where: { allocation: { credit: { tenantId } } },
              })
              await tx.customerLedgerAllocation.deleteMany({
                where: { credit: { tenantId } },
              })
              await tx.customerLedgerReceipt.deleteMany({
                where: { entry: { tenantId } },
              })
              await tx.customerLedgerEntry.deleteMany({ where: { tenantId } })
              await tx.customerLedgerAccount.deleteMany({ where: { tenantId } })
              await tx.commercialOrder.deleteMany({ where: { tenantId } })
              if (bookId) {
                await tx.financeCommand.deleteMany({ where: { bookId } })
                await tx.financeJournalLine.deleteMany({ where: { bookId } })
                await tx.financeJournalEntry.deleteMany({ where: { bookId } })
                await tx.financeAccount.deleteMany({ where: { bookId } })
                await tx.financeBook.delete({ where: { id: bookId } })
              }
              await tx.tenant.delete({ where: { id: tenantId } })
            },
            { maxWait: 10000, timeout: 30000 },
          )
        await db.user.delete({ where: { id: user.id } })
      }
    }, 180000)
  },
)
