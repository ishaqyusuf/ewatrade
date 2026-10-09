import { describe, expect, test } from "bun:test"
import type { DashboardNavContext, DashboardNavItem } from "./navigation"
import {
  canAccessDashboardPath,
  getDashboardNavItem,
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
    hasPrescriptionCommerce: false,
    hasProductItems: false,
    hasReportableActivity: false,
    hasServiceItems: false,
    hasServiceJobs: false,
    hasStaff: false,
    ...overrides,
  }
}

function flatten(items: DashboardNavItem[]): DashboardNavItem[] {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])])
}

describe("dashboard navigation policy", () => {
  test("Store settings are available only to business administrators", () => {
    for (const role of ["OWNER", "ADMIN"]) {
      expect(canAccessDashboardPath("/settings/stores", role, context())).toBe(
        true,
      )
      expect(
        flatten(getDashboardNavigation(role, context())).some(
          (item) => item.href === "/settings/stores",
        ),
      ).toBe(true)
    }
    for (const role of ["MANAGER", "OPERATOR", "CASHIER"]) {
      expect(canAccessDashboardPath("/settings/stores", role, context())).toBe(
        false,
      )
      expect(
        flatten(getDashboardNavigation(role, context())).some(
          (item) => item.href === "/settings/stores",
        ),
      ).toBe(false)
    }
  })

  test("keeps permitted primary pages available when a new business has no records", () => {
    const ownerItems = getDashboardNavigation("OWNER", context())

    expect(ownerItems.map((item) => item.href)).toEqual([
      "/",
      "/conversations",
      "/catalog",
      "/inventory",
      "/sales",
      "/services",
      "/customers",
      "/staff",
      "/finance",
      "/analytics",
      "/settings",
    ])
    expect(canAccessDashboardPath("/sales", "OWNER", context())).toBe(true)
    expect(canAccessDashboardPath("/services", "OWNER", context())).toBe(true)
    expect(ownerItems.some((item) => item.href === "/customers")).toBe(true)
  })

  test("shows full page coverage for a mixed pharmacy business", () => {
    const fullBusiness = context({
      businessProfileKey: "pharmacy-health-retail",
      operatingModel: "products_and_services",
    })
    const ownerItems = getDashboardNavigation("OWNER", fullBusiness)
    const adminItems = getDashboardNavigation("ADMIN", fullBusiness)

    expect(ownerItems.map((item) => item.href)).toEqual([
      "/",
      "/conversations",
      "/catalog",
      "/inventory",
      "/sales",
      "/services",
      "/prescriptions",
      "/customers",
      "/staff",
      "/finance",
      "/analytics",
      "/settings",
    ])
    expect(adminItems).toEqual(ownerItems)
    expect(new Set(flatten(ownerItems).map((item) => item.href)).size).toBe(28)
  })

  test("nests every existing Finance, Reports, and Settings page", () => {
    const items = getDashboardNavigation(
      "OWNER",
      context({ businessProfileKey: "pharmacy-health-retail" }),
    )
    const finance = items.find((item) => item.href === "/finance")
    const reports = items.find((item) => item.href === "/analytics")
    const settings = items.find((item) => item.href === "/settings")

    expect(finance?.children?.map((item) => item.href)).toEqual([
      "/finance",
      "/finance/spending",
      "/finance/accounts",
      "/finance/suppliers",
      "/customer-ledger",
      "/finance/reports",
    ])
    expect(reports?.children?.map((item) => item.href)).toEqual([
      "/analytics",
      "/service-commerce/reports",
      "/prescriptions/reports",
    ])
    expect(settings?.children?.map((item) => item.href)).toEqual([
      "/settings",
      "/settings/stores",
      "/settings/receipts",
      "/settings/domains",
      "/settings/channels",
      "/settings/service-commerce",
      "/settings/compliance",
      "/settings/billing",
    ])
    expect(
      flatten(items).some((item) => item.href === "/settings/prescriptions"),
    ).toBe(false)
  })

  test("gives Finance its own icon key, separate from Reports", () => {
    const items = getDashboardNavigation(
      "OWNER",
      context({ businessProfileKey: "pharmacy-health-retail" }),
    )
    const reports = items.find((item) => item.href === "/analytics")

    expect(
      flatten(items)
        .filter((item) => item.icon === "finance")
        .map((item) => item.href),
    ).toEqual([
      "/finance",
      "/finance",
      "/finance/spending",
      "/finance/accounts",
      "/finance/suppliers",
      "/customer-ledger",
      "/finance/reports",
    ])
    expect(reports?.icon).toBe("analytics")
    expect(reports?.children?.map((item) => item.icon)).toEqual([
      "analytics",
      "analytics",
      "prescriptions",
    ])
  })

  test("keeps child route permissions aligned with their specific pages", () => {
    const managerItems = getDashboardNavigation("MANAGER")
    const managerReports = managerItems.find(
      (item) => item.href === "/analytics",
    )

    expect(managerItems.some((item) => item.href === "/finance")).toBe(false)
    expect(managerItems.some((item) => item.href === "/settings")).toBe(false)
    expect(managerReports?.children?.map((item) => item.href)).toEqual([
      "/analytics",
      "/service-commerce/reports",
    ])
    expect(canAccessDashboardPath("/analytics", "MANAGER")).toBe(true)
    expect(canAccessDashboardPath("/service-commerce/reports", "MANAGER")).toBe(
      true,
    )
    expect(canAccessDashboardPath("/prescriptions/reports", "MANAGER")).toBe(
      false,
    )
    expect(canAccessDashboardPath("/prescriptions", "MANAGER")).toBe(true)
    expect(canAccessDashboardPath("/settings", "MANAGER")).toBe(false)
  })

  test("uses the selected operating model to show matching work families", () => {
    const productsContext = context({ operatingModel: "products" })
    const servicesContext = context({ operatingModel: "services" })
    const mixedContext = context({ operatingModel: "products_and_services" })
    const products = getDashboardNavigation("OWNER", productsContext)
    const services = getDashboardNavigation("OWNER", servicesContext)
    const mixed = getDashboardNavigation("OWNER", mixedContext)

    expect(products.some((item) => item.href === "/sales")).toBe(true)
    expect(products.some((item) => item.href === "/services")).toBe(false)
    expect(services.some((item) => item.href === "/sales")).toBe(false)
    expect(services.some((item) => item.href === "/services")).toBe(true)
    expect(mixed.some((item) => item.href === "/sales")).toBe(true)
    expect(mixed.some((item) => item.href === "/services")).toBe(true)
    expect(products.some((item) => item.href === "/customers")).toBe(true)
    expect(services.some((item) => item.href === "/customers")).toBe(true)
    expect(getDashboardNavItem("/services", "OWNER", productsContext)).toBe(
      undefined,
    )
    expect(
      getDashboardNavItem("/services", "OWNER", servicesContext)?.label,
    ).toBe("Service jobs")
    expect(canAccessDashboardPath("/services", "OWNER", productsContext)).toBe(
      true,
    )
    expect(
      canAccessDashboardPath("/prescriptions", "OWNER", productsContext),
    ).toBe(true)
  })

  test("derives work families from profiles and reserves prescription surfaces for pharmacy", () => {
    const productProfile = getDashboardNavigation(
      "OWNER",
      context({ businessProfileKey: "general-retail-groceries" }),
    )
    const serviceProfile = getDashboardNavigation(
      "OWNER",
      context({ businessProfileKey: "laundry-dry-cleaning" }),
    )
    const pharmacyProfile = getDashboardNavigation(
      "OWNER",
      context({ businessProfileKey: "pharmacy-health-retail" }),
    )
    const explicitServices = getDashboardNavigation(
      "OWNER",
      context({
        businessProfileKey: "general-retail-groceries",
        operatingModel: "services",
      }),
    )

    expect(productProfile.some((item) => item.href === "/sales")).toBe(true)
    expect(productProfile.some((item) => item.href === "/services")).toBe(false)
    expect(serviceProfile.some((item) => item.href === "/sales")).toBe(false)
    expect(serviceProfile.some((item) => item.href === "/services")).toBe(true)
    expect(serviceProfile.some((item) => item.href === "/customers")).toBe(true)
    expect(explicitServices.some((item) => item.href === "/sales")).toBe(false)
    expect(explicitServices.some((item) => item.href === "/services")).toBe(
      true,
    )
    expect(pharmacyProfile.some((item) => item.href === "/prescriptions")).toBe(
      true,
    )
    expect(
      pharmacyProfile
        .find((item) => item.href === "/analytics")
        ?.children?.some((item) => item.href === "/prescriptions/reports"),
    ).toBe(true)
    expect(
      pharmacyProfile
        .find((item) => item.href === "/settings")
        ?.children?.some((item) => item.href === "/settings/compliance"),
    ).toBe(true)
    expect(
      canAccessDashboardPath(
        "/prescriptions/reports",
        "OWNER",
        context({
          businessProfileKey: "general-retail-groceries",
        }),
      ),
    ).toBe(true)
    expect(
      canAccessDashboardPath(
        "/settings/compliance",
        "OWNER",
        context({
          businessProfileKey: "general-retail-groceries",
        }),
      ),
    ).toBe(true)
  })

  test("preserves attendant and limited-role access", () => {
    expect(getDashboardNavigation("CASHIER").map((item) => item.href)).toEqual([
      "/",
      "/conversations",
      "/sales",
      "/services",
      "/customers",
    ])
    expect(getDashboardNavigation("OPERATOR").map((item) => item.href)).toEqual(
      getDashboardNavigation("CASHIER").map((item) => item.href),
    )
    expect(getDashboardNavigation("SUPPORT").map((item) => item.href)).toEqual([
      "/",
    ])
    expect(getDashboardNavigation("MEMBER").map((item) => item.href)).toEqual([
      "/",
    ])
  })

  test("requires the platform-admin context for QA maintenance", () => {
    expect(
      getDashboardNavigation("OWNER").some(
        (item) => item.href === "/platform/qa-maintenance",
      ),
    ).toBe(false)
    expect(
      getDashboardNavigation("MEMBER", { isPlatformAdmin: true }).some(
        (item) => item.href === "/platform/qa-maintenance",
      ),
    ).toBe(true)
    expect(canAccessDashboardPath("/platform/qa-maintenance", "OWNER")).toBe(
      false,
    )
    expect(
      canAccessDashboardPath("/platform/qa-maintenance", "MEMBER", {
        isPlatformAdmin: true,
      }),
    ).toBe(true)
  })

  test("matches the most specific permitted child route", () => {
    expect(getDashboardNavItem("/finance/accounts", "OWNER")?.label).toBe(
      "Accounts",
    )
    expect(canAccessDashboardPath("/finance/reports/export", "OWNER")).toBe(
      true,
    )
    expect(canAccessDashboardPath("/inventory/stock", "OPERATOR")).toBe(false)
    expect(canAccessDashboardPath("/staff", "MEMBER")).toBe(false)
    expect(canAccessDashboardPath("/unknown-future-page", "MEMBER")).toBe(true)
  })

  test("formats role labels for the dashboard shell", () => {
    expect(getDashboardRoleLabel("OWNER")).toBe("Owner")
    expect(getDashboardRoleLabel(null)).toBe("Guest")
  })
})

test("Inventory exposes permitted Operations and Stock transfers children", () => {
  const inventory = getDashboardNavigation("OWNER", context()).find(
    (item) => item.href === "/inventory",
  )
  expect(inventory?.children?.map((item) => item.href)).toEqual([
    "/inventory/operations",
    "/inventory/transfers",
  ])
  expect(
    canAccessDashboardPath("/inventory/operations", "OPERATOR", context()),
  ).toBe(false)
  expect(
    canAccessDashboardPath("/inventory/transfers", "OWNER", context()),
  ).toBe(true)
})

test("scoped roles expose orders and stock without catalog or staff administration", () => {
  const scope = context({ staffAccessMode: "SCOPED", catalogEditor: false })
  expect(canAccessDashboardPath("/inventory", "OPERATOR", scope)).toBe(true)
  expect(canAccessDashboardPath("/inventory", "CASHIER", scope)).toBe(false)
  expect(canAccessDashboardPath("/staff", "MANAGER", scope)).toBe(false)
  expect(canAccessDashboardPath("/catalog", "MANAGER", scope)).toBe(false)
  expect(
    canAccessDashboardPath("/catalog", "MANAGER", {
      ...scope,
      catalogEditor: true,
    }),
  ).toBe(true)
  expect(canAccessDashboardPath("/finance", "MANAGER", scope)).toBe(false)
})

test("Free plan hides and blocks finance, staff, suppliers and receipt settings", () => {
  const free = context({ planFeatures: [] })
  const hrefs = flatten(getDashboardNavigation("OWNER", free)).map(
    (item) => item.href,
  )
  for (const href of [
    "/finance",
    "/finance/suppliers",
    "/customer-ledger",
    "/staff",
    "/settings/receipts",
  ]) {
    expect(hrefs).not.toContain(href)
    expect(canAccessDashboardPath(href, "OWNER", free)).toBe(false)
  }
  // Unlisted pages under a gated section stay blocked too.
  expect(canAccessDashboardPath("/finance/bank", "OWNER", free)).toBe(false)
  expect(canAccessDashboardPath("/settings/billing", "OWNER", free)).toBe(true)
  expect(hrefs).toContain("/settings/billing")

  const paid = context({
    planFeatures: ["finance", "invoices", "staff", "suppliers"],
  })
  expect(canAccessDashboardPath("/finance/bank", "OWNER", paid)).toBe(true)
  expect(canAccessDashboardPath("/settings/receipts", "OWNER", paid)).toBe(true)
  // An unknown plan (read failed) leaves navigation to the API's enforcement.
  expect(canAccessDashboardPath("/finance", "OWNER", context())).toBe(true)
})
