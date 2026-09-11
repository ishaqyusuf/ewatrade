import { describe, expect, test } from "bun:test"

import { runStoreConversationWhatsAppRecoverySchedule } from "./store-conversation-whatsapp-recovery-schedule"

describe("Store Conversation WhatsApp recovery schedule", () => {
  test("queues only bounded identifiers returned by the recovery outbox", async () => {
    const queued: unknown[] = []
    const result = await runStoreConversationWhatsAppRecoverySchedule({
      enqueue: async (input) => queued.push(input),
      list: async ({ limit }) => {
        expect(limit).toBe(100)
        return [
          { attemptId: "attempt_1", storeId: "store_1", tenantId: "tenant_1" },
          { attemptId: "attempt_2", storeId: "store_2", tenantId: "tenant_1" },
        ]
      },
    })

    expect(result).toEqual({ queued: 2 })
    expect(queued).toHaveLength(2)
    expect(JSON.stringify(queued)).not.toMatch(/recipient|content|token|url/i)
  })

  test("continues queueing when one independent enqueue fails", async () => {
    const queued: string[] = []
    const result = await runStoreConversationWhatsAppRecoverySchedule({
      enqueue: async ({ attemptId }) => {
        queued.push(attemptId)
        if (attemptId === "attempt_1") throw new Error("queue unavailable")
      },
      list: async () => [
        { attemptId: "attempt_1", storeId: "store_1", tenantId: "tenant_1" },
        { attemptId: "attempt_2", storeId: "store_2", tenantId: "tenant_1" },
      ],
    })

    expect(queued).toEqual(["attempt_1", "attempt_2"])
    expect(result).toEqual({ failed: 1, queued: 1 })
  })
})
