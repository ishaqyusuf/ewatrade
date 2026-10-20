import { expect, test } from "bun:test"
import { inventoryCreateStockCountSchema } from "./inventory"

const count = (enteredQuantity: string) => ({
  clientOperationId: "count-command-001",
  lines: [
    {
      balanceSourceId: "balance-1",
      entries: [{ enteredInventoryUnitId: "unit-1", enteredQuantity }],
      expectedRevision: 3,
    },
  ],
  schemaVersion: 1,
})

test("a count may record an empty shelf, but not a negative number", () => {
  expect(inventoryCreateStockCountSchema.safeParse(count("0")).success).toBe(
    true,
  )
  expect(inventoryCreateStockCountSchema.safeParse(count("12")).success).toBe(
    true,
  )
  expect(inventoryCreateStockCountSchema.safeParse(count("-1")).success).toBe(
    false,
  )
})
