import type { CustomerLedgerMode } from "@/hooks/use-customer-ledger-params"
export const customerLedgerTitles: Record<CustomerLedgerMode, string> = {
  opening: "Record opening balance",
  receipt: "Receive customer payment",
  apply: "Apply existing credit",
  entry: "Customer entry",
  release: "Release allocation",
  refund: "Return unused credit",
  reverse: "Correct customer entry",
}
