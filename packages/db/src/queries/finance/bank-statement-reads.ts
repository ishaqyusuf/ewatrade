import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FINANCE_BANK_STATEMENT_MAX_ROWS } from "./bank-statement-csv"
import { financeBankRevision } from "./bank-statement-rules"
import { getFinanceBankStatementSource } from "./bank-statement-source"
import { FinanceError } from "./rules"

async function bankReadBook(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string },
) {
  await assertFinanceManager(tx, input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  return book
}

export async function listFinanceBankMatchHistory(
  db: PrismaClient,
  supplied: FinanceActor & {
    bookId: string
    accountId: string
    snapshotRevision?: string
    cursor?: string
    limit?: number
  },
) {
  const input = { ...supplied }
  const limit = input.limit ?? 30
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (input.cursor && input.snapshotRevision === undefined)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Retain the matching history revision for bounded pagination.",
    )
  return db.$transaction(
    async (tx) => {
      const book = await bankReadBook(tx, input)
      const account = await tx.financeAccount.findFirst({
        where: {
          id: input.accountId,
          bookId: book.id,
          purpose: { in: ["BANK", "CLEARING"] },
          kind: "ASSET",
        },
        select: { id: true },
      })
      if (!account)
        throw new FinanceError(
          "NOT_FOUND",
          "Bank account not found in this book.",
        )
      const state = await tx.financeBankAccountState.findUnique({
        where: { bookId_accountId: { bookId: book.id, accountId: account.id } },
      })
      const snapshotRevision =
        input.snapshotRevision === undefined
          ? (state?.revision ?? 0n)
          : financeBankRevision(input.snapshotRevision)
      if (snapshotRevision > (state?.revision ?? 0n))
        throw new FinanceError(
          "CONFLICT",
          "Bank history revision is in the future.",
        )
      const cursor =
        input.cursor === undefined
          ? null
          : await tx.financeBankMatchEvent.findFirst({
              where: {
                bookId: book.id,
                accountId: account.id,
                revision: financeBankRevision(input.cursor),
              },
              select: { revision: true },
            })
      if (input.cursor && (!cursor || cursor.revision > snapshotRevision))
        throw new FinanceError(
          "CONFLICT",
          "The cursor is outside this original bank history.",
        )
      const rows = await tx.financeBankMatchEvent.findMany({
        where: {
          bookId: book.id,
          accountId: account.id,
          revision: {
            lte: snapshotRevision,
            ...(cursor ? { lt: cursor.revision } : {}),
          },
        },
        orderBy: { revision: "desc" },
        take: limit + 1,
      })
      return {
        bookId: book.id,
        accountId: account.id,
        snapshotRevision: snapshotRevision.toString(),
        nextCursor:
          rows.length > limit
            ? (rows[limit - 1]?.revision.toString() ?? null)
            : null,
        items: rows.slice(0, limit).map((row) => ({
          ...row,
          revision: row.revision.toString(),
          snapshotSequence: row.snapshotSequence.toString(),
        })),
      }
    },
    { maxWait: 10000, timeout: 30000, isolationLevel: "RepeatableRead" },
  )
}

export async function listFinanceBankStatements(
  db: PrismaClient,
  supplied: FinanceActor & {
    bookId: string
    accountId?: string
    cursor?: string
    limit?: number
  },
) {
  const input = { ...supplied }
  const limit = input.limit ?? 30
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Invalid bank statement page size.",
    )
  return db.$transaction(
    async (tx) => {
      const book = await bankReadBook(tx, input)
      const cursor = input.cursor
        ? await tx.financeBankStatement.findFirst({
            where: {
              id: input.cursor,
              bookId: book.id,
              accountId: input.accountId,
            },
            select: { id: true },
          })
        : null
      if (input.cursor && !cursor)
        throw new FinanceError(
          "CONFLICT",
          "Refresh bank statements before continuing this account page.",
        )
      const rows = await tx.financeBankStatement.findMany({
        where: {
          bookId: book.id,
          accountId: input.accountId,
          ...(cursor ? { id: { lt: cursor.id } } : {}),
        },
        orderBy: { id: "desc" },
        take: limit + 1,
      })
      return {
        bookId: book.id,
        currencyCode: book.currencyCode,
        nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
        items: rows.slice(0, limit).map((row) => ({
          ...row,
          openingBalanceMinor: row.openingBalanceMinor.toString(),
          closingBalanceMinor: row.closingBalanceMinor.toString(),
          importedRevision: row.importedRevision.toString(),
        })),
      }
    },
    { maxWait: 10000, timeout: 30000, isolationLevel: "RepeatableRead" },
  )
}

export async function getFinanceBankStatement(
  db: PrismaClient,
  supplied: FinanceActor & { bookId: string; statementId: string },
) {
  const input = { ...supplied }
  return db.$transaction(
    async (tx) => {
      const book = await bankReadBook(tx, input)
      const { statement, lines } = await getFinanceBankStatementSource(
        tx,
        input,
      )
      if (statement.currencyCode !== book.currencyCode)
        throw new FinanceError("CONFLICT", "Bank statement currency changed.")
      const state = await tx.financeBankAccountState.findUniqueOrThrow({
        where: {
          bookId_accountId: { bookId: book.id, accountId: statement.accountId },
        },
      })
      const ledger = await tx.financeJournalLine.findMany({
        where: {
          bookId: book.id,
          accountId: statement.accountId,
          activeBankMatchId: null,
          entry: {
            sequence: { lte: book.lastSequence },
            effectiveAt: { gte: book.startsAt, lte: statement.endsAt },
          },
        },
        include: {
          entry: {
            select: {
              sequence: true,
              effectiveAt: true,
              description: true,
              sourceKind: true,
              sourceId: true,
            },
          },
        },
        orderBy: [{ entry: { sequence: "asc" } }, { id: "asc" }],
        take: FINANCE_BANK_STATEMENT_MAX_ROWS + 1,
      })
      const candidateCoverageComplete =
        ledger.length <= FINANCE_BANK_STATEMENT_MAX_ROWS
      const candidates = ledger.slice(0, FINANCE_BANK_STATEMENT_MAX_ROWS)
      const unmatched = lines.filter((row) => row.activeMatchId === null)
      const [posted] = await tx.$queryRaw<
        Array<{ openingMinor: string; closingMinor: string }>
      >`
      SELECT COALESCE(SUM(CASE WHEN entry."effectiveAt" < ${statement.startsAt}
          THEN line."debitMinor" - line."creditMinor" ELSE 0 END), 0)::text AS "openingMinor",
        COALESCE(SUM(line."debitMinor" - line."creditMinor"), 0)::text AS "closingMinor"
      FROM "FinanceJournalLine" line
      JOIN "FinanceJournalEntry" entry ON entry.id = line."entryId" AND entry."bookId" = line."bookId"
      WHERE line."bookId" = ${book.id} AND line."accountId" = ${statement.accountId}
        AND entry.sequence <= ${book.lastSequence} AND entry."effectiveAt" <= ${statement.endsAt}
    `
      if (!posted)
        throw new FinanceError(
          "CONFLICT",
          "Posted bank balance scope is incomplete.",
        )
      return {
        bookId: book.id,
        accountId: statement.accountId,
        currencyCode: book.currencyCode,
        bankRevision: state.revision.toString(),
        snapshotSequence: book.lastSequence.toString(),
        statement: {
          id: statement.id,
          reference: statement.reference,
          startsAt: statement.startsAt,
          endsAt: statement.endsAt,
          importedAt: statement.createdAt,
          openingBalanceMinor: statement.openingBalanceMinor.toString(),
          closingBalanceMinor: statement.closingBalanceMinor.toString(),
          rowCount: statement.rowCount,
        },
        rows: lines.map((row) => ({
          id: row.id,
          position: row.position,
          externalId: row.externalId,
          occurredAt: row.occurredAt,
          amountMinor: row.amountMinor.toString(),
          description: row.description,
          activeMatchId: row.activeMatchId,
        })),
        candidates: candidates.map((line) => ({
          id: line.id,
          entryId: line.entryId,
          amountMinor: (line.debitMinor - line.creditMinor).toString(),
          effectiveAt: line.entry.effectiveAt,
          sequence: line.entry.sequence.toString(),
          description: line.entry.description,
          sourceKind: line.entry.sourceKind,
          sourceId: line.entry.sourceId,
        })),
        unmatchedBankRows: unmatched.length,
        unmatchedBankMinor: unmatched
          .reduce((sum, row) => sum + row.amountMinor, 0n)
          .toString(),
        postedOpeningMinor: posted.openingMinor,
        postedClosingMinor: posted.closingMinor,
        openingDifferenceMinor: (
          statement.openingBalanceMinor - BigInt(posted.openingMinor)
        ).toString(),
        closingDifferenceMinor: (
          statement.closingBalanceMinor - BigInt(posted.closingMinor)
        ).toString(),
        candidateCoverageComplete,
        candidateReviewLimit: FINANCE_BANK_STATEMENT_MAX_ROWS,
        // Zero net differences do not certify all rows or opening/source families.
        operationallyReconciled: false as const,
        canReconcileClose: false as const,
      }
    },
    { maxWait: 10000, timeout: 30000, isolationLevel: "RepeatableRead" },
  )
}
