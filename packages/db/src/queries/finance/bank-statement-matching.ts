import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import {
  financeBankReason,
  financeBankRevision,
  financeBankSelectedIds,
} from "./bank-statement-rules"
import { getFinanceBankStatementSource } from "./bank-statement-source"
import { financeDocumentCommand } from "./commands"
import { FinanceError, MAX_FINANCE_AMOUNT, financePayloadHash } from "./rules"

type MatchScope = FinanceActor & {
  bookId: string
  accountId: string
  clientCommandId: string
  expectedRevision: string
  expectedSnapshotSequence: string
  reason: string
}
export type FinanceBankMatchInput = MatchScope & {
  bankRowIds: string[]
  journalLineIds: string[]
}
export type FinanceBankUnmatchInput = MatchScope & { matchId: string }

async function assertBankReview(
  tx: Prisma.TransactionClient,
  bookId: string,
  accountId: string,
  revision: bigint,
) {
  const account = await tx.financeAccount.findFirst({
    where: {
      id: accountId,
      bookId,
      purpose: { in: ["BANK", "CLEARING"] },
      kind: "ASSET",
      archivedAt: null,
    },
    select: { id: true },
  })
  const state = await tx.financeBankAccountState.findUnique({
    where: { bookId_accountId: { bookId, accountId } },
  })
  if (!account || !state)
    throw new FinanceError(
      "NOT_FOUND",
      "Import original evidence for an active bank or clearing account first.",
    )
  if (state.revision !== revision)
    throw new FinanceError(
      "CONFLICT",
      "Bank evidence changed. Review the current matching revision.",
    )
}

/** Match full original rows/lines, including many-to-many groups; no money is posted. */
export async function matchFinanceBankStatement(
  db: PrismaClient,
  supplied: FinanceBankMatchInput,
) {
  const input = {
    ...supplied,
    reason: financeBankReason(supplied.reason),
    bankRowIds: financeBankSelectedIds(supplied.bankRowIds),
    journalLineIds: financeBankSelectedIds(supplied.journalLineIds),
  }
  const expectedRevision = financeBankRevision(input.expectedRevision)
  const snapshotSequence = financeBankRevision(input.expectedSnapshotSequence)
  return db.$transaction(
    (tx) =>
      financeDocumentCommand(
        tx,
        input,
        "BANK_STATEMENT_MATCH",
        {
          accountId: input.accountId,
          bankRowIds: input.bankRowIds,
          journalLineIds: input.journalLineIds,
          expectedRevision,
          snapshotSequence,
          reason: input.reason,
        },
        async (book) => {
          if (snapshotSequence !== book.lastSequence)
            throw new FinanceError(
              "CONFLICT",
              "The posted journal changed. Refresh the original matching review.",
            )
          await assertBankReview(tx, book.id, input.accountId, expectedRevision)
          const bankRows = await tx.financeBankStatementLine.findMany({
            where: {
              bookId: book.id,
              accountId: input.accountId,
              id: { in: input.bankRowIds },
            },
            include: {
              statement: {
                select: { startsAt: true, endsAt: true, currencyCode: true },
              },
            },
            orderBy: { id: "asc" },
          })
          const journalLines = await tx.financeJournalLine.findMany({
            where: {
              bookId: book.id,
              accountId: input.accountId,
              id: { in: input.journalLineIds },
            },
            include: {
              entry: {
                select: {
                  id: true,
                  bookId: true,
                  sequence: true,
                  effectiveAt: true,
                  payloadHash: true,
                },
              },
            },
            orderBy: { id: "asc" },
          })
          if (
            bankRows.length !== input.bankRowIds.length ||
            journalLines.length !== input.journalLineIds.length
          )
            throw new FinanceError(
              "NOT_FOUND",
              "Select complete original bank rows and journal lines in this account.",
            )
          const originalStatementIds = new Set(
            bankRows.map((row) => row.statementId),
          )
          if (originalStatementIds.size !== 1)
            throw new FinanceError(
              "INVALID_JOURNAL",
              "Review a matching group within one original statement at a time.",
            )
          const statementId = bankRows[0]?.statementId
          if (!statementId)
            throw new FinanceError(
              "NOT_FOUND",
              "Original statement is missing.",
            )
          await getFinanceBankStatementSource(tx, {
            bookId: book.id,
            statementId,
          })
          const latestCutoff = Math.max(
            ...bankRows.map((row) => row.statement.endsAt.getTime()),
          )
          if (
            bankRows.some(
              (row) =>
                row.activeMatchId !== null ||
                row.statement.currencyCode !== book.currencyCode ||
                row.occurredAt < row.statement.startsAt ||
                row.occurredAt > row.statement.endsAt,
            ) ||
            journalLines.some(
              (line) =>
                line.activeBankMatchId !== null ||
                line.entry.bookId !== book.id ||
                line.entry.sequence > snapshotSequence ||
                line.entry.effectiveAt < book.startsAt ||
                line.entry.effectiveAt.getTime() > latestCutoff ||
                line.debitMinor < 0n ||
                line.creditMinor < 0n ||
                (line.debitMinor === 0n) === (line.creditMinor === 0n) ||
                line.debitMinor > MAX_FINANCE_AMOUNT ||
                line.creditMinor > MAX_FINANCE_AMOUNT,
            )
          )
            throw new FinanceError(
              "CONFLICT",
              "Original matching sources are already matched or outside the reviewed scope.",
            )
          const bankMinor = bankRows.reduce(
            (sum, row) => sum + row.amountMinor,
            0n,
          )
          const ledgerMinor = journalLines.reduce(
            (sum, line) => sum + line.debitMinor - line.creditMinor,
            0n,
          )
          if (bankMinor !== ledgerMinor)
            throw new FinanceError(
              "CONFLICT",
              "Bank and posted amounts differ. Record a source-owned correction or select the full related group; matching never creates a balancing payment.",
            )
          const revision = expectedRevision + 1n
          const event = await tx.financeBankMatchEvent.create({
            data: {
              bookId: book.id,
              accountId: input.accountId,
              kind: "MATCH",
              revision,
              snapshotSequence,
              amountMinor: bankMinor.toString(),
              reason: input.reason,
              actorUserId: input.actorUserId,
              bankRows: bankRows.map((row) => ({
                id: row.id,
                statementId: row.statementId,
                externalId: row.externalId,
                occurredAt: row.occurredAt.toISOString(),
                amountMinor: row.amountMinor.toString(),
              })),
              journalLines: journalLines.map((line) => ({
                id: line.id,
                entryId: line.entryId,
                sequence: line.entry.sequence.toString(),
                effectiveAt: line.entry.effectiveAt.toISOString(),
                payloadHash: line.entry.payloadHash,
                debitMinor: line.debitMinor.toString(),
                creditMinor: line.creditMinor.toString(),
              })),
            },
          })
          const bankClaim = await tx.financeBankStatementLine.updateMany({
            where: {
              bookId: book.id,
              accountId: input.accountId,
              id: { in: input.bankRowIds },
              activeMatchId: null,
            },
            data: { activeMatchId: event.id },
          })
          const ledgerClaim = await tx.financeJournalLine.updateMany({
            where: {
              bookId: book.id,
              accountId: input.accountId,
              id: { in: input.journalLineIds },
              activeBankMatchId: null,
            },
            data: { activeBankMatchId: event.id },
          })
          if (
            bankClaim.count !== input.bankRowIds.length ||
            ledgerClaim.count !== input.journalLineIds.length
          )
            throw new FinanceError(
              "CONFLICT",
              "An original row was claimed by another review.",
            )
          await tx.financeBankAccountState.update({
            where: {
              bookId_accountId: { bookId: book.id, accountId: input.accountId },
            },
            data: { revision },
          })
          return { id: event.id }
        },
      ),
    { maxWait: 10000, timeout: 30000 },
  )
}

function originalIds(value: Prisma.JsonValue) {
  if (
    !Array.isArray(value) ||
    value.some(
      (row) =>
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        typeof row.id !== "string",
    )
  )
    throw new FinanceError("CONFLICT", "Original matching evidence is invalid.")
  return financeBankSelectedIds(
    value.map((row) => {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        typeof row.id !== "string"
      )
        throw new FinanceError(
          "CONFLICT",
          "Original matching evidence is invalid.",
        )
      return row.id
    }),
  )
}

/** Retain the original group and append a reasoned release; never delete audit. */
export async function unmatchFinanceBankStatement(
  db: PrismaClient,
  supplied: FinanceBankUnmatchInput,
) {
  const input = { ...supplied, reason: financeBankReason(supplied.reason) }
  const expectedRevision = financeBankRevision(input.expectedRevision)
  const snapshotSequence = financeBankRevision(input.expectedSnapshotSequence)
  return db.$transaction(
    (tx) =>
      financeDocumentCommand(
        tx,
        input,
        "BANK_STATEMENT_UNMATCH",
        {
          accountId: input.accountId,
          matchId: input.matchId,
          expectedRevision,
          snapshotSequence,
          reason: input.reason,
        },
        async (book) => {
          if (snapshotSequence !== book.lastSequence)
            throw new FinanceError(
              "CONFLICT",
              "The posted journal changed. Refresh the matching review.",
            )
          await assertBankReview(tx, book.id, input.accountId, expectedRevision)
          const original = await tx.financeBankMatchEvent.findFirst({
            where: {
              id: input.matchId,
              bookId: book.id,
              accountId: input.accountId,
              kind: "MATCH",
            },
            include: { reversal: { select: { id: true } } },
          })
          if (!original)
            throw new FinanceError(
              "NOT_FOUND",
              "Original bank match not found in this account.",
            )
          if (original.reversal)
            throw new FinanceError(
              "CONFLICT",
              "This original matching group was already released.",
            )
          const bankIds = originalIds(original.bankRows)
          const ledgerIds = originalIds(original.journalLines)
          const originalCommands = await tx.financeCommand.findMany({
            where: {
              bookId: book.id,
              kind: "BANK_STATEMENT_MATCH",
              actorUserId: original.actorUserId,
              payloadHash: financePayloadHash({
                accountId: original.accountId,
                bankRowIds: bankIds,
                journalLineIds: ledgerIds,
                expectedRevision: original.revision - 1n,
                snapshotSequence: original.snapshotSequence,
                reason: original.reason,
              }),
              result: { path: ["id"], equals: original.id },
            },
            take: 2,
            select: { id: true },
          })
          if (originalCommands.length !== 1)
            throw new FinanceError(
              "CONFLICT",
              "Original matching command changed.",
            )
          const [bankCount, ledgerCount] = await Promise.all([
            tx.financeBankStatementLine.count({
              where: {
                bookId: book.id,
                accountId: input.accountId,
                activeMatchId: original.id,
              },
            }),
            tx.financeJournalLine.count({
              where: {
                bookId: book.id,
                accountId: input.accountId,
                activeBankMatchId: original.id,
              },
            }),
          ])
          if (bankCount !== bankIds.length || ledgerCount !== ledgerIds.length)
            throw new FinanceError(
              "CONFLICT",
              "The complete original matching claims changed.",
            )
          const bankRelease = await tx.financeBankStatementLine.updateMany({
            where: {
              bookId: book.id,
              accountId: input.accountId,
              activeMatchId: original.id,
              id: { in: bankIds },
            },
            data: { activeMatchId: null },
          })
          const ledgerRelease = await tx.financeJournalLine.updateMany({
            where: {
              bookId: book.id,
              accountId: input.accountId,
              activeBankMatchId: original.id,
              id: { in: ledgerIds },
            },
            data: { activeBankMatchId: null },
          })
          if (
            bankRelease.count !== bankIds.length ||
            ledgerRelease.count !== ledgerIds.length
          )
            throw new FinanceError(
              "CONFLICT",
              "The original matching group is incomplete.",
            )
          const revision = expectedRevision + 1n
          const event = await tx.financeBankMatchEvent.create({
            data: {
              bookId: book.id,
              accountId: input.accountId,
              kind: "UNMATCH",
              revision,
              snapshotSequence,
              bankRows: original.bankRows ?? [],
              journalLines: original.journalLines ?? [],
              amountMinor: original.amountMinor,
              reason: input.reason,
              actorUserId: input.actorUserId,
              reversalOfId: original.id,
            },
          })
          await tx.financeBankAccountState.update({
            where: {
              bookId_accountId: { bookId: book.id, accountId: input.accountId },
            },
            data: { revision },
          })
          return { id: event.id }
        },
      ),
    { maxWait: 10000, timeout: 30000 },
  )
}
