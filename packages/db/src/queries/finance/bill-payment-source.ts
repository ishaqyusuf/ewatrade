import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceBillPaymentInput } from "./bills"
import { FinanceError, financeAmount } from "./rules"
type Input = Omit<FinanceBillPaymentInput, "clientCommandId">
export function normalizeFinanceBillPayment(input: Input) {
  const amount = financeAmount(input.amountMinor)
  const ownerFunded = input.funding === "OWNER_CAPITAL"
  if (
    (input.funding !== undefined &&
      !["OWNER_CAPITAL", "BUSINESS_ACCOUNT"].includes(input.funding)) ||
    (ownerFunded ? input.accountId !== undefined : !input.accountId)
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a business payment account or owner capital funding.",
    )
  }
  if (
    !Number.isFinite(input.effectiveAt.getTime()) ||
    (input.reference && input.reference.length > 160)
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Check the payment date and reference.",
    )
  }
  return { amount, ownerFunded }
}
/** Caller determines lock ownership; preview and execution use identical bill/source checks. */
export async function reviewFinanceBillPaymentSource(
  tx: Prisma.TransactionClient,
  input: Input,
  book: { id: string },
) {
  const { amount, ownerFunded } = normalizeFinanceBillPayment(input)
  const bill = await tx.financeBill.findFirst({
    where: { id: input.billId, bookId: book.id },
  })
  if (!bill)
    throw new FinanceError("NOT_FOUND", "Bill not found in this business.")
  if (bill.kind !== "EXPENSE")
    throw new FinanceError(
      "CONFLICT",
      "Purchase bills require the purchase settlement command.",
    )
  if (bill.voidedAt)
    throw new FinanceError(
      "CONFLICT",
      "A cancelled bill cannot receive another payment.",
    )
  if (input.effectiveAt < bill.incurredAt)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A bill payment cannot precede the expense. Record advances separately.",
    )
  if (amount > bill.totalMinor - bill.paidMinor)
    throw new FinanceError(
      "CONFLICT",
      "Payment exceeds the bill's outstanding amount.",
    )
  const account = await tx.financeAccount.findFirst({
    where: {
      bookId: book.id,
      ...(ownerFunded
        ? {
            code: "3000",
            kind: "EQUITY" as const,
            purpose: "CAPITAL" as const,
          }
        : {
            id: input.accountId,
            purpose: {
              in: ["CASH", "BANK", "CLEARING"] as Array<
                "CASH" | "BANK" | "CLEARING"
              >,
            },
          }),
      archivedAt: null,
    },
  })
  if (!account)
    throw new FinanceError(
      "NOT_FOUND",
      "Choose an active payment account in this business.",
    )
  const payable = await tx.financeAccount.findUniqueOrThrow({
    where: { bookId_code: { bookId: book.id, code: "2000" } },
  })
  return { bill, account, payable }
}
