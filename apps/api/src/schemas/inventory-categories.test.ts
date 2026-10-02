import { expect, test } from "bun:test"
import { inventorySingleBalanceOperationSchema } from "./inventory"

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
