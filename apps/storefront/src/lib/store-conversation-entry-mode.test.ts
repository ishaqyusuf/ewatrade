import { describe, expect, test } from "bun:test"

import { shouldUseStoreConversationTextTracer } from "./store-conversation-entry-mode"

describe("Store Conversation entry mode", () => {
  test("uses the text tracer only for a sole web Product Inquiry action", () => {
    expect(
      shouldUseStoreConversationTextTracer({
        actions: ["request_online"],
        requestKinds: ["product_inquiry"],
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

  test("preserves vertical and unavailable compatibility projections", () => {
    expect(
      shouldUseStoreConversationTextTracer({
        actions: ["request_online"],
        requestKinds: ["prescription"],
      }),
    ).toBe(false)
    expect(
      shouldUseStoreConversationTextTracer({
        actions: [],
        requestKinds: ["product_inquiry"],
      }),
    ).toBe(false)
  })
})
