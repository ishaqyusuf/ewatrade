import { describe, expect, test } from "bun:test"

import { runStoreConversationNotificationSchedule } from "./store-conversation-notification-schedule"

describe("Store Conversation notification schedule", () => {
  test("queues identifier-only due, reopened, and verification work", async () => {
    const enqueued: unknown[] = []
    const now = new Date("2026-08-15T12:00:00.000Z")
    const result = await runStoreConversationNotificationSchedule(
      {
        enqueueNotification: async (input) => {
          enqueued.push(["notification", input])
        },
        enqueueVerification: async (input) => {
          enqueued.push(["verification", input])
        },
        listDueNotifications: async () => [
          { intentId: "intent-due", storeId: "store-1", tenantId: "tenant-1" },
        ],
        listDueVerifications: async () => [
          {
            storeId: "store-1",
            tenantId: "tenant-1",
            verificationId: "verification-1",
          },
        ],
        listWaitingReopenings: async () => [
          {
            intentId: "intent-waiting",
            storeId: "store-1",
            tenantId: "tenant-1",
          },
        ],
        releaseReopening: async (input) => ({
          intentId: input.intentId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        }),
      },
      now,
    )

    expect(result).toEqual({
      notificationsQueued: 2,
      reopeningsReleased: 1,
      verificationsQueued: 1,
    })
    expect(enqueued).toEqual([
      [
        "notification",
        { intentId: "intent-due", storeId: "store-1", tenantId: "tenant-1" },
      ],
      [
        "notification",
        {
          intentId: "intent-waiting",
          storeId: "store-1",
          tenantId: "tenant-1",
        },
      ],
      [
        "verification",
        {
          storeId: "store-1",
          tenantId: "tenant-1",
          verificationId: "verification-1",
        },
      ],
    ])
    expect(JSON.stringify(enqueued)).not.toContain("destination")
    expect(JSON.stringify(enqueued)).not.toContain("message")
  })
})
