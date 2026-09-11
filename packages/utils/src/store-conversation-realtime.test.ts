import { describe, expect, test } from "bun:test"

import {
  latestStoreConversationSequence,
  mergeStoreConversationActionMessageUpdates,
  mergeStoreConversationSequence,
} from "./store-conversation-realtime"

describe("Store Conversation realtime state", () => {
  test("replaces a mounted action without requiring a newer message", () => {
    const messages = [
      {
        actionMessage: {
          actions: [{ label: "Pay now" }],
          lifecycle: "current",
        },
        id: "message_1",
        sequence: 4,
      },
      { id: "message_2", sequence: 5 },
    ]

    expect(
      mergeStoreConversationActionMessageUpdates(messages, [
        {
          actionMessage: { actions: [], lifecycle: "revoked" },
          messageId: "message_1",
        },
      ]),
    ).toEqual([
      {
        actionMessage: { actions: [], lifecycle: "revoked" },
        id: "message_1",
        sequence: 4,
      },
      { id: "message_2", sequence: 5 },
    ])
  })

  test("merges reconnect pages in sequence without duplicate messages", () => {
    const current = [
      { id: "message_1", sequence: 1, text: "First" },
      { id: "message_2", sequence: 2, text: "Pending projection" },
    ]
    const incoming = [
      { id: "message_2", sequence: 2, text: "Current projection" },
      { id: "message_3", sequence: 3, text: "Third" },
    ]

    const result = mergeStoreConversationSequence(current, incoming)

    expect(result).toEqual([
      { id: "message_1", sequence: 1, text: "First" },
      { id: "message_2", sequence: 2, text: "Current projection" },
      { id: "message_3", sequence: 3, text: "Third" },
    ])
    expect(latestStoreConversationSequence(result)).toBe(3)
  })
})
