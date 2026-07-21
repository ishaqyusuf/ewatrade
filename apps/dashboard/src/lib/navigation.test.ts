import { describe, expect, test } from "bun:test"
import type { DashboardNavContext } from "./navigation"
import {
  canAccessDashboardPath,
  getDashboardNavigation,
  getDashboardRoleLabel,
} from "./navigation"

function context(
  overrides: Partial<DashboardNavContext> = {},
): DashboardNavContext {
  return {
    hasActiveSellableItems: false,
    hasCatalogItems: false,
    hasCustomers: false,
    hasOrders: false,
    hasProductItems: false,
    hasReportableActivity: false,
    hasServiceItems: false,
    hasServiceJobs: false,
    hasStaff: false,
    ...overrides,
  }
}

describe("dashboard navigation policy", () => {
  test("shows owner and admin the full established dashboard surface", () => {
    const ownerItems = getDashboardNavigation("OWNER")
    const adminItems = getDashboardNavigation("ADMIN")

    expect(ownerItems.map((item) => item.href)).toEqual([
      "/",
      "/catalog",
      "/inventory",
      "/sales",
      "/services",
      "/customers",
      "/staff",
      "/analytics",
      "/settings",
    ])
    expect(adminItems.map((item) => item.href)).toEqual(
      ownerItems.map((item) => item.href),
    )
  })

  test("keeps a new owner workspace focused while preserving creation access", () => {
    const empty = context()

    expect(
      getDashboardNavigation("OWNER", empty).map((item) => item.href),
    ).toEqual(["/", "/settings"])
    expect(canAccessDashboardPath("/catalog", "OWNER", empty)).toBe(true)
    expect(canAccessDashboardPath("/staff", "OWNER", empty)).toBe(true)
    expect(canAccessDashboardPath("/customers", "OWNER", empty)).toBe(true)
    expect(canAccessDashboardPath("/analytics", "OWNER", empty)).toBe(true)
    expect(canAccessDashboardPath("/sales", "OWNER", empty)).toBe(true)
    expect(canAccessDashboardPath("/inventory", "OWNER", empty)).toBe(true)
    expect(canAccessDashboardPath("/services", "OWNER", empty)).toBe(true)
  })

  test("reveals catalog and inventory from item history without revealing work", () => {
    const productOnly = context({
      hasActiveSellableItems: true,
      hasCatalogItems: true,
      hasProductItems: true,
    })
    const serviceOnly = context({
      hasActiveSellableItems: true,
      hasCatalogItems: true,
      hasServiceItems: true,
    })

    expect(
      getDashboardNavigation("OWNER", productOnly).map((item) => item.href),
    ).toEqual(["/", "/catalog", "/inventory", "/settings"])
    expect(
      getDashboardNavigation("OWNER", serviceOnly).map((item) => item.href),
    ).toEqual(["/", "/catalog", "/settings"])
    expect(canAccessDashboardPath("/sales", "OWNER", productOnly)).toBe(true)
    expect(canAccessDashboardPath("/services", "OWNER", serviceOnly)).toBe(true)
  })

  test("reveals operational modules from their own records", () => {
    const established = context({
      hasActiveSellableItems: true,
      hasCatalogItems: true,
      hasCustomers: true,
      hasOrders: true,
      hasProductItems: true,
      hasReportableActivity: true,
      hasServiceItems: true,
      hasServiceJobs: true,
      hasStaff: true,
    })

    expect(
      getDashboardNavigation("OWNER", established).map((item) => item.href),
    ).toEqual([
      "/",
      "/catalog",
      "/inventory",
      "/sales",
      "/services",
      "/customers",
      "/staff",
      "/analytics",
      "/settings",
    ])
  })

  test("shows managers operational administration without owner settings", () => {
    expect(getDashboardNavigation("MANAGER").map((item) => item.href)).toEqual([
      "/",
      "/catalog",
      "/inventory",
      "/sales",
      "/services",
      "/customers",
      "/staff",
      "/analytics",
    ])
  })

  test("shows attendants only revealed permitted work surfaces", () => {
    const established = context({
      hasCustomers: true,
      hasOrders: true,
      hasProductItems: true,
      hasServiceJobs: true,
    })
    const cashierItems = getDashboardNavigation("CASHIER", established).map(
      (item) => item.href,
    )
    const operatorItems = getDashboardNavigation("OPERATOR", established).map(
      (item) => item.href,
    )

    expect(cashierItems).toEqual([
      "/",
      "/inventory",
      "/sales",
      "/services",
      "/customers",
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

  test("gates known paths by permission without treating visibility as authorization", () => {
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
