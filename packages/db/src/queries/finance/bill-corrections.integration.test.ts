import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import {
  reverseFinanceBillPayment,
  voidFinanceExpense,
} from "./bill-corrections"
import { getFinanceBill, listFinanceBills } from "./bill-reads"
import { payFinanceBill, recordFinanceExpense } from "./bills"
import { getFinanceAccountBalances } from "./reads"

describeWithServiceCommerceDatabase("expense corrections", () => {
  test("reverse owner and bank payments before cancelling, without erasing financial history", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const user = await db.user.create({
      data: {
        email: `finance-corrections-${suffix}@example.invalid`,
        name: "Finance correction acceptance",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `finance-corrections-${suffix}`,
          name: "Finance correction acceptance",
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
      const bank = accounts.find((account) => account.purpose === "BANK")
      if (!expense || !bank) throw new Error("Missing fixture accounts")
      const created = await recordFinanceExpense(db, {
        ...actor,
        bookId,
        clientCommandId: "expense",
        payeeName: "QA vendor",
        description: "Erroneous transport",
        incurredAt: new Date("2026-02-01"),
        lines: [
          {
            accountId: expense.id,
            description: "Transport",
            amountMinor: "10000",
          },
        ],
        payment: {
          funding: "OWNER_CAPITAL",
          amountMinor: "4000",
          effectiveAt: new Date("2026-02-01"),
        },
      })
      const paid = await payFinanceBill(db, {
        ...actor,
        bookId,
        billId: created.id,
        clientCommandId: "bank-payment",
        accountId: bank.id,
        amountMinor: "6000",
        effectiveAt: new Date("2026-02-02"),
      })
      const correction = {
        ...actor,
        bookId,
        reason: "Duplicate expense entered in error",
        effectiveAt: new Date("2026-02-04"),
      }
      await expect(
        voidFinanceExpense(db, {
          ...correction,
          billId: created.id,
          clientCommandId: "void-paid",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const detail = await getFinanceBill(db, {
        ...actor,
        bookId,
        billId: created.id,
      })
      const owner = detail.payments.find(
        (payment) => payment.funding === "OWNER_CAPITAL",
      )
      if (!owner) throw new Error("Missing owner payment")
      const ownerCorrection = {
        ...correction,
        paymentId: owner.id,
        clientCommandId: "reverse-owner",
      }
      const reversed = await reverseFinanceBillPayment(db, ownerCorrection)
      expect(await reverseFinanceBillPayment(db, ownerCorrection)).toEqual(
        reversed,
      )
      expect(
        (await getFinanceBill(db, { ...actor, bookId, billId: created.id }))
          .paidMinor,
      ).toBe("6000")
      await reverseFinanceBillPayment(db, {
        ...correction,
        paymentId: paid.id,
        clientCommandId: "reverse-bank",
      })
      await expect(
        reverseFinanceBillPayment(db, {
          ...ownerCorrection,
          clientCommandId: "reverse-again",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        voidFinanceExpense(db, {
          ...correction,
          billId: created.id,
          clientCommandId: "void-too-early",
          effectiveAt: new Date("2026-02-03"),
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      const cancel = {
        ...correction,
        billId: created.id,
        clientCommandId: "void",
      }
      const cancelled = await voidFinanceExpense(db, cancel)
      expect(await voidFinanceExpense(db, cancel)).toEqual(cancelled)
      await expect(
        payFinanceBill(db, {
          ...actor,
          bookId,
          billId: created.id,
          clientCommandId: "pay-void",
          accountId: bank.id,
          amountMinor: "1",
          effectiveAt: new Date("2026-02-05"),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const final = await getFinanceBill(db, {
        ...actor,
        bookId,
        billId: created.id,
      })
      expect(final.totalMinor).toBe("10000")
      expect(final.paidMinor).toBe("0")
      expect(final.outstandingMinor).toBe("0")
      expect(final.voidReason).toBe(correction.reason)
      expect(final.payments).toHaveLength(2)
      expect(
        final.payments.every(
          (payment) =>
            payment.reversedAt && payment.reversalReason === correction.reason,
        ),
      ).toBe(true)
      const balances = await getFinanceAccountBalances(db, { ...actor, bookId })
      expect(
        balances.accounts.every((account) => account.balanceMinor === "0"),
      ).toBe(true)
      expect((await listFinanceBills(db, { ...actor, bookId })).count).toBe(0)
      const voids = await listFinanceBills(db, {
        ...actor,
        bookId,
        status: "VOID",
      })
      expect(voids.count).toBe(1)
      expect(voids.items[0]?.status).toBe("VOID")
      expect(voids.summary.incurredMinor).toBe("0")
      expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(6)
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
