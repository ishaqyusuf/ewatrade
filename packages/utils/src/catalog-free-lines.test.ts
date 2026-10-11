import { expect, test } from "bun:test"
import {
  catalogFreeLineDisplay,
  catalogFreeLinesError,
  catalogFreeLinesTotalMinor,
  catalogFreeOrderLines,
} from "./catalog-free-lines"

const line = (
  kind: "quick_sale" | "additional_cost",
  amount: string,
  description = "",
) => ({ amount, description, id: `${kind}-${amount}`, kind })

test("labels additional costs and falls back to (no description)", () => {
  expect(
    catalogFreeLineDisplay({
      description: " Delivery ",
      kind: "additional_cost",
    }),
  ).toEqual({ detail: "Delivery", title: "Additional cost" })
  expect(catalogFreeLineDisplay({ kind: "additional_cost" })).toEqual({
    detail: "(no description)",
    title: "Additional cost",
  })
  expect(
    catalogFreeLineDisplay({ description: "Rice", kind: "quick_sale" }),
  ).toEqual({ detail: null, title: "Rice" })
  expect(
    catalogFreeLineDisplay({ description: "  ", kind: "quick_sale" }),
  ).toEqual({ detail: null, title: "Quick sale" })
})

test("totals typed amounts and builds order lines", () => {
  const lines = [
    line("quick_sale", "1,500.50", "Rice"),
    line("additional_cost", "200"),
  ]
  expect(catalogFreeLinesError(lines)).toBeNull()
  expect(catalogFreeLinesTotalMinor(lines)).toBe(170_050)
  expect(catalogFreeOrderLines(lines)).toEqual([
    { amountMinor: 150_050, custom: "quick_sale", description: "Rice" },
    { amountMinor: 20_000, custom: "additional_cost" },
  ])
})

test("asks for an amount on empty or zero lines", () => {
  expect(catalogFreeLinesError([line("quick_sale", "")])).toBe(
    "Enter an amount for each Quick sale.",
  )
  expect(catalogFreeLinesError([line("additional_cost", "0")])).toBe(
    "Enter an amount for each Additional cost.",
  )
  expect(catalogFreeLinesTotalMinor([line("quick_sale", "abc")])).toBe(0)
})
