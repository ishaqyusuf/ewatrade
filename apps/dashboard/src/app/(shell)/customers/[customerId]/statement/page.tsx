import { CustomerLedgerRoute } from "@/components/customer-ledger/customer-ledger-route"
export default async function Page({
  params,
}: { params: Promise<{ customerId: string }> }) {
  return <CustomerLedgerRoute customerId={(await params).customerId} />
}
