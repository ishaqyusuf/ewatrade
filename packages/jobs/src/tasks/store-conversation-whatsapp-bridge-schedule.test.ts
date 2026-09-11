import { describe, expect, test } from "bun:test"

import { runStoreConversationWhatsAppBridgeSchedule } from "./store-conversation-whatsapp-bridge-schedule"

describe("Store Conversation WhatsApp bridge prompt schedule", () => {
  test("queues only bounded identifier payloads returned by the durable outbox", async () => {
    const queued: unknown[] = []
    const result = await runStoreConversationWhatsAppBridgeSchedule({
      enqueue: async (input) => queued.push(input),
      list: async ({ limit }) => {
        expect(limit).toBe(100)
        return [
          { bridgeId: "bridge_1", storeId: "store_1", tenantId: "tenant_1" },
          { bridgeId: "bridge_2", storeId: "store_2", tenantId: "tenant_1" },
        ]
      },
    })

    expect(result).toEqual({ queued: 2 })
    expect(queued).toEqual([
      { bridgeId: "bridge_1", storeId: "store_1", tenantId: "tenant_1" },
      { bridgeId: "bridge_2", storeId: "store_2", tenantId: "tenant_1" },
    ])
    expect(JSON.stringify(queued)).not.toMatch(/recipient|token|message/i)
  })

  test("continues queueing independent attempts when one enqueue fails", async () => {
    const queued: string[] = []
    const result = await runStoreConversationWhatsAppBridgeSchedule({
      enqueue: async ({ bridgeId }) => {
        queued.push(bridgeId)
        if (bridgeId === "bridge_1") throw new Error("queue unavailable")
      },
      list: async () => [
        { bridgeId: "bridge_1", storeId: "store_1", tenantId: "tenant_1" },
        { bridgeId: "bridge_2", storeId: "store_2", tenantId: "tenant_1" },
      ],
    })

    expect(queued).toEqual(["bridge_1", "bridge_2"])
    expect(result).toEqual({ failed: 1, queued: 1 })
  })
})
