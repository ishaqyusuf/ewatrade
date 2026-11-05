import { expect, test } from "bun:test"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { answerListLink, groupAnswerRows } from "./answer-groups"

const asOf = "2026-11-05T13:25:00.000Z"
const origin = { tenantId: "t", storeId: "s" }
function answer(id: string, extra: Partial<GeneralAnswer> = {}): GeneralAnswer {
  return {
    id,
    title: id,
    value: "₦600.00",
    scope: "Store · Authorized orders",
    asOf,
    detail: "model notes",
    ...extra,
  }
}
const order = (id: string) =>
  answer(id, { target: { kind: "order", orderId: id, origin } })

test("a page header gathers the records it listed into one card", () => {
  const groups = groupAnswerRows([
    answer("Orders"),
    order("ORD-058"),
    order("ORD-056"),
  ])
  expect(groups).toHaveLength(1)
  expect(groups[0]?.rows.map((row) => row.id)).toEqual(["ORD-058", "ORD-056"])
})

test("records from another read, or a lone record, keep their own card", () => {
  const groups = groupAnswerRows([
    order("ORD-001"),
    answer("Orders"),
    order("ORD-058"),
    answer("Catalog", { scope: "Catalog" }),
    answer("Other read", { asOf: "2026-11-05T13:26:00.000Z" }),
    order("ORD-059"),
  ])
  expect(groups.map((group) => [group.head.id, group.rows.length])).toEqual([
    ["ORD-001", 0],
    ["Orders", 1],
    ["Catalog", 0],
    ["Other read", 0],
    ["ORD-059", 0],
  ])
})

test("a record with its own choices or handoff is never folded into a row", () => {
  const groups = groupAnswerRows([
    answer("Orders"),
    { ...order("ORD-058"), chatChoices: [{ title: "Yes", text: "Yes" }] },
  ])
  expect(groups).toHaveLength(2)
})

test("a list with more results links to its screen; a complete one does not", () => {
  const head = (continuation: unknown) =>
    answer("Orders", { continuation } as Partial<GeneralAnswer>)
  const orders = (input: Record<string, unknown>, nextCursor: string | null) =>
    head({ version: 1, tool: "readOrders", input, nextCursor })
  expect(answerListLink(orders({ owing: true }, "c1"))).toEqual({
    label: "See all orders",
    href: "/(admin-tabs)/orders?payment=owing",
  })
  expect(answerListLink(orders({}, "c1"))?.href).toBe("/(admin-tabs)/orders")
  expect(answerListLink(orders({ owing: true }, null))).toBeNull()
  expect(answerListLink(answer("Sales today"))).toBeNull()
})
