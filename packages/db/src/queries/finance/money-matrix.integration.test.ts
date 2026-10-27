import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { reverseFinanceCashAdjustment } from "./cash-adjustment-reversals"
import { adjustFinanceCashCount } from "./cash-adjustments"
import { getFinanceCashCount, recordFinanceCashCount } from "./cash-counts"
import { recordFinanceMoneyMovement } from "./money"
import { reverseFinanceMoney } from "./money-reversals"
import { getFinanceAccountBalances } from "./reads"

// Throws from a helper so a mismatched fixture never gets deleted.
function refuseCleanup(mismatch: boolean) {
  if (mismatch) throw new Error("Refusing non-fixture cleanup")
}

// F1.6.05 posting matrix rows 1, 4, 5 and 6: transfer, money-account opening
// balance, money reversal and the cash-count surplus direction.
describeWithServiceCommerceDatabase("money and cash posting matrix", () => {
  test("transfers and openings post once, replay, refuse closed periods; reversals and cash surpluses respect the lock", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const email = `finance-money-matrix-${suffix}@example.invalid`
    const user = await db.user.create({
      data: { email, name: "Money matrix acceptance" },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `finance-money-matrix-${suffix}`,
          name: "Money matrix acceptance",
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
      const startsAt = new Date("2026-01-01T00:00:00Z")
      const book = await createFinanceBook(db, { ...actor, startsAt })
      bookId = book.id
      const scope = { ...actor, bookId }
      const accounts = await db.financeAccount.findMany({ where: { bookId } })
      const account = (purpose: string) => {
        const found = accounts.find((row) => row.purpose === purpose)
        if (!found) throw new Error(`Missing fixture account ${purpose}`)
        return found
      }
      const cash = account("CASH")
      const bank = account("BANK")
      const balance = async (id: string) =>
        (await getFinanceAccountBalances(db, scope)).accounts.find(
          (row) => row.id === id,
        )?.balanceMinor
      const entries = (sourceKind: string) =>
        db.financeJournalEntry.count({ where: { bookId, sourceKind } })
      const lock = (closedThrough: Date | null) =>
        db.financeBook.update({
          where: { id: bookId },
          data: { closedThrough },
        })

      // Row 4: one opening balance per money account, dated at the book start.
      const opening = {
        ...scope,
        clientCommandId: "bank-opening",
        kind: "OPENING_BALANCE" as const,
        accountId: bank.id,
        amountMinor: "50000",
        description: "Bank balance at cutoff",
        effectiveAt: startsAt,
      }
      const openingResult = await recordFinanceMoneyMovement(db, opening)
      expect(await recordFinanceMoneyMovement(db, opening)).toEqual(
        openingResult,
      )
      await expect(
        recordFinanceMoneyMovement(db, { ...opening, amountMinor: "50001" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      // sourceId is the account: a second opening with other details conflicts,
      // an identical one under a new command resolves to the same entry.
      await expect(
        recordFinanceMoneyMovement(db, {
          ...opening,
          clientCommandId: "bank-opening-again",
          amountMinor: "60000",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(
        await recordFinanceMoneyMovement(db, {
          ...opening,
          clientCommandId: "bank-opening-identical",
        }),
      ).toEqual(openingResult)
      await expect(
        recordFinanceMoneyMovement(db, {
          ...opening,
          clientCommandId: "late-opening",
          accountId: cash.id,
          effectiveAt: new Date("2026-01-02T00:00:00Z"),
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      expect(await entries("OPENING_BALANCE")).toBe(1)
      expect(await balance(bank.id)).toBe("50000")
      expect(await balance(account("OPENING_EQUITY").id)).toBe("50000")

      // Once the first period is closed no opening can be dated at the start.
      await lock(new Date("2026-01-31T00:00:00Z"))
      await expect(
        recordFinanceMoneyMovement(db, {
          ...opening,
          clientCommandId: "cash-opening-closed",
          accountId: cash.id,
        }),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      // An identical replay of an already-posted opening still answers.
      expect(await recordFinanceMoneyMovement(db, opening)).toEqual(
        openingResult,
      )
      await lock(null)
      expect(await entries("OPENING_BALANCE")).toBe(1)
      expect(await balance(cash.id)).toBe("0")

      // Row 1: transfer between own money accounts.
      const transfer = {
        ...scope,
        clientCommandId: "bank-to-till",
        kind: "TRANSFER" as const,
        accountId: bank.id,
        destinationAccountId: cash.id,
        amountMinor: "12000",
        description: "Float for the till",
        effectiveAt: new Date("2026-02-10T09:00:00Z"),
      }
      const transferResult = await recordFinanceMoneyMovement(db, transfer)
      expect(await recordFinanceMoneyMovement(db, transfer)).toEqual(
        transferResult,
      )
      await expect(
        recordFinanceMoneyMovement(db, { ...transfer, amountMinor: "12001" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        recordFinanceMoneyMovement(db, {
          ...transfer,
          clientCommandId: "same-account",
          destinationAccountId: bank.id,
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        recordFinanceMoneyMovement(db, {
          ...transfer,
          clientCommandId: "to-expense",
          destinationAccountId: account("OPERATING_EXPENSE").id,
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      expect(await entries("TRANSFER")).toBe(1)
      const transferEntry = await db.financeJournalEntry.findFirstOrThrow({
        where: { bookId, sourceKind: "TRANSFER" },
        include: { lines: true },
      })
      expect(
        transferEntry.lines
          .map((line) => [
            line.accountId,
            line.debitMinor.toString(),
            line.creditMinor.toString(),
          ])
          .sort(),
      ).toEqual(
        [
          [cash.id, "12000", "0"],
          [bank.id, "0", "12000"],
        ].sort(),
      )
      expect(await balance(bank.id)).toBe("38000")
      expect(await balance(cash.id)).toBe("12000")

      await lock(new Date("2026-02-28T00:00:00Z"))
      await expect(
        recordFinanceMoneyMovement(db, {
          ...transfer,
          clientCommandId: "closed-transfer",
          effectiveAt: new Date("2026-02-15T00:00:00Z"),
        }),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      // The lock date itself is closed.
      await expect(
        recordFinanceMoneyMovement(db, {
          ...transfer,
          clientCommandId: "closed-boundary",
          effectiveAt: new Date("2026-02-28T00:00:00Z"),
        }),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect(await recordFinanceMoneyMovement(db, transfer)).toEqual(
        transferResult,
      )
      expect(await entries("TRANSFER")).toBe(1)

      // Row 5: a reversal into a closed period is refused and writes nothing.
      const reversal = {
        ...scope,
        clientCommandId: "undo-float",
        entryId: transferEntry.id,
        reason: "Float was never moved",
        effectiveAt: new Date("2026-02-20T00:00:00Z"),
      }
      await expect(reverseFinanceMoney(db, reversal)).rejects.toMatchObject({
        code: "CLOSED_PERIOD",
      })
      expect(await entries("MONEY_REVERSAL")).toBe(0)
      expect(
        await db.financeCommand.count({
          where: { bookId, clientCommandId: reversal.clientCommandId },
        }),
      ).toBe(0)
      await lock(null)
      const openingEntry = await db.financeJournalEntry.findFirstOrThrow({
        where: { bookId, sourceKind: "OPENING_BALANCE" },
      })
      await expect(
        reverseFinanceMoney(db, {
          ...reversal,
          clientCommandId: "undo-opening",
          entryId: openingEntry.id,
          effectiveAt: new Date("2026-03-01T00:00:00Z"),
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      const open = {
        ...reversal,
        effectiveAt: new Date("2026-03-01T00:00:00Z"),
      }
      const reversed = await reverseFinanceMoney(db, open)
      expect(await reverseFinanceMoney(db, open)).toEqual(reversed)
      expect(await balance(bank.id)).toBe("50000")
      expect(await balance(cash.id)).toBe("0")

      // Row 6 surplus direction: a count above the posted balance.
      const count = await recordFinanceCashCount(db, {
        ...scope,
        accountId: cash.id,
        clientCommandId: "surplus-count",
        asOf: new Date("2026-03-05T00:00:00Z"),
        observedBalanceMinor: "700",
        reference: "Till count",
      })
      const counted = await getFinanceCashCount(db, {
        ...scope,
        countId: count.id,
      })
      expect(counted).toMatchObject({
        status: "DIFFERENCE",
        expectedBalanceMinor: "0",
        differenceMinor: "700",
      })
      const sequence = async () =>
        (
          await db.financeBook.findUniqueOrThrow({ where: { id: bookId } })
        ).lastSequence.toString()
      const adjustment = {
        ...scope,
        countId: count.id,
        clientCommandId: "adjust-surplus",
        expectedSnapshotSequence: await sequence(),
        reason: "Unrecorded cash sale found in the till",
      }
      await lock(new Date("2026-03-10T00:00:00Z"))
      await expect(
        adjustFinanceCashCount(db, adjustment),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect(await entries("CASH_COUNT_ADJUSTMENT")).toBe(0)
      expect(
        await db.financeAccount.count({
          where: { bookId, code: "CASH_SURPLUS" },
        }),
      ).toBe(0)
      await lock(null)
      const posted = await adjustFinanceCashCount(db, adjustment)
      expect(await adjustFinanceCashCount(db, adjustment)).toEqual(posted)
      const surplus = await db.financeAccount.findUniqueOrThrow({
        where: { bookId_code: { bookId, code: "CASH_SURPLUS" } },
      })
      expect(surplus).toMatchObject({
        kind: "INCOME",
        purpose: "OTHER",
        name: "Cash count surplus",
      })
      expect(
        await db.financeAccount.count({
          where: { bookId, code: "CASH_SHORTAGE" },
        }),
      ).toBe(0)
      const adjustmentEntry = await db.financeJournalEntry.findUniqueOrThrow({
        where: { id: posted.id },
        include: { lines: true },
      })
      expect(adjustmentEntry).toMatchObject({
        sourceKind: "CASH_COUNT_ADJUSTMENT",
        sourceId: count.id,
        effectiveAt: new Date("2026-03-05T00:00:00Z"),
      })
      expect(
        adjustmentEntry.lines
          .map((line) => [
            line.accountId,
            line.debitMinor.toString(),
            line.creditMinor.toString(),
          ])
          .sort(),
      ).toEqual(
        [
          [cash.id, "700", "0"],
          [surplus.id, "0", "700"],
        ].sort(),
      )
      expect(await balance(cash.id)).toBe("700")
      expect(await balance(surplus.id)).toBe("700")
      expect(
        await getFinanceCashCount(db, { ...scope, countId: count.id }),
      ).toMatchObject({
        status: "ADJUSTED",
        differenceMinor: "700",
        adjustment: { id: posted.id },
      })
      await expect(
        adjustFinanceCashCount(db, {
          ...adjustment,
          clientCommandId: "adjust-surplus-twice",
          expectedSnapshotSequence: await sequence(),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })

      const undo = {
        ...scope,
        entryId: posted.id,
        clientCommandId: "undo-surplus",
        expectedSnapshotSequence: await sequence(),
        reason: "Sale was already recorded elsewhere",
        effectiveAt: new Date("2026-03-06T00:00:00Z"),
      }
      const undone = await reverseFinanceCashAdjustment(db, undo)
      expect(await reverseFinanceCashAdjustment(db, undo)).toEqual(undone)
      const undoEntry = await db.financeJournalEntry.findFirstOrThrow({
        where: {
          bookId,
          sourceKind: "CASH_COUNT_ADJUSTMENT_REVERSAL",
          reversalOfId: posted.id,
        },
        include: { lines: true },
      })
      expect(
        undoEntry.lines
          .map((line) => [
            line.accountId,
            line.debitMinor.toString(),
            line.creditMinor.toString(),
          ])
          .sort(),
      ).toEqual(
        [
          [cash.id, "0", "700"],
          [surplus.id, "700", "0"],
        ].sort(),
      )
      expect(await balance(cash.id)).toBe("0")
      expect(await balance(surplus.id)).toBe("0")

      const totals = await db.financeJournalLine.groupBy({
        by: ["entryId"],
        where: { bookId },
        _sum: { debitMinor: true, creditMinor: true },
      })
      for (const row of totals)
        expect(row._sum.debitMinor).toBe(row._sum.creditMinor)
      expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(5)
    } finally {
      if (bookId) {
        const owned = await db.financeBook.findUniqueOrThrow({
          where: { id: bookId },
          select: { tenantId: true },
        })
        refuseCleanup(owned.tenantId !== tenantId)
        await db.$transaction(
          async (tx) => {
            const scope = { bookId: bookId as string }
            await tx.financeReconciliation.deleteMany({ where: scope })
            await tx.financeCommand.deleteMany({ where: scope })
            await tx.financeJournalLine.deleteMany({ where: scope })
            await tx.financeJournalEntry.deleteMany({
              where: { ...scope, reversalOfId: { not: null } },
            })
            await tx.financeJournalEntry.deleteMany({ where: scope })
            await tx.financeAccount.deleteMany({ where: scope })
            await tx.financeBook.delete({ where: { id: scope.bookId } })
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
      }
      if (tenantId) {
        const tenant = await db.tenant.findUniqueOrThrow({
          where: { id: tenantId },
        })
        refuseCleanup(tenant.dataClassification !== "QA")
        await db.tenant.delete({ where: { id: tenantId } })
      }
      await db.user.delete({ where: { id: user.id } })
      expect(
        await db.tenant.count({
          where: { slug: `finance-money-matrix-${suffix}` },
        }),
      ).toBe(0)
    }
  }, 180_000)
})
