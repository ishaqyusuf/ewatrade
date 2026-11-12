import { describe, expect, test } from "bun:test"
import { safeEventMetadata } from "./event-metadata"
import { growthIntentEvent, isSeePlansTap } from "./growth-intent"

describe("growth intent events", () => {
  test("plan_sheet_opened keeps only fixed labels", () => {
    const event = growthIntentEvent({
      name: "plan_sheet_opened",
      surface: "mobile",
      feature: "attachments",
      placement: "lock_sheet",
    })
    expect(event).toEqual({
      name: "plan_sheet_opened",
      properties: {
        surface: "mobile",
        action: "lock_sheet",
        feature: "attachments",
      },
    })
    // The shared whitelist passes the feature label through unchanged.
    expect(safeEventMetadata(event?.properties)).toEqual(
      event?.properties ?? {},
    )
  })

  test("upgrade_cta_clicked carries the plan as a category label", () => {
    expect(
      growthIntentEvent({
        name: "upgrade_cta_clicked",
        surface: "dashboard",
        feature: "plan_billing",
        placement: "plan_page",
        plan: "growth",
      })?.properties,
    ).toEqual({
      surface: "dashboard",
      action: "plan_page",
      feature: "plan_billing",
      category: "growth",
    })
  })

  test("nudge events carry the play id only", () => {
    expect(
      growthIntentEvent({
        name: "nudge_dismissed",
        surface: "mobile",
        play: "P08_limit:products",
        placement: "home_card",
      })?.properties,
    ).toEqual({
      surface: "mobile",
      action: "home_card",
      category: "P08_limit:products",
    })
  })

  test("drops unknown labels, ids and extra fields", () => {
    expect(
      growthIntentEvent({
        name: "plan_sheet_opened",
        surface: "mobile",
        feature: "anything",
        placement: "lock_sheet",
      }),
    ).toBeNull()
    expect(
      growthIntentEvent({
        name: "nudge_shown",
        surface: "mobile",
        play: "tenant_123 owner@example.com",
        placement: "home_card",
      }),
    ).toBeNull()
    expect(
      growthIntentEvent({
        name: "upgrade_cta_clicked",
        surface: "dashboard",
        feature: "staff",
        placement: "limit_card",
        tenantId: "t_1",
      }),
    ).toBeNull()
    expect(safeEventMetadata({ feature: "free text" })).toEqual({})
  })

  test("See plans taps exclude the plan page's own buttons", () => {
    expect(
      isSeePlansTap({
        name: "upgrade_cta_clicked",
        surface: "mobile",
        feature: "staff",
        placement: "limit_card",
      }),
    ).toBe(true)
    expect(
      isSeePlansTap({
        name: "upgrade_cta_clicked",
        surface: "dashboard",
        feature: "plan_billing",
        placement: "plan_page",
        plan: "starter",
      }),
    ).toBe(false)
  })

  test("camelCase limit suffixes pass; Home card taps are not counted", () => {
    expect(
      growthIntentEvent({
        name: "nudge_shown",
        surface: "dashboard",
        play: "P08_limit:ordersPerMonth",
        placement: "banner",
      })?.properties.category,
    ).toBe("P08_limit:ordersPerMonth")
    expect(
      isSeePlansTap({
        name: "upgrade_cta_clicked",
        surface: "mobile",
        feature: "storefront",
        placement: "home_card",
      }),
    ).toBe(false)
    expect(
      isSeePlansTap({
        name: "upgrade_cta_clicked",
        surface: "dashboard",
        feature: "finance",
        placement: "lock_sheet",
      }),
    ).toBe(true)
  })
})
