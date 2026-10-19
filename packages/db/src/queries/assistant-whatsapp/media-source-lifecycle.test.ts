import { expect, test } from "bun:test"
import {
  assertAssistantWhatsAppMediaProcessingSourceActive,
  assistantWhatsAppMediaSourceReference,
  cancelAssistantWhatsAppPendingMediaInTransaction,
} from "./media-source-lifecycle"
import { expireAssistantWhatsAppInbox } from "./processing"
import { cancelAssistantWhatsAppQueuedWorkInTransaction } from "./queued-work"

const now = new Date("2026-10-15T17:00:00Z")
type Source = Parameters<typeof assistantWhatsAppMediaSourceReference>[0]
function source(): Source {
  return {
    id: "inbox",
    kind: "TURN",
    identityId: null,
    phoneNumberId: "123456789",
    providerMessageId: "original-event",
    state: "PENDING",
    expiresAt: new Date(now.getTime() + 60_000),
    executionAuthorityDigest: "a".repeat(64),
    content: {
      type: "media",
      media: {
        id: "provider-audio",
        mediaType: "audio/ogg",
        sourceType: "audio",
      },
    },
    binding: {
      id: "binding",
      grantId: "grant",
      identityGeneration: 2,
      grantGeneration: 3,
      selectionGeneration: 4,
      conversationId: "conversation",
      identity: {
        userId: "actor",
        phoneNumberId: "123456789",
        senderId: "2348000000000",
      },
      conversation: {
        id: "conversation",
        ownerUserId: "actor",
        tenantId: "tenant",
        storeId: "store",
      },
    },
  }
}
function pinned() {
  const row = source()
  const ref = assistantWhatsAppMediaSourceReference(row)
  if (!ref) throw Error("Expected exact synthetic source")
  row.content = { ...ref.media, attachmentId: ref.attachmentId }
  return { row, ref }
}

test("source reconstruction binds original endpoint/event/media and owner scope, never an arbitrary stored pointer", () => {
  const { row, ref } = pinned()
  expect(assistantWhatsAppMediaSourceReference(row)?.attachmentId).toBe(
    ref.attachmentId,
  )
  const voice = {
    type: "voice_review",
    source: row.content,
    review: {
      attachmentId: ref.attachmentId,
      contentDigest: "b".repeat(64),
      transcriptDigest: "c".repeat(64),
      processingGeneration: 1,
      authorityDigest: "d".repeat(64),
      expiresAt: new Date(now.getTime() + 30_000).toISOString(),
    },
  }
  expect(
    assistantWhatsAppMediaSourceReference({ ...row, content: voice })
      ?.attachmentId,
  ).toBe(ref.attachmentId)
  for (const changed of [
    { ...row, content: { ...ref.media, attachmentId: "different-file" } },
    {
      ...row,
      content: {
        ...voice,
        review: { ...voice.review, attachmentId: "different-file" },
      },
    },
    { ...row, providerMessageId: "different-event" },
    { ...row, phoneNumberId: "999999999" },
    { ...row, kind: "CONTROL" as const },
    { ...row, identityId: "another-identity" },
    { ...row, binding: null },
    { ...row, content: { type: "channel_notice", code: "MEDIA_FAILED" } },
  ])
    expect(assistantWhatsAppMediaSourceReference(changed)).toBeNull()
  const foreign = source()
  if (!foreign.binding) throw Error("Expected synthetic binding")
  foreign.binding.conversation.ownerUserId = "another-user"
  expect(assistantWhatsAppMediaSourceReference(foreign)).toBeNull()
})

test("source cancellation fences only the exact unsent attachment and retains bytes attribution", async () => {
  const { row, ref } = pinned()
  const updates: unknown[] = []
  const tx = {
    assistantWhatsAppInbox: { findMany: async () => [row] },
    assistantAttachment: {
      updateMany: async (input: unknown) => {
        updates.push(input)
        return { count: 1 }
      },
    },
  }
  expect(
    await cancelAssistantWhatsAppPendingMediaInTransaction(
      tx as never,
      [row.id],
      now,
    ),
  ).toEqual({ cancelled: 1 })
  expect(updates).toEqual([
    {
      where: {
        id: ref.attachmentId,
        clientRequestId: ref.clientRequestId,
        actorUserId: "actor",
        tenantId: "tenant",
        storeId: "store",
        conversationId: "conversation",
        messageId: null,
        status: { in: ["PENDING_UPLOAD", "UPLOADED", "PROCESSING", "READY"] },
      },
      data: {
        status: "FAILED",
        errorCode: "WHATSAPP_SOURCE_CANCELLED",
        processingAttempts: { increment: 1 },
        leaseUntil: null,
        transcript: null,
        extraction: expect.anything(),
        retentionUntil: new Date(now.getTime() - 1),
      },
    },
  ])
  expect(JSON.stringify(updates)).not.toMatch(
    /storageProvider|storageStoreId|storagePath|contentDigest|sizeBytes/,
  )
  updates.length = 0
  row.content = {
    type: "media",
    media: {
      id: "provider-audio",
      mediaType: "audio/ogg",
      sourceType: "audio",
    },
    attachmentId: "forged",
  }
  expect(
    await cancelAssistantWhatsAppPendingMediaInTransaction(
      tx as never,
      [row.id],
      now,
    ),
  ).toEqual({ cancelled: 0 })
  expect(updates).toEqual([])
})

test("revoke queue clearing and bounded inbox TTL both invalidate media before erasing original source", async () => {
  for (const reason of ["revoke", "expiry"] as const) {
    const { row } = pinned()
    const order: string[] = []
    const tx = {
      assistantWhatsAppBinding: { findMany: async () => [{ id: "binding" }] },
      assistantWhatsAppInbox: {
        findMany: async () => [row],
        update: async () => {
          order.push("erase")
          return row
        },
        updateMany: async () => {
          order.push("erase")
          return { count: 1 }
        },
      },
      assistantWhatsAppOutbox: { findMany: async () => [] },
      assistantWhatsAppActionReview: { updateMany: async () => ({ count: 0 }) },
      assistantWhatsAppWorkflowReview: {
        updateMany: async () => ({ count: 0 }),
      },
      assistantAttachment: {
        updateMany: async () => {
          order.push("fence-attachment")
          return { count: 1 }
        },
      },
    }
    if (reason === "revoke")
      await cancelAssistantWhatsAppQueuedWorkInTransaction(
        tx as never,
        "identity",
        null,
        now,
      )
    else
      await expireAssistantWhatsAppInbox(
        {
          $transaction: async (work: (value: typeof tx) => Promise<unknown>) =>
            work(tx),
        } as never,
        now,
        [row.id],
      )
    expect(order).toEqual(["fence-attachment", "erase"])
  }
})

test("ordinary app attachments need no channel authority, while unprovable legacy WhatsApp jobs refuse before dispatch", async () => {
  const { ref } = pinned()
  const attachment = {
    id: ref.attachmentId,
    clientRequestId: null,
    actorUserId: "actor",
    tenantId: "tenant",
    storeId: "store",
    conversationId: "conversation",
  }
  await expect(
    assertAssistantWhatsAppMediaProcessingSourceActive(
      {} as never,
      attachment,
      now,
    ),
  ).resolves.toBeUndefined()
  const flags = {
    ASSISTANT_WHATSAPP_ENABLED: "true",
    ASSISTANT_WHATSAPP_MEDIA_ENABLED: "true",
    ASSISTANT_WHATSAPP_PILOT_USER_IDS: "actor",
    ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: "tenant",
    WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789",
    WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-not-a-provider-token",
    ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "+2348000000000",
  }
  const previous = new Map(
    Object.keys(flags).map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, flags)
  try {
    let reads = 0
    const db = {
      assistantWhatsAppInbox: {
        findMany: async () => {
          reads++
          return []
        },
      },
    }
    await expect(
      assertAssistantWhatsAppMediaProcessingSourceActive(
        db as never,
        { ...attachment, clientRequestId: ref.clientRequestId },
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(reads).toBe(1)
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
})

test("missing provider token or invalid display stops WhatsApp source reads while ordinary app attachments remain unaffected", async () => {
  const { ref } = pinned()
  const attachment = {
    id: ref.attachmentId,
    clientRequestId: ref.clientRequestId,
    actorUserId: "actor",
    tenantId: "tenant",
    storeId: "store",
    conversationId: "conversation",
  }
  const flags = {
    ASSISTANT_WHATSAPP_ENABLED: "true",
    ASSISTANT_WHATSAPP_MEDIA_ENABLED: "true",
    ASSISTANT_WHATSAPP_PILOT_USER_IDS: "actor",
    ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: "tenant",
    WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789",
    WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-not-a-provider-token",
    ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "+2348000000000",
  }
  const previous = new Map(
    Object.keys(flags).map((key) => [key, process.env[key]]),
  )
  let reads = 0
  const db = {
    assistantWhatsAppInbox: {
      findMany: async () => {
        reads++
        return []
      },
    },
  }
  try {
    for (const [key, value] of [
      ["WHATSAPP_OTP_ACCESS_TOKEN", undefined],
      ["WHATSAPP_OTP_ACCESS_TOKEN", " "],
      ["ASSISTANT_WHATSAPP_DISPLAY_NUMBER", undefined],
      ["ASSISTANT_WHATSAPP_DISPLAY_NUMBER", "012345678"],
      ["ASSISTANT_WHATSAPP_DISPLAY_NUMBER", "+123"],
    ] as const) {
      Object.assign(process.env, flags)
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
      await expect(
        assertAssistantWhatsAppMediaProcessingSourceActive(
          db as never,
          attachment,
          now,
        ),
      ).rejects.toMatchObject({ code: "UNAVAILABLE" })
      await expect(
        assertAssistantWhatsAppMediaProcessingSourceActive(
          db as never,
          { ...attachment, clientRequestId: null },
          now,
        ),
      ).resolves.toBeUndefined()
    }
    expect(reads).toBe(0)
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
})

test("a pinned pending source still rereads exact original grant generations and refuses revocation or erased metadata", async () => {
  const { row, ref } = pinned()
  const attachment = {
    id: ref.attachmentId,
    clientRequestId: ref.clientRequestId,
    actorUserId: "actor",
    tenantId: "tenant",
    storeId: "store",
    conversationId: "conversation",
  }
  const flags = {
    ASSISTANT_WHATSAPP_ENABLED: "true",
    ASSISTANT_WHATSAPP_MEDIA_ENABLED: "true",
    ASSISTANT_WHATSAPP_PILOT_USER_IDS: "actor",
    ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: "tenant",
    WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789",
    WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-not-a-provider-token",
    ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "+2348000000000",
  }
  const previous = new Map(
    Object.keys(flags).map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, flags)
  try {
    const grantReads: unknown[] = []
    const db = {
      assistantWhatsAppInbox: { findMany: async () => [row] },
      assistantWhatsAppGrant: {
        findFirst: async (input: unknown) => {
          grantReads.push(input)
          return null
        },
      },
    }
    await expect(
      assertAssistantWhatsAppMediaProcessingSourceActive(
        db as never,
        attachment,
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(grantReads).toEqual([
      expect.objectContaining({
        where: expect.objectContaining({
          id: "grant",
          generation: 3,
          revokedAt: null,
          identity: expect.objectContaining({ generation: 2, revokedAt: null }),
        }),
      }),
    ])
    grantReads.length = 0
    row.content = null
    await expect(
      assertAssistantWhatsAppMediaProcessingSourceActive(
        db as never,
        attachment,
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(grantReads).toEqual([])
    process.env.ASSISTANT_WHATSAPP_MEDIA_ENABLED = "false"
    await expect(
      assertAssistantWhatsAppMediaProcessingSourceActive(
        db as never,
        attachment,
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" })
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
})
