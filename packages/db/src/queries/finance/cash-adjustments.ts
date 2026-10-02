import type { PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { FinanceError, financeAmount } from "./rules"

export async function adjustFinanceCashCount(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    countId: string
    clientCommandId: string
    expectedSnapshotSequence: string
    reason: string
  },
) {
  const reason = input.reason.trim()
  if (
    !reason ||
    reason.length > 400 ||
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedSnapshotSequence)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Review the current snapshot and give a reason for the cash adjustment.",
    )
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return db.$transaction(
    (tx) =>
      financeDocumentCommand(
        tx,
        input,
        "CASH_COUNT_ADJUSTMENT",
        payload,
        async (book) => {
          if (book.lastSequence !== BigInt(input.expectedSnapshotSequence))
            throw new FinanceError(
              "CONFLICT",
              "Finance entries changed. Review the cash count again.",
            )
          const count = await tx.financeReconciliation.findFirst({
            where: {
              id: input.countId,
              bookId: book.id,
              account: { purpose: "CASH", archivedAt: null },
            },
          })
          if (!count)
            throw new FinanceError(
              "NOT_FOUND",
              "Active cash count not found in this book.",
            )
          const existing = await tx.financeJournalEntry.findUnique({
            where: {
              bookId_sourceKind_sourceId: {
                bookId: book.id,
                sourceKind: "CASH_COUNT_ADJUSTMENT",
                sourceId: count.id,
              },
            },
          })
          if (existing)
            throw new FinanceError(
              "CONFLICT",
              "This count already has an adjustment.",
            )
          const changed = await tx.financeJournalLine.findFirst({
            where: {
              bookId: book.id,
              accountId: count.accountId,
              entry: {
                effectiveAt: { lte: count.asOf },
                sequence: { gt: count.snapshotSequence },
              },
            },
            select: { id: true },
          })
          if (changed)
            throw new FinanceError(
              "CONFLICT",
              "History changed since this count. Investigate and record a fresh count before adjusting.",
            )
          const difference =
            count.observedBalanceMinor - count.expectedBalanceMinor
          if (difference === BigInt(0))
            throw new FinanceError(
              "CONFLICT",
              "This count already matches the recorded balance.",
            )
          const amount = financeAmount(
            (difference < BigInt(0) ? -difference : difference).toString(),
          ).toString()
          const surplus = difference > BigInt(0)
          const code = surplus ? "CASH_SURPLUS" : "CASH_SHORTAGE"
          const kind = surplus ? ("INCOME" as const) : ("EXPENSE" as const)
          const offset = await tx.financeAccount.upsert({
            where: { bookId_code: { bookId: book.id, code } },
            create: {
              bookId: book.id,
              code,
              name: surplus ? "Cash count surplus" : "Cash count shortage",
              kind,
              purpose: "OTHER",
            },
            update: {},
          })
          if (
            offset.kind !== kind ||
            offset.purpose !== "OTHER" ||
            offset.archivedAt
          )
            throw new FinanceError(
              "CONFLICT",
              "The cash adjustment account code is already used by an incompatible account.",
            )
          await postFinanceJournalInTransaction(tx, {
            ...input,
            clientCommandId: financePostingCommandId(
              input.clientCommandId,
              "adjustment",
            ),
            sourceKind: "CASH_COUNT_ADJUSTMENT",
            sourceId: count.id,
            description: `Cash count adjustment: ${reason}`,
            effectiveAt: count.asOf,
            lines: [
              {
                accountId: count.accountId,
                side: surplus ? "DEBIT" : "CREDIT",
                amountMinor: amount,
              },
              {
                accountId: offset.id,
                side: surplus ? "CREDIT" : "DEBIT",
                amountMinor: amount,
              },
            ],
          })
          return tx.financeJournalEntry.findUniqueOrThrow({
            where: {
              bookId_sourceKind_sourceId: {
                bookId: book.id,
                sourceKind: "CASH_COUNT_ADJUSTMENT",
                sourceId: count.id,
              },
            },
            select: { id: true },
          })
        },
      ),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
