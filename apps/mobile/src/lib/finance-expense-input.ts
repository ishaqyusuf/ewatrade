import { parseFinanceMoney } from "@ewatrade/utils/finance-money"

export function financeUtcDate(value: string, minimum: Date | string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    date < new Date(minimum)
  )
    throw new Error(
      "Choose a valid UTC date on or after the original record and bookkeeping start.",
    )
  return date
}

export function prepareExpensePayment(input: {
  bookId: string
  billId: string
  outstandingMinor: string
  earliestDate: Date | string
  fundingAccountId: string
  activeAccountIds: string[]
  amount: string
  date: string
  reference: string
}) {
  const amountMinor = parseFinanceMoney(input.amount)
  if (BigInt(amountMinor) > BigInt(input.outstandingMinor))
    throw new Error(
      "Payment exceeds the amount still owed. Refresh the expense before reviewing.",
    )
  const reference = input.reference.trim()
  if (reference.length > 160)
    throw new Error("Use a payment reference of up to 160 characters.")
  const common = {
    bookId: input.bookId,
    billId: input.billId,
    amountMinor,
    effectiveAt: financeUtcDate(input.date, input.earliestDate),
    ...(reference ? { reference } : {}),
  }
  if (input.fundingAccountId === "OWNER_CAPITAL")
    return { ...common, funding: "OWNER_CAPITAL" as const }
  if (!input.activeAccountIds.includes(input.fundingAccountId))
    throw new Error(
      "Choose an active business money account or owner personal funds.",
    )
  return {
    ...common,
    funding: "BUSINESS_ACCOUNT" as const,
    accountId: input.fundingAccountId,
  }
}

export function prepareExpenseCorrection(input: {
  bookId: string
  billId: string
  paymentId?: string
  earliestDate: Date | string
  reason: string
  date: string
}) {
  const reason = input.reason.trim()
  if (!reason || reason.length > 400)
    throw new Error("Enter a correction reason of up to 400 characters.")
  const common = {
    bookId: input.bookId,
    reason,
    effectiveAt: financeUtcDate(input.date, input.earliestDate),
  }
  return input.paymentId
    ? {
        operation: "reverseBillPayment" as const,
        payload: { ...common, paymentId: input.paymentId },
      }
    : {
        operation: "voidExpense" as const,
        payload: { ...common, billId: input.billId },
      }
}
