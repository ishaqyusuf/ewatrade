import type { CustomerLedgerMode } from "@/hooks/use-customer-ledger-params"
export const customerLedgerTitles: Record<CustomerLedgerMode, string> = {
  opening: "Add starting balance",
  receipt: "Record payment",
  apply: "Use on an order",
  entry: "Entry details",
  release: "Take off this order",
  refund: "Return paid-ahead money",
  reverse: "Undo entry",
  remind: "Send reminder",
  summary: "Share summary",
  link: "Link earlier orders",
}
