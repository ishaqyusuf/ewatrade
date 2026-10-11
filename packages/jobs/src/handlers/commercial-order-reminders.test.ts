import { describe, expect, test } from "bun:test"

import {
  commercialOrderReminderTiming,
  isCommercialOrderReminderRecipientRole,
  tenantSendsOrderReminders,
} from "./commercial-order-reminders"

describe("commercial Order reminder classification", () => {
  const now = new Date("2026-07-25T07:00:00.000Z")

  test("classifies same-day and day-before delivery in the business timezone", () => {
    expect(
      commercialOrderReminderTiming({
        deliveryDueAt: new Date("2026-07-25T16:00:00.000Z"),
        now,
        timeZone: "Africa/Lagos",
      }),
    ).toBe("same_day")
    expect(
      commercialOrderReminderTiming({
        deliveryDueAt: new Date("2026-07-26T16:00:00.000Z"),
        now,
        timeZone: "Africa/Lagos",
      }),
    ).toBe("day_before")
  })

  test("does not remind for deliveries outside the configured daily windows", () => {
    expect(
      commercialOrderReminderTiming({
        deliveryDueAt: new Date("2026-07-27T16:00:00.000Z"),
        now,
        timeZone: "Africa/Lagos",
      }),
    ).toBeNull()
    expect(
      commercialOrderReminderTiming({
        deliveryDueAt: new Date("2026-07-24T16:00:00.000Z"),
        now,
        timeZone: "Africa/Lagos",
      }),
    ).toBeNull()
  })

  test("targets active management roles", () => {
    expect(isCommercialOrderReminderRecipientRole("OWNER")).toBe(true)
    expect(isCommercialOrderReminderRecipientRole("ADMIN")).toBe(true)
    expect(isCommercialOrderReminderRecipientRole("MANAGER")).toBe(true)
    expect(isCommercialOrderReminderRecipientRole("CASHIER")).toBe(false)
  })

  test("sends nothing for Free businesses; paid plans and the launch default send", () => {
    expect(
      tenantSendsOrderReminders({
        metadata: {},
        subscription: { plan: { key: "free" } },
      }),
    ).toBe(false)
    expect(
      tenantSendsOrderReminders({
        metadata: { retailOps: { subscription: { planId: "free" } } },
        subscription: null,
      }),
    ).toBe(false)
    expect(
      tenantSendsOrderReminders({
        metadata: {},
        subscription: { plan: { key: "starter" } },
      }),
    ).toBe(true)
    expect(
      tenantSendsOrderReminders({ metadata: null, subscription: null }),
    ).toBe(true)
  })
})
