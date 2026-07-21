import { describe, expect, test } from "bun:test"
import {
  type MobileWorkspaceFeatureAvailability,
  getMobileDashboardFeatureVisibility,
  getMobileDashboardNavigation,
  mergeMobileWorkspaceFeatureAvailability,
  switchMobileBusinessSession,
} from "./workspace-feature-availability"

const authoritative: MobileWorkspaceFeatureAvailability = {
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
  storeId: "store_a",
}

describe("mobile workspace feature availability", () => {
  test("keeps authoritative history sticky", () => {
    expect(
      mergeMobileWorkspaceFeatureAvailability(
        {
          ...authoritative,
          hasCatalogItems: true,
          hasProductItems: true,
        },
        {
          catalogItems: [],
          commercialOrders: 0,
          customers: 0,
          inventoryOperations: 0,
          serviceOperations: 0,
        },
      ),
    ).toMatchObject({
      hasCatalogItems: true,
      hasProductItems: true,
      storeId: "store_a",
    })
  })

  test("reveals supported provisional offline work", () => {
    expect(
      mergeMobileWorkspaceFeatureAvailability(authoritative, {
        catalogItems: [{ provisional: true }],
        commercialOrders: 1,
        customers: 1,
        inventoryOperations: 1,
        serviceOperations: 1,
      }),
    ).toMatchObject({
      hasCatalogItems: true,
      hasCustomers: true,
      hasInventoryActivity: true,
      hasOrders: true,
      hasProductItems: true,
      hasReportableActivity: true,
      hasServiceJobs: true,
    })
  })

  test("progressively reveals dashboard content from feature presence", () => {
    expect(
      getMobileDashboardFeatureVisibility(authoritative, false),
    ).toMatchObject({
      showGettingStarted: true,
      showOrderHistory: false,
    })
    expect(
      getMobileDashboardFeatureVisibility(
        {
          ...authoritative,
          hasCatalogItems: true,
          hasOrders: true,
          hasReportableActivity: true,
          hasServiceJobs: true,
        },
        false,
      ),
    ).toMatchObject({
      showGettingStarted: false,
      showOrderHistory: true,
    })
  })

  test("keeps role-appropriate bottom tabs independent of feature presence", () => {
    expect(getMobileDashboardNavigation(false)).toEqual({
      centralActionLabel: "Add",
      navItemLabels: ["Home", "Catalog", "Work", "Reports"],
    })
    expect(getMobileDashboardNavigation(true)).toEqual({
      centralActionLabel: "New order",
      navItemLabels: ["Home", "Work"],
    })
  })

  test("switches the authoritative business context without carrying feature state", () => {
    const switched = switchMobileBusinessSession(
      {
        profile: {
          businessId: "tenant_a",
          businessName: "Business A",
          businessSlug: "business-a",
          email: "owner@test.com",
          id: "user_a",
          name: "Owner",
          role: "OWNER",
        },
        token: "session-token",
      },
      {
        createdAt: "",
        currency: "GHS",
        id: "tenant_b",
        name: "Business B",
        role: "MANAGER",
        slug: "business-b",
      },
    )

    expect(switched).toMatchObject({
      profile: {
        businessId: "tenant_b",
        businessName: "Business B",
        businessSlug: "business-b",
        currencyCode: "GHS",
        role: "MANAGER",
      },
      token: "session-token",
    })
    expect(
      mergeMobileWorkspaceFeatureAvailability(
        { ...authoritative, storeId: "store_b" },
        {
          catalogItems: [],
          commercialOrders: 0,
          customers: 0,
          inventoryOperations: 0,
          serviceOperations: 0,
        },
      ),
    ).toMatchObject({
      hasCatalogItems: false,
      hasOrders: false,
      storeId: "store_b",
    })

    expect(
      switchMobileBusinessSession(switched, {
        createdAt: "",
        id: "local_business",
        name: "Local Business",
      }),
    ).toMatchObject({
      profile: {
        businessId: "local_business",
        businessName: "Local Business",
        businessSlug: undefined,
      },
    })
  })
})
