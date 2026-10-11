import { reviewFinanceMoneySources } from "./money-source-review"
import { runInOwnTransaction } from "../own-transaction"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
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

export function recordFinanceMoneyMovement(
  db: PrismaClient,
  input: FinanceMoneyInput,
) {
  return runInOwnTransaction(db, (tx) =>
    recordFinanceMoneyMovementInTransaction(tx, input),
  )
}

/** Caller owns commit/rollback; all Book, account and posting checks remain canonical. */
export async function recordFinanceMoneyMovementInTransaction(
  tx: Prisma.TransactionClient,
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
  const book = await lockFinanceBook(tx, input)
  const { account, opposite } = await reviewFinanceMoneySources(tx, input, book)
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
}
