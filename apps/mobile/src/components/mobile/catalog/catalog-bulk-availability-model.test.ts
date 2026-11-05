import { expect, test } from "bun:test"
import {
  bulkAvailabilityFailed,
  bulkAvailabilityHides,
  bulkAvailabilitySummary,
  isHiddenFromSale,
  isOnSale,
  planBulkAvailability,
} from "./catalog-bulk-availability-model"

const offering = (
  id: string,
  available: boolean | null,
  status = "active",
) => ({
  id,
  status,
  stores:
    available === null
      ? []
      : [
          { isAvailable: available, storeId: "s1" },
          { isAvailable: !available, storeId: "s2" },
        ],
})
const item = (id: string, offerings: ReturnType<typeof offering>[]) => ({
  id,
  name: `Item ${id}`,
  variants: [{ offerings }],
})

const onSale = item("a", [offering("a1", true), offering("a2", false)])
const hidden = item("b", [offering("b1", false), offering("b2", null)])
const archivedOnly = item("c", [offering("c1", true, "archived")])

test("on sale follows the current store's rows for active offerings", () => {
  expect(isOnSale(onSale, "s1")).toBe(true)
  expect(isHiddenFromSale(hidden, "s1")).toBe(true)
  expect(isHiddenFromSale(hidden, "s2")).toBe(false)
  expect(isHiddenFromSale(archivedOnly, "s1")).toBe(false)
  expect(bulkAvailabilityHides([hidden, onSale], "s1")).toBe(true)
  expect(bulkAvailabilityHides([hidden], "s1")).toBe(false)
})

test("hide switches off only offerings on sale here; others are skipped", () => {
  const plan = planBulkAvailability([onSale, hidden, archivedOnly], "s1", true)
  expect(plan.targets.map((t) => [t.item.id, t.offeringIds])).toEqual([
    ["a", ["a1"]],
  ])
  expect(plan.skipped.map((s) => [s.key, s.detail])).toEqual([
    ["b", "Already hidden"],
    ["c", "No active price to sell"],
  ])
})

test("show switches on every active offering not on sale here", () => {
  const plan = planBulkAvailability([hidden, onSale], "s1", false)
  expect(plan.targets.map((t) => [t.item.id, t.offeringIds])).toEqual([
    ["b", ["b1", "b2"]],
    ["a", ["a2"]],
  ])
})

test("the summary and failures read per item", () => {
  const outcomes = [
    {
      detail: "Hidden from sale",
      key: "a",
      label: "A",
      result: "done" as const,
    },
    bulkAvailabilityFailed(hidden, new Error("Set a price first.")),
  ]
  expect(outcomes[1]?.detail).toBe("Set a price first.")
  expect(bulkAvailabilitySummary(outcomes, true)).toBe("1 hidden · 1 skipped")
  expect(bulkAvailabilitySummary(outcomes.slice(0, 1), false)).toBe(
    "1 back on sale",
  )
})
