import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { StoreConversationGuestCredentialPurpose } from "../../generated/prisma/enums"
import { appendStoreConversationPrescriptionMedia } from "./prescription-requests"
import {
  appendGuestStoreConversationAttachment,
  authorizeGuestStoreConversationVoiceNoteView,
  authorizeStoreConversationAttachmentView,
  listPendingStoreConversationMediaSafetyWork,
  preparePendingStoreConversationMediaSafetyWork,
  resolveCreatedStoreConversationCommerceInquiryAttachmentTarget,
  resolveGuestStoreConversationAttachmentUpload,
} from "./store-conversation-attachments"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

const entryActions: Array<"chat_on_whatsapp" | "request_online"> = [
  "request_online",
]
const entryRequestKinds: Array<"prescription" | "product_inquiry" | "service"> =
  ["product_inquiry", "prescription"]

const entry = {
  actions: entryActions,
  availability: {
    available: true,
    customerMessage: null,
    reason: null,
    recovery: [],
    reopensAt: null,
    state: "available" as const,
  },
  channelMode: {
    chat: { available: true, blockers: [] },
    composerEnabled: true,
    desiredMode: "ewatrade_chat" as const,
    effectiveMode: "ewatrade_chat" as const,
    historyReadable: true as const,
    revision: 0,
    whatsapp: {
      available: false,
      blockers: ["whatsapp_not_configured" as const],
    },
    whatsappAction: null,
  },
  entryPointId: "entry_1",
  entryPointRevision: 4,
  requestKinds: entryRequestKinds,
  storeId: "store_1",
  storeName: "Example Store",
  tenantId: "tenant_1",
  webVerticals: { pharmacy: true, service: true },
}

test("authorizes the guest before revealing unavailable attachment capability", async () => {
  let credentialReads = 0
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    storeConversationGuestCredential: {
      findFirst: async () => {
        credentialReads += 1
        return null
      },
    },
  }

  await expect(
    resolveGuestStoreConversationAttachmentUpload(
      dbClient(client),
      {
        channel: "web",
        conversationId: "conversation_1",
        credentialToken: "guest-token-that-is-at-least-32-characters",
        file: {
          attachmentCount: 1,
          byteSize: 128,
          kind: "image",
          mimeType: "image/jpeg",
          signatureMimeType: "image/jpeg",
        },
        privateMediaProviderReady: true,
        publicToken: "entry-token-that-is-at-least-32-characters",
        target: { kind: "new_commerce_inquiry" },
      },
      {
        resolveEntry: async () => ({
          ...entry,
          availability: {
            available: false,
            customerMessage: "The Store is outside its chat service hours.",
            reason: "outside_service_hours" as const,
            recovery: ["view_history" as const],
            reopensAt: new Date("2026-08-15T09:00:00.000Z"),
            state: "unavailable_until" as const,
          },
        }),
      },
    ),
  ).rejects.toMatchObject({ code: "GUEST_CREDENTIAL_EXPIRED" })
  expect(credentialReads).toBe(1)
})

test("resolves an exact current generic target without exposing guest or private-media references", async () => {
  const credentialReads: unknown[] = []
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    commerceInquiry: {
      findMany: async () => [
        {
          createdAt: new Date(),
          id: "inquiry_1",
          revision: 3,
          status: "RECEIVED",
        },
      ],
    },
    commerceInquiryLine: {
      findFirst: async () => ({
        createdAt: new Date("2026-08-13T00:00:00.000Z"),
        description: "Customer attachment",
        id: "line_1",
        inquiry: { status: "RECEIVED", updatedAt: new Date() },
        position: 1,
        requestedQuantity: null,
      }),
    },
    prescriptionRequest: { findMany: async () => [] },
    serviceCommercePolicyAuditEvent: { createMany: async () => ({ count: 1 }) },
    serviceCommercePolicyDecision: {
      findMany: async () => allowedServiceCommercePolicyDecisionRows(),
    },
    serviceCommerceSourceAttachment: { count: async () => 0 },
    serviceCommerceStoreProfile: {
      findFirst: async () => ({
        attachmentsEnabled: true,
        attachmentsProviderReady: true,
        staffEnabled: true,
        status: "ACTIVE",
        webEnabled: true,
        whatsappEnabled: false,
      }),
    },
    serviceRequest: { findMany: async () => [] },
    store: { findFirst: async () => ({ countryCode: "NG" }) },
    storeConversation: {
      findFirst: async () => ({
        guestIdentityId: "guest_1",
        id: "conversation_1",
        lifecycle: "ACTIVE",
        moderationState: "OPEN",
        store: { name: "Example Store" },
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      }),
    },
    storeConversationGuestCredential: {
      findFirst: async (query: unknown) => {
        credentialReads.push(query)
        return {
          expiresAt: new Date(Date.now() + 60_000),
          guestIdentity: { id: "guest_1", status: "ACTIVE" },
          guestIdentityId: "guest_1",
          id: "credential_1",
        }
      },
      update: async () => ({}),
    },
    storeConversationGuestIdentity: { update: async () => ({}) },
    storeConversationRequestLink: {
      findMany: async () => [
        {
          createdAt: new Date(),
          kind: "COMMERCE_INQUIRY",
          sourceId: "inquiry_1",
        },
      ],
    },
    whatsAppStoreBinding: { findFirst: async () => null },
  }

  const resolved = await resolveGuestStoreConversationAttachmentUpload(
    dbClient(client),
    {
      channel: "mobile",
      conversationId: "conversation_1",
      credentialToken: "c".repeat(32),
      file: {
        attachmentCount: 1,
        byteSize: 24,
        kind: "image",
        mimeType: "image/jpeg",
        signatureMimeType: "image/jpeg",
      },
      installationToken: "i".repeat(32),
      privateMediaProviderReady: true,
      publicToken: "p".repeat(32),
      purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
      target: {
        kind: "existing_request",
        request: {
          id: "inquiry_1",
          kind: "commerce_inquiry",
          revision: 3,
        },
      },
    },
    { resolveEntry: async () => entry },
  )

  expect(resolved).toMatchObject({
    actorUserId: "public_store_conversation",
    capability: {
      acceptedMimeTypes: expect.arrayContaining([
        "image/jpeg",
        "application/pdf",
      ]),
      limits: { maxBytes: 10_000_000, maxCount: 1 },
    },
    channel: "web",
    intakeContext: {
      entryPointId: "entry_1",
      entryPointRevision: 4,
      kind: "entry_point",
    },
    target: {
      kind: "generic",
      source: { id: "inquiry_1", kind: "commerce_inquiry" },
      sourceLineId: "line_1",
    },
  })
  await expect(
    resolveCreatedStoreConversationCommerceInquiryAttachmentTarget(
      dbClient(client),
      {
        actorUserId: "public_store_conversation",
        inquiryId: "inquiry_1",
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    ),
  ).resolves.toMatchObject({
    kind: "generic",
    source: { id: "inquiry_1", kind: "commerce_inquiry" },
    sourceLineId: "line_1",
  })
  expect(resolved).not.toHaveProperty("credential")
  expect(resolved).not.toHaveProperty("objectKey")
  expect(credentialReads[0]).toMatchObject({
    where: {
      deviceBindingDigest: expect.any(String),
      purpose: "MOBILE_DEVICE",
    },
  })
})

test("authorizes only the exact safe voice note for its guest participant", async () => {
  const auditWrites: unknown[] = []
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    serviceCommerceMediaAuditEvent: {
      create: async ({ data }: { data: unknown }) => {
        auditWrites.push(data)
        return { id: "audit_1" }
      },
    },
    storeConversation: {
      findFirst: async () => ({
        guestIdentityId: "guest_1",
        id: "conversation_1",
        store: { name: "Example Store" },
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      }),
    },
    storeConversationGuestCredential: {
      findFirst: async () => ({
        expiresAt: new Date(Date.now() + 60_000),
        guestIdentity: { id: "guest_1", status: "ACTIVE" },
        guestIdentityId: "guest_1",
        id: "credential_1",
      }),
      update: async () => ({}),
    },
    storeConversationGuestIdentity: { update: async () => ({}) },
    storeConversationMessageAttachment: {
      findFirst: async () => ({
        id: "message_attachment_1",
        message: {
          requestLinks: [{ kind: "COMMERCE_INQUIRY", sourceId: "inquiry_1" }],
        },
        sourceAttachment: {
          id: "source_attachment_1",
          lifecycle: "ACTIVE",
          mediaAsset: {
            id: "asset_1",
            kind: "AUDIO",
            lifecycle: "SAFE",
            objectKey: "private/voice-1.m4a",
          },
          mediaAssetId: "asset_1",
          sourceId: "inquiry_1",
          sourceKind: "COMMERCE_INQUIRY",
        },
      }),
    },
  }

  await expect(
    authorizeGuestStoreConversationVoiceNoteView(
      dbClient(client),
      {
        conversationId: "conversation_1",
        credentialToken: "c".repeat(32),
        expiresAt: new Date(Date.now() + 30_000),
        installationToken: "i".repeat(32),
        messageAttachmentId: "message_attachment_1",
        publicToken: "p".repeat(32),
        purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
      },
      { resolveEntry: async () => entry },
    ),
  ).resolves.toMatchObject({
    mediaAssetId: "asset_1",
    storageReference: "private/voice-1.m4a",
  })
  expect(auditWrites[0]).toMatchObject({
    actorUserId: "public_store_conversation",
    reason: "customer_voice_note_playback",
    type: "VIEW_AUTHORIZED",
  })
})

describe("conversation attachment commit", () => {
  test("links exactly one generic owner and replays only an identical payload", async () => {
    const writes: Array<{ name: string; data: Record<string, unknown> }> = []
    let receipt: Record<string, unknown> | null = null
    const message = {
      authorKind: "CUSTOMER",
      body: "Image attachment",
      channel: "WEB",
      id: "message_1",
      kind: "CUSTOMER_ATTACHMENT",
      occurredAt: new Date(),
      sequence: 8,
    }
    const client = {
      $queryRaw: async () => [{ id: "conversation_1" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      commerceInquiry: {
        findFirst: async () => ({ revision: 3, status: "RECEIVED" }),
      },
      serviceCommerceSourceAttachment: {
        findFirst: async () => ({
          id: "source_attachment_1",
          lifecycle: "ACTIVE",
          mediaAsset: { kind: "IMAGE", lifecycle: "SAFE" },
          sourceId: "inquiry_1",
          sourceKind: "COMMERCE_INQUIRY",
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        }),
      },
      storeConversation: {
        findFirst: async () => ({
          guestIdentityId: "guest_1",
          id: "conversation_1",
          lastMessageSequence: 7,
          lifecycle: "ACTIVE",
          moderationState: "OPEN",
          store: { name: "Example Store" },
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        }),
        updateMany: async () => ({ count: 1 }),
      },
      storeConversationAuditEvent: { create: async () => ({}) },
      storeConversationCommandReceipt: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          receipt = data
          return data
        },
        findFirst: async () =>
          receipt
            ? {
                ...receipt,
                message: {
                  ...message,
                  attachments: [
                    {
                      id: "message_attachment_1",
                      prescriptionMedia: null,
                      sourceAttachment: {
                        lifecycle: "ACTIVE",
                        mediaAsset: { kind: "IMAGE", lifecycle: "SAFE" },
                      },
                    },
                  ],
                  requestLinks: [
                    { kind: "COMMERCE_INQUIRY", sourceId: "inquiry_1" },
                  ],
                },
              }
            : null,
      },
      storeConversationGuestCredential: {
        findFirst: async () => ({
          expiresAt: new Date(Date.now() + 60_000),
          guestIdentity: { id: "guest_1", status: "ACTIVE" },
          guestIdentityId: "guest_1",
          id: "credential_1",
        }),
        update: async () => ({}),
      },
      storeConversationGuestIdentity: { update: async () => ({}) },
      storeConversationMessage: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push({ data, name: "message" })
          return { ...message, ...data }
        },
      },
      storeConversationMessageAttachment: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push({ data, name: "attachment" })
          return { id: "message_attachment_1", ...data }
        },
      },
      storeConversationRequestLink: {
        create: async ({ data }: { data: Record<string, unknown> }) => data,
      },
    }
    const input = {
      channel: "web" as const,
      clientOperationId: "attachment-command-1",
      conversationId: "conversation_1",
      credentialToken: "c".repeat(32),
      owner: {
        kind: "generic" as const,
        sourceAttachmentId: "source_attachment_1",
      },
      publicToken: "p".repeat(32),
      request: {
        id: "inquiry_1",
        kind: "commerce_inquiry" as const,
        revision: 3,
      },
    }

    const first = await appendGuestStoreConversationAttachment(
      dbClient(client),
      input,
      { resolveEntry: async () => entry },
    )
    const replay = await appendGuestStoreConversationAttachment(
      dbClient(client),
      input,
      { resolveEntry: async () => entry },
    )

    expect(first).toMatchObject({ replayed: false })
    expect(first.message.attachments).toEqual([
      {
        durationMs: null,
        id: "message_attachment_1",
        kind: "image",
        label: "Image attachment",
        recovery: null,
        state: "safe",
        viewable: true,
      },
    ])
    expect(replay).toMatchObject({ replayed: true })
    expect(writes.filter((write) => write.name === "attachment")).toHaveLength(
      1,
    )
    expect(writes[1]?.data).toMatchObject({
      prescriptionMediaId: null,
      sourceAttachmentId: "source_attachment_1",
    })
  })
})

test("staff viewing reauthorizes the exact conversation link and delegates clinical access", async () => {
  const calls: string[] = []
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    membership: {
      findFirst: async () => ({
        id: "membership_1",
        role: "STAFF",
        user: { displayName: "A", name: "A" },
      }),
    },
    store: { findFirst: async () => ({ id: entry.storeId }) },
    storeConversation: {
      findFirst: async () => ({ id: "conversation_1" }),
    },
    storeConversationSensitiveReadAuditEvent: {
      create: async () => ({ id: "sensitive_read_1" }),
    },
    storeConversationMessageAttachment: {
      findFirst: async () => ({
        id: "message_attachment_1",
        prescriptionMedia: {
          id: "prescription_media_1",
          mediaType: "application/pdf",
          requestId: "prescription_1",
          status: "SAFE",
        },
        sourceAttachment: null,
        message: {
          requestLinks: [
            { kind: "PRESCRIPTION_REQUEST", sourceId: "prescription_1" },
          ],
        },
      }),
    },
  }
  const result = await authorizeStoreConversationAttachmentView(
    dbClient(client),
    {
      actorUserId: "user_1",
      conversationId: "conversation_1",
      expiresAt: new Date(Date.now() + 30_000),
      messageAttachmentId: "message_attachment_1",
      reason: "customer_request_review",
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    },
    {
      recordPrescriptionAccess: async () => {
        calls.push("prescription-access")
        return {
          mediaId: "prescription_media_1",
          objectKey: "private/prescription",
        }
      },
    },
  )

  expect(calls).toEqual(["prescription-access"])
  expect(result).toEqual({
    expiresAt: expect.any(Date),
    kind: "prescription",
    mediaId: "prescription_media_1",
    storageReference: "private/prescription",
  })
})

test("generic staff viewing uses the current transaction client without nesting", async () => {
  const calls: unknown[] = []
  const transaction = {
    membership: {
      findFirst: async () => ({
        id: "membership_1",
        role: "STAFF",
        user: { displayName: "A", name: "A" },
      }),
    },
    store: { findFirst: async () => ({ id: entry.storeId }) },
    storeConversation: {
      findFirst: async () => ({ id: "conversation_1" }),
    },
    storeConversationSensitiveReadAuditEvent: {
      create: async () => ({ id: "sensitive_read_1" }),
    },
    storeConversationMessageAttachment: {
      findFirst: async () => ({
        id: "message_attachment_1",
        prescriptionMedia: null,
        sourceAttachment: {
          id: "source_attachment_1",
          lifecycle: "ACTIVE",
          mediaAsset: { lifecycle: "SAFE" },
          sourceId: "inquiry_1",
          sourceKind: "COMMERCE_INQUIRY",
        },
        message: {
          requestLinks: [{ kind: "COMMERCE_INQUIRY", sourceId: "inquiry_1" }],
        },
      }),
    },
  }
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(transaction),
  }
  await authorizeStoreConversationAttachmentView(
    dbClient(client),
    {
      actorUserId: "user_1",
      conversationId: "conversation_1",
      expiresAt: new Date(Date.now() + 30_000),
      messageAttachmentId: "message_attachment_1",
      reason: "customer_request_review",
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    },
    {
      getGenericView: async (tx, input) => {
        calls.push({ input, nestedTransaction: "$transaction" in tx })
        return {
          expiresAt: input.expiresAt,
          mediaAssetId: "asset_1",
          storageReference: "private/generic",
        }
      },
    },
  )
  expect(calls).toEqual([
    {
      input: expect.objectContaining({ attachmentId: "source_attachment_1" }),
      nestedTransaction: false,
    },
  ])
})

test("staff viewing denies a foreign Store or Tenant before any media delegate", async () => {
  const reads: unknown[] = []
  let delegateCalled = false
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    membership: {
      findFirst: async () => ({
        id: "membership_1",
        role: "STAFF",
        user: { displayName: "A", name: "A" },
      }),
    },
    store: { findFirst: async () => ({ id: "store_foreign" }) },
    storeConversation: {
      findFirst: async () => ({ id: "conversation_foreign" }),
    },
    storeConversationSensitiveReadAuditEvent: {
      create: async () => ({ id: "sensitive_read_1" }),
    },
    storeConversationMessageAttachment: {
      findFirst: async ({ where }: { where: unknown }) => {
        reads.push(where)
        return null
      },
    },
  }
  await expect(
    authorizeStoreConversationAttachmentView(
      dbClient(client),
      {
        actorUserId: "user_1",
        conversationId: "conversation_foreign",
        expiresAt: new Date(Date.now() + 30_000),
        messageAttachmentId: "attachment_foreign",
        reason: "customer_request_review",
        storeId: "store_foreign",
        tenantId: "tenant_foreign",
      },
      {
        getGenericView: async () => {
          delegateCalled = true
          throw new Error("must not delegate")
        },
        recordPrescriptionAccess: async () => {
          delegateCalled = true
          throw new Error("must not delegate")
        },
      },
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(reads).toEqual([
    {
      conversationId: "conversation_foreign",
      id: "attachment_foreign",
      storeId: "store_foreign",
      tenantId: "tenant_foreign",
    },
  ])
  expect(delegateCalled).toBe(false)
})

test("appends existing clinical media only through current Prescription authority", async () => {
  const created: Record<string, unknown>[] = []
  const transaction = {
    $queryRaw: async () => [{ id: "prescription_1" }],
    customerEntryPoint: { findFirst: async () => ({ id: "entry_1" }) },
    prescriptionMedia: {
      count: async () => 1,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return { id: "prescription_media_2", ...data }
      },
      findFirst: async () => null,
    },
    prescriptionStoreSettings: {
      findFirst: async () => ({ id: "settings_1", status: "ACTIVE" }),
    },
    prescriptionRequest: {
      findFirst: async () => ({
        currentMediaRevision: 2,
        id: "prescription_1",
        status: "MEDIA_REVIEW",
      }),
      updateMany: async () => ({ count: 1 }),
    },
    prescriptionRequestAuditEvent: { create: async () => ({}) },
    prescriptionTranscription: { updateMany: async () => ({ count: 0 }) },
    serviceCommercePolicyAuditEvent: {
      createMany: async () => ({ count: 1 }),
    },
    serviceCommercePolicyDecision: {
      findMany: async () => allowedServiceCommercePolicyDecisionRows(),
    },
    store: { findFirst: async () => ({ countryCode: "NG" }) },
  }
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(transaction),
  }
  const result = await appendStoreConversationPrescriptionMedia(
    dbClient(client),
    {
      actorUserId: "public_store_conversation",
      expectedMediaRevision: 2,
      intakeContext: {
        entryPointId: "entry_1",
        entryPointRevision: 4,
        kind: "entry_point",
      },
      media: {
        clientMediaId: "clinical-attachment-2",
        mediaType: "application/pdf",
        objectKey: "private/prescription-2",
        originalFileName: "prescription.pdf",
        pageNumber: 1,
        sha256: "a".repeat(64),
        sizeBytes: 24,
      },
      requestId: "prescription_1",
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    },
  )
  expect(result).toEqual({
    mediaId: "prescription_media_2",
    replayed: false,
    requestId: "prescription_1",
    revision: 3,
  })
  expect(created[0]).toMatchObject({
    pageNumber: 1,
    requestId: "prescription_1",
    revision: 3,
    accessEvents: { create: { action: "UPLOADED" } },
  })
})

test("pages only identifier-only conversation media safety recovery work", async () => {
  const client = {
    prescriptionMedia: {
      findMany: async () => [
        {
          createdAt: new Date("2026-08-13T10:01:00.000Z"),
          id: "clinical_media_1",
          requestId: "prescription_1",
          storeId: "store_1",
          tenantId: "tenant_1",
        },
      ],
    },
    serviceCommerceMediaAsset: {
      findMany: async () => [
        {
          createdAt: new Date("2026-08-13T10:00:00.000Z"),
          id: "asset_1",
          storeId: "store_1",
          tenantId: "tenant_1",
        },
        {
          createdAt: new Date("2026-08-13T10:02:00.000Z"),
          id: "asset_2",
          storeId: "store_2",
          tenantId: "tenant_2",
        },
      ],
    },
  }
  const page = await listPendingStoreConversationMediaSafetyWork(
    dbClient(client),
    { limit: 2 },
  )
  expect(page.items).toEqual([
    {
      kind: "generic",
      mediaAssetId: "asset_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    },
    {
      kind: "prescription",
      requestId: "prescription_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    },
  ])
  expect(page.nextCursor).toEqual(expect.any(String))
  expect(page.items[0]).not.toHaveProperty("objectKey")
  expect(page.items[1]).not.toHaveProperty("mediaId")
})

test("prepares stored and complete retryable generic media without widening scope", async () => {
  for (const lifecycle of ["STORED", "RETRYABLE"] as const) {
    const writes: Record<string, unknown>[] = []
    const asset = {
      contentDigest: "a".repeat(64),
      declaredMediaType: "image/jpeg",
      id: "asset_1",
      kind: "IMAGE",
      lifecycle,
      objectKey: "private/asset_1",
      originalFileName: "private.jpg",
      storeId: "store_1",
      tenantId: "tenant_1",
      verifiedMediaType: "image/jpeg",
      verifiedSizeBytes: 24,
    }
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      serviceCommerceMediaAsset: {
        findFirst: async () => asset,
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push(data)
          Object.assign(asset, data)
          return { count: 1 }
        },
      },
      serviceCommerceMediaAuditEvent: { create: async () => ({}) },
      storeConversationMessageAttachment: {
        findFirst: async () => ({ id: "conversation_attachment_1" }),
      },
    }
    const prepared = await preparePendingStoreConversationMediaSafetyWork(
      dbClient(client),
      {
        mediaAssetId: "asset_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    )
    expect(prepared).toEqual({
      kind: "generic",
      mediaAssetId: "asset_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
    expect(writes[0]).toMatchObject({
      lastFailureCode: null,
      lifecycle: "SAFETY_PENDING",
      nextRetryAt: null,
    })
  }
})

test("rejects malformed retryable or non-conversation media before requeue", async () => {
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    serviceCommerceMediaAsset: {
      findFirst: async () => ({
        contentDigest: null,
        declaredMediaType: "image/jpeg",
        id: "asset_1",
        kind: "IMAGE",
        lifecycle: "RETRYABLE",
        objectKey: null,
        originalFileName: "private.jpg",
        storeId: "store_1",
        tenantId: "tenant_1",
        verifiedMediaType: null,
        verifiedSizeBytes: null,
      }),
    },
    storeConversationMessageAttachment: { findFirst: async () => null },
  }
  await expect(
    preparePendingStoreConversationMediaSafetyWork(dbClient(client), {
      mediaAssetId: "asset_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
})

test("does not select or prepare a retryable safety failure before its due time", async () => {
  const dueAt = new Date("2026-08-13T11:00:00.000Z")
  const queryCalls: Record<string, unknown>[] = []
  const listClient = {
    prescriptionMedia: { findMany: async () => [] },
    serviceCommerceMediaAsset: {
      findMany: async (input: Record<string, unknown>) => {
        queryCalls.push(input)
        return []
      },
    },
  }
  await listPendingStoreConversationMediaSafetyWork(dbClient(listClient), {
    limit: 10,
    now: new Date("2026-08-13T10:00:00.000Z"),
  })
  expect(queryCalls[0]?.where).toMatchObject({
    OR: [
      { lifecycle: { in: ["STORED", "SAFETY_PENDING"] } },
      {
        lifecycle: "RETRYABLE",
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: new Date("2026-08-13T10:00:00.000Z") } },
        ],
      },
    ],
  })

  const transaction = {
    serviceCommerceMediaAsset: {
      findFirst: async () => ({
        contentDigest: "a".repeat(64),
        id: "asset_1",
        lifecycle: "RETRYABLE",
        nextRetryAt: dueAt,
        objectKey: "private/asset_1",
        storeId: "store_1",
        tenantId: "tenant_1",
        verifiedMediaType: "image/jpeg",
        verifiedSizeBytes: 24,
      }),
    },
    storeConversationMessageAttachment: {
      findFirst: async () => ({ id: "conversation_attachment_1" }),
    },
  }
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(transaction),
  }
  await expect(
    preparePendingStoreConversationMediaSafetyWork(dbClient(client), {
      mediaAssetId: "asset_1",
      now: new Date("2026-08-13T10:00:00.000Z"),
      storeId: "store_1",
      tenantId: "tenant_1",
    }),
  ).rejects.toMatchObject({ code: "NOT_READY" })
})
