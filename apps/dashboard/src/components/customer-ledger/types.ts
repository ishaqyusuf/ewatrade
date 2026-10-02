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
  | "applyCredit"
  | "releaseAllocation"
  | "refundUnusedCredit"
  | "reverseEntry"]
export const ledgerLabels: Record<string, string> = {
  OPENING_DEBT: "Opening debt",
  OPENING_CREDIT: "Opening credit",
  RECEIPT: "Payment received",
  ORDER_CHARGE: "Order charge",
  REFUND: "Unused credit returned",
  REVERSAL: "Correction",
}
