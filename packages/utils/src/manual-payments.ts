export class ManualPaymentError extends Error {
  constructor(
    readonly code: "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message)
    this.name = "ManualPaymentError"
  }
}
export const MANUAL_RECEIPT_MAX_BYTES = 4 * 1024 * 1024
export const manualReceiptTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const

export function manualPaymentAmount(input: {
  amountMinor: number
  requestedMinor: number
  balanceMinor: number
  allowPartial: boolean
}) {
  const due = Math.min(input.requestedMinor, input.balanceMinor)
  if (!Number.isSafeInteger(due) || due <= 0)
    throw new ManualPaymentError(
      "CONFLICT",
      "This order has no amount available to pay.",
    )
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    input.amountMinor > due
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Enter a positive payment amount up to the amount due.",
    )
  if (!input.allowPartial && input.amountMinor !== due)
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "This business requires the displayed payment amount.",
    )
  return due
}

export function manualBankDetails(input: {
  bankName: string
  accountNumber: string
  accountHolder: string
}) {
  const bankName = input.bankName.trim()
  const bankAccountHolder = input.accountHolder.trim()
  const bankAccountNumber = input.accountNumber.trim()
  if (
    !bankName ||
    bankName.length > 100 ||
    !bankAccountHolder ||
    bankAccountHolder.length > 160 ||
    !/^\d{10}$/.test(bankAccountNumber)
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Enter the bank, account holder and ten-digit Nigerian account number.",
    )
  return { bankName, bankAccountNumber, bankAccountHolder }
}

export function manualPaymentOutcome(input: {
  status: string
  receivedAmountMinor: number | null
  balanceMinor: number
  currencyCode: string
  orderNumber: string
  note: string | null
}) {
  const money = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: input.currencyCode,
  }).format((input.receivedAmountMinor ?? 0) / 100)
  if (input.status === "CONFIRMED")
    return {
      state:
        input.balanceMinor > 0
          ? ("partially_paid" as const)
          : ("paid" as const),
      message: `We have confirmed receipt of ${money} for order ${input.orderNumber}.${input.balanceMinor > 0 ? " A balance remains on your order." : " Thank you for your payment."}`,
    }
  if (input.status === "NOT_RECEIVED")
    return {
      state: "not_received" as const,
      message: `We have not confirmed receipt of your payment for order ${input.orderNumber}.${input.note ? ` ${input.note}` : " Please check the transfer and contact us."}`,
    }
  return {
    state: "checking" as const,
    message: "Your payment is being confirmed.",
  }
}
