import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { whatsAppVoiceReviewContentSchema } from "@ewatrade/assistant/channels/media"
import { processSetupAttachment } from "@ewatrade/assistant/setup/attachment-processing"
import { SETUP_REHEARSAL_TRANSCRIPT } from "@ewatrade/assistant/setup/vision"
import { DirectMetaWhatsAppProvider } from "@ewatrade/communications"
import { assistantBudgetScopeKey } from "@ewatrade/db/assistant"
import {
  acceptAssistantWhatsAppIngress,
  acceptAssistantWhatsAppStatus,
  assistantWhatsAppMediaClientRequestId,
  claimAssistantWhatsAppInbox,
  claimAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
  nextAssistantWhatsAppInbox,
  recoverAssistantWhatsAppInboxRun,
  retryAssistantWhatsAppInbox,
  settleAssistantWhatsAppInbox,
  settleAssistantWhatsAppNotice,
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
import { prepareAssistantWhatsAppMediaTurn } from "../channel-media-turn"
import { createLinkedAssistantContext } from "../channel-principal"
import {
  type ChannelTurnDependencies,
  processAssistantChannelTurn,
} from "../channel-turn"
import { generalBudgetScopeKey } from "../general-allowance"
import {
  createDefaultWhatsAppMediaIngestDependencies,
  createWhatsAppMediaIngestor,
} from "./ingest"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-measured-wav")
const flags = [
  "ASSISTANT_WHATSAPP_MEDIA_ENABLED",
  "LOCAL_PRIVATE_OBJECTS_DIR",
  "ASSISTANT_OPENAI_API_KEY",
] as const
const previous = new Map(flags.map((key) => [key, process.env[key]]))
const setupKey = assistantBudgetScopeKey(fixture.tenantId, "SETUP")
const generalKey = generalBudgetScopeKey({ tenantId: fixture.tenantId })
let privateRoot = ""
let attachmentId = ""
let providerMessageId = ""
let mediaId = ""

/** 1.2 seconds of mono PCM silence, measured from the actual RIFF header and bytes. */
function wav() {
  const sampleRate = 8000
  const dataLength = sampleRate * 1.2 * 2
  const bytes = new Uint8Array(44 + dataLength)
  const view = new DataView(bytes.buffer)
  const label = (at: number, text: string) =>
    bytes.set(new TextEncoder().encode(text), at)
  label(0, "RIFF")
  view.setUint32(4, bytes.length - 8, true)
  label(8, "WAVE")
  label(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  label(36, "data")
  view.setUint32(40, dataLength, true)
  return bytes
}
const audio = wav()
const digest = createHash("sha256").update(audio).digest("hex")

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  privateRoot = await mkdtemp(join(tmpdir(), "ewatrade-wa-measured-wav-"))
  process.env.LOCAL_PRIVATE_OBJECTS_DIR = privateRoot
  process.env.ASSISTANT_WHATSAPP_MEDIA_ENABLED = "true"
  // Configured availability only. The actual job must select its canonical QA
  // rehearsal adapter; this value must never reach a speech provider.
  process.env.ASSISTANT_OPENAI_API_KEY = "synthetic-never-dispatched-wav-key"
}, 90_000)

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      const { db, tenantId, storeId, userId } = fixture
      try {
        const tenant = await db.tenant.findUniqueOrThrow({
          where: { id: tenantId },
        })
        expect(tenant).toMatchObject({
          slug: tenantId,
          dataClassification: "QA",
          qaSourceDomain: "assistant-action-confirmation.test",
        })
        const rows = await db.assistantAttachment.findMany({
          where: { tenantId },
        })
        expect(rows.length).toBeLessThanOrEqual(1)
        for (const row of rows) {
          expect(row).toMatchObject({
            id: attachmentId,
            actorUserId: userId,
            storeId,
            conversationId: fixture.conversationId,
            kind: "AUDIO",
            contentType: "audio/wav",
            contentDigest: digest,
            sizeBytes: audio.byteLength,
            durationMs: 1200,
            storageProvider: "local_test",
            messageId: null,
            clientRequestId: assistantWhatsAppMediaClientRequestId(
              fixture.principal.phoneNumberId,
              providerMessageId,
              mediaId,
            ),
          })
        }
        const counts = await Promise.all([
          db.assistantRun.count({ where: { conversation: { tenantId } } }),
          db.assistantActionProposal.count({ where: { tenantId } }),
          db.customer.count({ where: { tenantId } }),
          db.catalogItem.count({ where: { tenantId } }),
          db.commercialOrder.count({ where: { tenantId } }),
          db.financeBook.count({ where: { tenantId } }),
          db.stockOperation.count({ where: { tenantId } }),
          db.serviceJob.count({ where: { tenantId } }),
        ])
        for (const count of counts) expect(count).toBe(0)
        for (const usage of await db.assistantUsageEvent.findMany({
          where: { tenantId },
        }))
          expect(usage).toMatchObject({
            attachmentId,
            actorUserId: userId,
            provider: "ewatrade-rehearsal",
            model: "rehearsal-transcribe-v1",
            requestClass: "transcribe",
          })
        expect(
          await db.assistantBudget.findUnique({
            where: { scopeKey: generalKey },
          }),
        ).toBeNull()
        const budget = await db.assistantBudget.findUnique({
          where: { scopeKey: setupKey },
        })
        if (budget)
          expect(budget).toMatchObject({
            requests: 0,
            tokens: 0,
            audioSeconds: 2,
            visionImages: 0,
          })
        // Original private bytes first; failures retain database ownership and the directory.
        for (const row of rows)
          await setupAttachmentStorage("QA").remove({
            target: setupAttachmentTarget(row),
          })
        if (privateRoot) {
          const entries = await readdir(privateRoot, {
            recursive: true,
            withFileTypes: true,
          })
          expect(entries.filter((entry) => entry.isFile())).toHaveLength(0)
          await rm(privateRoot, { recursive: true })
        }
        await db.assistantBudget.deleteMany({ where: { scopeKey: setupKey } })
      } catch (error) {
        throw new Error(
          `Measured audio cleanup unverified; retained fixture ${tenantId} and private root ${privateRoot}`,
          { cause: error },
        )
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

async function admittedAudio() {
  providerMessageId = `wamid.${fixture.marker}.${randomUUID()}`
  mediaId = `measured-wav-${randomUUID()}`
  const body = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: fixture.principal.phoneNumberId },
              messages: [
                {
                  id: providerMessageId,
                  from: fixture.principal.senderId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "audio",
                  audio: {
                    id: mediaId,
                    mime_type: "audio/wav",
                    sha256: digest,
                    voice: true,
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
        "x-hub-signature-256": `sha256=${createHmac("sha256", "synthetic-action-webhook-secret").update(body).digest("hex")}`,
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
  const id = queued[0]
  if (!id) throw Error("Expected one actual signed audio admission")
  return fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({ where: { id } })
}

suite("measured WhatsApp WAV through default canonical QA processing", () => {
  test("charges measured audio once, saves known rehearsal usage and requires quoted transcript review before any assistant request", async () => {
    const { db, tenantId, userId, storeId } = fixture
    const inbox = await admittedAudio()
    const claimed = await fixture.claim(inbox.id)
    const ctx = await createLinkedAssistantContext(
      db,
      fixture.principal,
      inbox.requestId,
      claimed.lease,
    )
    expect(ctx.session.session).toBeNull()
    const defaults = await createDefaultWhatsAppMediaIngestDependencies(ctx)
    if (!defaults) throw Error("Expected actual linked media dependencies")
    const downloads: string[] = []
    const fake = Object.assign(
      async (url: string | URL | Request, init?: RequestInit) => {
        const href = url instanceof Request ? url.url : String(url)
        downloads.push(href)
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer synthetic-audio-download-only",
        )
        if (downloads.length === 1) {
          expect(new URL(href).hostname).toBe("graph.facebook.com")
          return Response.json({
            id: mediaId,
            file_size: audio.byteLength,
            mime_type: "audio/wav",
            sha256: digest,
            url: `https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=${mediaId}`,
          })
        }
        expect(downloads).toHaveLength(2)
        expect(new URL(href).hostname).toBe("lookaside.fbsbx.com")
        return new Response(
          new Blob([Uint8Array.from(audio)], { type: "audio/wav" }),
          {
            headers: {
              "content-type": "audio/wav",
              "content-length": String(audio.byteLength),
            },
          },
        )
      },
      { preconnect: fetch.preconnect },
    )
    const provider = new DirectMetaWhatsAppProvider({ fetch: fake })
    const queued: string[] = []
    const ingest = createWhatsAppMediaIngestor({
      ...defaults,
      download: (request) =>
        provider.fetchMedia({
          ...request,
          accessToken: "synthetic-audio-download-only",
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
      throw Error(`Expected measured audio upload, got ${first.state}`)
    attachmentId = first.attachmentId
    expect(queued).toEqual([attachmentId])
    const uploaded = await db.assistantAttachment.findUniqueOrThrow({
      where: { id: attachmentId },
    })
    expect(uploaded).toMatchObject({
      kind: "AUDIO",
      status: "UPLOADED",
      durationMs: 1200,
      sizeBytes: audio.byteLength,
      contentDigest: digest,
      audioBudgetReserved: false,
      messageId: null,
      storageProvider: "local_test",
    })
    expect(
      await setupAttachmentStorage("QA").read({
        target: setupAttachmentTarget(uploaded),
      }),
    ).toEqual(audio)
    expect(
      await db.assistantBudget.findUnique({ where: { scopeKey: setupKey } }),
    ).toBeNull()
    let externalFetchCalls = 0
    const refuseExternalFetch = () => {
      externalFetchCalls += 1
      throw Error("Unexpected external fetch in the QA audio proof")
    }
    const fetchTrap = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(async () => refuseExternalFetch(), {
        preconnect: refuseExternalFetch,
      }),
    )
    try {
      // Untouched default job: fresh source guard, byte read, QA adapter selection,
      // canonical reservation, attempt/usage attribution and READY transition.
      expect(
        await processSetupAttachment(
          attachmentId,
          defaultAssistantAttachmentDeps(),
        ),
      ).toEqual({ status: "ready", kind: "AUDIO" })
      const ready = await db.assistantAttachment.findUniqueOrThrow({
        where: { id: attachmentId },
      })
      expect(ready).toMatchObject({
        tenantId,
        storeId,
        actorUserId: userId,
        status: "READY",
        durationMs: 1200,
        processingAttempts: 1,
        audioBudgetReserved: true,
        transcript: SETUP_REHEARSAL_TRANSCRIPT,
        messageId: null,
        extraction: { type: "transcript" },
      })
      const budget = await db.assistantBudget.findUniqueOrThrow({
        where: { scopeKey: setupKey },
      })
      expect(budget).toMatchObject({
        requests: 0,
        tokens: 0,
        audioSeconds: 2,
        visionImages: 0,
      })
      const attempts = await db.assistantTranscriptionAttempt.findMany({
        where: { attachmentId },
      })
      expect(attempts).toHaveLength(1)
      expect(attempts[0]).toMatchObject({
        generation: 1,
        ordinal: 1,
        provider: "rehearsal",
        model: "rehearsal-transcribe-v1",
        outcome: "success",
        audioSeconds: 2,
        billingStatus: "not_billable",
        estimatedCostMicros: 0n,
      })
      const usages = await db.assistantUsageEvent.findMany({
        where: { tenantId },
      })
      expect(usages).toHaveLength(1)
      expect(usages[0]).toMatchObject({
        attachmentId,
        actorUserId: userId,
        provider: "ewatrade-rehearsal",
        model: "rehearsal-transcribe-v1",
        requestClass: "transcribe",
        outcome: "success",
        audioSeconds: 2,
      })
      expect(
        await processSetupAttachment(
          attachmentId,
          defaultAssistantAttachmentDeps(),
        ),
      ).toEqual({ status: "skipped" })
      expect(await ingest(input)).toMatchObject({
        state: "voice_review",
        attachmentId,
        transcript: SETUP_REHEARSAL_TRANSCRIPT,
        processingGeneration: 1,
      })
      expect(downloads).toHaveLength(2)
      expect(queued).toEqual([attachmentId])
      expect(
        await db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: setupKey },
        }),
      ).toEqual(budget)
      expect(await db.assistantUsageEvent.count({ where: { tenantId } })).toBe(
        1,
      )
      expect(
        await db.assistantTranscriptionAttempt.count({
          where: { attachmentId },
        }),
      ).toBe(1)
      expect(
        await prepareAssistantWhatsAppMediaTurn(ctx, claimed.lease, inbox),
      ).toEqual({ kind: "completed" })
      const source = await db.assistantWhatsAppInbox.findUniqueOrThrow({
        where: { id: inbox.id },
      })
      const review = whatsAppVoiceReviewContentSchema.parse(source.content)
      expect(review.review).toMatchObject({
        attachmentId,
        processingGeneration: 1,
        transcriptDigest: createHash("sha256")
          .update(SETUP_REHEARSAL_TRANSCRIPT)
          .digest("hex"),
      })
      expect(review.review.consumedBy).toBeUndefined()
      expect(
        await db.assistantRun.count({ where: { conversation: { tenantId } } }),
      ).toBe(0)
      expect(
        await db.assistantActionProposal.count({ where: { tenantId } }),
      ).toBe(0)
      expect(
        await db.assistantBudget.findUnique({
          where: { scopeKey: generalKey },
        }),
      ).toBeNull()
      const outbox = await db.assistantWhatsAppOutbox.findFirstOrThrow({
        where: { inboxId: inbox.id },
      })
      expect(outbox).toMatchObject({
        renderKind: "voice_review",
        runId: null,
        messageId: null,
      })
      expect(outbox.content).toContain(SETUP_REHEARSAL_TRANSCRIPT)
      expect(outbox.content).toContain(
        "Nothing in this recording has been sent as an assistant request yet",
      )
      const accepted = await fixture.fakeAcceptedDelivery(outbox.id)
      const cancel = await fixture.incoming(
        "Cancel transcript",
        accepted.providerMessageId,
      )
      const deps: ChannelTurnDependencies = {
        enabled: () => true,
        claim: (id) => claimAssistantWhatsAppInbox(db, id, [userId]),
        recover: (lease) => recoverAssistantWhatsAppInboxRun(db, lease),
        context: (principal, requestId, lease) =>
          createLinkedAssistantContext(db, principal, requestId, lease),
        prepareMedia: prepareAssistantWhatsAppMediaTurn,
        createTurn: async () => {
          throw Error(
            "An unapproved or cancelled recording must never enter a model turn",
          )
        },
        notice: (principal, lease, code) =>
          settleAssistantWhatsAppNotice(db, { principal, lease, code }),
        settle: (lease, errorCode) =>
          settleAssistantWhatsAppInbox(db, lease, {
            permittedUserIds: [userId],
            errorCode,
          }),
        retry: (lease) => retryAssistantWhatsAppInbox(db, lease),
        next: (bindingId) => nextAssistantWhatsAppInbox(db, bindingId),
      }
      expect(await processAssistantChannelTurn(cancel.id, deps)).toMatchObject({
        status: "completed",
      })
      expect(
        await db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: cancel.id },
        }),
      ).toMatchObject({
        runId: null,
        content: { type: "channel_notice", code: "VOICE_CANCELLED" },
      })
      const cancelled = await db.assistantAttachment.findUniqueOrThrow({
        where: { id: attachmentId },
      })
      expect(cancelled).toMatchObject({
        status: "FAILED",
        errorCode: "VOICE_CANCELLED",
        transcript: null,
        messageId: null,
        storagePath: ready.storagePath,
        contentDigest: digest,
      })
      expect(cancelled.retentionUntil.getTime()).toBeLessThan(Date.now())
      expect(
        await setupAttachmentStorage("QA").read({
          target: setupAttachmentTarget(cancelled),
        }),
      ).toEqual(audio)
      expect(
        await processSetupAttachment(
          attachmentId,
          defaultAssistantAttachmentDeps(),
        ),
      ).toEqual({ status: "skipped" })
      expect(
        await db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: setupKey },
        }),
      ).toEqual(budget)
      expect(
        await db.assistantRun.count({ where: { conversation: { tenantId } } }),
      ).toBe(0)
      expect(
        await db.assistantActionProposal.count({ where: { tenantId } }),
      ).toBe(0)
      expect(await db.assistantUsageEvent.count({ where: { tenantId } })).toBe(
        1,
      )
    } finally {
      fetchTrap.mockRestore()
      expect(externalFetchCalls).toBe(0)
    }
  }, 300_000)
})
