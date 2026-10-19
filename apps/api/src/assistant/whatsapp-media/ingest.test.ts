import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { DirectMetaWhatsAppProvider } from "@ewatrade/communications"
import type { AssistantAttachmentRecord } from "@ewatrade/db/assistant-attachments"
import { assistantAttachmentRequestId } from "@ewatrade/db/assistant-attachments"
import {
  type WhatsAppMediaIngestDependencies,
  createWhatsAppMediaIngestor,
  whatsAppAttachmentKindAllowedForPurpose,
} from "./ingest"

const now = new Date("2026-10-15T12:00:00Z")
const scope = {
  tenantId: "tenant",
  storeId: "store",
  userId: "user",
  dataClassification: "LIVE" as const,
}
const original = new TextEncoder().encode("Original customer supplied facts")
const contentDigest = createHash("sha256").update(original).digest("hex")
const source = {
  type: "media",
  media: {
    id: "12345",
    mediaType: "text/plain",
    sourceType: "document",
    fileName: "facts.txt",
  },
  text: "Keep these original facts",
}

function harness() {
  let row: AssistantAttachmentRecord | null = null
  const events: string[] = []
  let calls = 0
  const fake = Object.assign(
    async (_url: string | URL | Request, _init?: RequestInit) => {
      calls++
      return calls % 2 === 1
        ? Response.json({
            id: "12345",
            file_size: original.length,
            mime_type: "text/plain",
            sha256: contentDigest,
            url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=12345",
          })
        : new Response(original, { headers: { "content-type": "text/plain" } })
    },
    { preconnect: fetch.preconnect },
  )
  const provider = new DirectMetaWhatsAppProvider({ fetch: fake })
  const deps: WhatsAppMediaIngestDependencies = {
    enabled: () => true,
    allows: async () => true,
    now: () => now,
    authorize: async () => {
      events.push("authorize")
      return { scope, conversationId: "chat", phoneNumberId: "123456789" }
    },
    read: async (id) => (row?.id === id ? row : null),
    createIntent: async (input) => {
      events.push("intent")
      row = {
        id: assistantAttachmentRequestId(
          scope,
          input.conversationId,
          input.clientRequestId,
        ),
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        actorUserId: scope.userId,
        conversationId: input.conversationId,
        kind: input.kind,
        status: "PENDING_UPLOAD",
        messageId: null,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        contentDigest: input.contentDigest,
        durationMs: null,
        storageProvider: null,
        storageStoreId: null,
        storagePath: null,
        transcript: null,
        extraction: null,
        errorCode: null,
        processingAttempts: 0,
        uploadExpiresAt: new Date(now.getTime() + 60_000),
        retentionUntil: new Date(now.getTime() + 86_400_000),
        processedAt: null,
        createdAt: now,
      }
      return row
    },
    download: async (input) => {
      events.push("download")
      return provider.fetchMedia({
        ...input,
        accessToken: "test-only",
        phoneNumberId: "123456789",
      })
    },
    audioDuration: async () => 1000,
    voiceAvailable: async () => true,
    storage: () => ({
      provider: "local_test",
      storeId: "test-store",
      assertAvailable: () => undefined,
      stage: async () => {
        events.push("stage")
        return { storagePath: "private/path" }
      },
      read: async () => original,
      remove: async () => {
        events.push("remove")
      },
    }),
    pin: async () => {
      events.push("pin")
      return true
    },
    uploaded: async () => {
      events.push("uploaded")
      if (row) row.status = "UPLOADED"
      return true
    },
    enqueue: async () => {
      events.push("enqueue")
    },
  }
  return {
    deps,
    events,
    calls: () => calls,
    row: () => row,
    replace: (value: AssistantAttachmentRecord) => {
      row = value
    },
  }
}

test("fake HTTP flows into canonical intent, pinned private storage and ID-only processing; original replay reuses it", async () => {
  const h = harness()
  const ingest = createWhatsAppMediaIngestor(h.deps)
  const first = await ingest({
    providerMessageId: "provider-event",
    content: source,
  })
  expect(first.state).toBe("processing")
  expect(h.events).toEqual([
    "authorize",
    "download",
    "authorize",
    "intent",
    "pin",
    "stage",
    "authorize",
    "uploaded",
    "enqueue",
  ])
  const saved = h.row()
  if (!saved) throw Error("Expected a canonical attachment")
  h.replace({
    ...saved,
    status: "READY",
    extraction: {
      type: "text",
      text: "Original customer supplied facts",
      truncated: false,
    },
    processingAttempts: 1,
  })
  const replay = await ingest({
    providerMessageId: "provider-event",
    content: source,
  })
  expect(replay).toEqual({
    state: "ready",
    attachmentId: saved.id,
    kind: "TEXT",
    parts: [
      { type: "text", text: source.text },
      { type: "data-setup-attachment", data: { attachmentId: saved.id } },
    ],
  })
  expect(h.calls()).toBe(2)
  expect(JSON.stringify(replay)).not.toContain("lookaside")
})

test("media gate, unsupported files and unavailable voice stop before HTTP or private writes", async () => {
  const h = harness()
  const ingest = createWhatsAppMediaIngestor(h.deps)
  h.deps.enabled = () => false
  expect(
    (await ingest({ providerMessageId: "event", content: source })).state,
  ).toBe("refused")
  h.deps.enabled = () => true
  expect(
    (
      await ingest({
        providerMessageId: "event",
        content: {
          type: "media",
          media: {
            id: "12345",
            mediaType: "application/zip",
            sourceType: "document",
          },
        },
      })
    ).state,
  ).toBe("refused")
  h.deps.voiceAvailable = async () => false
  expect(
    (
      await ingest({
        providerMessageId: "voice",
        content: {
          type: "media",
          media: { id: "12345", mediaType: "audio/ogg", sourceType: "audio" },
        },
      })
    ).state,
  ).toBe("refused")
  expect(h.calls()).toBe(0)
  expect(h.events).not.toContain("intent")
})

test("scope loss after storage stage prevents uploaded state and removes the private object", async () => {
  const h = harness()
  const authorize = h.deps.authorize
  let checks = 0
  h.deps.authorize = async () => {
    if (++checks === 3) throw Error("scope changed")
    return authorize()
  }
  await expect(
    createWhatsAppMediaIngestor(h.deps)({
      providerMessageId: "event",
      content: source,
    }),
  ).rejects.toThrow("scope changed")
  expect(h.events).toContain("remove")
  expect(h.events).not.toContain("uploaded")
  expect(h.events).not.toContain("enqueue")
})

test("READY audio returns only an explicit voice review request and never executable message parts", async () => {
  const h = harness()
  const ingest = createWhatsAppMediaIngestor(h.deps)
  await ingest({ providerMessageId: "event", content: source })
  const row = h.row()
  if (!row) throw Error("Expected attachment")
  const audioSource = {
    type: "media",
    media: { ...source.media, mediaType: "audio/ogg", sourceType: "audio" },
  }
  h.replace({
    ...row,
    contentType: "audio/ogg",
    kind: "AUDIO",
    status: "READY",
    transcript: "Record this after I review it",
    processingAttempts: 1,
  })
  const result = await ingest({
    providerMessageId: "event",
    content: audioSource,
  })
  expect(result).toMatchObject({
    state: "voice_review",
    attachmentId: row.id,
    processingGeneration: 1,
    transcript: "Record this after I review it",
  })
  expect(result).not.toHaveProperty("parts")
  h.replace({
    ...row,
    contentType: "audio/ogg",
    kind: "AUDIO",
    status: "READY",
    transcript: "x".repeat(2001),
    processingAttempts: 1,
  })
  expect(
    await ingest({ providerMessageId: "event", content: audioSource }),
  ).toMatchObject({ state: "refused", code: "TRANSCRIPT_REQUIRES_APP" })
})

test("deferred Setup image reading refuses before bytes or persistence while original photos and deterministic files keep their purpose", async () => {
  const h = harness()
  h.deps.allows = async (policy) =>
    whatsAppAttachmentKindAllowedForPurpose(policy.kind, "SETUP")
  const result = await createWhatsAppMediaIngestor(h.deps)({
    providerMessageId: "deferred-setup-image",
    content: {
      type: "media",
      media: {
        id: "image-original",
        mediaType: "image/png",
        sourceType: "image",
      },
    },
  })
  expect(result).toMatchObject({
    state: "refused",
    code: "MEDIA_NOT_AVAILABLE",
  })
  expect(h.events).toEqual(["authorize"])
  expect(h.calls()).toBe(0)
  expect(h.row()).toBeNull()
  expect(whatsAppAttachmentKindAllowedForPurpose("IMAGE", "GENERAL")).toBe(true)
  expect(
    whatsAppAttachmentKindAllowedForPurpose("IMAGE", "PRODUCT_CREATE"),
  ).toBe(false)
  for (const kind of ["PDF", "SPREADSHEET", "TEXT"] as const)
    expect(whatsAppAttachmentKindAllowedForPurpose(kind, "SETUP")).toBe(true)
  expect(
    whatsAppAttachmentKindAllowedForPurpose("SPREADSHEET", "GENERAL"),
  ).toBe(false)
  for (const purpose of ["GENERAL", "SETUP", "PRODUCT_CREATE"] as const)
    expect(whatsAppAttachmentKindAllowedForPurpose("AUDIO", purpose)).toBe(true)
})
