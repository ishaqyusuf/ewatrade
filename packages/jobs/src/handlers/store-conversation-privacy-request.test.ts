import { describe, expect, test } from "bun:test"

import { runStoreConversationPrivacyRequest } from "./store-conversation-privacy-request"

describe("Store Conversation privacy request job", () => {
  test("accepts only a request id and processes bounded media identifiers", async () => {
    const calls: unknown[] = []
    const result = await runStoreConversationPrivacyRequest(
      { privacyRequestId: "privacy_1" },
      {
        claim: async () => ({
          claimToken: "claim_1",
          classifications: ["generic_media", "presentation_message"],
          conversationId: "conversation_1",
          genericMediaAssetIds: ["media_1", "media_2"],
          privacyRequestId: "privacy_1",
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
        complete: async (input) => {
          calls.push(["complete", input])
          return { status: "completed" }
        },
        deleteGenericMedia: async (input) => {
          calls.push(["delete", input])
        },
      },
    )

    expect(result).toEqual({ status: "completed" })
    expect(calls).toEqual([
      [
        "delete",
        { mediaAssetId: "media_1", storeId: "store_1", tenantId: "tenant_1" },
      ],
      [
        "delete",
        { mediaAssetId: "media_2", storeId: "store_1", tenantId: "tenant_1" },
      ],
      [
        "complete",
        {
          claimToken: "claim_1",
          deletedGenericMediaAssetIds: ["media_1", "media_2"],
          privacyRequestId: "privacy_1",
        },
      ],
    ])
    expect(JSON.stringify({ privacyRequestId: "privacy_1" })).not.toMatch(
      /content|contact|token|objectKey|provider|clinical/,
    )
  })

  test("is a no-op when another worker owns the privacy claim", async () => {
    expect(
      await runStoreConversationPrivacyRequest(
        { privacyRequestId: "privacy_1" },
        {
          claim: async () => null,
          complete: async () => {
            throw new Error("not used")
          },
          deleteGenericMedia: async () => {
            throw new Error("not used")
          },
        },
      ),
    ).toBeNull()
  })
})
