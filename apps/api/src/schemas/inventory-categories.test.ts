import { expect, test } from "bun:test"
import {
  inventoryOperationHistoryPageSchema,
  inventoryOperationHistorySchema,
  inventoryOperationTotalsSchema,
  inventorySingleBalanceOperationSchema,
} from "./inventory"

const command = {
  balanceSourceId: "balance",
  clientOperationId: "operation-123",
  direction: "increase",
  enteredInventoryUnitId: "unit",
  enteredQuantity: "20",
  expectedBalanceRevision: 0,
  expectedConfigurationVersionId: "config",
  schemaVersion: 1,
  source: "test",
  type: "receipt",
}

test("new categories accept integer IDs and names, and reject ambiguous or text IDs", () => {
  expect(
    inventorySingleBalanceOperationSchema.parse({
      ...command,
      categories: [{ categoryNameId: 12 }, { name: " Row   1 " }],
    }).categories,
  ).toEqual([{ categoryNameId: 12 }, { name: "Row 1" }])
  for (const categories of [
    [{ categoryNameId: "12" }],
    [{ categoryNameId: 1.2 }],
    [{ categoryNameId: 0 }],
    [{ categoryNameId: 2, name: "Row 1" }],
    [],
    [{ name: " " }],
  ]) {
    expect(
      inventorySingleBalanceOperationSchema.safeParse({
        ...command,
        categories,
      }).success,
    ).toBe(false)
  }
  expect(inventorySingleBalanceOperationSchema.safeParse(command).success).toBe(
    false,
  )
})

test("legacy commands keep categories absent and returns keep their reason contract", () => {
  const legacy = inventorySingleBalanceOperationSchema.parse({
    ...command,
    reason: "Opening balance",
  })
  expect(Object.hasOwn(legacy, "categories")).toBe(false)
  expect(
    inventorySingleBalanceOperationSchema.safeParse({
      ...command,
      type: "return",
      categories: [{ name: "Return" }],
    }).success,
  ).toBe(false)
  expect(
    inventorySingleBalanceOperationSchema.safeParse({
      ...command,
      type: "return",
      reason: "Return",
      categories: [{ name: "Return" }],
    }).success,
  ).toBe(false)
  expect(
    inventorySingleBalanceOperationSchema.safeParse({
      ...command,
      type: "return",
      reason: "Returned item",
    }).success,
  ).toBe(true)
})

test("history and totals filters take match-all name IDs or Uncategorized, never both", () => {
  expect(
    inventoryOperationHistoryPageSchema.parse({
      categoryNameIds: [7, 8],
      cursor: "op_1",
      limit: 25,
    }),
  ).toEqual({ categoryNameIds: [7, 8], cursor: "op_1", limit: 25 })
  expect(
    inventoryOperationHistorySchema.parse({ uncategorized: true }),
  ).toEqual({ uncategorized: true })
  for (const input of [
    { categoryNameIds: [7], uncategorized: true },
    { categoryNameIds: ["7"] },
    { categoryNameIds: [0] },
    { categoryNameIds: Array.from({ length: 11 }, (_, i) => i + 1) },
    { limit: 101 },
  ])
    expect(inventoryOperationHistoryPageSchema.safeParse(input).success).toBe(
      false,
    )
  // Corrections are folded into the original they correct.
  expect(
    inventoryOperationTotalsSchema.safeParse({ type: "correction" }).success,
  ).toBe(false)
  expect(
    inventoryOperationTotalsSchema.parse({
      type: "receipt",
      categoryNameIds: [7],
    }),
  ).toEqual({ type: "receipt", categoryNameIds: [7] })
})
