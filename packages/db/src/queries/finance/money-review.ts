import type { Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager } from "./access"
import type { FinanceMoneyInput } from "./money"
import { reviewFinanceMoneySources } from "./money-source-review"
import { FinanceError, financeAmount, assertFinancePostingDate } from "./rules"

/** Read-only preview for recording completed movements; execution repeats checks under locks. */
export async function getFinanceMoneyMovementReview(
  tx: Prisma.TransactionClient,
  input: Omit<FinanceMoneyInput, "clientCommandId">,
) {
  await assertFinanceManager(tx, input)
  if (
    !["TRANSFER", "OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL"].includes(input.kind)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a transfer, owner contribution or owner withdrawal.",
    )
  const amount = financeAmount(input.amountMinor)
  if (!input.description.trim() || input.description.length > 500)
    throw new FinanceError("INVALID_JOURNAL", "Describe the recorded movement.")
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  assertFinancePostingDate({
    effectiveAt: input.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  if (
    input.storeId &&
    !(await tx.store.findFirst({
      where: { id: input.storeId, tenantId: input.tenantId },
      select: { id: true },
    }))
  )
    throw new FinanceError("NOT_FOUND", "Store not found in this business.")
  const { account, opposite } = await reviewFinanceMoneySources(tx, input, book)
  // Posting checks both accounts' active state before new effects, including equity controls.
  if (account.archivedAt || opposite.archivedAt)
    throw new FinanceError(
      "NOT_FOUND",
      "An account is unavailable in this financial book.",
    )
  const outgoing =
    input.kind === "TRANSFER" || input.kind === "OWNER_WITHDRAWAL"
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    kind: input.kind,
    accountId: account.id,
    accountName: account.name,
    accountPurpose: account.purpose,
    oppositeAccountId: opposite.id,
    oppositeAccountName: opposite.name,
    oppositeAccountPurpose: opposite.purpose,
    debitAccountId: outgoing ? opposite.id : account.id,
    creditAccountId: outgoing ? account.id : opposite.id,
    amountMinor: amount.toString(),
    effectiveAt: input.effectiveAt.toISOString(),
    description: input.description.trim(),
    startsAt: book.startsAt.toISOString(),
    closedThrough: book.closedThrough?.toISOString() ?? null,
    effect: "RECORD_COMPLETED_MONEY_MOVEMENT" as const,
    moneyTransfer: "NOT_PERFORMED" as const,
  }
}
