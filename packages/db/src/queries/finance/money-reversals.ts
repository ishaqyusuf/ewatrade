import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { FinanceError } from "./rules"

export type FinanceMoneyReversalInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  entryId: string
  reason: string
  effectiveAt: Date
}

export async function reverseFinanceMoneyInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceMoneyReversalInput,
) {
  const reason = input.reason.trim()
  if (!reason || reason.length > 400) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Enter a correction reason of up to 400 characters.",
    )
  }
  return financeDocumentCommand(
    tx,
    input,
    "REVERSE_MONEY",
    {
      entryId: input.entryId,
      reason,
      effectiveAt: input.effectiveAt,
    },
    async (book) => {
      const original = await tx.financeJournalEntry.findFirst({
        where: { id: input.entryId, bookId: book.id },
        include: { lines: true, reversal: { select: { id: true } } },
      })
      if (!original)
        throw new FinanceError(
          "NOT_FOUND",
          "Money movement not found in this book.",
        )
      if (original.reversalOfId || original.reversal) {
        throw new FinanceError(
          "CONFLICT",
          "This movement is already reversed or is itself a reversal.",
        )
      }
      if (
        !["TRANSFER", "OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL"].includes(
          original.sourceKind,
        )
      ) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "Correct this posting through its originating workflow.",
        )
      }
      if (
        !Number.isFinite(input.effectiveAt.getTime()) ||
        input.effectiveAt < original.effectiveAt
      ) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "A reversal cannot precede the original movement.",
        )
      }
      await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "money-reversal",
        ),
        sourceKind: "MONEY_REVERSAL",
        sourceId: original.id,
        reversalOfId: original.id,
        storeId: original.storeId ?? undefined,
        description: `Reversal: ${reason}`,
        lines: original.lines.map((line) => ({
          accountId: line.accountId,
          side: line.debitMinor > BigInt(0) ? "CREDIT" : "DEBIT",
          amountMinor: (line.debitMinor > BigInt(0)
            ? line.debitMinor
            : line.creditMinor
          ).toString(),
          description: line.description ?? undefined,
        })),
      })
      const reversal = await tx.financeJournalEntry.findUniqueOrThrow({
        where: { reversalOfId: original.id },
        select: { id: true },
      })
      return { id: reversal.id }
    },
  )
}

export async function reverseFinanceMoney(
  db: PrismaClient,
  input: FinanceMoneyReversalInput,
) {
  return db.$transaction((tx) => reverseFinanceMoneyInTransaction(tx, input), {
    maxWait: 10_000,
    timeout: 30_000,
  })
}
