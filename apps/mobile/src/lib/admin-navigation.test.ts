import { describe, expect, test } from "bun:test"

import {
  buildAccountSections,
  buildAdminMoreSections,
  canAccessAdminTabs,
  getAdminCatalogTabLabel,
  getAdminDockLabels,
} from "./admin-navigation"
import { getPlan } from "./retail-ops-subscription"
import type { MobileWorkspaceFeatureAvailability } from "./workspace-feature-availability"

const availability: MobileWorkspaceFeatureAvailability = {
  hasActiveSellableItems: false,
  hasCatalogItems: false,
  hasCustomers: false,
  hasInventoryActivity: false,
  hasOrders: false,
  hasPrescriptionCommerce: false,
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

    for (const role of [
      "CASHIER",
      "OPERATOR",
      "SUPPORT",
      "MEMBER",
      undefined,
    ]) {
      expect(canAccessAdminTabs(role)).toBe(false)
    }
  })

  test("keeps a stable catalog route while adapting its visible label", () => {
    expect(getAdminCatalogTabLabel(availability)).toBe("Catalog")
    expect(
      getAdminCatalogTabLabel({ ...availability, hasProductItems: true }),
    ).toBe("Goods")
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
    expect(getAdminDockLabels("Goods")).toEqual([
      "Home",
      "Orders",
      "+",
      "Goods",
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
      websiteDomainsEnabled: true,
    })
    const ownerItems = ownerSections.flatMap((section) => section.items)

    expect(ownerItems.map((item) => item.id)).toEqual([
      "inventory",
      "analytics",
      "payments-received",
      "team",
      "customers",
      "service-work",
      "finance",
      "order-reminders",
      "receipt-settings",
      "returns-refunds",
      "whatsapp-messages",
      "website-domain",
      "plan-billing",
      "sync-offline",
      "assistant-whatsapp",
      "app-theme",
      "app-lock",
      "app-updates",
      "sign-out",
    ])
    expect(ownerItems.find((item) => item.id === "inventory")?.disabled).toBe(
      false,
    )
    expect(ownerSections.map((section) => section.id)).toEqual([
      "store-tools",
      "storefront-plan",
      "offline",
      "account-settings",
    ])

    const managerItems = buildAdminMoreSections({
      availability,
      role: "MANAGER",
    }).flatMap((section) => section.items)

    expect(managerItems.find((item) => item.id === "inventory")?.disabled).toBe(
      true,
    )
    expect(managerItems.some((item) => item.id === "service-work")).toBe(false)
    expect(managerItems.some((item) => item.id === "website-domain")).toBe(
      false,
    )
    expect(managerItems.some((item) => item.id === "plan-billing")).toBe(false)
  })

  test("hides Website & domain until the API reports it launched", () => {
    const ids = (websiteDomainsEnabled?: boolean) =>
      buildAdminMoreSections({
        availability,
        role: "OWNER",
        websiteDomainsEnabled,
      })
        .flatMap((section) => section.items)
        .map((item) => item.id)
    expect(ids()).not.toContain("website-domain")
    expect(ids(false)).not.toContain("website-domain")
    expect(ids(true)).toContain("website-domain")
  })

  test("hides Free plan exclusions while keeping unknown plans ungated", () => {
    const ids = (
      planFeatures?: Parameters<
        typeof buildAdminMoreSections
      >[0]["planFeatures"],
    ) =>
      buildAdminMoreSections({ availability, planFeatures, role: "OWNER" })
        .flatMap((section) => section.items)
        .map((item) => item.id)
    const free = ids(getPlan("free").features)
    expect(free).not.toContain("finance")
    expect(free).not.toContain("receipt-settings")
    expect(free).not.toContain("team")
    expect(free).not.toContain("order-reminders")
    expect(free).toContain("customers")
    expect(free).toContain("plan-billing")
    for (const unrestricted of [ids(getPlan("starter").features), ids()]) {
      expect(unrestricted).toContain("finance")
      expect(unrestricted).toContain("receipt-settings")
      expect(unrestricted).toContain("team")
      expect(unrestricted).toContain("order-reminders")
    }
  })
})

test("account access has no management tools", () => {
  const items = buildAccountSections().flatMap((s) => s.items)
  expect(items.map((i) => i.id)).toEqual([
    "assistant-whatsapp",
    "app-theme",
    "app-lock",
    "app-updates",
    "sign-out",
  ])
  expect(items.some((i) => i.id === "finance" || i.id === "team")).toBe(false)
  expect(items.find((i) => i.id === "assistant-whatsapp")?.action).toEqual({
    kind: "route",
    href: "/assistant-whatsapp",
  })
})
