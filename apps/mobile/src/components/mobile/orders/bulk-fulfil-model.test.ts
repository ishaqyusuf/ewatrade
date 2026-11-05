import { expect, test } from "bun:test"
import {
  bulkFulfilDone,
  bulkFulfilFailed,
  bulkFulfilSummary,
  planBulkFulfil,
} from "./bulk-fulfil-model"

const order = (id: string, customerName?: string) => ({
  customerName,
  id,
  orderNumber: `ORD-${id}`,
})

test("orders with nothing ready are skipped before any call", () => {
  const ready = { a: 2, b: 0, c: 1 } as Record<string, number>
  const plan = planBulkFulfil(
    [order("a", "Amaka"), order("b"), order("c")],
    (o) => ready[o.id] ?? 0,
  )
  expect(plan.ready.map((entry) => [entry.order.id, entry.lines])).toEqual([
    ["a", 2],
    ["c", 1],
  ])
  expect(plan.skipped).toEqual([
    {
      detail: "Nothing ready to fulfil",
      label: "ORD-b · Walk-in customer",
      key: "b",
      result: "skipped",
    },
  ])
})

test("the report names each order's result and why it was skipped", () => {
  const outcomes = [
    bulkFulfilDone(order("a", "Amaka"), 1),
    bulkFulfilDone(order("c"), 3),
    bulkFulfilFailed(order("d"), new Error("Stock changed. Review the Order.")),
    bulkFulfilFailed(order("e"), "boom"),
  ]
  expect(outcomes.map((outcome) => outcome.detail)).toEqual([
    "1 line fulfilled",
    "3 lines fulfilled",
    "Stock changed. Review the Order.",
    "Couldn’t fulfil this Order. Try it from the Order.",
  ])
  expect(bulkFulfilSummary(outcomes)).toBe("2 fulfilled · 2 skipped")
  expect(bulkFulfilSummary(outcomes.slice(0, 2))).toBe("2 fulfilled")
})
