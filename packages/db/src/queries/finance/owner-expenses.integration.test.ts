import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { getFinanceBill } from "./bill-reads"
import { payFinanceBill, recordFinanceExpense } from "./bills"
import { getFinanceAccountBalances } from "./reads"

describeWithServiceCommerceDatabase("owner-funded expenses", () => {
  test("owner capital settles expense debt without reducing business cash", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const user = await db.user.create({
      data: {
        email: `finance-owner-${suffix}@example.invalid`,
        name: "Owner-funded expense acceptance",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `finance-owner-${suffix}`,
          name: "Owner-funded expense acceptance",
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

      const expense = accounts.find(
        (account) => account.purpose === "OPERATING_EXPENSE",
      )
      const capital = accounts.find((account) => account.purpose === "CAPITAL")
      if (!expense || !capital) throw new Error("Missing fixture accounts")
      const input = {
        ...actor,
        bookId,
        clientCommandId: "owner-expense",
        payeeName: "QA supplier",
        description: "Owner-funded transport",
        incurredAt: new Date("2026-02-01"),
        lines: [
          {
            accountId: expense.id,
            description: "Transport",
            amountMinor: "10000",
          },
        ],
        payment: {
          funding: "OWNER_CAPITAL" as const,
          amountMinor: "4000",
          effectiveAt: new Date("2026-02-01"),
        },
      }
      const result = await recordFinanceExpense(db, input)
      expect(await recordFinanceExpense(db, input)).toEqual(result)
      const detail = await getFinanceBill(db, {
        ...actor,
        bookId,
        billId: result.id,
      })
      expect(detail.outstandingMinor).toBe("6000")
      expect(detail.payments[0]?.funding).toBe("OWNER_CAPITAL")
      await expect(
        payFinanceBill(db, {
          ...actor,
          bookId,
          billId: result.id,
          clientCommandId: "wrong-account",
          accountId: capital.id,
          amountMinor: "100",
          effectiveAt: new Date("2026-02-02"),
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      const payment = {
        ...actor,
        bookId,
        billId: result.id,
        clientCommandId: "owner-rest",
        funding: "OWNER_CAPITAL" as const,
        amountMinor: "6000",
        effectiveAt: new Date("2026-02-02"),
      }
      const paid = await payFinanceBill(db, payment)
      expect(await payFinanceBill(db, payment)).toEqual(paid)
      const balances = await getFinanceAccountBalances(db, { ...actor, bookId })
      const balance = (purpose: string) =>
        balances.accounts.find((account) => account.purpose === purpose)
          ?.balanceMinor
      expect(balance("CAPITAL")).toBe("10000")
      expect(balance("OPERATING_EXPENSE")).toBe("10000")
      expect(balance("PAYABLE")).toBe("0")
      expect(balance("CASH")).toBe("0")
      expect(balance("BANK")).toBe("0")
      expect(
        await db.financeJournalEntry.count({
          where: { bookId, sourceKind: "OWNER_BILL_PAYMENT" },
        }),
      ).toBe(2)
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
