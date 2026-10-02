import { expect, test } from "bun:test"
import { canOperateInventory } from "./inventory-operations"
import { canAccessDashboardPath, getDashboardNavigation } from "./navigation"

test.each(["CASHIER", "OPERATOR", "SUPPORT", "MEMBER", null])(
  "%s cannot enter inventory management or see its navigation link",
  (role) => {
    expect(canOperateInventory(role)).toBe(false)
    expect(canAccessDashboardPath("/inventory", role)).toBe(false)
    expect(canAccessDashboardPath("/inventory/stock", role)).toBe(false)
    expect(
      getDashboardNavigation(role).some((item) => item.href === "/inventory"),
    ).toBe(false)
  },
)
test.each(["OWNER", "ADMIN", "MANAGER"])(
  "%s retains inventory management access",
  (role) => {
    expect(canOperateInventory(role)).toBe(true)
    expect(canAccessDashboardPath("/inventory", role)).toBe(true)
    expect(
      getDashboardNavigation(role).some((item) => item.href === "/inventory"),
    ).toBe(true)
  },
)
test("cashier keeps sales access while inventory management is denied", () => {
  expect(canAccessDashboardPath("/sales", "CASHIER")).toBe(true)
  expect(canAccessDashboardPath("/catalog", "CASHIER")).toBe(false)
  expect(canAccessDashboardPath("/staff", "CASHIER")).toBe(false)
})
