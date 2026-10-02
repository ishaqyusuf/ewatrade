import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  listFinanceAccountActivity,
  listFinanceAccountLedger,
} from "./account-activity"
import { createFinanceBook } from "./accounts"
import { reverseFinanceBillPayment } from "./bill-corrections"
import { payFinanceBill, recordFinanceExpense } from "./bills"
import { recordFinanceMoneyMovement } from "./money"
import { getFinanceReports } from "./reports"

describeWithServiceCommerceDatabase("journal financial reports", () => {
  test("accrual period totals exclude payments and owner funding, and snapshots stay fixed", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const user = await db.user.create({
      data: {
        email: `finance-reports-${suffix}@example.invalid`,
        name: "Finance report acceptance",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `finance-reports-${suffix}`,
          name: "Finance report acceptance",
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

      const cash = accounts.find((account) => account.purpose === "CASH")
      const bank = accounts.find((account) => account.purpose === "BANK")
      if (!cash || !bank) throw new Error("Missing fixture accounts")
      const expense = accounts.find(
        (account) => account.purpose === "OPERATING_EXPENSE",
      )
      if (!expense) throw new Error("Missing expense account")
      await recordFinanceMoneyMovement(db, {
        ...actor,
        bookId,
        clientCommandId: "opening",
        accountId: cash.id,
        kind: "OWNER_CONTRIBUTION",
        amountMinor: "10000",
        description: "Initial funding",
        effectiveAt: new Date("2026-01-01"),
      })
      const bill = await recordFinanceExpense(db, {
        ...actor,
        bookId,
        clientCommandId: "bill",
        payeeName: "QA supplier",
        description: "Accrued expense",
        incurredAt: new Date("2026-02-01"),
        lines: [
          {
            accountId: expense.id,
            description: "Service",
            amountMinor: "3000",
          },
        ],
      })
      const payment = await payFinanceBill(db, {
        ...actor,
        bookId,
        billId: bill.id,
        clientCommandId: "payment",
        accountId: cash.id,
        amountMinor: "1000",
        effectiveAt: new Date("2026-03-01"),
      })
      const range = {
        ...actor,
        bookId,
        from: new Date("2026-02-01"),
        through: new Date("2026-02-28T23:59:59.999Z"),
      }
      const first = await getFinanceReports(db, range)
      expect(first.trialBalance.balanced).toBe(true)
      expect(first.trialBalance.debitMinor).toBe("13000")
      expect(first.trialBalance.creditMinor).toBe("13000")
      expect(first.profitAndLoss.revenueMinor).toBe("0")
      expect(first.profitAndLoss.expensesMinor).toBe("3000")
      expect(first.profitAndLoss.netProfitMinor).toBe("-3000")
      expect(
        first.trialBalance.accounts.find(
          (account) => account.purpose === "PAYABLE",
        )?.closingBalanceMinor,
      ).toBe("3000")
      expect(first.completeness).toBe("INCOMPLETE_SOURCE_COVERAGE")
      const expenseLedger = await listFinanceAccountLedger(db, {
        ...range,
        accountId: expense.id,
        snapshotSequence: first.snapshotSequence,
      })
      expect(expenseLedger.debitMinor).toBe(first.profitAndLoss.expensesMinor)
      expect(expenseLedger.closingBalanceMinor).toBe("3000")
      expect(expenseLedger.normalSide).toBe("DEBIT")
      const payable = accounts.find((account) => account.purpose === "PAYABLE")
      if (!payable) throw new Error("Missing payable account")
      const payableLedger = await listFinanceAccountLedger(db, {
        ...range,
        accountId: payable.id,
        snapshotSequence: first.snapshotSequence,
      })
      expect(payableLedger.normalSide).toBe("CREDIT")
      expect(payableLedger.creditMinor).toBe("3000")
      expect(payableLedger.items[0]?.balanceMinor).toBe("3000")
      await expect(
        listFinanceAccountActivity(db, { ...range, accountId: payable.id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })

      expect(first.cashFlow.openingMinor).toBe("10000")
      expect(first.cashFlow.operatingMinor).toBe("0")
      expect(first.cashFlow.reconciled).toBe(true)

      const march = await getFinanceReports(db, {
        ...range,
        from: new Date("2026-03-01"),
        through: new Date("2026-03-31"),
      })
      expect(march.profitAndLoss.expensesMinor).toBe("0")
      expect(march.cashFlow.operatingMinor).toBe("-1000")
      expect(march.cashFlow.closingMinor).toBe("9000")
      expect(march.cashFlow.reconciled).toBe(true)

      expect(
        march.trialBalance.accounts.find(
          (account) => account.purpose === "PAYABLE",
        )?.closingBalanceMinor,
      ).toBe("2000")
      await recordFinanceExpense(db, {
        ...actor,
        bookId,
        clientCommandId: "backdated-owner-expense",
        payeeName: "QA supplier",
        description: "Owner expense",
        incurredAt: new Date("2026-02-02"),
        lines: [
          {
            accountId: expense.id,
            description: "Owner expense",
            amountMinor: "2000",
          },
        ],
        payment: {
          funding: "OWNER_CAPITAL",
          amountMinor: "2000",
          effectiveAt: new Date("2026-02-02"),
        },
      })
      const pinned = await getFinanceReports(db, {
        ...range,
        snapshotSequence: first.snapshotSequence,
      })
      expect(pinned).toEqual(first)
      const current = await getFinanceReports(db, range)
      expect(current.profitAndLoss.netProfitMinor).toBe("-5000")
      expect(current.trialBalance.balanced).toBe(true)
      expect(
        current.trialBalance.accounts.find(
          (account) => account.purpose === "CASH",
        )?.closingBalanceMinor,
      ).toBe("10000")
      expect(
        current.trialBalance.accounts.find(
          (account) => account.purpose === "CAPITAL",
        )?.closingBalanceMinor,
      ).toBe("12000")

      expect(current.cashFlow.financingMinor).toBe("0")
      expect(current.cashFlow.closingMinor).toBe("10000")
      await reverseFinanceBillPayment(db, {
        ...actor,
        bookId,
        paymentId: payment.id,
        clientCommandId: "reverse-payment",
        effectiveAt: new Date("2026-03-02"),
        reason: "Correct duplicate payment",
      })
      const reversed = await getFinanceReports(db, {
        ...range,
        from: new Date("2026-03-01"),
        through: new Date("2026-03-31"),
      })
      expect(reversed.cashFlow.operatingMinor).toBe("0")
      expect(reversed.cashFlow.classificationComplete).toBe(true)
      expect(reversed.cashFlow.reconciled).toBe(true)
      expect(reversed.cashFlow.closingMinor).toBe("10000")
      await expect(
        getFinanceReports(db, { ...range, tenantId: "wrong-tenant" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        getFinanceReports(db, { ...range, from: new Date("2025-01-01") }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        getFinanceReports(db, { ...range, snapshotSequence: "999999" }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
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
            await tx.financeJournalEntry.deleteMany({
              where: { bookId, reversalOfId: { not: null } },
            })
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
