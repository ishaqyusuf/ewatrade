import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createCommercialOrder } from "../commercial-orders"
import { recordCommercialOrderPayment } from "../commercial-payments"
import {
  createFinanceBook,
  createFinanceMoneyAccount,
  updateFinanceMoneyAccountPayments,
} from "./accounts"
import { postCommerceFinanceJournalInTransaction } from "./posting"
import { getFinanceAccountBalances } from "./reads"

describeWithServiceCommerceDatabase("order receiving accounts", () => {
  test("zero-catalog sales, later receipts and refunds post once; wrong-method, paused, invalid accounts and closed periods roll back", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const user = await db.user.create({
      data: {
        name: "Collection QA",
        email: `collection-${runId}@example.invalid`,
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          name: "Collection QA",
          slug: `collection-${runId}`,
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
        data: { tenantId, name: "No catalog", slug: "main", status: "ACTIVE" },
      })
      const cash = await db.financeAccount.findFirstOrThrow({
        where: { bookId, purpose: "CASH" },
      })
      const palm = await createFinanceMoneyAccount(db, {
        ...actor,
        bookId,
        code: "1110",
        name: "Palm Pay",
        purpose: "BANK",
      })
      const opay = await createFinanceMoneyAccount(db, {
        ...actor,
        bookId,
        code: "1120",
        name: "Opay",
        purpose: "BANK",
      })
      expect(await db.catalogItem.count({ where: { tenantId } })).toBe(0)
      const customer = await db.customer.create({
        data: { tenantId, name: "Feed buyer" },
      })
      const base = { ...actor, storeId: store.id, schemaVersion: 1 }
      const balances = async () =>
        (await getFinanceAccountBalances(db, { ...actor, bookId: book.id }))
          .accounts
      for (const [index, account] of [cash, palm, opay].entries()) {
        const input = {
          ...base,
          clientOrderId: `${runId}:${index}`,
          customerId: index === 1 ? customer.id : undefined,
          fulfillNow: true,
          lines: [
            {
              custom: "quick_sale" as const,
              amountMinor: 1000,
              description: "Feed sale",
            },
          ],
          initialPayment: {
            amountMinor: 1000,
            clientPaymentId: `${runId}:${index}:paid`,
            method:
              index === 0 ? ("cash" as const) : ("bank_transfer" as const),
            moneyAccountId: account.id,
          },
        }
        const order = await createCommercialOrder(db, input)
        expect(order).toMatchObject({
          amountPaidMinor: 1000,
          balanceDueMinor: 0,
          status: "COMPLETED",
        })
        expect((await createCommercialOrder(db, input)).id).toBe(order.id)
        expect(
          await db.financeJournalEntry.count({
            where: {
              bookId,
              sourceKind: "COMMERCIAL_ORDER_COLLECTION",
              sourceId: { in: order.payments.map((payment) => payment.id) },
            },
          }),
        ).toBe(1)
        await expect(
          createCommercialOrder(db, {
            ...input,
            initialPayment: {
              ...input.initialPayment,
              moneyAccountId: account.id === cash.id ? palm.id : cash.id,
            },
          }),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
        expect(
          (await balances()).find((row) => row.id === account.id)?.balanceMinor,
        ).toBe("1000")
        await expect(
          db.$transaction(
            (tx) =>
              postCommerceFinanceJournalInTransaction(tx, {
                tenantId: tenant.id,
                orderId: order.id,
                event: "BILLED",
              }),
            { timeout: 30000 },
          ),
        ).rejects.toMatchObject({ code: "CONFLICT" })
      }
      expect(
        await db.catalogItem.count({ where: { tenantId, systemRole: null } }),
      ).toBe(0)
      const open = await createCommercialOrder(db, {
        ...base,
        clientOrderId: `${runId}:later`,
        lines: [
          {
            custom: "quick_sale",
            amountMinor: 2000,
            description: "Later feed sale",
          },
        ],
      })
      const payment = {
        ...actor,
        orderId: open.id,
        clientPaymentId: `${runId}:later:pay`,
        amountMinor: 500,
        method: "bank_transfer" as const,
        moneyAccountId: palm.id,
      }
      const [first, replay] = await Promise.all([
        recordCommercialOrderPayment(db, payment),
        recordCommercialOrderPayment(db, payment),
      ])
      expect(first).toEqual(replay)
      await expect(
        recordCommercialOrderPayment(db, {
          ...payment,
          moneyAccountId: opay.id,
        }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
      const expenses = await db.financeAccount.findFirstOrThrow({
        where: { bookId, purpose: "OPERATING_EXPENSE" },
      })
      const invalid = {
        ...payment,
        clientPaymentId: `${runId}:invalid`,
        moneyAccountId: expenses.id,
      }
      await expect(
        recordCommercialOrderPayment(db, invalid),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(
        await db.commercialOrderPayment.count({ where: { tenantId } }),
      ).toBe(4)
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: new Date(Date.now() + 60000) },
      })
      await expect(
        recordCommercialOrderPayment(db, {
          ...payment,
          clientPaymentId: `${runId}:closed`,
        }),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect(
        (await db.commercialOrder.findUniqueOrThrow({ where: { id: open.id } }))
          .amountPaidMinor,
      ).toBe(500)
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: null },
      })
      // Bank accounts don't take cash; a paused account takes no new money.
      await expect(
        recordCommercialOrderPayment(db, {
          ...payment,
          clientPaymentId: `${runId}:cash-into-bank`,
          method: "cash",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await updateFinanceMoneyAccountPayments(db, {
        ...actor,
        bookId,
        accountId: palm.id,
        paymentMethods: ["bank_transfer", "pos"],
        availableForPayments: false,
      })
      expect(
        await db.financeMoneyAccountPaymentEvent.findMany({
          where: { accountId: palm.id },
          select: { actorUserId: true, paymentMethods: true, paused: true },
        }),
      ).toEqual([
        {
          actorUserId: user.id,
          paymentMethods: ["BANK_TRANSFER", "POS"],
          paused: true,
        },
      ])
      expect(await recordCommercialOrderPayment(db, payment)).toEqual(first)
      await expect(
        recordCommercialOrderPayment(db, {
          ...payment,
          clientPaymentId: `${runId}:paused`,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(
        await db.commercialOrderPayment.count({ where: { tenantId } }),
      ).toBe(4)
      // Refunds still come out of a paused account; an old client that sends
      // no account gets the order's only receiving account.
      await recordCommercialOrderPayment(db, {
        ...payment,
        type: "refund",
        moneyAccountId: undefined,
        clientPaymentId: `${runId}:refund`,
      })
      expect(
        (await balances()).find((row) => row.id === palm.id)?.balanceMinor,
      ).toBe("1000")
      const entries = await db.financeJournalEntry.findMany({
        where: { bookId },
        include: { lines: true },
      })
      expect(entries).toHaveLength(5)
      for (const entry of entries)
        expect(
          entry.lines.reduce(
            (sum, row) => sum + row.debitMinor - row.creditMinor,
            0n,
          ),
        ).toBe(0n)
    } finally {
      if (tenantId)
        await db.$transaction(
          async (tx) => {
            await tx.commercialOrderPayment.deleteMany({ where: { tenantId } })
            await tx.commercialServiceFulfillment.deleteMany({
              where: { tenantId },
            })
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
