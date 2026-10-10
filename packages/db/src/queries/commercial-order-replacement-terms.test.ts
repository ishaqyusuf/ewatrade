import { expect, test } from "bun:test"
import {
  type ReplacementSourceLine,
  buildOrderReplacementTerms as build,
} from "./commercial-order-replacement-terms"
function fixture() {
  const line: ReplacementSourceLine = {
    id: "line",
    offeringId: "offering",
    quantity: "2",
    unitPriceMinor: 125,
    totalMinor: 250,
    discountMinor: 0,
    taxMinor: 0,
    snapshot: {
      pricingPolicy: "FIXED",
      quantity: "2",
      unitPriceMinor: 125,
      totalMinor: 250,
      transactionScale: 2,
    },
  }
  return {
    lines: [line],
    subtotalMinor: 250,
    discountMinor: 10,
    taxMinor: 20,
    serviceChargeMinor: 30,
    totalMinor: 290,
  }
}
test("replacement retains original source and unchanged charges while making exact quantity/price differences", () => {
  const source = fixture()
  const original = JSON.stringify(source)
  const result = build(source, [
    { orderLineId: "line", quantity: "3", unitPriceMinor: 140 },
  ])
  expect(result).toMatchObject({
    subtotalMinor: 420,
    discountMinor: 10,
    taxMinor: 20,
    serviceChargeMinor: 30,
    totalMinor: 460,
    originalTotalMinor: 290,
    totalChangeMinor: 170,
  })
  expect(result.lines[0]).toMatchObject({
    originalQuantity: "2",
    originalUnitPriceMinor: 125,
    originalTotalMinor: 250,
    quantity: "3",
    unitPriceMinor: 140,
    totalMinor: 420,
  })
  expect(JSON.stringify(source)).toBe(original)
})
test("untouched lines keep their original prices", () => {
  const source = fixture()
  source.lines.push({ ...first(source), id: "second" })
  source.subtotalMinor = 500
  source.totalMinor = 540
  const result = build(source, [{ orderLineId: "line", quantity: "3" }])
  expect(result.lines[1]).toMatchObject({
    orderLineId: "second",
    quantity: "2",
    unitPriceMinor: 125,
    totalMinor: 250,
  })
  expect(result.totalMinor).toBe(665)
})
test("ambiguous, foreign, duplicate and no-op edits refuse", () => {
  const source = fixture()
  for (const input of [
    [],
    [{ orderLineId: "foreign", quantity: "3" }],
    [
      { orderLineId: "line", quantity: "3" },
      { orderLineId: "line", quantity: "4" },
    ],
    [{ orderLineId: "line" }],
    [{ orderLineId: "line", quantity: "2" }],
  ])
    expect(() => build(source, input)).toThrow()
  expect(() =>
    build(source, [
      { orderLineId: "line", quantity: "3", status: "CANCELLED" } as never,
    ]),
  ).toThrow()
})
test("quantity precision and integer minor-unit totals cannot be rounded", () => {
  for (const quantity of ["0", "-1", "0.001", "1e3", "0.01"])
    expect(() =>
      build(fixture(), [{ orderLineId: "line", quantity }]),
    ).toThrow()
  expect(
    build(fixture(), [{ orderLineId: "line", quantity: "0.04" }]).lines[0]
      ?.totalMinor,
  ).toBe(5)
  expect(() =>
    build(fixture(), [
      { orderLineId: "line", unitPriceMinor: 100_000_000, quantity: "2" },
    ]),
  ).toThrow()
})
test("order-priced quantities require a newly stated item total without inventing a unit price", () => {
  const source = fixture()
  first(source).unitPriceMinor = null
  snapshot(source).unitPriceMinor = null
  snapshot(source).pricingPolicy = "ORDER_TOTAL"
  expect(() => build(source, [{ orderLineId: "line", quantity: "3" }])).toThrow(
    "explicit replacement item total",
  )
  expect(() =>
    build(source, [{ orderLineId: "line", unitPriceMinor: 100 }]),
  ).toThrow("not a unit price")
  expect(
    build(source, [
      { orderLineId: "line", quantity: "3", enteredTotalMinor: 400 },
    ]).lines[0],
  ).toMatchObject({ quantity: "3", unitPriceMinor: null, totalMinor: 400 })
})
test("inconsistent original amounts, unsupported line adjustments and quote ownership refuse", () => {
  const bad = fixture()
  bad.totalMinor = 0
  expect(() => build(bad, [{ orderLineId: "line", quantity: "3" }])).toThrow(
    "reconciliation",
  )
  const badLine = fixture()
  snapshot(badLine).totalMinor = 1
  expect(() =>
    build(badLine, [{ orderLineId: "line", quantity: "3" }]),
  ).toThrow("inconsistent")
  const adjusted = fixture()
  first(adjusted).taxMinor = 5
  expect(() =>
    build(adjusted, [{ orderLineId: "line", quantity: "3" }]),
  ).toThrow("owning correction")
  const quote = fixture()
  snapshot(quote).pricingPolicy = "QUOTE_REQUIRED"
  expect(() => build(quote, [{ orderLineId: "line", quantity: "3" }])).toThrow(
    "owning quote",
  )
})

function first(source: ReturnType<typeof fixture>) {
  const line = source.lines[0]
  if (!line) throw Error("Fixture line required")
  return line
}
function snapshot(source: ReturnType<typeof fixture>) {
  const value = first(source).snapshot
  if (!value) throw Error("Fixture snapshot required")
  return value
}
