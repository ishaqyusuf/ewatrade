import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  listCommercialOrderPaymentsPage,
  recordCommercialCreditSettlementInTransaction,
  recordCommercialOrderPaymentInTransaction,
} from "../commercial-payments"
import { createFinanceBook } from "../finance/accounts"
import { postFinanceJournalInTransaction } from "../finance/posting"
import { ensureCustomerLedgerAccount } from "./accounts"

describeWithServiceCommerceDatabase(
  "customer credit Order settlement adapter",
  () => {
    test("settles and releases existing credit without creating refundable cash", async () => {
      const { prisma: db } = await import("../../client")
      const id = randomUUID()
      const user = await db.user.create({
        data: {
          name: "Settlement QA",
          email: `settlement-${id}@example.invalid`,
        },
      })
      let tenantId: string | undefined
      let bookId: string | undefined
      try {
        const tenant = await db.tenant.create({
          data: {
            name: "Settlement QA",
            slug: `settlement-${id}`,
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
            name: "Settlement store",
            slug: "settlement-store",
            status: "ACTIVE",
          },
        })
        const customer = await db.customer.create({
          data: { tenantId, name: "Settlement customer" },
        })
        const account = await ensureCustomerLedgerAccount(db, {
          ...actor,
          customerId: customer.id,
          currencyCode: "NGN",
        })
        const order = await db.commercialOrder.create({
          data: {
            tenantId,
            storeId: store.id,
            customerId: customer.id,
            clientOrderId: id,
            payloadHash: "adapter-fixture",
            orderNumber: "QA-1",
            currencyCode: "NGN",
            subtotalMinor: 10000,
            totalMinor: 10000,
            createdByUserId: user.id,
          },
        })
        // Adapter fixture represents an already-posted source; source activation has
        // its own acceptance and is not inferred from this test.
        const charge = await db.customerLedgerEntry.create({
          data: {
            tenantId,
            accountId: account.id,
            sequence: BigInt(1),
            kind: "ORDER_CHARGE",
            side: "DEBIT",
            amountMinor: BigInt(10000),
            sourceKind: "QA_ORDER",
            sourceId: order.id,
            orderId: order.id,
            actorUserId: user.id,
            effectiveAt: new Date(),
            description: "Preposted fixture charge",
          },
        })
        const credit = await db.customerLedgerEntry.create({
          data: {
            tenantId,
            accountId: account.id,
            sequence: BigInt(2),
            kind: "OPENING_CREDIT",
            side: "CREDIT",
            amountMinor: BigInt(5000),
            sourceKind: "QA_CREDIT",
            sourceId: id,
            actorUserId: user.id,
            effectiveAt: new Date(),
            description: "Preposted fixture credit",
          },
        })
        const allocation = await db.customerLedgerAllocation.create({
          data: {
            accountId: account.id,
            sequence: BigInt(3),
            creditEntryId: credit.id,
            chargeEntryId: charge.id,
            amountMinor: BigInt(1000),
            actorUserId: user.id,
          },
        })
        const input = {
          ...actor,
          orderId: order.id,
          amountMinor: 1000,
          clientPaymentId: `customer-allocation:${allocation.id}`,
          method: "other" as const,
        }
        const source = { bookId, allocationId: allocation.id }
        const run = () =>
          db.$transaction(
            (tx) =>
              recordCommercialCreditSettlementInTransaction(tx, input, source),
            { timeout: 30000 },
          )
        await expect(run()).rejects.toMatchObject({ code: "INVALID_ORDER" })
        const accounts = await db.financeAccount.findMany({ where: { bookId } })
        const advance = accounts.find(
          (row) => row.purpose === "CUSTOMER_ADVANCE",
        )
        const receivable = accounts.find((row) => row.purpose === "RECEIVABLE")
        if (!advance || !receivable) throw new Error("Missing control accounts")
        await db.$transaction(
          (tx) =>
            postFinanceJournalInTransaction(tx, {
              ...actor,
              bookId: book.id,
              clientCommandId: "fixture-allocation",
              sourceKind: "CUSTOMER_CREDIT_ALLOCATION",
              sourceId: allocation.id,
              description: "Fixture credit allocation",
              effectiveAt: new Date(),
              lines: [
                { accountId: advance.id, side: "DEBIT", amountMinor: "1000" },
                {
                  accountId: receivable.id,
                  side: "CREDIT",
                  amountMinor: "1000",
                },
              ],
            }),
          { timeout: 30000 },
        )
        const settled = await run()
        expect(settled.amountPaidMinor).toBe(1000)
        expect((await run()).id).toBe(settled.id)
        expect(
          (
            await db.commercialOrderPayment.findUniqueOrThrow({
              where: { id: settled.id },
            })
          ).method,
        ).toBe("CUSTOMER_CREDIT")
        const received = await listCommercialOrderPaymentsPage(db, {
          tenantId,
          defaultCurrencyCode: "NGN",
        })
        expect(received.items).toHaveLength(0)
        expect(received.totalCount).toBe(0)
        await expect(
          db.$transaction(
            (tx) =>
              recordCommercialOrderPaymentInTransaction(tx, {
                ...actor,
                orderId: order.id,
                amountMinor: 1,
                clientPaymentId: "invalid-cash-refund",
                method: "cash",
                type: "refund",
              }),
            { timeout: 30000 },
          ),
        ).rejects.toMatchObject({ code: "INVALID_ORDER" })
        const release = await db.customerLedgerAllocationRelease.create({
          data: {
            allocationId: allocation.id,
            sequence: BigInt(4),
            amountMinor: BigInt(1000),
            reason: "Correct allocation",
            actorUserId: user.id,
          },
        })
        const released = await db.$transaction(
          async (tx) => {
            await postFinanceJournalInTransaction(tx, {
              ...actor,
              bookId: book.id,
              clientCommandId: "fixture-release",
              sourceKind: "CUSTOMER_ALLOCATION_RELEASE",
              sourceId: release.id,
              description: "Fixture credit release",
              effectiveAt: new Date(),
              lines: [
                {
                  accountId: receivable.id,
                  side: "DEBIT",
                  amountMinor: "1000",
                },
                { accountId: advance.id, side: "CREDIT", amountMinor: "1000" },
              ],
            })
            return recordCommercialCreditSettlementInTransaction(
              tx,
              {
                ...actor,
                orderId: order.id,
                amountMinor: 1000,
                clientPaymentId: `customer-allocation-release:${release.id}`,
                method: "other",
                type: "refund",
              },
              { bookId: book.id, releaseId: release.id },
            )
          },
          { timeout: 30000 },
        )
        expect(released.amountPaidMinor).toBe(0)
        expect(released.balanceDueMinor).toBe(10000)
        expect(released.paymentStatus).toBe("pending")
        expect(
          (
            await db.commercialOrderPayment.findUniqueOrThrow({
              where: { id: released.id },
            })
          ).customerAllocationReleaseId,
        ).toBe(release.id)
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
            { timeout: 30000 },
          )
        await db.user.delete({ where: { id: user.id } })
      }
    }, 180000)
  },
)
