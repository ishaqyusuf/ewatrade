import { describe, expect, test } from "bun:test"

import {
  parseStagedStoreConversationGuestRotation,
  parseStoreConversationGuestIssuedAt,
  serializeStagedStoreConversationGuestRotation,
} from "./store-conversation-credential-rotation-codec"

describe("Store Conversation web credential rotation staging", () => {
  test("round-trips only one bounded caller-staged operation", () => {
    const staged = {
      clientOperationId: "credential-rotation-operation-1",
      targetCredentialToken: "target-credential-token-with-enough-entropy",
    }
    expect(
      parseStagedStoreConversationGuestRotation(
        serializeStagedStoreConversationGuestRotation(staged),
      ),
    ).toEqual(staged)
    expect(JSON.stringify(staged)).not.toContain("conversationId")
  })

  test("rejects malformed staging and issuance timestamps", () => {
    expect(parseStagedStoreConversationGuestRotation("bad")).toBeNull()
    expect(parseStoreConversationGuestIssuedAt("bad")).toBeNull()
    expect(
      parseStoreConversationGuestIssuedAt("2026-08-16T12:00:00.000Z"),
    ).toEqual(new Date("2026-08-16T12:00:00.000Z"))
  })
})
