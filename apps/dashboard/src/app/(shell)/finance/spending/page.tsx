import { FinanceRoute } from "@/components/finance/finance-route"
export const metadata = { title: "Spending | EwaTrade" }
export default function Page({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FinanceRoute view="spending" searchParams={searchParams} />
}
