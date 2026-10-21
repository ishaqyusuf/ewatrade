import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
export type LedgerAccount = RouterOutputs["customerLedger"]["accountDetail"]
export type LedgerStatement = RouterOutputs["customerLedger"]["statement"]
export type LedgerEntry = LedgerStatement["entries"][number]
export type LedgerSource =
  RouterOutputs["customerLedger"]["sources"]["sources"][number]
export type LedgerDetail = RouterOutputs["customerLedger"]["entryDetail"]
export type LedgerMoneyAccount =
  RouterOutputs["finance"]["balances"]["accounts"][number]
export type LedgerRequest = {
  [K in
    | "recordOpening"
    | "recordReceipt"
    | "recordReceiptAndApply"
    | "applyCredit"
    | "releaseAllocation"
    | "refundUnusedCredit"
    | "reverseEntry"]: {
    operation: K
    payload: Omit<RouterInputs["customerLedger"][K], "clientCommandId">
  }
}[
  | "recordOpening"
  | "recordReceipt"
  | "recordReceiptAndApply"
  | "applyCredit"
  | "releaseAllocation"
  | "refundUnusedCredit"
  | "reverseEntry"]
export const ledgerLabels: Record<string, string> = {
  OPENING_DEBT: "Starting balance",
  OPENING_CREDIT: "Starting balance, paid ahead",
  RECEIPT: "Payment",
  ORDER_CHARGE: "Order",
  REFUND: "Paid-ahead money returned",
  REVERSAL: "Undo",
}

/** Payment methods in everyday words; the stored values stay codes. */
export const paymentMethodLabels: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  POS: "POS",
  CUSTOMER_CREDIT: "Paid ahead",
  OTHER: "Other",
}

/** "₦45,000 owed", "₦12,500 paid ahead" or "₦0"; never a minus sign. */
export function ledgerBalanceWords(
  netMinor: string,
  money: (minor: string) => string,
) {
  const net = BigInt(netMinor)
  if (net > BigInt(0)) return `${money(net.toString())} owed`
  if (net < BigInt(0)) return `${money((-net).toString())} paid ahead`
  return money("0")
}

export function formatLedgerDate(value: string | Date, withTime = false) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(
        "en-NG",
        withTime
          ? { dateStyle: "medium", timeStyle: "short" }
          : { dateStyle: "medium" },
      ).format(date)
}
