import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { recordFinanceMoneyMovement } from "./money"
import { changeFinancePeriod, getFinancePeriods } from "./periods"
describeWithServiceCommerceDatabase("finance period controls", () => {
  test("close, latest-first reopen, snapshot conflicts and original audits", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const user = await db.user.create({
      data: {
        email: `finance-period-${suffix}@example.invalid`,
        name: "Finance period acceptance",
      },
    })
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `finance-period-${suffix}`,
          name: "Finance period acceptance",
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
      const movement = {
        ...actor,
        bookId,
        accountId: cash.id,
        kind: "OWNER_CONTRIBUTION" as const,
        amountMinor: "1000",
        description: "Period test",
        effectiveAt: new Date("2026-01-15"),
      }
      await recordFinanceMoneyMovement(db, {
        ...movement,
        clientCommandId: "funding",
      })
      const close = {
        ...actor,
        bookId,
        clientCommandId: "close-jan",
        action: "CLOSE" as const,
        through: new Date("2026-01-31T23:59:59.999Z"),
        expectedSnapshotSequence: "1",
        reason: "Reviewed January",
      }
      const first = await changeFinancePeriod(db, close)
      expect(await changeFinancePeriod(db, close)).toEqual(first)
      await expect(
        recordFinanceMoneyMovement(db, {
          ...movement,
          clientCommandId: "blocked",
        }),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      const feb = await changeFinancePeriod(db, {
        ...close,
        clientCommandId: "close-feb",
        through: new Date("2026-02-28T23:59:59.999Z"),
      })
      await expect(
        changeFinancePeriod(db, {
          ...actor,
          bookId,
          clientCommandId: "wrong-reopen",
          action: "REOPEN",
          periodId: first.id,
          expectedSnapshotSequence: "1",
          reason: "Wrong order",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const reopen = {
        ...actor,
        bookId,
        clientCommandId: "reopen-feb",
        action: "REOPEN" as const,
        periodId: feb.id,
        expectedSnapshotSequence: "1",
        reason: "Late February entry",
      }
      await changeFinancePeriod(db, reopen)
      expect(
        (
          await getFinancePeriods(db, { ...actor, bookId })
        ).closedThrough?.toISOString(),
      ).toBe(close.through.toISOString())
      await recordFinanceMoneyMovement(db, {
        ...movement,
        clientCommandId: "feb-funding",
        effectiveAt: new Date("2026-02-15"),
      })
      await expect(
        changeFinancePeriod(db, {
          ...close,
          clientCommandId: "stale-close",
          through: new Date("2026-02-28T23:59:59.999Z"),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await changeFinancePeriod(db, {
        ...close,
        clientCommandId: "reclose-feb",
        through: new Date("2026-02-28T23:59:59.999Z"),
        expectedSnapshotSequence: "2",
        reason: "Reviewed correction",
      })
      const history = await getFinancePeriods(db, { ...actor, bookId })
      expect(history.periods).toHaveLength(2)
      expect(history.events).toHaveLength(4)
      expect(history.closedThrough?.toISOString()).toBe(
        "2026-02-28T23:59:59.999Z",
      )
      expect(history.events.map((event) => event.result)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            audit: expect.objectContaining({
              action: "REOPEN",
              reason: "Late February entry",
            }),
          }),
        ]),
      )
      await expect(
        changeFinancePeriod(db, { ...close, tenantId: "wrong-tenant" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
    } finally {
      // Only run-owned synthetic acceptance data is removed; no merchant IDs
      // are accepted from environment variables or external input.
      if (bookId)
        await db.$transaction(
          async (tx) => {
            await tx.financeBillPayment.deleteMany({ where: { bookId } })
            await tx.financeBillLine.deleteMany({ where: { bookId } })
            await tx.financeBill.deleteMany({ where: { bookId } })
            await tx.financePeriod.deleteMany({ where: { bookId } })
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
