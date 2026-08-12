import { describe, expect, test } from "bun:test"

import { runStoreConversationEscalations } from "./store-conversation-escalations"

describe("Store Conversation escalation schedule", () => {
  test("delegates one bounded identifier-only repository scan", async () => {
    const calls: unknown[] = []
    const now = new Date("2026-08-12T12:00:00.000Z")
    const result = await runStoreConversationEscalations(
      {
        record: async (input) => {
          calls.push(input)
          return { openedCount: 2, scannedCount: 3 }
        },
      },
      now,
    )

    expect(result).toEqual({ openedCount: 2, scannedCount: 3 })
    expect(calls).toEqual([{ limit: 200, now }])
    expect(JSON.stringify(calls)).not.toContain("message")
  })
})
