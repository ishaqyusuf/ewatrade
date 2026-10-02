import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { getFinanceBill, listFinanceBills } from "./bill-reads"
import { payFinanceBill, recordFinanceExpense } from "./bills"
import { getFinanceAccountBalances } from "./reads"

describeWithServiceCommerceDatabase("expense and payable accounting", () => {
  test("partial payments, retries, concurrent overpayment and failed initial payment stay reconciled", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const user = await db.user.create({
      data: {
        email: `finance-bills-${suffix}@example.invalid`,
        name: "Finance bill acceptance",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `finance-bills-${suffix}`,
          name: "Finance bill acceptance",
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
      const accounts = await db.financeAccount.findMany({ where: { bookId } })
      const bank = accounts.find((account) => account.purpose === "BANK")
      const expense = accounts.find(
        (account) => account.purpose === "OPERATING_EXPENSE",
      )
      if (!bank || !expense) throw new Error("Missing acceptance accounts")
      const input = {
        ...actor,
        bookId,
        clientCommandId: "expense",
        payeeName: "Synthetic supplier",
        description: "Transport",
        incurredAt: new Date("2026-02-01"),
        lines: [
          {
            accountId: expense.id,
            description: "Transport",
            amountMinor: "10000",
          },
        ],
        payment: {
          accountId: bank.id,
          amountMinor: "4000",
          effectiveAt: new Date("2026-02-01"),
        },
      }
      const result = await recordFinanceExpense(db, input)
      expect(await recordFinanceExpense(db, input)).toEqual(result)
      expect(
        (await getFinanceBill(db, { ...actor, bookId, billId: result.id }))
          .outstandingMinor,
      ).toBe("6000")
      const payment = {
        ...actor,
        bookId,
        billId: result.id,
        accountId: bank.id,
        amountMinor: "4000",
        effectiveAt: new Date("2026-02-02"),
      }
      const simultaneous = await Promise.allSettled([
        payFinanceBill(db, { ...payment, clientCommandId: "payment-a" }),
        payFinanceBill(db, { ...payment, clientCommandId: "payment-b" }),
      ])
      expect(
        simultaneous.filter((item) => item.status === "fulfilled"),
      ).toHaveLength(1)
      expect(
        simultaneous.filter((item) => item.status === "rejected"),
      ).toHaveLength(1)
      const bill = await getFinanceBill(db, {
        ...actor,
        bookId,
        billId: result.id,
      })
      expect(bill.paidMinor).toBe("8000")
      expect(bill.outstandingMinor).toBe("2000")
      expect(bill.payments).toHaveLength(2)
      await expect(
        recordFinanceExpense(db, {
          ...input,
          clientCommandId: "bad-initial",
          payment: { ...input.payment, amountMinor: "11000" },
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const list = await listFinanceBills(db, {
        ...actor,
        bookId,
        status: "PARTIAL",
      })
      expect(list.count).toBe(1)
      expect(list.summary).toEqual({
        incurredMinor: "10000",
        paidAgainstBillsMinor: "8000",
        outstandingMinor: "2000",
      })
      const balances = await getFinanceAccountBalances(db, { ...actor, bookId })
      expect(
        balances.accounts.find((account) => account.purpose === "PAYABLE")
          ?.balanceMinor,
      ).toBe("2000")
      expect(
        balances.accounts.find(
          (account) => account.purpose === "OPERATING_EXPENSE",
        )?.balanceMinor,
      ).toBe("10000")
      expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(3)
    } finally {
      // Only run-owned synthetic acceptance data is removed; no merchant IDs
      // are accepted from environment variables or external input.
      if (bookId)
        await db.$transaction(
          async (tx) => {
            await tx.financeBillPayment.deleteMany({ where: { bookId } })
            await tx.financeBillLine.deleteMany({ where: { bookId } })
            await tx.financeBill.deleteMany({ where: { bookId } })
            await tx.financeCommand.deleteMany({ where: { bookId } })
            await tx.financeJournalLine.deleteMany({ where: { bookId } })
            await tx.financeJournalEntry.deleteMany({ where: { bookId } })
            await tx.financeAccount.deleteMany({ where: { bookId } })
            await tx.financeBook.delete({ where: { id: bookId } })
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
      if (tenantId) await db.tenant.delete({ where: { id: tenantId } })
      await db.user.delete({ where: { id: user.id } })
    }
  }, 180_000)
})
