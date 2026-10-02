import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { FINANCE_DEFAULT_ACCOUNTS } from "./accounts"
import { reverseFinanceMoneyInTransaction } from "./money-reversals"
import { postFinanceJournalInTransaction } from "./posting"

describeWithServiceCommerceDatabase("money movement correction", () => {
  test("reversal preserves original, restores balances and rejects a second reversal", async () => {
    const { prisma: db } = await import("../../client")
    const rollback = new Error("ROLLBACK_REVERSAL_ACCEPTANCE")
    const suffix = randomUUID()
    await expect(
      db.$transaction(
        async (tx) => {
          const user = await tx.user.create({
            data: {
              email: `finance-${suffix}@example.invalid`,
              name: "Finance acceptance",
            },
          })
          const tenant = await tx.tenant.create({
            data: {
              name: "Finance acceptance",
              slug: `finance-${suffix}`,
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              dataClassification: "QA",
              users: {
                create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
              },
            },
          })
          const book = await tx.financeBook.create({
            data: {
              tenantId: tenant.id,
              currencyCode: "NGN",
              timezone: "Africa/Lagos",
              startsAt: new Date("2026-01-01"),
              createdById: user.id,
              accounts: { create: FINANCE_DEFAULT_ACCOUNTS },
            },
            include: { accounts: true },
          })
          const cash = book.accounts.find(
            (account) => account.purpose === "CASH",
          )
          const capital = book.accounts.find(
            (account) => account.purpose === "CAPITAL",
          )
          if (!cash || !capital) throw new Error("Missing fixture accounts")
          const input = {
            tenantId: tenant.id,
            actorUserId: user.id,
            bookId: book.id,
            clientCommandId: "first",
            sourceKind: "OWNER_CONTRIBUTION",
            sourceId: "contribution",
            description: "Initial funds",
            effectiveAt: new Date("2026-02-01"),
            lines: [
              {
                accountId: cash.id,
                side: "DEBIT" as const,
                amountMinor: "100000",
              },
              {
                accountId: capital.id,
                side: "CREDIT" as const,
                amountMinor: "100000",
              },
            ],
          }

          await postFinanceJournalInTransaction(tx, input)
          const original = await tx.financeJournalEntry.findFirstOrThrow({
            where: { bookId: book.id },
          })
          const correction = {
            tenantId: tenant.id,
            actorUserId: user.id,
            bookId: book.id,
            clientCommandId: "reverse",
            entryId: original.id,
            reason: "Recorded twice outside this book",
            effectiveAt: new Date("2026-03-01"),
          }
          await expect(
            reverseFinanceMoneyInTransaction(tx, {
              ...correction,
              effectiveAt: new Date("2026-01-10"),
            }),
          ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
          const result = await reverseFinanceMoneyInTransaction(tx, correction)
          expect(
            await reverseFinanceMoneyInTransaction(tx, correction),
          ).toEqual(result)
          await expect(
            reverseFinanceMoneyInTransaction(tx, {
              ...correction,
              clientCommandId: "another",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" })
          await expect(
            reverseFinanceMoneyInTransaction(tx, {
              ...correction,
              reason: "Different reason",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" })
          const reversal = await tx.financeJournalEntry.findUniqueOrThrow({
            where: { id: result.id },
          })
          expect(reversal.reversalOfId).toBe(original.id)
          expect(reversal.actorUserId).toBe(user.id)
          expect(reversal.description).toContain(correction.reason)
          expect(
            await tx.financeJournalEntry.findUniqueOrThrow({
              where: { id: original.id },
            }),
          ).toEqual(original)
          const totals = await tx.financeJournalLine.groupBy({
            by: ["accountId"],
            where: { bookId: book.id },
            _sum: { debitMinor: true, creditMinor: true },
          })
          for (const row of totals)
            expect(row._sum.debitMinor).toBe(row._sum.creditMinor)
          expect(
            await tx.financeJournalEntry.count({ where: { bookId: book.id } }),
          ).toBe(2)
          throw rollback
        },
        { maxWait: 10_000, timeout: 30_000 },
      ),
    ).rejects.toBe(rollback)
    expect(
      await db.tenant.count({ where: { slug: `finance-${suffix}` } }),
    ).toBe(0)
  }, 60_000)
})
