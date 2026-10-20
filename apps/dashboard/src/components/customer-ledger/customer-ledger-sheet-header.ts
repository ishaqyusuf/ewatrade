import type { CustomerLedgerMode } from "@/hooks/use-customer-ledger-params"
export const customerLedgerTitles: Record<CustomerLedgerMode, string> = {
  opening: "Add starting balance",
  receipt: "Record payment",
  apply: "Use on an Order",
  entry: "Entry details",
  release: "Take off this Order",
  refund: "Refund paid-ahead money",
  reverse: "Undo entry",
}
