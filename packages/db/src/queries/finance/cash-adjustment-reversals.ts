import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { FinanceError } from "./rules"

export type FinanceCashAdjustmentReversalInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  entryId: string
  expectedSnapshotSequence: string
  reason: string
  effectiveAt: Date
}

export async function reverseFinanceCashAdjustmentInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceCashAdjustmentReversalInput,
) {
  const reason = input.reason.trim()
  if (
    !reason ||
    reason.length > 400 ||
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedSnapshotSequence)
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Review the current snapshot and give a reason for the cash-adjustment reversal.",
    )
  }
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "CASH_COUNT_ADJUSTMENT_REVERSAL",
    { ...payload, reason },
    async (book) => {
      if (book.lastSequence !== BigInt(input.expectedSnapshotSequence)) {
        throw new FinanceError(
          "CONFLICT",
          "Finance entries changed. Review the cash count again.",
        )
      }
      const original = await tx.financeJournalEntry.findFirst({
        where: {
          id: input.entryId,
          bookId: book.id,
          sourceKind: "CASH_COUNT_ADJUSTMENT",
        },
        include: {
          lines: true,
          reversal: { select: { id: true } },
        },
      })
      if (!original) {
        throw new FinanceError(
          "NOT_FOUND",
          "Cash-count adjustment not found in this book.",
        )
      }
      if (original.reversalOfId || original.reversal) {
        throw new FinanceError(
          "CONFLICT",
          "This cash-count adjustment is already reversed or is itself a reversal.",
        )
      }
      if (
        !Number.isFinite(input.effectiveAt.getTime()) ||
        input.effectiveAt < original.effectiveAt
      ) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "A reversal cannot precede the original cash adjustment.",
        )
      }
      await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "cash-adjustment-reversal",
        ),
        sourceKind: "CASH_COUNT_ADJUSTMENT_REVERSAL",
        sourceId: original.id,
        reversalOfId: original.id,
        storeId: original.storeId ?? undefined,
        description: `Reversal: ${reason}`,
        effectiveAt: input.effectiveAt,
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

export async function reverseFinanceCashAdjustment(
  db: PrismaClient,
  input: FinanceCashAdjustmentReversalInput,
) {
  return db.$transaction(
    (tx) => reverseFinanceCashAdjustmentInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
