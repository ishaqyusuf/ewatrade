import { describe, expect, test } from "bun:test"

import {
  buildAdminMoreSections,
  canAccessAdminTabs,
  getAdminCatalogTabLabel,
  getAdminDockLabels,
} from "./admin-navigation"
import type { MobileWorkspaceFeatureAvailability } from "./workspace-feature-availability"

const availability: MobileWorkspaceFeatureAvailability = {
  hasActiveSellableItems: false,
  hasCatalogItems: false,
  hasCustomers: false,
  hasInventoryActivity: false,
  hasOrders: false,
  hasProductItems: false,
  hasReportableActivity: false,
  hasServiceItems: false,
  hasServiceJobs: false,
  hasStaff: false,
  storeId: "store_1",
}

describe("admin mobile navigation", () => {
  test("limits the tab group to operational management roles", () => {
    expect(canAccessAdminTabs("OWNER")).toBe(true)
    expect(canAccessAdminTabs("ADMIN")).toBe(true)
    expect(canAccessAdminTabs("MANAGER")).toBe(true)

    for (const role of ["CASHIER", "OPERATOR", "SUPPORT", "MEMBER", undefined]) {
      expect(canAccessAdminTabs(role)).toBe(false)
    }
  })

  test("keeps a stable catalog route while adapting its visible label", () => {
    expect(getAdminCatalogTabLabel(availability)).toBe("Catalog")
    expect(
      getAdminCatalogTabLabel({ ...availability, hasProductItems: true }),
    ).toBe("Products")
    expect(
      getAdminCatalogTabLabel({ ...availability, hasServiceItems: true }),
    ).toBe("Services")
    expect(
      getAdminCatalogTabLabel({
        ...availability,
        hasProductItems: true,
        hasServiceItems: true,
      }),
    ).toBe("Catalog")
  })

  test("keeps the requested five-position dock order", () => {
    expect(getAdminDockLabels("Products")).toEqual([
      "Home",
      "Orders",
      "+",
      "Products",
      "More",
    ])
  })

  test("maps real More destinations with permission and capability rules", () => {
    const ownerSections = buildAdminMoreSections({
      availability: {
        ...availability,
        hasProductItems: true,
        hasServiceItems: true,
      },
      role: "OWNER",
    })
    const ownerItems = ownerSections.flatMap((section) => section.items)

    expect(ownerItems.map((item) => item.id)).toEqual([
      "inventory",
      "analytics",
      "team",
      "customers",
      "service-work",
      "plan-billing",
      "app-theme",
      "app-lock",
      "sync-offline",
      "app-updates",
      "sign-out",
    ])
    expect(ownerItems.find((item) => item.id === "inventory")?.disabled).toBe(
      false,
    )

    const managerItems = buildAdminMoreSections({
      availability,
      role: "MANAGER",
    }).flatMap((section) => section.items)

    expect(managerItems.find((item) => item.id === "inventory")?.disabled).toBe(
      true,
    )
    expect(managerItems.some((item) => item.id === "service-work")).toBe(false)
    expect(managerItems.some((item) => item.id === "plan-billing")).toBe(false)
  })
})
