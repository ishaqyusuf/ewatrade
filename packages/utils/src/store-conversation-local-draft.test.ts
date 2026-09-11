import { describe, expect, test } from "bun:test"
import {
  STORE_CONVERSATION_LOCAL_DRAFT_LIFETIME_MS,
  createStoreConversationLocalDraft,
  parseStoreConversationLocalDraft,
  storeConversationLocalDraftKey,
} from "./store-conversation-local-draft"

describe("Store Conversation local drafts", () => {
  test("stores bounded text and attachment metadata without raw bytes", () => {
    const draft = createStoreConversationLocalDraft(
      { attachmentKind: "document", text: "Unsent request" },
      1_000,
    )
    expect(draft).toEqual({
      attachmentKind: "document",
      expiresAt: 1_000 + STORE_CONVERSATION_LOCAL_DRAFT_LIFETIME_MS,
      text: "Unsent request",
      version: 1,
    })
    expect(JSON.stringify(draft)).not.toContain("file:")
  })

  test("drops empty, expired, malformed, and unsupported drafts", () => {
    expect(
      createStoreConversationLocalDraft(
        { attachmentKind: null, text: "  " },
        1_000,
      ),
    ).toBeNull()
    expect(
      parseStoreConversationLocalDraft(
        JSON.stringify({
          attachmentKind: "image",
          expiresAt: 999,
          text: "Expired",
          version: 1,
        }),
        1_000,
      ),
    ).toBeNull()
    expect(parseStoreConversationLocalDraft("{", 1_000)).toBeNull()
    expect(
      parseStoreConversationLocalDraft(
        JSON.stringify({
          attachmentKind: "video",
          expiresAt: 2_000,
          text: "",
          version: 1,
        }),
        1_000,
      ),
    ).toBeNull()
  })

  test("keys drafts to the exact Store entry and conversation", () => {
    expect(
      storeConversationLocalDraftKey({
        conversationId: "conversation_1",
        publicToken: "entry_1",
      }),
    ).toBe("store-conversation-draft:v1:entry_1:conversation_1")
  })
})
