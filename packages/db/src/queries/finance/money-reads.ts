import type { PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

export type FinanceMoneyMovementInput = FinanceActor & {
  bookId: string
  entryId: string
}

const REVERSIBLE_MONEY_SOURCES = [
  "TRANSFER",
  "OWNER_CONTRIBUTION",
  "OWNER_WITHDRAWAL",
] as const

export async function getFinanceMoneyMovement(
  db: PrismaClient,
  input: FinanceMoneyMovementInput,
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)

      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true, currencyCode: true },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")

      const entry = await tx.financeJournalEntry.findFirst({
        where: { id: input.entryId, bookId: book.id },
        select: {
          id: true,
          bookId: true,
          sourceKind: true,
          description: true,
          effectiveAt: true,
          recordedAt: true,
          actorUserId: true,
          sequence: true,
          reversalOfId: true,
          reversal: {
            select: {
              id: true,
              effectiveAt: true,
              recordedAt: true,
              description: true,
            },
          },
          lines: {
            orderBy: [{ accountId: "asc" }, { id: "asc" }],
            select: {
              accountId: true,
              debitMinor: true,
              creditMinor: true,
              description: true,
              account: {
                select: { name: true, kind: true, purpose: true },
              },
            },
          },
        },
      })
      if (
        !entry ||
        entry.reversalOfId !== null ||
        !(REVERSIBLE_MONEY_SOURCES as readonly string[]).includes(
          entry.sourceKind,
        )
      ) {
        throw new FinanceError(
          "NOT_FOUND",
          "Money movement not found in this book.",
        )
      }

      return {
        id: entry.id,
        bookId: entry.bookId,
        currencyCode: book.currencyCode,
        sourceKind: entry.sourceKind,
        description: entry.description,
        effectiveAt: entry.effectiveAt,
        recordedAt: entry.recordedAt,
        actorUserId: entry.actorUserId,
        sequence: entry.sequence.toString(),
        reversalOfId: entry.reversalOfId,
        reversal: entry.reversal,
        lines: entry.lines.map((line) => ({
          accountId: line.accountId,
          accountName: line.account.name,
          accountKind: line.account.kind,
          accountPurpose: line.account.purpose,
          debitMinor: line.debitMinor.toString(),
          creditMinor: line.creditMinor.toString(),
          description: line.description,
        })),
      }
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
      isolationLevel: "RepeatableRead",
    },
  )
}
