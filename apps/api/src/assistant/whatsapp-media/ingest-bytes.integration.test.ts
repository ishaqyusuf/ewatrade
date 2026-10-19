import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { whatsAppMediaContentSchema } from "@ewatrade/assistant/channels/media"
import { processSetupAttachment } from "@ewatrade/assistant/setup/attachment-processing"
import { SETUP_ATTACHMENT_PART } from "@ewatrade/assistant/setup/attachments"
import { DirectMetaWhatsAppProvider } from "@ewatrade/communications"
import { readAssistantAttachment } from "@ewatrade/db/assistant-attachments"
import {
  acceptAssistantWhatsAppIngress,
  acceptAssistantWhatsAppStatus,
  assistantWhatsAppAuthorityDigest,
  claimAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
  resolveAssistantWhatsAppConversation,
} from "@ewatrade/db/assistant-whatsapp"
import { prisma as processingDb } from "@ewatrade/db/client"
import { defaultAssistantAttachmentDeps } from "../../../../../packages/jobs/src/handlers/assistant-attachment-process"
import { processPlatformWhatsAppEvent } from "../../communications/whatsapp-platform-runtime"
import { handleWhatsAppWebhookRequest } from "../../communications/whatsapp-runtime"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "../attachment-storage"
import { createAssistantWhatsAppActionFixture } from "../channel-action-integration-fixture"
import { createLinkedAssistantContext } from "../channel-principal"
import {
  createDefaultWhatsAppMediaIngestDependencies,
  createWhatsAppMediaIngestor,
} from "./ingest"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-original-png")
const flags = [
  "ASSISTANT_WHATSAPP_MEDIA_ENABLED",
  "LOCAL_PRIVATE_OBJECTS_DIR",
] as const
const previous = new Map(flags.map((key) => [key, process.env[key]]))
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lK0AAAAASUVORK5CYII=",
    "base64",
  ),
)
const contentDigest = createHash("sha256").update(png).digest("hex")
const caption = "Keep this original receipt photo attached; do not analyse it."
const fixtureAppSecret = "synthetic-action-webhook-secret"
let privateRoot = ""

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  privateRoot = await mkdtemp(join(tmpdir(), "ewatrade-wa-original-png-"))
  process.env.LOCAL_PRIVATE_OBJECTS_DIR = privateRoot
  process.env.ASSISTANT_WHATSAPP_MEDIA_ENABLED = "true"
}, 90_000)

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      const rows = await fixture.db.assistantAttachment.findMany({
        where: { tenantId: fixture.tenantId, actorUserId: fixture.userId },
      })
      const storage = setupAttachmentStorage("QA")
      for (const row of rows) {
        expect(row.storageProvider).toBe("local_test")
        // Physical bytes first. A failure here deliberately retains database
        // attribution and the owned directory for safe recovery.
        await storage.remove({ target: setupAttachmentTarget(row) })
      }
      if (privateRoot) {
        const entries = await readdir(privateRoot, {
          recursive: true,
          withFileTypes: true,
        })
        expect(entries.filter((entry) => entry.isFile())).toHaveLength(0)
        await rm(privateRoot, { recursive: true })
      }
    }
    await fixture.cleanup()
  } finally {
    if (enabled) {
      if (fixture.db) await fixture.db.$disconnect()
      await processingDb.$disconnect()
    }
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
}, 90_000)

async function admittedImage() {
  const providerMessageId = `wamid.${fixture.marker}.${randomUUID()}`
  const mediaId = `original-png-${randomUUID()}`
  const principal = fixture.principal
  const body = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: principal.phoneNumberId },
              messages: [
                {
                  id: providerMessageId,
                  from: principal.senderId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "image",
                  image: {
                    id: mediaId,
                    mime_type: "image/png",
                    sha256: contentDigest,
                    caption,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  })
  const queued: string[] = []
  const response = await handleWhatsAppWebhookRequest(
    new Request("https://api.example.test/api/webhooks/whatsapp", {
      method: "POST",
      body,
      headers: {
        "x-hub-signature-256": `sha256=${createHmac("sha256", fixtureAppSecret).update(body).digest("hex")}`,
      },
    }),
    fixture.marker,
    {
      processPlatformEvent: (event) =>
        processPlatformWhatsAppEvent(event, {
          env: process.env,
          receipt: (event) => acceptAssistantWhatsAppStatus(fixture.db, event),
          accept: (input, permitted) =>
            acceptAssistantWhatsAppIngress(fixture.db, input, permitted),
          enqueue: async (id) => {
            queued.push(id)
          },
          claim: (input) => claimAssistantWhatsAppLink(fixture.db, input),
          disconnect: (input) => disconnectAssistantWhatsApp(fixture.db, input),
        }),
    },
  )
  expect(response.status).toBe(200)
  expect(queued).toHaveLength(1)
  const inboxId = queued[0]
  if (!inboxId) throw Error("Expected one identifier-only media admission")
  const inbox = await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
    where: { id: inboxId },
  })
  expect(inbox.kind).toBe("TURN")
  expect(whatsAppMediaContentSchema.parse(inbox.content)).toMatchObject({
    type: "media",
    text: caption,
    media: {
      id: mediaId,
      mediaType: "image/png",
      sourceType: "image",
      sha256: contentDigest,
    },
  })
  return { inbox, mediaId }
}

suite(
  "WhatsApp original PNG through actual attachment storage and processing",
  () => {
    test("stores exact fake-HTTP bytes, preserves the original caption and uses no vision or model", async () => {
      const { inbox, mediaId } = await admittedImage()
      const claimed = await fixture.claim(inbox.id)
      expect(
        (
          await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
            where: { id: inbox.id },
          })
        ).executionAuthorityDigest,
      ).toBeNull()
      const ctx = await createLinkedAssistantContext(
        fixture.db,
        fixture.principal,
        inbox.requestId,
        claimed.lease,
      )
      expect(ctx.session.session).toBeNull()
      const defaults = await createDefaultWhatsAppMediaIngestDependencies(ctx)
      if (!defaults) throw Error("Expected actual linked ingest dependencies")
      const queued: string[] = []
      const requests: string[] = []
      const fake = Object.assign(
        async (url: string | URL | Request, init?: RequestInit) => {
          const href = url instanceof Request ? url.url : String(url)
          requests.push(href)
          expect(new Headers(init?.headers).get("authorization")).toBe(
            "Bearer synthetic-media-download-only",
          )
          if (requests.length === 1) {
            expect(
              await fixture.db.assistantAttachment.count({
                where: { conversationId: fixture.conversationId },
              }),
            ).toBe(0)
            expect(new URL(href).hostname).toBe("graph.facebook.com")
            return Response.json({
              id: mediaId,
              file_size: png.byteLength,
              mime_type: "image/png",
              sha256: contentDigest,
              url: `https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=${mediaId}`,
            })
          }
          expect(requests).toHaveLength(2)
          expect(new URL(href).hostname).toBe("lookaside.fbsbx.com")
          return new Response(
            new Blob([Uint8Array.from(png)], { type: "image/png" }),
            {
              headers: {
                "content-type": "image/png",
                "content-length": String(png.byteLength),
              },
            },
          )
        },
        { preconnect: fetch.preconnect },
      )
      const provider = new DirectMetaWhatsAppProvider({ fetch: fake })
      // Only the external download and job-dispatch ports are replaced. Scope,
      // intent, pin, actual local storage and uploaded transition stay canonical.
      const ingest = createWhatsAppMediaIngestor({
        ...defaults,
        download: (request) =>
          provider.fetchMedia({
            ...request,
            accessToken: "synthetic-media-download-only",
            phoneNumberId: fixture.principal.phoneNumberId,
          }),
        enqueue: async (id) => {
          queued.push(id)
        },
      })
      const input = {
        providerMessageId: inbox.providerMessageId,
        content: inbox.content,
      }
      const first = await ingest(input)
      if (first.state !== "processing")
        throw Error(`Expected canonical processing, got ${first.state}`)
      expect(queued).toEqual([first.attachmentId])
      expect(requests).toHaveLength(2)
      const pinned = await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
        where: { id: inbox.id },
      })
      expect(pinned.content).toMatchObject({
        type: "media",
        attachmentId: first.attachmentId,
        media: { id: mediaId },
      })
      expect(pinned.state).toBe("PROCESSING")
      expect(pinned.executionAuthorityDigest).toBe(
        await assistantWhatsAppAuthorityDigest(
          fixture.db,
          await resolveAssistantWhatsAppConversation(
            fixture.db,
            fixture.principal,
          ),
        ),
      )
      const scope = {
        tenantId: fixture.tenantId,
        storeId: fixture.storeId,
        userId: fixture.userId,
      }
      const stored = await readAssistantAttachment(
        fixture.db,
        scope,
        first.attachmentId,
      )
      expect(stored).toMatchObject({
        status: "UPLOADED",
        kind: "IMAGE",
        contentType: "image/png",
        contentDigest,
        sizeBytes: png.byteLength,
        storageProvider: "local_test",
        storageStoreId: "store_localtest",
        messageId: null,
        transcript: null,
        extraction: null,
      })
      const original = await setupAttachmentStorage("QA").read({
        target: setupAttachmentTarget(stored),
      })
      expect(original).toEqual(png)
      expect(createHash("sha256").update(original).digest("hex")).toBe(
        contentDigest,
      )
      expect(JSON.stringify(stored)).not.toContain("lookaside.fbsbx.com")
      expect(JSON.stringify(stored)).not.toContain(
        "synthetic-media-download-only",
      )

      expect(
        await processSetupAttachment(
          first.attachmentId,
          defaultAssistantAttachmentDeps(),
        ),
      ).toEqual({ status: "ready", kind: "IMAGE" })
      const ready = await readAssistantAttachment(
        fixture.db,
        scope,
        first.attachmentId,
      )
      expect(ready).toMatchObject({
        status: "READY",
        processingAttempts: 1,
        transcript: null,
        extraction: {
          type: "text",
          text: "Photo attached; not analysed.",
          truncated: false,
        },
      })
      const replay = await ingest(input)
      expect(replay).toEqual({
        state: "ready",
        kind: "IMAGE",
        attachmentId: first.attachmentId,
        parts: [
          { type: "text", text: caption },
          {
            type: SETUP_ATTACHMENT_PART,
            data: { attachmentId: first.attachmentId },
          },
        ],
      })
      expect(requests).toHaveLength(2)
      expect(queued).toEqual([first.attachmentId])
      expect(
        await setupAttachmentStorage("QA").read({
          target: setupAttachmentTarget(ready),
        }),
      ).toEqual(png)
      expect(
        await fixture.db.assistantUsageEvent.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(0)
      expect(
        await fixture.db.assistantRun.count({
          where: { conversationId: fixture.conversationId },
        }),
      ).toBe(0)
      expect(
        await fixture.db.assistantTranscriptionAttempt.count({
          where: { attachmentId: first.attachmentId },
        }),
      ).toBe(0)

      expect(
        await disconnectAssistantWhatsApp(fixture.db, {
          phoneNumberId: fixture.principal.phoneNumberId,
          senderId: fixture.principal.senderId,
        }),
      ).toEqual({ disconnected: true })
      const cancelled = await fixture.db.assistantAttachment.findUniqueOrThrow({
        where: { id: first.attachmentId },
      })
      expect(cancelled).toMatchObject({
        status: "FAILED",
        errorCode: "WHATSAPP_SOURCE_CANCELLED",
        processingAttempts: ready.processingAttempts + 1,
        leaseUntil: null,
        transcript: null,
        extraction: null,
        messageId: null,
        storageProvider: ready.storageProvider,
        storageStoreId: ready.storageStoreId,
        storagePath: ready.storagePath,
        contentDigest: ready.contentDigest,
        contentType: ready.contentType,
        sizeBytes: ready.sizeBytes,
      })
      expect(cancelled.retentionUntil.getTime()).toBeLessThan(Date.now())
      // Withdrawal fences processing immediately but preserves original bytes
      // and attribution until the canonical bytes-first cleanup owns deletion.
      expect(
        await setupAttachmentStorage("QA").read({
          target: setupAttachmentTarget(cancelled),
        }),
      ).toEqual(png)
      expect(
        await processSetupAttachment(
          cancelled.id,
          defaultAssistantAttachmentDeps(),
        ),
      ).toEqual({ status: "skipped" })
      expect(
        await fixture.db.assistantUsageEvent.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(0)
      expect(
        await fixture.db.assistantRun.count({
          where: { conversationId: fixture.conversationId },
        }),
      ).toBe(0)
    }, 240_000)
  },
)
