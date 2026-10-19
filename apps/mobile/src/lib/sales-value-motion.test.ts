import { expect, test } from "bun:test"
import { salesValueAt, salesValuePlan } from "./sales-value-motion"

const scope = "business-a:store-a:owner:2026-10-17"

test("a confirmed change counts from the displayed value and lands exactly", () => {
  expect(
    salesValuePlan(
      { scopeKey: scope, displayedMinor: 400_000 },
      { scopeKey: scope, minor: 750_000 },
      false,
    ),
  ).toEqual({ animate: true, from: 400_000, to: 750_000 })
  expect(salesValueAt(400_000, 750_000, 0)).toBe(400_000)
  expect(salesValueAt(400_000, 750_000, 1)).toBe(750_000)
  const mid = salesValueAt(400_000, 750_000, 0.4)
  expect(mid).toBeGreaterThan(400_000)
  expect(mid).toBeLessThan(750_000)
  // Whole-naira amounts never flash kobo while counting.
  expect(mid % 100).toBe(0)
  // Amounts with kobo count in minor units and still land exactly.
  expect(salesValueAt(400_050, 750_025, 1)).toBe(750_025)
})

test("first value, unchanged refresh, new scope and Reduce Motion never animate", () => {
  const next = { scopeKey: scope, minor: 750_000 }
  const still = { animate: false, from: 750_000, to: 750_000 }
  expect(salesValuePlan({}, next, false)).toEqual(still)
  expect(
    salesValuePlan({ scopeKey: scope, displayedMinor: 750_000 }, next, false),
  ).toEqual(still)
  expect(
    salesValuePlan(
      {
        scopeKey: "business-a:store-b:owner:2026-10-17",
        displayedMinor: 400_000,
      },
      next,
      false,
    ),
  ).toEqual(still)
  expect(
    salesValuePlan({ scopeKey: scope, displayedMinor: 400_000 }, next, true),
  ).toEqual(still)
})

test("an interrupted count continues from the number on screen", () => {
  const shown = salesValueAt(400_000, 750_000, 0.5)
  expect(
    salesValuePlan(
      { scopeKey: scope, displayedMinor: shown },
      { scopeKey: scope, minor: 1_000_000 },
      false,
    ),
  ).toEqual({ animate: true, from: shown, to: 1_000_000 })
})
