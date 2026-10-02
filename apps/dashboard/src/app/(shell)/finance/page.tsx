import { FinanceRoute } from "@/components/finance/finance-route"
export const metadata = { title: "Finance | EwaTrade" }
export default function Page({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FinanceRoute view="overview" searchParams={searchParams} />
}
