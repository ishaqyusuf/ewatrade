import { expect, test } from "bun:test"
import { capabilityForAction } from "../capabilities/manifest"
import { generalActionSchema, generalActionSummary } from "./contracts"
import {
  storeSettingsReceiptKind,
  storeSettingsUpdateAction,
} from "./store-settings-change"

const receipts = {
  action: "store_settings_update" as const,
  change: {
    section: "receipts" as const,
    scope: "store" as const,
    settings: {
      showCustomerName: false,
      showPaymentBreakdown: true,
      thankYouNote: "See you soon",
    },
  },
}

test("a settings change names one section with exact values", () => {
  expect(generalActionSchema.safeParse(receipts).success).toBe(true)
  // Removing this Store's own receipt settings is allowed; business defaults are not removable.
  expect(
    storeSettingsUpdateAction.safeParse({
      ...receipts,
      change: { ...receipts.change, settings: null },
    }).success,
  ).toBe(true)
  expect(
    storeSettingsUpdateAction.safeParse({
      ...receipts,
      change: { ...receipts.change, scope: "business", settings: null },
    }).success,
  ).toBe(false)
  for (const change of [
    { section: "reminders", enabled: true },
    { section: "order_visibility", visibility: "EVERYONE" },
    { section: "pricing", value: 1 },
    { ...receipts.change, storeId: "other-store" },
  ])
    expect(
      storeSettingsUpdateAction.safeParse({ ...receipts, change }).success,
    ).toBe(false)
  expect(
    storeSettingsUpdateAction.safeParse({ ...receipts, tenantId: "foreign" })
      .success,
  ).toBe(false)
})

test("summaries and receipt kinds follow the section", () => {
  expect(generalActionSummary(receipts, "NGN")).toBe(
    'Receipts (this Store only): customer name no, payment breakdown yes, note "See you soon"',
  )
  expect(
    generalActionSummary(
      {
        action: "store_settings_update",
        change: {
          section: "reminders",
          enabled: true,
          dayBeforeEnabled: true,
          sameDayEnabled: false,
        },
      },
      "NGN",
    ),
  ).toBe("Order reminders on · day before yes · same day no")
  expect(
    generalActionSummary(
      {
        action: "store_settings_update",
        change: { section: "order_visibility", visibility: "ALL_STORE_ORDERS" },
      },
      "NGN",
    ),
  ).toBe("Sales reps see all orders in this Store")
  expect(
    (["receipts", "reminders", "order_visibility"] as const).map(
      storeSettingsReceiptKind,
    ),
  ).toEqual([
    "store_receipt_settings",
    "store_reminder_settings",
    "store_order_visibility",
  ])
})

test("the change is a planned Owner/Admin capability on both clients", () => {
  expect(capabilityForAction("store_settings_update")).toMatchObject({
    id: "settings.store.change",
    rollout: "planned",
    policy: { roles: ["OWNER", "ADMIN"] },
    clients: ["dashboard", "mobile"],
    procedures: [
      "orders.saveReceiptSettings",
      "orders.updateReminderSettings",
      "stores.updateOrderVisibility",
    ],
  })
})
