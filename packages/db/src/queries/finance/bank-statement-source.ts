import type { Prisma } from "../../../generated/prisma/client"
import { FINANCE_BANK_STATEMENT_MAX_ROWS } from "./bank-statement-csv"
import { FinanceError, financePayloadHash } from "./rules"

/** Reconstruct original immutable import from actual rows and its original command. */
export async function getFinanceBankStatementSource(
  tx: Prisma.TransactionClient,
  input: { bookId: string; statementId: string },
) {
  const statement = await tx.financeBankStatement.findFirst({
    where: { id: input.statementId, bookId: input.bookId },
  })
  if (!statement)
    throw new FinanceError(
      "NOT_FOUND",
      "Bank statement not found in this book.",
    )
  const lines = await tx.financeBankStatementLine.findMany({
    where: {
      bookId: statement.bookId,
      accountId: statement.accountId,
      statementId: statement.id,
    },
    orderBy: { position: "asc" },
    take: FINANCE_BANK_STATEMENT_MAX_ROWS + 1,
  })
  if (
    statement.rowCount < 0 ||
    statement.rowCount > FINANCE_BANK_STATEMENT_MAX_ROWS ||
    lines.length !== statement.rowCount ||
    lines.some(
      (row, index) =>
        row.position !== index ||
        row.occurredAt < statement.startsAt ||
        row.occurredAt > statement.endsAt,
    ) ||
    statement.importedRevision < 1n
  )
    throw new FinanceError(
      "CONFLICT",
      "Original bank statement rows are incomplete or changed.",
    )
  const content = {
    accountId: statement.accountId,
    currencyCode: statement.currencyCode,
    reference: statement.reference,
    startsAt: statement.startsAt,
    endsAt: statement.endsAt,
    openingBalanceMinor: statement.openingBalanceMinor,
    closingBalanceMinor: statement.closingBalanceMinor,
    rows: lines.map((row) => ({
      externalId: row.externalId,
      occurredAt: row.occurredAt,
      amountMinor: row.amountMinor,
      description: row.description,
    })),
  }
  if (
    financePayloadHash(content) !== statement.contentHash ||
    statement.openingBalanceMinor +
      lines.reduce((sum, row) => sum + row.amountMinor, 0n) !==
      statement.closingBalanceMinor
  )
    throw new FinanceError(
      "CONFLICT",
      "Original bank statement content changed.",
    )
  const original = await tx.financeCommand.findMany({
    where: {
      bookId: statement.bookId,
      kind: "BANK_STATEMENT_IMPORT",
      actorUserId: statement.actorUserId,
      payloadHash: financePayloadHash({
        ...content,
        expectedRevision: statement.importedRevision - 1n,
      }),
      result: { path: ["id"], equals: statement.id },
    },
    take: 2,
    select: { id: true },
  })
  if (original.length !== 1)
    throw new FinanceError(
      "CONFLICT",
      "Original bank import command is missing or repeated.",
    )
  return { statement, lines }
}
