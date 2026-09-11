import { describe, expect, test } from "bun:test"

import type { MobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"
import { buildAdminCreateActions } from "./admin-create-actions"

const EMPTY_AVAILABILITY: MobileWorkspaceFeatureAvailability = {
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
  storeId: "store-1",
}

describe("admin create actions", () => {
  test("prioritizes first-item choices and explains locked operations", () => {
    const actions = buildAdminCreateActions(EMPTY_AVAILABILITY, false)

    expect(actions.map((action) => action.label)).toEqual([
      "Product",
      "Service",
      "Customer",
      "Staff",
      "Order",
      "Stock Entry",
    ])
    expect(actions.slice(0, 2).every((action) => !action.disabled)).toBe(true)
    expect(actions[4]).toMatchObject({
      disabled: true,
      statusLabel: "First item",
    })
    expect(actions[5]).toMatchObject({
      disabled: true,
      statusLabel: "Product",
    })
  })

  test("keeps offline catalog setup explicit without locking local-safe actions", () => {
    const actions = buildAdminCreateActions(EMPTY_AVAILABILITY, true)

    expect(actions[0]).toMatchObject({
      disabled: true,
      statusLabel: "Online only",
    })
    expect(actions[1]).toMatchObject({
      disabled: true,
      statusLabel: "Online only",
    })
    expect(actions[2]?.disabled).toBe(false)
    expect(actions[3]?.disabled).toBe(false)
  })

  test("unlocks order and stock actions from their independent prerequisites", () => {
    const actions = buildAdminCreateActions(
      {
        ...EMPTY_AVAILABILITY,
        hasActiveSellableItems: true,
        hasProductItems: true,
      },
      false,
    )

    expect(actions[4]).toMatchObject({ disabled: false })
    expect(actions[4]?.statusLabel).toBeUndefined()
    expect(actions[5]).toMatchObject({ disabled: false })
    expect(actions[5]?.statusLabel).toBeUndefined()
  })
})
