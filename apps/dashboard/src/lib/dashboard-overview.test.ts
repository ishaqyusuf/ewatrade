import { describe, expect, test } from "bun:test"
import type { WorkspaceFeatureAvailability } from "@ewatrade/db/queries"
import { getGettingStartedActions } from "./dashboard-overview"

const emptyAvailability: WorkspaceFeatureAvailability = {
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
  storeId: "store_a",
}

describe("dashboard getting started actions", () => {
  test("gives an owner first-record paths without exposing empty modules", () => {
    expect(
      getGettingStartedActions("OWNER", emptyAvailability).map((action) => ({
        disabled: action.disabled ?? false,
        href: action.href,
      })),
    ).toEqual([
      {
        disabled: false,
        href: "/?catalogItem=create&catalogCreateKind=product",
      },
      {
        disabled: false,
        href: "/?catalogItem=create&catalogCreateKind=service",
      },
      { disabled: true, href: "/sales?orderSheet=create" },
      { disabled: false, href: "/staff?staffSheet=invite" },
    ])
  })

  test("enables the first order after a sellable item exists", () => {
    const actions = getGettingStartedActions("OWNER", {
      ...emptyAvailability,
      hasActiveSellableItems: true,
      hasCatalogItems: true,
      hasProductItems: true,
    })

    expect(
      actions.find((action) => action.label === "Create first order"),
    ).toEqual(expect.objectContaining({ disabled: false }))
  })

  test("does not offer administrative setup to attendants", () => {
    expect(
      getGettingStartedActions("CASHIER", emptyAvailability).map(
        (action) => action.label,
      ),
    ).toEqual(["Create first order"])
  })
})
