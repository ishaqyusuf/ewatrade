import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import type { FinanceMoneyInput } from "./money"
import { FinanceError } from "./rules"

/** Shared source checks; the caller decides whether the Book is locked. */
export async function reviewFinanceMoneySources(
  tx: Prisma.TransactionClient,
  input: Omit<FinanceMoneyInput, "clientCommandId">,
  book: FinanceBook,
) {
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
  return { account, opposite }
}
