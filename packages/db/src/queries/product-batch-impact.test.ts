import { expect, test } from "bun:test"
import { productBatchImpact } from "./product-batch-impact"

const line = (id: string) => ({
  orderLineId: id,
  stock: { balanceSourceId: "shared", unitName: "Piece", onHandBefore: "3",
    onHandAfter: "2", reservedBefore: "3", canonicalBefore: "3", canonicalQuantity: "1" },
  cost: { status: "PROJECTED", currencyCode: "NGN", valueBeforeMinor: "2" as string | null,
    unknownReason: null as string | null, poolSequence: "1" },
})

test("shared balance costs round per issue, not once on the combined quantity", () => {
  const first = line("one")
  first.cost.valueBeforeMinor = "1"
  expect(productBatchImpact([first, { ...first, orderLineId: "two" }])).toMatchObject([{
    onHandBefore: "3", onHandAfter: "1", reservedAfter: "1", canonicalAfter: "1",
    valueBeforeMinor: "1", valueAfterMinor: "1", valueDeltaMinor: "0",
  }])
})

test("packaged and canonical quantities stay distinct, with exact large costs", () => {
  const a = line("one")
  a.stock.canonicalBefore = "36"
  a.stock.canonicalQuantity = "12"
  a.cost.valueBeforeMinor = "9007199254740993"
  const b = { ...a, orderLineId: "two" }
  expect(productBatchImpact([a, b])).toMatchObject([{
    onHandAfter: "1", canonicalAfter: "12", valueAfterMinor: "3002399751580331",
    valueDeltaMinor: "-6004799503160662",
  }])
})

test("unknown costs stay unknown and separate balances stay separate", () => {
  const a = line("one")
  a.cost.valueBeforeMinor = null
  a.cost.unknownReason = "MISSING_OPENING_COST"
  const b = line("two")
  b.stock.balanceSourceId = "other"
  const result = productBatchImpact([a, b])
  expect(result).toHaveLength(2)
  expect(result[0]).toMatchObject({ valueAfterMinor: null, valueDeltaMinor: null, unknownReason: "MISSING_OPENING_COST" })
})

test("rejects duplicate lines, inconsistent snapshots and cumulative overdraw", () => {
  expect(() => productBatchImpact([line("same"), line("same")])).toThrow("appeared twice")
  const changed = line("changed")
  changed.cost.poolSequence = "2"
  expect(() => productBatchImpact([line("one"), changed])).toThrow("changed while reviewing")
  expect(() => productBatchImpact([line("1"), line("2"), line("3"), line("4")])).toThrow("exceed available stock")
})
