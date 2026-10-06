import type { PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { parseFinanceBankStatementCsv } from "./bank-statement-csv"
import {
  financeBankRevision,
  financeBankSignedBalance,
} from "./bank-statement-rules"
import { financeDocumentCommand } from "./commands"
import { FinanceError, financePayloadHash } from "./rules"

export type FinanceBankStatementImportInput = FinanceActor & {
  bookId: string
  accountId: string
  clientCommandId: string
  expectedRevision: string
  currencyCode: string
  reference: string
  startsAt: Date
  endsAt: Date
  openingBalanceMinor: string
  closingBalanceMinor: string
  csv: string
  columns: {
    transactionId: string
    date: string
    amount: string
    description: string
  }
  units: "MINOR" | "MAJOR"
}

/** Imported observations never post a payment or change the journal watermark. */
export async function importFinanceBankStatement(
  db: PrismaClient,
  supplied: FinanceBankStatementImportInput,
) {
  const input = {
    ...supplied,
    reference: supplied.reference.trim(),
    startsAt: new Date(supplied.startsAt),
    endsAt: new Date(supplied.endsAt),
  }
  const expectedRevision = financeBankRevision(input.expectedRevision)
  const openingBalanceMinor = financeBankSignedBalance(
    input.openingBalanceMinor,
  )
  const closingBalanceMinor = financeBankSignedBalance(
    input.closingBalanceMinor,
  )
  if (
    !input.reference ||
    input.reference.length > 160 ||
    !Number.isFinite(input.startsAt.getTime()) ||
    !Number.isFinite(input.endsAt.getTime()) ||
    input.startsAt.toISOString().slice(11) !== "00:00:00.000Z" ||
    input.endsAt.toISOString().slice(11) !== "23:59:59.999Z" ||
    input.startsAt > input.endsAt ||
    input.endsAt >= new Date()
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Use a statement reference and a completed inclusive UTC date range.",
    )
  const rows = parseFinanceBankStatementCsv(
    input.csv,
    { ...input.columns },
    input.units,
  )
  if (
    rows.some(
      (row) => row.occurredAt < input.startsAt || row.occurredAt > input.endsAt,
    ) ||
    openingBalanceMinor +
      rows.reduce((sum, row) => sum + row.amountMinor, 0n) !==
      closingBalanceMinor
  )
    throw new FinanceError(
      "CONFLICT",
      "Statement rows must fall within the range and reconcile opening plus transactions to closing.",
    )
  const content = {
    accountId: input.accountId,
    currencyCode: input.currencyCode,
    reference: input.reference,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    openingBalanceMinor,
    closingBalanceMinor,
    rows,
  }
  const contentHash = financePayloadHash(content)
  return db.$transaction(
    (tx) =>
      financeDocumentCommand(
        tx,
        input,
        "BANK_STATEMENT_IMPORT",
        { ...content, expectedRevision },
        async (book) => {
          if (input.currencyCode !== book.currencyCode)
            throw new FinanceError(
              "CONFLICT",
              "The statement currency must equal the financial book currency.",
            )
          const account = await tx.financeAccount.findFirst({
            where: {
              id: input.accountId,
              bookId: book.id,
              kind: "ASSET",
              purpose: { in: ["BANK", "CLEARING"] },
              archivedAt: null,
            },
            select: { id: true },
          })
          if (!account)
            throw new FinanceError(
              "NOT_FOUND",
              "Choose an active bank or clearing account in this book.",
            )
          const state = await tx.financeBankAccountState.findUnique({
            where: {
              bookId_accountId: { bookId: book.id, accountId: account.id },
            },
          })
          if ((state?.revision ?? 0n) !== expectedRevision)
            throw new FinanceError(
              "CONFLICT",
              "Bank evidence changed. Refresh before importing.",
            )
          const existing = await tx.financeBankStatement.findFirst({
            where: {
              bookId: book.id,
              accountId: account.id,
              reference: input.reference,
            },
          })
          if (existing) {
            if (existing.contentHash !== contentHash)
              throw new FinanceError(
                "CONFLICT",
                "This statement reference already has different original details.",
              )
            return { id: existing.id }
          }
          const duplicate = await tx.financeBankStatementLine.findFirst({
            where: {
              bookId: book.id,
              accountId: account.id,
              externalId: { in: rows.map((row) => row.externalId) },
            },
            select: { id: true },
          })
          if (duplicate)
            throw new FinanceError(
              "CONFLICT",
              "An original bank transaction was already imported for this account. Do not import overlapping rows again.",
            )
          const revision = expectedRevision + 1n
          await tx.financeBankAccountState.upsert({
            where: {
              bookId_accountId: { bookId: book.id, accountId: account.id },
            },
            create: { bookId: book.id, accountId: account.id, revision },
            update: { revision },
          })
          return tx.financeBankStatement.create({
            data: {
              bookId: book.id,
              accountId: account.id,
              currencyCode: book.currencyCode,
              reference: input.reference,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              openingBalanceMinor,
              closingBalanceMinor,
              rowCount: rows.length,
              contentHash,
              importedRevision: revision,
              actorUserId: input.actorUserId,
              lines: {
                createMany: {
                  data: rows.map((row, position) => ({ position, ...row })),
                },
              },
            },
            select: { id: true },
          })
        },
      ),
    { maxWait: 10000, timeout: 30000 },
  )
}
