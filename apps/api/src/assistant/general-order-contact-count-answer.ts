import { generalCountAnswer } from "./general-count-answer"

export function generalOrderContactCountAnswer(input: {
  count: number
  storeName?: string
  ownSales: boolean
}) {
  return generalCountAnswer({
    title: "Order contact identities",
    count: input.count,
    scope: `${input.storeName ?? "Current business · all Stores"} · ${input.ownSales ? "your own sales" : "all visible orders"}`,
    detail:
      "Exact distinct contact keys from order snapshots: email first, otherwise phone, otherwise name. Blank contacts excluded. All dates and statuses, including cancelled/refunded. This does not count unique people, saved directory entries or customers with unpaid orders.",
  })
}
