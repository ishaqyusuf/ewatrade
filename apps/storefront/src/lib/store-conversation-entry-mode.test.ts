import { describe, expect, test } from "bun:test"

import { shouldUseStoreConversationTextTracer } from "./store-conversation-entry-mode"

describe("Store Conversation entry mode", () => {
  test("uses the conversation for any permitted web Request allowlist", () => {
    expect(
      shouldUseStoreConversationTextTracer({
        actions: ["request_online"],
        requestKinds: ["product_inquiry"],
      }),
    ).toBe(true)
    expect(
      shouldUseStoreConversationTextTracer({
        actions: ["request_online"],
        requestKinds: ["product_inquiry", "service", "prescription"],
      }),
    ).toBe(true)
  })

  test("preserves the compatibility projection when WhatsApp is also allowed", () => {
    expect(
      shouldUseStoreConversationTextTracer({
        actions: ["request_online", "chat_on_whatsapp"],
        requestKinds: ["product_inquiry"],
      }),
    ).toBe(false)
  })

  test("preserves unavailable compatibility projections", () => {
    expect(
      shouldUseStoreConversationTextTracer({
        actions: ["request_online"],
        requestKinds: [],
      }),
    ).toBe(false)
  })
})
