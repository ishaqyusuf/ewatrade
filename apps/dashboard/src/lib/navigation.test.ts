import { describe, expect, test } from "bun:test"
import {
  canAccessDashboardPath,
  getDashboardNavigation,
  getDashboardRoleLabel,
} from "./navigation"

describe("dashboard navigation policy", () => {
  test("shows owner and admin the full dashboard surface", () => {
    const ownerItems = getDashboardNavigation("OWNER")
    const adminItems = getDashboardNavigation("ADMIN")

    expect(ownerItems.map((item) => item.href)).toEqual([
      "/",
      "/products",
      "/inventory",
      "/sales",
      "/customers",
      "/staff",
      "/links",
      "/analytics",
      "/settings",
    ])
    expect(adminItems.map((item) => item.href)).toEqual(
      ownerItems.map((item) => item.href),
    )
  })

  test("shows managers operational administration without owner-only settings", () => {
    expect(getDashboardNavigation("MANAGER").map((item) => item.href)).toEqual([
      "/",
      "/products",
      "/inventory",
      "/sales",
      "/customers",
      "/staff",
      "/links",
      "/analytics",
    ])
  })

  test("adds service orders only for dry-cleaning stores", () => {
    expect(
      getDashboardNavigation("OWNER", {
        storeBusinessTemplateKey: "dry_cleaning_laundry",
      }).map((item) => item.href),
    ).toContain("/services")
    expect(
      getDashboardNavigation("OWNER", {
        storeBusinessTemplateKey: "product_sales",
      }).map((item) => item.href),
    ).not.toContain("/services")
    expect(
      canAccessDashboardPath("/services", "CASHIER", {
        storeBusinessTemplateKey: "dry_cleaning_laundry",
      }),
    ).toBe(true)
    expect(canAccessDashboardPath("/services", "CASHIER")).toBe(false)
  })

  test("shows attendants only permitted work surfaces", () => {
    const cashierItems = getDashboardNavigation("CASHIER").map(
      (item) => item.href,
    )
    const operatorItems = getDashboardNavigation("OPERATOR").map(
      (item) => item.href,
    )

    expect(cashierItems).toEqual([
      "/",
      "/inventory",
      "/sales",
      "/customers",
      "/links",
    ])
    expect(operatorItems).toEqual(cashierItems)
  })

  test("keeps support and member roles limited to overview", () => {
    expect(getDashboardNavigation("SUPPORT").map((item) => item.href)).toEqual([
      "/",
    ])
    expect(getDashboardNavigation("MEMBER").map((item) => item.href)).toEqual([
      "/",
    ])
  })

  test("gates known dashboard paths by role", () => {
    expect(canAccessDashboardPath("/settings", "OWNER")).toBe(true)
    expect(canAccessDashboardPath("/settings", "MANAGER")).toBe(false)
    expect(canAccessDashboardPath("/analytics", "CASHIER")).toBe(false)
    expect(canAccessDashboardPath("/sales", "CASHIER")).toBe(true)
    expect(canAccessDashboardPath("/inventory/stock", "OPERATOR")).toBe(true)
    expect(canAccessDashboardPath("/staff", "MEMBER")).toBe(false)
    expect(canAccessDashboardPath("/unknown-future-page", "MEMBER")).toBe(true)
  })

  test("formats role labels for the dashboard shell", () => {
    expect(getDashboardRoleLabel("OWNER")).toBe("Owner")
    expect(getDashboardRoleLabel(null)).toBe("Guest")
  })
})
