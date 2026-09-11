import { describe, expect, test } from "bun:test"

import {
  STORE_CONVERSATION_PRESENTATION_TOMBSTONE,
  getStoreConversationRetentionPolicy,
  projectStoreConversationPrivacyOutcomes,
  storeConversationPrivacyRequestInputSchema,
} from "./store-conversation-privacy"

describe("Store Conversation privacy and retention policy", () => {
  test("assigns independent defaults instead of one global lifetime", () => {
    expect(getStoreConversationRetentionPolicy("guest_credential")).toEqual({
      customerErasable: true,
      defaultDays: 180,
    })
    expect(getStoreConversationRetentionPolicy("generic_media")).toEqual({
      customerErasable: true,
      defaultDays: 365,
    })
    expect(getStoreConversationRetentionPolicy("security_evidence")).toEqual({
      customerErasable: false,
      defaultDays: 30,
    })
    expect(getStoreConversationRetentionPolicy("clinical_record")).toEqual({
      customerErasable: false,
      defaultDays: null,
    })
  })

  test("returns truthful per-class outcomes for mixed required records", () => {
    expect(
      projectStoreConversationPrivacyOutcomes({
        available: new Set(["presentation_message", "commercial_record"]),
        removed: new Set(["presentation_message"]),
        requested: [
          "presentation_message",
          "commercial_record",
          "generic_media",
        ],
      }),
    ).toEqual([
      { classification: "presentation_message", status: "removed" },
      { classification: "commercial_record", status: "retained_required" },
      { classification: "generic_media", status: "unavailable" },
    ])
    expect(STORE_CONVERSATION_PRESENTATION_TOMBSTONE).toBe(
      "Message removed following a customer privacy request.",
    )
  })

  test("normalizes bounded allowlisted privacy classifications", () => {
    expect(
      storeConversationPrivacyRequestInputSchema.parse({
        classifications: [
          "presentation_message",
          "guest_credential",
          "presentation_message",
        ],
        clientOperationId: "privacy-operation-1",
        conversationId: "conversation_1",
        publicToken: "p".repeat(32),
      }).classifications,
    ).toEqual(["guest_credential", "presentation_message"])
    expect(() =>
      storeConversationPrivacyRequestInputSchema.parse({
        classifications: ["everything"],
        clientOperationId: "privacy-operation-2",
        conversationId: "conversation_1",
        publicToken: "p".repeat(32),
      }),
    ).toThrow()
  })
})
