import { describe, expect, test } from "bun:test"

import { runServiceCommerceCustomerNotificationSchedule } from "./service-commerce-customer-notification-schedule"

describe("Service Commerce customer notification schedule", () => {
  test("enqueues bounded identifier-only due intents", async () => {
    const now = new Date("2031-02-03T08:00:00.000Z")
    const queued: unknown[] = []
    const listed: unknown[] = []
    await expect(
      runServiceCommerceCustomerNotificationSchedule(
        {
          enqueue: async (input) => queued.push(input),
          list: async (input) => {
            listed.push(input)
            return [
              {
                actorUserId: "user-1",
                intentId: "intent-1",
                storeId: "store-1",
                tenantId: "tenant-1",
              },
            ]
          },
        },
        now,
      ),
    ).resolves.toEqual({ queued: 1 })
    expect(listed).toEqual([{ limit: 100, now }])
    expect(queued).toEqual([
      {
        actorUserId: "user-1",
        intentId: "intent-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      },
    ])
  })

  test("does not enqueue when no due intent exists", async () => {
    await expect(
      runServiceCommerceCustomerNotificationSchedule({
        enqueue: async () => {
          throw new Error("not used")
        },
        list: async () => [],
      }),
    ).resolves.toEqual({ queued: 0 })
  })
})
