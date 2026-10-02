import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { listFinanceAccountActivity } from "./account-activity"
import { createFinanceBook } from "./accounts"
import { recordFinanceMoneyMovement } from "./money"
import { reverseFinanceMoney } from "./money-reversals"

describeWithServiceCommerceDatabase("snapshot account statements", () => {
  test("running balances and paginated snapshots exclude later backdated entries and reversal metadata", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const user = await db.user.create({
      data: {
        email: `finance-statement-${suffix}@example.invalid`,
        name: "Finance statement acceptance",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `finance-statement-${suffix}`,
          name: "Finance statement acceptance",
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
      const base = {
        ...actor,
        bookId,
        accountId: cash.id,
        description: "Statement acceptance",
      }
      await recordFinanceMoneyMovement(db, {
        ...base,
        clientCommandId: "opening",
        kind: "OWNER_CONTRIBUTION",
        amountMinor: "10000",
        effectiveAt: new Date("2026-01-01"),
      })
      await recordFinanceMoneyMovement(db, {
        ...base,
        clientCommandId: "withdrawal",
        kind: "OWNER_WITHDRAWAL",
        amountMinor: "2000",
        effectiveAt: new Date("2026-02-01"),
      })
      await recordFinanceMoneyMovement(db, {
        ...base,
        clientCommandId: "funding",
        kind: "OWNER_CONTRIBUTION",
        amountMinor: "5000",
        effectiveAt: new Date("2026-02-02"),
      })
      const range = {
        ...actor,
        bookId,
        accountId: cash.id,
        from: new Date("2026-02-01"),
        through: new Date("2026-03-01"),
        limit: 1,
      }
      const first = await listFinanceAccountActivity(db, range)
      expect(first.openingBalanceMinor).toBe("10000")
      expect(first.debitMinor).toBe("5000")
      expect(first.creditMinor).toBe("2000")
      expect(first.closingBalanceMinor).toBe("13000")
      expect(first.items[0]?.balanceMinor).toBe("8000")
      if (!first.nextCursor || !first.items[0])
        throw new Error("Expected first statement row")
      await recordFinanceMoneyMovement(db, {
        ...base,
        clientCommandId: "backdated",
        kind: "OWNER_CONTRIBUTION",
        amountMinor: "3000",
        effectiveAt: new Date("2026-02-01"),
      })
      const second = await listFinanceAccountActivity(db, {
        ...range,
        cursor: first.nextCursor,
        snapshotSequence: first.snapshotSequence,
      })
      expect(second.pageOpeningBalanceMinor).toBe("8000")
      expect(second.items[0]?.balanceMinor).toBe("13000")
      expect(second.closingBalanceMinor).toBe("13000")
      expect(second.nextCursor).toBeNull()
      await reverseFinanceMoney(db, {
        ...actor,
        bookId,
        entryId: first.items[0].id,
        clientCommandId: "reverse-withdrawal",
        reason: "QA correction",
        effectiveAt: new Date("2026-02-03"),
      })
      const pinned = await listFinanceAccountActivity(db, {
        ...range,
        snapshotSequence: first.snapshotSequence,
      })
      expect(pinned.items[0]?.reversedById).toBeNull()
      const latest = await listFinanceAccountActivity(db, {
        ...range,
        limit: 50,
      })
      expect(latest.closingBalanceMinor).toBe("18000")
      expect(latest.items.map((item) => item.balanceMinor)).toEqual([
        "8000",
        "11000",
        "16000",
        "18000",
      ])
      expect(latest.items[0]?.reversedById).not.toBeNull()
      await expect(
        listFinanceAccountActivity(db, {
          ...range,
          accountId: bank.id,
          cursor: first.nextCursor,
          snapshotSequence: first.snapshotSequence,
        }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      await expect(
        listFinanceAccountActivity(db, { ...range, cursor: first.nextCursor }),
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
