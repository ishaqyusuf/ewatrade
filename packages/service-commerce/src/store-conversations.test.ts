import { describe, expect, test } from "bun:test"

import {
  storeConversationBootstrapInputSchema,
  storeConversationSendTextInputSchema,
  storeConversationTimelineInputSchema,
} from "./schemas/store-conversations"
import { projectStoreConversationCursor } from "./store-conversations"

describe("Store Conversation contracts", () => {
  test("accepts an opaque Store entry and bounded text command", () => {
    expect(
      storeConversationBootstrapInputSchema.parse({
        publicToken: "a".repeat(32),
      }),
    ).toEqual({ publicToken: "a".repeat(32) })
    expect(
      storeConversationSendTextInputSchema.parse({
        clientOperationId: "send-text-123",
        conversationId: "conversation_1",
        publicToken: "a".repeat(32),
        text: "  I need a red handbag.  ",
      }),
    ).toMatchObject({ text: "I need a red handbag." })
  })

  test("rejects empty or oversized customer text", () => {
    expect(() =>
      storeConversationSendTextInputSchema.parse({
        clientOperationId: "send-text-123",
        conversationId: "conversation_1",
        publicToken: "a".repeat(32),
        text: " ",
      }),
    ).toThrow()
    expect(() =>
      storeConversationSendTextInputSchema.parse({
        clientOperationId: "send-text-123",
        conversationId: "conversation_1",
        publicToken: "a".repeat(32),
        text: "x".repeat(2_001),
      }),
    ).toThrow()
  })

  test("uses bounded deterministic sequence cursors", () => {
    expect(
      storeConversationTimelineInputSchema.parse({
        conversationId: "conversation_1",
      }),
    ).toMatchObject({ limit: 50 })
    expect(
      projectStoreConversationCursor({
        hasMore: true,
        messages: [{ sequence: 7 }, { sequence: 6 }],
      }),
    ).toBe(6)
    expect(
      projectStoreConversationCursor({
        hasMore: false,
        messages: [{ sequence: 7 }],
      }),
    ).toBeNull()
  })
})
