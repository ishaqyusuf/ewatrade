import { describe, expect, test } from "bun:test"

import { runServiceCommerceBookingReminders } from "./service-commerce-booking-reminders"

const payload = {
  actorUserId: "worker_1",
  limit: 25,
  storeId: "store_1",
  tenantId: "tenant_1",
}

describe("Service Commerce booking reminders", () => {
  test("schedules only from the scoped repository seam and enqueues identifier-only dispatches", async () => {
    const calls: unknown[] = []
    const result = await runServiceCommerceBookingReminders(payload, {
      schedule: async (input) => {
        calls.push(["schedule", input])
        return {
          notificationDispatches: [
            { actorUserId: "worker_1", intentId: "intent_1" },
            { actorUserId: "worker_2", intentId: "intent_2" },
          ],
        }
      },
      enqueue: async (input) => calls.push(["enqueue", input]),
    })

    expect(result).toEqual({ scheduled: 2 })
    expect(calls).toEqual([
      ["schedule", payload],
      [
        "enqueue",
        {
          actorUserId: "worker_1",
          intentId: "intent_1",
          storeId: "store_1",
          tenantId: "tenant_1",
        },
      ],
      [
        "enqueue",
        {
          actorUserId: "worker_2",
          intentId: "intent_2",
          storeId: "store_1",
          tenantId: "tenant_1",
        },
      ],
    ])
  })

  test("does not enqueue when no due reminder survives job-time authorization", async () => {
    await expect(
      runServiceCommerceBookingReminders(payload, {
        schedule: async () => ({ notificationDispatches: [] }),
        enqueue: async () => {
          throw new Error("not used")
        },
      }),
    ).resolves.toEqual({ scheduled: 0 })
  })
})
