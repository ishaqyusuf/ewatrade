import { describe, expect, test } from "bun:test"
import { pickerAssignments, pickerHasManager } from "./staff-role-picker"

const base = {
  role: "cashier" as const,
  storeIds: ["a", "b"],
  startStoreId: "b",
  catalogEditor: false,
  storeRoles: null,
}

describe("staff role picker", () => {
  test("puts the starting store first with one role everywhere", () => {
    expect(pickerAssignments(base)).toEqual([
      { storeId: "b", role: "cashier" },
      { storeId: "a", role: "cashier" },
    ])
    expect(pickerHasManager(base)).toBe(false)
  })
  test("keeps a different role in each store", () => {
    const value = {
      ...base,
      storeRoles: { a: "manager" as const, b: "operator" as const },
    }
    expect(pickerAssignments(value)).toEqual([
      { storeId: "b", role: "operator" },
      { storeId: "a", role: "manager" },
    ])
    expect(pickerHasManager(value)).toBe(true)
  })
})
