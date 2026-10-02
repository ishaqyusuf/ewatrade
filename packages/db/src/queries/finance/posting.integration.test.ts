import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { FINANCE_DEFAULT_ACCOUNTS } from "./accounts"
import { postFinanceJournalInTransaction } from "./posting"

describeWithServiceCommerceDatabase(
  "finance posting on verified development database",
  () => {
    test("source/command retries, scope and closed dates preserve one balanced posting", async () => {
      const { prisma: db } = await import("../../client")
      const rollback = new Error("ROLLBACK_FINANCE_ACCEPTANCE")
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
            const first = await postFinanceJournalInTransaction(tx, input)
            const debitLine = input.lines[0]
            const creditLine = input.lines[1]
            if (!debitLine || !creditLine)
              throw new Error("Missing fixture journal lines")
            expect(await postFinanceJournalInTransaction(tx, input)).toEqual(
              first,
            )
            expect(
              await postFinanceJournalInTransaction(tx, {
                ...input,
                clientCommandId: "second",
              }),
            ).toEqual(first)
            await expect(
              postFinanceJournalInTransaction(tx, {
                ...input,
                description: "Changed meaning",
              }),
            ).rejects.toMatchObject({ code: "CONFLICT" })
            await expect(
              postFinanceJournalInTransaction(tx, {
                ...input,
                tenantId: "other",
              }),
            ).rejects.toMatchObject({ code: "FORBIDDEN" })
            await expect(
              postFinanceJournalInTransaction(tx, {
                ...input,
                clientCommandId: "bad-account",
                sourceId: "bad-account",
                lines: [
                  debitLine,
                  { ...creditLine, accountId: "other-book-account" },
                ],
              }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" })
            await tx.financeBook.update({
              where: { id: book.id },
              data: { closedThrough: new Date("2026-02-28T23:59:59.999Z") },
            })
            expect(await postFinanceJournalInTransaction(tx, input)).toEqual(
              first,
            )
            await expect(
              postFinanceJournalInTransaction(tx, {
                ...input,
                clientCommandId: "closed",
                sourceId: "closed",
              }),
            ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
            expect(
              await tx.financeJournalEntry.count({
                where: { bookId: book.id },
              }),
            ).toBe(1)
            const totals = await tx.financeJournalLine.aggregate({
              where: { bookId: book.id },
              _sum: { debitMinor: true, creditMinor: true },
            })
            expect(totals._sum.debitMinor).toBe(100000n)
            expect(totals._sum.creditMinor).toBe(100000n)
            throw rollback
          },
          { maxWait: 10_000, timeout: 30_000 },
        ),
      ).rejects.toBe(rollback)
      expect(
        await db.tenant.count({ where: { slug: `finance-${suffix}` } }),
      ).toBe(0)
    }, 60_000)
  },
)
