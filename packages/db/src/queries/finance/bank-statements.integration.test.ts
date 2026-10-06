import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { importFinanceBankStatement } from "./bank-statement-import"
import {
  matchFinanceBankStatement,
  unmatchFinanceBankStatement,
} from "./bank-statement-matching"
import {
  getFinanceBankStatement,
  listFinanceBankMatchHistory,
  listFinanceBankStatements,
} from "./bank-statement-reads"
import { recordFinanceMoneyMovement } from "./money"

describeWithServiceCommerceDatabase("original bank statement matching", () => {
  test("import, grouped match, retained release and replay preserve money and enforce original evidence/current authority", async () => {
    const { prisma: db } = await import("../../client")
    const run = randomUUID()
    const email = `bank-statement-${run}@example.invalid`
    const slug = `bank-statement-${run}`
    try {
      const user = await db.user.create({
        data: { email, name: "Bank evidence QA" },
      })
      const tenant = await db.tenant.create({
        data: {
          slug,
          name: "Bank evidence QA",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          users: {
            create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      })
      const actor = { tenantId: tenant.id, actorUserId: user.id }
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: new Date("2025-01-01T00:00:00Z"),
      })
      const bank = await db.financeAccount.findFirstOrThrow({
        where: { bookId: book.id, purpose: "BANK" },
      })
      const capital = await db.financeAccount.findFirstOrThrow({
        where: { bookId: book.id, purpose: "CAPITAL" },
      })
      const scope = { ...actor, bookId: book.id, accountId: bank.id }
      for (const [command, kind, amountMinor, date] of [
        ["deposit", "OWNER_CONTRIBUTION", "100", "2025-01-02"],
        ["withdraw", "OWNER_WITHDRAWAL", "10", "2025-01-03"],
      ] as const)
        await recordFinanceMoneyMovement(db, {
          ...scope,
          clientCommandId: `${run}-${command}`,
          kind,
          amountMinor,
          description: "Owned QA original bank movement",
          effectiveAt: new Date(`${date}T00:00:00Z`),
        })
      const imported = {
        ...scope,
        clientCommandId: `${run}-import`,
        expectedRevision: "0",
        currencyCode: "NGN",
        reference: `statement-${run}`,
        startsAt: new Date("2025-01-01T00:00:00Z"),
        endsAt: new Date("2025-01-31T23:59:59.999Z"),
        openingBalanceMinor: "0",
        closingBalanceMinor: "90",
        csv: "Id,Date,Amount,Description\noriginal-deposit,2025-01-02,100,Deposit\noriginal-withdrawal,2025-01-03,-10,Withdrawal",
        columns: {
          transactionId: "Id",
          date: "Date",
          amount: "Amount",
          description: "Description",
        },
        units: "MINOR" as const,
      }
      const statement = await importFinanceBankStatement(db, imported)
      expect(await importFinanceBankStatement(db, imported)).toEqual(statement)
      await expect(
        importFinanceBankStatement(db, {
          ...imported,
          closingBalanceMinor: "91",
        }),
      ).rejects.toThrow("opening plus transactions")
      await expect(
        importFinanceBankStatement(db, {
          ...imported,
          clientCommandId: `${run}-overlap`,
          reference: `overlap-${run}`,
          expectedRevision: "1",
        }),
      ).rejects.toThrow("already imported")
      const readScope = { ...actor, bookId: book.id, statementId: statement.id }
      const review = await getFinanceBankStatement(db, readScope)
      expect(review.bankRevision).toBe("1")
      expect(review.snapshotSequence).toBe("2")
      expect(review.unmatchedBankMinor).toBe("90")
      expect(review.postedOpeningMinor).toBe("0")
      expect(review.postedClosingMinor).toBe("90")
      expect(review.openingDifferenceMinor).toBe("0")
      expect(review.closingDifferenceMinor).toBe("0")
      expect(review.unmatchedBankRows).toBe(2)
      expect(review.candidateCoverageComplete).toBe(true)
      expect(review.canReconcileClose).toBe(false)
      const matched = {
        ...scope,
        clientCommandId: `${run}-match`,
        expectedRevision: review.bankRevision,
        expectedSnapshotSequence: review.snapshotSequence,
        reason: "Reviewed original deposit and withdrawal group",
        bankRowIds: review.rows.map((row) => row.id),
        journalLineIds: review.candidates.map((row) => row.id),
      }
      await expect(
        matchFinanceBankStatement(db, {
          ...matched,
          expectedSnapshotSequence: "1",
        }),
      ).rejects.toThrow("posted journal changed")
      await expect(
        matchFinanceBankStatement(db, {
          ...matched,
          bankRowIds: matched.bankRowIds.slice(0, 1),
        }),
      ).rejects.toThrow("amounts differ")
      const other = { ...matched, clientCommandId: `${run}-competing-match` }
      const outcomes = await Promise.allSettled([
        matchFinanceBankStatement(db, matched),
        matchFinanceBankStatement(db, other),
      ])
      expect(
        outcomes.filter((value) => value.status === "fulfilled"),
      ).toHaveLength(1)
      expect(
        outcomes.filter((value) => value.status === "rejected"),
      ).toHaveLength(1)
      const success = outcomes.find((value) => value.status === "fulfilled")
      if (!success || success.status !== "fulfilled")
        throw new Error("No accepted QA match")
      const originalMatch = success.value
      const winner = outcomes[0]?.status === "fulfilled" ? matched : other
      expect(await matchFinanceBankStatement(db, winner)).toEqual(originalMatch)
      await expect(
        matchFinanceBankStatement(db, {
          ...winner,
          reason: "Changed same command",
        }),
      ).rejects.toThrow("different details")
      let result = await getFinanceBankStatement(db, readScope)
      expect(result.bankRevision).toBe("2")
      expect(result.unmatchedBankRows).toBe(0)
      expect(result.candidates).toEqual([])
      expect(
        (await db.financeBook.findUniqueOrThrow({ where: { id: book.id } }))
          .lastSequence,
      ).toBe(2n)
      expect(
        await db.financeJournalEntry.count({ where: { bookId: book.id } }),
      ).toBe(2)
      await expect(
        Promise.resolve(
          db.financeJournalLine.updateMany({
            where: { bookId: book.id, accountId: capital.id },
            data: { activeBankMatchId: originalMatch.id },
          }),
        ),
      ).rejects.toMatchObject({ code: "P2003" })
      const released = {
        ...scope,
        clientCommandId: `${run}-release`,
        expectedRevision: "2",
        expectedSnapshotSequence: "2",
        reason: "Reviewed group release to correct matching",
        matchId: originalMatch.id,
      }
      const release = await unmatchFinanceBankStatement(db, released)
      expect(await unmatchFinanceBankStatement(db, released)).toEqual(release)
      result = await getFinanceBankStatement(db, readScope)
      expect(result.bankRevision).toBe("3")
      expect(result.unmatchedBankRows).toBe(2)
      expect(result.candidates).toHaveLength(2)
      const history = await listFinanceBankMatchHistory(db, {
        ...scope,
        limit: 1,
      })
      expect(history.snapshotRevision).toBe("3")
      expect(history.items[0]).toMatchObject({
        id: release.id,
        kind: "UNMATCH",
        reversalOfId: originalMatch.id,
      })
      const originalPage = await listFinanceBankMatchHistory(db, {
        ...scope,
        cursor: history.nextCursor ?? undefined,
        snapshotRevision: history.snapshotRevision,
        limit: 1,
      })
      expect(originalPage.items[0]).toMatchObject({
        id: originalMatch.id,
        kind: "MATCH",
        amountMinor: "90",
      })
      expect(
        (
          await listFinanceBankStatements(db, {
            ...actor,
            bookId: book.id,
            accountId: bank.id,
          })
        ).items,
      ).toHaveLength(1)
      await expect(
        getFinanceBankStatement(db, { ...readScope, tenantId: randomUUID() }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      const row = await db.financeBankStatementLine.findFirstOrThrow({
        where: { bookId: book.id },
      })
      await db.financeBankStatementLine.update({
        where: { id: row.id },
        data: { description: "Owned QA changed source" },
      })
      await expect(getFinanceBankStatement(db, readScope)).rejects.toThrow(
        "content changed",
      )
      await expect(
        matchFinanceBankStatement(db, {
          ...matched,
          clientCommandId: `${run}-corrupt-match`,
          expectedRevision: "3",
        }),
      ).rejects.toThrow("content changed")
      await db.financeBankStatementLine.update({
        where: { id: row.id },
        data: { description: row.description },
      })
      expect(
        (await db.financeBook.findUniqueOrThrow({ where: { id: book.id } }))
          .lastSequence,
      ).toBe(2n)
      expect(
        await db.financeBankMatchEvent.count({ where: { bookId: book.id } }),
      ).toBe(2)
      const emptyStatement = await importFinanceBankStatement(db, {
        ...imported,
        clientCommandId: `${run}-zero-movements`,
        expectedRevision: "3",
        reference: `zero-${run}`,
        startsAt: new Date("2025-02-01T00:00:00Z"),
        endsAt: new Date("2025-02-28T23:59:59.999Z"),
        openingBalanceMinor: "90",
        closingBalanceMinor: "90",
        csv: "Id,Date,Amount,Description",
      })
      expect(
        (
          await getFinanceBankStatement(db, {
            ...readScope,
            statementId: emptyStatement.id,
          })
        ).rows,
      ).toEqual([])
    } finally {
      const tenants = await db.tenant.findMany({
        where: { slug },
        select: { id: true },
      })
      const users = await db.user.findMany({
        where: { email },
        select: { id: true },
      })
      const tenantIds = tenants.map((row) => row.id)
      const userIds = users.map((row) => row.id)
      const books = await db.financeBook.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { id: true },
      })
      const bookIds = books.map((row) => row.id)
      for (const bookId of bookIds)
        await db.$transaction(
          async (tx) => {
            await tx.financeBankStatementLine.updateMany({
              where: { bookId },
              data: { activeMatchId: null },
            })
            await tx.financeJournalLine.updateMany({
              where: { bookId },
              data: { activeBankMatchId: null },
            })
            await tx.financeBankMatchEvent.deleteMany({
              where: { bookId, kind: "UNMATCH" },
            })
            await tx.financeBankMatchEvent.deleteMany({ where: { bookId } })
            await tx.financeBankStatementLine.deleteMany({ where: { bookId } })
            await tx.financeBankStatement.deleteMany({ where: { bookId } })
            await tx.financeBankAccountState.deleteMany({ where: { bookId } })
            await tx.financeCommand.deleteMany({ where: { bookId } })
            await tx.financeJournalLine.deleteMany({ where: { bookId } })
            await tx.financeJournalEntry.deleteMany({ where: { bookId } })
            await tx.financeAccount.deleteMany({ where: { bookId } })
            await tx.financeBook.deleteMany({ where: { id: bookId } })
          },
          { maxWait: 10000, timeout: 30000 },
        )
      await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
      await db.user.deleteMany({ where: { id: { in: userIds } } })
      const absences = await Promise.all([
        db.financeBankAccountState.count({
          where: { bookId: { in: bookIds } },
        }),
        db.financeBankStatement.count({ where: { bookId: { in: bookIds } } }),
        db.financeBankStatementLine.count({
          where: { bookId: { in: bookIds } },
        }),
        db.financeBankMatchEvent.count({ where: { bookId: { in: bookIds } } }),
        db.financeCommand.count({ where: { bookId: { in: bookIds } } }),
        db.financeJournalLine.count({ where: { bookId: { in: bookIds } } }),
        db.financeJournalEntry.count({ where: { bookId: { in: bookIds } } }),
        db.financeAccount.count({ where: { bookId: { in: bookIds } } }),
        db.financeBook.count({ where: { id: { in: bookIds } } }),
        db.financeBook.count({ where: { tenantId: { in: tenantIds } } }),
        db.membership.count({
          where: {
            OR: [{ tenantId: { in: tenantIds } }, { userId: { in: userIds } }],
          },
        }),
        db.tenant.count({ where: { slug } }),
        db.user.count({ where: { email } }),
      ])
      for (const absence of absences) expect(absence).toBe(0)
    }
  }, 240000)
})
