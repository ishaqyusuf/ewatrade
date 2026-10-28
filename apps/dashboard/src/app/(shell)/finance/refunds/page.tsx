import { CustomerRefundsRoute } from "@/components/customer-ledger/refunds/customer-refunds-route"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Refunds | EwaTrade" }

export default function Page() {
  return <CustomerRefundsRoute />
}
