import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, lockFinanceBook } from "./access"
import { postFinanceJournalInTransaction } from "./posting"
import { FinanceError, financeAmount } from "./rules"

export type FinanceMoneyInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  accountId: string
  amountMinor: string
  description: string
  effectiveAt: Date
  storeId?: string
} & (
    | { kind: "TRANSFER"; destinationAccountId: string }
    | {
        kind: "OWNER_CONTRIBUTION" | "OWNER_WITHDRAWAL" | "OPENING_BALANCE"
        destinationAccountId?: never
      }
  )

export async function recordFinanceMoneyMovement(
  db: PrismaClient,
  input: FinanceMoneyInput,
) {
  financeAmount(input.amountMinor)
  if (
    ![
      "TRANSFER",
      "OWNER_CONTRIBUTION",
      "OWNER_WITHDRAWAL",
      "OPENING_BALANCE",
    ].includes(input.kind)
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a supported money movement.",
    )
  }
  return db.$transaction(
    async (tx) => {
      const book = await lockFinanceBook(tx, input)
      const account = await tx.financeAccount.findFirst({
        where: {
          id: input.accountId,
          bookId: book.id,
          purpose: { in: ["CASH", "BANK", "CLEARING"] },
          archivedAt: null,
        },
      })
      if (!account)
        throw new FinanceError("NOT_FOUND", "Choose an active money account.")
      const opposite =
        input.kind === "TRANSFER"
          ? await tx.financeAccount.findFirst({
              where: {
                id: input.destinationAccountId,
                bookId: book.id,
                purpose: { in: ["CASH", "BANK", "CLEARING"] },
                archivedAt: null,
              },
            })
          : await tx.financeAccount.findUnique({
              where: {
                bookId_code: {
                  bookId: book.id,
                  code:
                    input.kind === "OWNER_CONTRIBUTION"
                      ? "3000"
                      : input.kind === "OWNER_WITHDRAWAL"
                        ? "3100"
                        : "3900",
                },
              },
            })
      if (!opposite || opposite.id === account.id) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "Choose a different account in the same financial book.",
        )
      }
      if (
        input.kind === "OPENING_BALANCE" &&
        input.effectiveAt.getTime() !== book.startsAt.getTime()
      ) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "Opening balances use the bookkeeping start date.",
        )
      }
      const outgoing =
        input.kind === "TRANSFER" || input.kind === "OWNER_WITHDRAWAL"
      return postFinanceJournalInTransaction(tx, {
        ...input,
        sourceKind: input.kind,
        // One original opening balance per account; correction needs reversal.
        sourceId:
          input.kind === "OPENING_BALANCE" ? account.id : input.clientCommandId,
        lines: [
          {
            accountId: account.id,
            side: outgoing ? "CREDIT" : "DEBIT",
            amountMinor: input.amountMinor,
          },
          {
            accountId: opposite.id,
            side: outgoing ? "DEBIT" : "CREDIT",
            amountMinor: input.amountMinor,
          },
        ],
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
