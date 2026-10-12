import { describe, expect, test } from "bun:test"

import {
  type DigestOrder,
  type DigestRecipient,
  commercialOrderDigestSections,
  isCommercialOrderDigestWindow,
  localDateKey,
  planCommercialOrderReminderDigests,
  reminderCoverageKey,
} from "./commercial-order-reminder-digest"

// 08:00 in Lagos (UTC+1).
const now = new Date("2026-10-12T07:00:00.000Z")
const timeZone = "Africa/Lagos"

function order(
  id: string,
  deliveryDueAt: string,
  overrides: Partial<DigestOrder> = {},
): DigestOrder {
  return {
    customerName: `Customer ${id}`,
    deliveryDueAt: new Date(deliveryDueAt),
    id,
    orderNumber: `EWA-${id}`,
    settings: null,
    storeId: "store_a",
    storeName: "Lekki Store",
    ...overrides,
  }
}

function recipient(
  email: string,
  overrides: Partial<DigestRecipient> = {},
): DigestRecipient {
  return {
    accessMode: "LEGACY",
    email,
    managedStoreIds: [],
    name: null,
    role: "OWNER",
    ...overrides,
  }
}

const orders = [
  order("today", "2026-10-12T15:00:00.000Z"),
  order("tomorrow", "2026-10-13T09:00:00.000Z"),
  order("overdue", "2026-10-11T12:00:00.000Z"),
  order("later", "2026-10-15T09:00:00.000Z"),
  order("store-b", "2026-10-12T10:00:00.000Z", {
    storeId: "store_b",
    storeName: "Yaba Store",
  }),
]

describe("commercial Order reminder digest planning", () => {
  test("sends one digest per recipient listing every due Order", () => {
    const digests = planCommercialOrderReminderDigests({
      coveredKeys: new Set(),
      now,
      orders,
      recipients: [
        recipient("Owner@Example.com"),
        recipient("owner@example.com"),
      ],
      timeZone,
    })
    expect(digests).toHaveLength(1)
    expect(digests[0]?.recipient.email).toBe("owner@example.com")
    expect(
      digests[0]?.entries.map((entry) => [entry.order.id, entry.timing]),
    ).toEqual([
      ["overdue", "overdue"],
      ["store-b", "same_day"],
      ["today", "same_day"],
      ["tomorrow", "day_before"],
    ])
  })

  test("honours per-Store reminder settings", () => {
    const [digest] = planCommercialOrderReminderDigests({
      coveredKeys: new Set(),
      now,
      orders: orders.map((entry) =>
        entry.storeId === "store_b"
          ? {
              ...entry,
              settings: {
                dayBeforeEnabled: true,
                enabled: false,
                sameDayEnabled: true,
              },
            }
          : {
              ...entry,
              settings: {
                dayBeforeEnabled: false,
                enabled: true,
                sameDayEnabled: true,
              },
            },
      ),
      recipients: [recipient("owner@example.com")],
      timeZone,
    })
    expect(digest?.entries.map((entry) => entry.order.id)).toEqual([
      "overdue",
      "today",
    ])
  })

  test("scopes Store Managers to the Stores they manage", () => {
    const digests = planCommercialOrderReminderDigests({
      coveredKeys: new Set(),
      now,
      orders,
      recipients: [
        recipient("scoped@example.com", {
          accessMode: "SCOPED",
          managedStoreIds: ["store_b"],
          role: "CASHIER",
        }),
        recipient("legacy-cashier@example.com", { role: "CASHIER" }),
        recipient("legacy-manager@example.com", { role: "MANAGER" }),
        recipient("scoped-none@example.com", {
          accessMode: "SCOPED",
          role: "MANAGER",
        }),
      ],
      timeZone,
    })
    expect(
      digests.map((digest) => [
        digest.recipient.email,
        digest.entries.map((entry) => entry.order.id),
      ]),
    ).toEqual([
      ["scoped@example.com", ["store-b"]],
      [
        "legacy-manager@example.com",
        ["overdue", "store-b", "today", "tomorrow"],
      ],
    ])
  })

  test("leaves out Orders already reminded for the same timing", () => {
    const digests = planCommercialOrderReminderDigests({
      coveredKeys: new Set([
        reminderCoverageKey({
          email: "owner@example.com",
          orderId: "overdue",
          timing: "overdue",
        }),
        reminderCoverageKey({
          email: "owner@example.com",
          orderId: "today",
          timing: "same_day",
        }),
        reminderCoverageKey({
          email: "owner@example.com",
          orderId: "store-b",
          timing: "same_day",
        }),
        reminderCoverageKey({
          email: "owner@example.com",
          orderId: "tomorrow",
          timing: "day_before",
        }),
      ]),
      now,
      orders,
      recipients: [recipient("owner@example.com")],
      timeZone,
    })
    expect(digests).toEqual([])
  })

  test("sends only in the Tenant's local morning window", () => {
    expect(
      isCommercialOrderDigestWindow(
        new Date("2026-10-12T05:00:00.000Z"),
        timeZone,
      ),
    ).toBe(false)
    expect(
      isCommercialOrderDigestWindow(
        new Date("2026-10-12T06:00:00.000Z"),
        timeZone,
      ),
    ).toBe(true)
    expect(
      isCommercialOrderDigestWindow(
        new Date("2026-10-12T08:00:00.000Z"),
        timeZone,
      ),
    ).toBe(true)
    expect(
      isCommercialOrderDigestWindow(
        new Date("2026-10-12T09:00:00.000Z"),
        timeZone,
      ),
    ).toBe(false)
    expect(localDateKey(new Date("2026-10-12T23:30:00.000Z"), timeZone)).toBe(
      "2026-10-13",
    )
  })

  test("builds email sections in overdue, today, tomorrow order with links", () => {
    const [digest] = planCommercialOrderReminderDigests({
      coveredKeys: new Set(),
      now,
      orders,
      recipients: [recipient("owner@example.com")],
      timeZone,
    })
    const sections = commercialOrderDigestSections({
      dashboardUrl: "https://dash.ewatrade.com",
      entries: digest?.entries ?? [],
      timeZone,
    })
    expect(sections.map((section) => section.timing)).toEqual([
      "overdue",
      "same_day",
      "day_before",
    ])
    expect(sections[1]?.orders[0]?.orderUrl).toBe(
      "https://dash.ewatrade.com/sales/orders/store-b",
    )
    expect(sections[1]?.orders[0]?.dueLabel).toStartWith("Today, ")
    expect(sections[0]?.orders[0]?.dueLabel).toStartWith("Was due ")
    expect(sections[1]?.orders[0]?.storeName).toBe("Yaba Store")
  })

  test("omits the Store name when every Order is from one Store", () => {
    const [digest] = planCommercialOrderReminderDigests({
      coveredKeys: new Set(),
      now,
      orders: orders.filter((entry) => entry.storeId === "store_a"),
      recipients: [recipient("owner@example.com")],
      timeZone,
    })
    const sections = commercialOrderDigestSections({
      dashboardUrl: null,
      entries: digest?.entries ?? [],
      timeZone,
    })
    for (const section of sections)
      for (const order of section.orders) {
        expect(order.storeName).toBeNull()
        expect(order.orderUrl).toBeNull()
      }
  })
})
