import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { reverseFinanceCashAdjustment } from "./cash-adjustment-reversals"
import { adjustFinanceCashCount } from "./cash-adjustments"
import { getFinanceCashCount, recordFinanceCashCount } from "./cash-counts"
import { recordFinanceMoneyMovement } from "./money"
import { getFinanceAccountBalances } from "./reads"

describeWithServiceCommerceDatabase("cash count accounting", () => {
  test("count preserves differences and flags later backdated postings without adjusting cash", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const user = await db.user.create({
      data: {
        email: `finance-counts-${suffix}@example.invalid`,
        name: "Finance cash-count acceptance",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `finance-counts-${suffix}`,
          name: "Finance cash-count acceptance",
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
      if (!cash) throw new Error("Missing cash account")
      const count = {
        ...actor,
        bookId,
        accountId: cash.id,
        clientCommandId: "count",
        asOf: new Date("2026-02-03"),
        observedBalanceMinor: "0",
        reference: "Till count",
      }
      const result = await recordFinanceCashCount(db, count)
      expect(await recordFinanceCashCount(db, count)).toEqual(result)
      expect(
        (
          await getFinanceCashCount(db, {
            ...actor,
            bookId,
            countId: result.id,
          })
        ).status,
      ).toBe("MATCHED")
      await recordFinanceMoneyMovement(db, {
        ...actor,
        bookId,
        accountId: cash.id,
        clientCommandId: "later",
        kind: "OWNER_CONTRIBUTION",
        amountMinor: "1000",
        description: "Later funding",
        effectiveAt: new Date("2026-02-04"),
      })
      expect(
        (
          await getFinanceCashCount(db, {
            ...actor,
            bookId,
            countId: result.id,
          })
        ).reviewRequired,
      ).toBe(false)
      await recordFinanceMoneyMovement(db, {
        ...actor,
        bookId,
        accountId: cash.id,
        clientCommandId: "backdated",
        kind: "OWNER_CONTRIBUTION",
        amountMinor: "500",
        description: "Backdated funding",
        effectiveAt: new Date("2026-02-02"),
      })
      const stale = await getFinanceCashCount(db, {
        ...actor,
        bookId,
        countId: result.id,
      })
      expect(stale.status).toBe("REVIEW_REQUIRED")
      expect(stale.expectedBalanceMinor).toBe("0")
      const recount = await recordFinanceCashCount(db, {
        ...count,
        clientCommandId: "recount",
        observedBalanceMinor: "450",
      })
      const difference = await getFinanceCashCount(db, {
        ...actor,
        bookId,
        countId: recount.id,
      })
      expect(difference.status).toBe("DIFFERENCE")
      expect(difference.expectedBalanceMinor).toBe("500")
      expect(difference.differenceMinor).toBe("-50")
      expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(2)
      await expect(
        recordFinanceCashCount(db, { ...count, observedBalanceMinor: "1" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        getFinanceCashCount(db, {
          ...actor,
          tenantId: "other",
          bookId,
          countId: result.id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      const adjustment = {
        ...actor,
        bookId,
        countId: recount.id,
        clientCommandId: "adjust",
        expectedSnapshotSequence: "2",
        reason: "Investigated till shortage",
      }
      await expect(
        adjustFinanceCashCount(db, {
          ...adjustment,
          expectedSnapshotSequence: "1",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        adjustFinanceCashCount(db, { ...adjustment, countId: result.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const posted = await adjustFinanceCashCount(db, adjustment)
      expect(await adjustFinanceCashCount(db, adjustment)).toEqual(posted)
      const adjusted = await getFinanceCashCount(db, {
        ...actor,
        bookId,
        countId: recount.id,
      })
      expect(adjusted.status).toBe("ADJUSTED")
      expect(adjusted.expectedBalanceMinor).toBe("500")
      expect(adjusted.differenceMinor).toBe("-50")
      expect(adjusted.adjustment?.id).toBe(posted.id)
      const reversal = {
        ...actor,
        bookId,
        entryId: posted.id,
        clientCommandId: "reverse-adjustment",
        expectedSnapshotSequence: "3",
        reason: "Recount confirmed the shortage was entered in error",
        effectiveAt: count.asOf,
      }
      await expect(
        reverseFinanceCashAdjustment(db, {
          ...reversal,
          expectedSnapshotSequence: "2",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        reverseFinanceCashAdjustment(db, { ...reversal, reason: " " }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        reverseFinanceCashAdjustment(db, {
          ...reversal,
          effectiveAt: new Date("2026-02-02T00:00:00Z"),
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await db.financeBook.update({
        where: { id: bookId },
        data: { closedThrough: new Date("2026-02-04T00:00:00Z") },
      })
      await expect(
        reverseFinanceCashAdjustment(db, {
          ...reversal,
          effectiveAt: new Date("2026-02-04T00:00:00Z"),
        }),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      await db.financeBook.update({
        where: { id: bookId },
        data: { closedThrough: null },
      })
      const reversed = await reverseFinanceCashAdjustment(db, reversal)
      expect(await reverseFinanceCashAdjustment(db, reversal)).toEqual(reversed)
      await expect(
        reverseFinanceCashAdjustment(db, {
          ...reversal,
          reason: "Changed reason on replay",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        reverseFinanceCashAdjustment(db, {
          ...reversal,
          tenantId: "other-tenant",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        reverseFinanceCashAdjustment(db, {
          ...reversal,
          actorUserId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        reverseFinanceCashAdjustment(db, {
          ...reversal,
          entryId: reversed.id,
          clientCommandId: "reverse-wrong-source",
          expectedSnapshotSequence: "4",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      const reversedCount = await getFinanceCashCount(db, {
        ...actor,
        bookId,
        countId: recount.id,
      })
      expect(reversedCount.status).toBe("ADJUSTMENT_REVERSED")
      expect(reversedCount.reviewRequired).toBe(false)
      expect(reversedCount.expectedBalanceMinor).toBe("500")
      expect(reversedCount.differenceMinor).toBe("-50")
      expect(reversedCount.adjustment?.description).toBe(
        adjusted.adjustment?.description,
      )
      expect(reversedCount.adjustment?.reversal?.id).toBe(reversed.id)
      await expect(
        reverseFinanceCashAdjustment(db, {
          ...reversal,
          clientCommandId: "duplicate-adjustment-reversal",
          expectedSnapshotSequence: "4",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await recordFinanceMoneyMovement(db, {
        ...actor,
        bookId,
        accountId: cash.id,
        clientCommandId: "unrelated-backdated-after-reversal",
        kind: "OWNER_CONTRIBUTION",
        amountMinor: "1",
        description: "Unrelated correction after reversal",
        effectiveAt: new Date("2026-02-02T00:00:00Z"),
      })
      const staleAfterUnrelatedEntry = await getFinanceCashCount(db, {
        ...actor,
        bookId,
        countId: recount.id,
      })
      expect(staleAfterUnrelatedEntry.status).toBe("REVIEW_REQUIRED")
      expect(staleAfterUnrelatedEntry.reviewRequired).toBe(true)
      expect(staleAfterUnrelatedEntry.expectedBalanceMinor).toBe("500")
      expect(staleAfterUnrelatedEntry.differenceMinor).toBe("-50")
      expect(staleAfterUnrelatedEntry.adjustment?.reversal?.id).toBe(
        reversed.id,
      )
      const balances = await getFinanceAccountBalances(db, { ...actor, bookId })
      expect(
        balances.accounts.find((account) => account.id === cash.id)
          ?.balanceMinor,
      ).toBe("1501")
      expect(
        balances.accounts.find((account) => account.code === "CASH_SHORTAGE")
          ?.balanceMinor,
      ).toBe("0")
      await expect(
        adjustFinanceCashCount(db, {
          ...adjustment,
          clientCommandId: "duplicate-adjust",
          expectedSnapshotSequence: "5",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
    } finally {
      // Only run-owned synthetic acceptance data is removed; no merchant IDs
      // are accepted from environment variables or external input.
      if (bookId)
        await db.$transaction(
          async (tx) => {
            await tx.financeReconciliation.deleteMany({ where: { bookId } })
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
