import { FinanceRoute } from "@/components/finance/finance-route"
export const metadata = { title: "Bank statements | EwaTrade" }
export default function Page({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FinanceRoute view="bank" searchParams={searchParams} />
}
