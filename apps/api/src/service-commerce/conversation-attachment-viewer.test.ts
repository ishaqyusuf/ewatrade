import { describe, expect, test } from "bun:test"

import {
  StoreConversationAttachmentViewerUnavailableError,
  issueGuestStoreConversationVoiceNoteGrant,
  issueStoreConversationAttachmentViewerGrant,
} from "./conversation-attachment-viewer"

const input = {
  actorUserId: "attendant-1",
  conversationId: "conversation-1",
  messageAttachmentId: "message-attachment-1",
  reason: "customer request review",
  storeId: "store-1",
  tenantId: "tenant-1",
}

describe("Store Conversation attachment staff viewer", () => {
  test("maps exact generic authorization to a one-time generic grant", async () => {
    const calls: unknown[] = []
    const expiresAt = new Date("2031-01-01T00:00:30.000Z")
    const result = await issueStoreConversationAttachmentViewerGrant(
      {} as never,
      input,
      {
        authorize: async (_db, command) => {
          calls.push(["authorize", command])
          return {
            expiresAt,
            kind: "generic",
            mediaAssetId: "media-1",
            storageReference: "private:media-1",
          }
        },
        grantGeneric: async (command) => {
          calls.push(["generic", command])
          return { expiresAt, url: "/api/service-commerce/media/grant-1" }
        },
        grantPrescription: async () => {
          throw new Error("not used")
        },
      },
    )

    expect(result).toEqual({
      expiresAt,
      url: "/api/service-commerce/media/grant-1",
    })
    expect(calls[0]).toEqual([
      "authorize",
      expect.objectContaining({
        actorUserId: "attendant-1",
        conversationId: "conversation-1",
        messageAttachmentId: "message-attachment-1",
        reason: "customer request review",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ])
    expect(calls[1]).toEqual([
      "generic",
      {
        expiresAt,
        mediaAssetId: "media-1",
        storageReference: "private:media-1",
      },
    ])
  })

  test("maps exact clinical authorization only to the clinical delivery provider", async () => {
    const calls: unknown[] = []
    const expiresAt = new Date("2031-01-01T00:00:30.000Z")
    const result = await issueStoreConversationAttachmentViewerGrant(
      {} as never,
      input,
      {
        authorize: async () => ({
          expiresAt,
          kind: "prescription",
          mediaId: "prescription-media-1",
          storageReference: "prescriptions/store-1/object-1",
        }),
        grantGeneric: async () => {
          throw new Error("not used")
        },
        grantPrescription: async (command) => {
          calls.push(command)
          return { expiresAt, url: "/api/prescriptions/media/grant-1" }
        },
      },
    )

    expect(result.url).toBe("/api/prescriptions/media/grant-1")
    expect(calls).toEqual([
      {
        expiresInSeconds: 60,
        objectKey: "prescriptions/store-1/object-1",
      },
    ])
  })

  test("redacts provider failures from the protected API boundary", async () => {
    await expect(
      issueStoreConversationAttachmentViewerGrant({} as never, input, {
        authorize: async () => ({
          expiresAt: new Date(Date.now() + 30_000),
          kind: "generic",
          mediaAssetId: "media-1",
          storageReference: "s3://private-bucket/customer-object",
        }),
        grantGeneric: async () => {
          throw new Error("s3://private-bucket/customer-object")
        },
        grantPrescription: async () => {
          throw new Error("not used")
        },
      }),
    ).rejects.toBeInstanceOf(StoreConversationAttachmentViewerUnavailableError)
  })
})

describe("Store Conversation customer voice viewer", () => {
  test("binds a short generic grant to the exact mobile participant", async () => {
    const calls: unknown[] = []
    const expiresAt = new Date(Date.now() + 30_000)
    const result = await issueGuestStoreConversationVoiceNoteGrant(
      {} as never,
      {
        channel: "mobile",
        conversationId: "conversation-1",
        credentialToken: "c".repeat(32),
        installationToken: "i".repeat(32),
        messageAttachmentId: "message-attachment-1",
        publicToken: "p".repeat(32),
      },
      {
        authorize: async (_db, command) => {
          calls.push(command)
          return {
            expiresAt,
            mediaAssetId: "media-1",
            storageReference: "private:voice-1",
          }
        },
        grantGeneric: async (command) => {
          calls.push(command)
          return { expiresAt, url: "/api/service-commerce/media/grant-voice" }
        },
      },
    )

    expect(result.url).toBe("/api/service-commerce/media/grant-voice")
    expect(calls[0]).toMatchObject({
      conversationId: "conversation-1",
      installationToken: "i".repeat(32),
      messageAttachmentId: "message-attachment-1",
      purpose: "MOBILE_DEVICE",
    })
    expect(calls[1]).toEqual({
      expiresAt,
      mediaAssetId: "media-1",
      storageReference: "private:voice-1",
    })
  })
})
