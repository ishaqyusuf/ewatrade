import type { Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager } from "./access"
import type { FinanceExpenseInput } from "./bills"
import { normalizeFinanceExpense } from "./expense-input"
import { FinanceError, assertFinancePostingDate, financeAmount } from "./rules"

/** Advisory review; canonical expense/payment commands repeat authority and posting checks. */
export async function getFinanceExpenseReview(
  tx: Prisma.TransactionClient,
  input: Omit<FinanceExpenseInput, "clientCommandId">,
) {
  await assertFinanceManager(tx, input)
  const { lines, totalMinor } = normalizeFinanceExpense(input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  const postingDate = (effectiveAt: Date) =>
    assertFinancePostingDate({
      effectiveAt,
      startsAt: book.startsAt,
      closedThrough: book.closedThrough,
      now: new Date(),
    })
  postingDate(input.incurredAt)
  if (
    input.storeId &&
    !(await tx.store.findFirst({
      where: { id: input.storeId, tenantId: input.tenantId },
      select: { id: true },
    }))
  )
    throw new FinanceError("NOT_FOUND", "Store not found in this business.")
  const ids = [...new Set(lines.map((line) => line.accountId))]
  const categories = await tx.financeAccount.findMany({
    where: {
      bookId: book.id,
      id: { in: ids },
      kind: "EXPENSE",
      purpose: "OPERATING_EXPENSE",
      archivedAt: null,
    },
    select: { id: true, name: true },
  })
  if (categories.length !== ids.length)
    throw new FinanceError(
      "NOT_FOUND",
      "Choose active expense categories in this business.",
    )
  const payable = await tx.financeAccount.findUnique({
    where: { bookId_code: { bookId: book.id, code: "2000" } },
  })
  if (!payable || payable.archivedAt)
    throw new FinanceError("NOT_FOUND", "The payable account is unavailable.")
  let payment: {
    funding: "OWNER_CAPITAL" | "BUSINESS_ACCOUNT"
    accountId: string
    accountName: string
    amountMinor: string
    effectiveAt: string
    reference: string | null
  } | null = null
  if (input.payment) {
    const source = input.payment,
      amount = financeAmount(source.amountMinor),
      owner = source.funding === "OWNER_CAPITAL"
    if (
      (source.funding !== undefined &&
        !["OWNER_CAPITAL", "BUSINESS_ACCOUNT"].includes(source.funding)) ||
      (owner ? source.accountId !== undefined : !source.accountId)
    )
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Choose a business payment account or owner capital funding.",
      )
    postingDate(source.effectiveAt)
    if (
      source.effectiveAt < input.incurredAt ||
      (source.reference && source.reference.length > 160)
    )
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Check the payment date and reference.",
      )
    if (amount > totalMinor)
      throw new FinanceError(
        "CONFLICT",
        "Payment exceeds the bill's outstanding amount.",
      )
    const account = await tx.financeAccount.findFirst({
      where: {
        bookId: book.id,
        archivedAt: null,
        ...(owner
          ? { code: "3000", kind: "EQUITY", purpose: "CAPITAL" }
          : {
              id: source.accountId,
              purpose: { in: ["CASH", "BANK", "CLEARING"] },
            }),
      },
    })
    if (!account)
      throw new FinanceError(
        "NOT_FOUND",
        "Choose an active payment account in this business.",
      )
    payment = {
      funding: owner ? "OWNER_CAPITAL" : "BUSINESS_ACCOUNT",
      accountId: account.id,
      accountName: account.name,
      amountMinor: amount.toString(),
      effectiveAt: source.effectiveAt.toISOString(),
      reference: source.reference?.trim() || null,
    }
  }
  const paid = BigInt(payment?.amountMinor ?? "0")
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt.toISOString(),
    closedThrough: book.closedThrough?.toISOString() ?? null,
    payeeName: input.payeeName.trim(),
    description: input.description.trim(),
    reference: input.reference?.trim() || null,
    incurredAt: input.incurredAt.toISOString(),
    dueAt: input.dueAt?.toISOString() ?? null,
    lines: lines.map((line) => ({
      accountId: line.accountId,
      accountName: categories.find(
        (category) => category.id === line.accountId,
      )!.name,
      description: line.description,
      amountMinor: line.amountMinor.toString(),
    })),
    totalMinor: totalMinor.toString(),
    paidMinor: paid.toString(),
    outstandingMinor: (totalMinor - paid).toString(),
    payableAccountId: payable.id,
    payableAccountName: payable.name,
    payment,
    status:
      paid === 0n ? "UNPAID" : paid === totalMinor ? "PAID" : "PARTIALLY_PAID",
    moneyTransfer: "NOT_PERFORMED" as const,
  }
}
