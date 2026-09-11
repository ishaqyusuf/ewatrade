import { describe, expect, test } from "bun:test"
import {
  BUSINESS_SWITCH_COPY,
  getBusinessSwitchRowPresentation,
} from "./business-switch-presentation"

describe("business switch presentation", () => {
  test("keeps the current workspace informational instead of reactivating it", () => {
    const presentation = getBusinessSwitchRowPresentation(
      {
        category: "Retail",
        country: "Nigeria",
        currency: "NGN",
        id: "business-current",
        name: "Ewa UI Audit",
        role: "OWNER",
        salesMethod: "In store",
        type: "Business",
      },
      "business-current",
    )

    expect(presentation).toEqual({
      badgeLabel: "Current",
      canActivate: false,
      detail: "Owner · NGN",
      metadata: "Retail · Nigeria · In store",
      selected: true,
    })
  })

  test("keeps another workspace available as a switch action", () => {
    const presentation = getBusinessSwitchRowPresentation(
      {
        currency: "USD",
        id: "business-other",
        name: "Export Store",
        role: "ADMIN",
        type: "Business",
      },
      "business-current",
    )

    expect(presentation).toEqual({
      badgeLabel: "Choose",
      canActivate: true,
      detail: "Admin · USD",
      metadata: "",
      selected: false,
    })
  })

  test("uses one concise workspace title and purpose", () => {
    expect(BUSINESS_SWITCH_COPY).toEqual({
      description: "Choose where you want to manage orders, stock, and staff.",
      title: "Workspaces",
    })
  })
})
