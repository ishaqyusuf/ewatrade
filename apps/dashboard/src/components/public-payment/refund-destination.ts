/**
 * Bank details for a refund request, exactly as the verified refund report takes them: a bank
 * name typed by the customer (no bank code or directory is invented), a ten-digit account number
 * and the account holder's name. They live in this page's memory only: never browser storage,
 * query keys, logs or report metadata, so finishing after a reload asks for them again.
 */
export type RefundDestination = {
  bankName: string
  accountNumber: string
  accountName: string
}

/** What the customer has typed so far. */
export type RefundDestinationText = RefundDestination

export type RefundDestinationField = keyof RefundDestination

export const emptyRefundDestination: RefundDestinationText = {
  bankName: "",
  accountNumber: "",
  accountName: "",
}

export function refundDestinationIsEmpty(text: RefundDestinationText) {
  return (
    !text.bankName.trim() &&
    !text.accountNumber.trim() &&
    !text.accountName.trim()
  )
}

export type RefundDestinationResult =
  | { kind: "empty" }
  | { kind: "invalid"; field: RefundDestinationField; message: string }
  | { kind: "valid"; destination: RefundDestination }

/** The same bounds the server checks; spaces in the account number are dropped. */
export function readRefundDestination(
  text: RefundDestinationText,
): RefundDestinationResult {
  if (refundDestinationIsEmpty(text)) return { kind: "empty" }
  const bankName = text.bankName.trim().replace(/\s+/g, " ")
  const accountNumber = text.accountNumber.replace(/[\s-]/g, "")
  const accountName = text.accountName.trim().replace(/\s+/g, " ")
  if (bankName.length < 2 || bankName.length > 100)
    return {
      kind: "invalid",
      field: "bankName",
      message: "Enter the name of your bank.",
    }
  if (!/^\d{10}$/.test(accountNumber))
    return {
      kind: "invalid",
      field: "accountNumber",
      message: "Enter your ten-digit account number.",
    }
  if (accountName.length < 2 || accountName.length > 160)
    return {
      kind: "invalid",
      field: "accountName",
      message: "Enter the account holder's name as your bank shows it.",
    }
  return {
    kind: "valid",
    destination: { bankName, accountNumber, accountName },
  }
}

export function sameRefundDestination(
  a: RefundDestination | null,
  b: RefundDestination | null,
) {
  if (!a || !b) return a === b
  return (
    a.bankName === b.bankName &&
    a.accountNumber === b.accountNumber &&
    a.accountName === b.accountName
  )
}
