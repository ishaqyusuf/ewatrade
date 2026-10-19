import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { whatsAppVoiceReviewContentSchema } from "@ewatrade/assistant/channels/media"
import {
  generalStoredPartSchema,
  simpleSaleAction,
} from "@ewatrade/assistant/general/contracts"
import { processSetupAttachment } from "@ewatrade/assistant/setup/attachment-processing"
import { SETUP_ATTACHMENT_PART } from "@ewatrade/assistant/setup/attachments"
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
import { z } from "zod"
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
import { prepareAssistantWhatsAppReview } from "../channel-review-staging"
import {
  type ChannelTurnDependencies,
  processAssistantChannelTurn,
} from "../channel-turn"
import { generalBudgetScopeKey } from "../general-allowance"
import { createGeneralAssistantTurn } from "../general-turn"
import { generalTurnInputSchema } from "../general-turn-contract"
import {
  createDefaultWhatsAppMediaIngestDependencies,
  createWhatsAppMediaIngestor,
} from "./ingest"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-audio-draft")
const flags = [
  "ASSISTANT_REHEARSAL_MODE",
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
let editedMessageId: string | null = null
let completedRunId: string | null = null
let proposalId: string | null = null
let turnCalls = 0
const correctedText = "Sale 500 to cash account"

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
  privateRoot = await mkdtemp(join(tmpdir(), "ewatrade-wa-audio-draft-"))
  process.env.LOCAL_PRIVATE_OBJECTS_DIR = privateRoot
  process.env.ASSISTANT_REHEARSAL_MODE = "true"
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
        await db.$transaction(
          async (tx) => {
            const tenant = await tx.tenant.findUniqueOrThrow({
              where: { id: tenantId },
            })
            expect(tenant).toMatchObject({
              slug: tenantId,
              dataClassification: "QA",
              qaSourceDomain: "assistant-action-confirmation.test",
            })
            const links = await tx.assistantWhatsAppLink.findMany({
              where: {
                tenantId,
                storeId,
                userId,
                membershipId: fixture.membershipId,
                confirmedAt: { not: null },
              },
            })
            expect(links).toHaveLength(1)
            const link = links[0]
            if (!link) throw Error("Exact owned confirmed link required")
            expect(link).toMatchObject({
              phoneNumberId: fixture.principal.phoneNumberId,
              claimedSenderId: fixture.principal.senderId,
            })
            const chats = await tx.assistantConversation.findMany({
              where: { tenantId },
              include: {
                _count: {
                  select: { messages: true, runs: true, proposals: true },
                },
                setupDraft: true,
              },
            })
            expect(chats.map((chat) => chat.id).sort()).toEqual(
              [fixture.conversationId, `wa-linked_${link.id}`].sort(),
            )
            for (const chat of chats) {
              expect(chat).toMatchObject({
                ownerUserId: userId,
                storeId,
                purpose: "GENERAL",
                status: "ACTIVE",
                setupDraft: null,
                workflowContext: null,
              })
              if (chat.id !== fixture.conversationId)
                expect(chat).toMatchObject({
                  lastSequence: 0,
                  _count: { messages: 0, runs: 0, proposals: 0 },
                })
            }
            const rows = await tx.assistantAttachment.findMany({
              where: { tenantId },
            })
            expect(rows.length).toBeLessThanOrEqual(1)
            for (const row of rows)
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
                messageId: editedMessageId,
                clientRequestId: assistantWhatsAppMediaClientRequestId(
                  fixture.principal.phoneNumberId,
                  providerMessageId,
                  mediaId,
                ),
              })
            const runs = await tx.assistantRun.findMany({
              where: { conversation: { tenantId } },
            })
            expect(runs.length).toBeLessThanOrEqual(1)
            for (const run of runs)
              expect(run).toMatchObject({
                id: completedRunId,
                actorUserId: userId,
                conversationId: fixture.conversationId,
                provider: "ewatrade-rehearsal",
                model: "rehearsal-v1",
                status: "COMPLETED",
              })
            const proposals = await tx.assistantActionProposal.findMany({
              where: { tenantId },
            })
            expect(proposals.length).toBeLessThanOrEqual(1)
            for (const proposal of proposals) {
              expect(proposal).toMatchObject({
                id: proposalId,
                actorUserId: userId,
                storeId,
                conversationId: fixture.conversationId,
                action: "sale_record",
                status: "PENDING",
                executedResult: null,
              })
              expect(simpleSaleAction.parse(proposal.payload)).toMatchObject({
                receivedMinor: 50000,
                accountName: "Shop cash",
                createAccount: true,
                attachmentIds: [],
              })
            }
            for (const usage of await tx.assistantUsageEvent.findMany({
              where: { tenantId },
            })) {
              expect(usage.actorUserId).toBe(userId)
              expect(usage.provider).toBe("ewatrade-rehearsal")
              if (usage.requestClass === "transcribe")
                expect(usage).toMatchObject({
                  attachmentId,
                  runId: null,
                  model: "rehearsal-transcribe-v1",
                  audioSeconds: 2,
                })
              else
                expect(usage).toMatchObject({
                  attachmentId: null,
                  runId: completedRunId,
                  requestClass: "chat",
                  model: "rehearsal-v1",
                  inputTokens: null,
                  outputTokens: null,
                  totalTokens: null,
                })
            }
            const counts = await Promise.all([
              tx.customer.count({ where: { tenantId } }),
              tx.catalogItem.count({ where: { tenantId } }),
              tx.commercialOrder.count({ where: { tenantId } }),
              tx.financeBook.count({ where: { tenantId } }),
              tx.stockOperation.count({ where: { tenantId } }),
              tx.serviceJob.count({ where: { tenantId } }),
              tx.customerLedgerEntry.count({ where: { tenantId } }),
              tx.businessActivityEvent.count({ where: { tenantId } }),
            ])
            for (const count of counts) expect(count).toBe(0)
            const budgets = await tx.assistantBudget.findMany({
              where: { scopeKey: { in: [setupKey, generalKey] } },
            })
            for (const budget of budgets)
              expect(budget).toMatchObject(
                budget.scopeKey === setupKey
                  ? { requests: 0, tokens: 0, audioSeconds: 2, visionImages: 0 }
                  : {
                      requests: 1,
                      tokens: 0,
                      audioSeconds: 0,
                      visionImages: 0,
                    },
              )
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
        // Physical originals first. A failure preserves canonical attribution and the private root.
        for (const row of await db.assistantAttachment.findMany({
          where: { tenantId },
        }))
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
        await db.assistantBudget.deleteMany({
          where: { scopeKey: { in: [setupKey, generalKey] } },
        })
      } catch (error) {
        await db.$disconnect()
        throw new Error(
          `Audio draft cleanup unverified; retained fixture ${tenantId} and private root ${privateRoot}`,
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

suite("measured WhatsApp audio to explicitly edited canonical draft", () => {
  test("default processing remains inert until quoted Edit creates one pending draft, and repeated choice cannot create or execute anything", async () => {
    const { db, tenantId, userId, storeId } = fixture
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
      const deps: ChannelTurnDependencies = {
        enabled: () => true,
        claim: (id) => claimAssistantWhatsAppInbox(db, id, [userId]),
        recover: (lease) => recoverAssistantWhatsAppInboxRun(db, lease),
        context: (principal, requestId, lease) =>
          createLinkedAssistantContext(db, principal, requestId, lease),
        prepareMedia: prepareAssistantWhatsAppMediaTurn,
        createTurn: (current, input, signal) => {
          turnCalls += 1
          expect(process.env.ASSISTANT_REHEARSAL_MODE).toBe("true")
          expect(generalTurnInputSchema.parse(input).message.parts).toEqual([
            { type: "text", text: correctedText },
            { type: SETUP_ATTACHMENT_PART, data: { attachmentId } },
          ])
          return createGeneralAssistantTurn(current, input, signal)
        },
        notice: (principal, lease, code) =>
          settleAssistantWhatsAppNotice(db, { principal, lease, code }),
        settle: async (lease, errorCode) => {
          const exactReview = errorCode
            ? undefined
            : await prepareAssistantWhatsAppReview(db, lease)
          return settleAssistantWhatsAppInbox(db, lease, {
            permittedUserIds: [userId],
            errorCode,
            review: exactReview,
          })
        },
        retry: (lease) => retryAssistantWhatsAppInbox(db, lease),
        next: (bindingId) => nextAssistantWhatsAppInbox(db, bindingId),
      }
      const edit = await fixture.incoming(
        `Edit transcript: ${correctedText}`,
        accepted.providerMessageId,
      )
      editedMessageId = edit.userMessageId
      expect(await processAssistantChannelTurn(edit.id, deps)).toMatchObject({
        status: "completed",
      })
      expect(turnCalls).toBe(1)
      const completed = await db.assistantWhatsAppInbox.findUniqueOrThrow({
        where: { id: edit.id },
      })
      completedRunId = completed.runId
      if (!completedRunId)
        throw Error("Edited voice must enter the real shared canonical run")
      const run = await db.assistantRun.findUniqueOrThrow({
        where: { id: completedRunId },
      })
      expect(run).toMatchObject({
        conversationId: fixture.conversationId,
        actorUserId: userId,
        requestId: edit.requestId,
        status: "COMPLETED",
        provider: "ewatrade-rehearsal",
        model: "rehearsal-v1",
      })
      if (!run.assistantMessageId)
        throw Error("Actual canonical final reply required")
      const savedUser = await db.assistantMessage.findUniqueOrThrow({
        where: { id: edit.userMessageId },
      })
      expect(savedUser.parts).toEqual(
        expect.arrayContaining([{ type: "text", text: correctedText }]),
      )
      expect(savedUser.parts).toEqual(
        expect.arrayContaining([
          {
            type: SETUP_ATTACHMENT_PART,
            data: expect.objectContaining({ attachmentId, kind: "AUDIO" }),
          },
        ]),
      )
      const after = await db.assistantAttachment.findUniqueOrThrow({
        where: { id: attachmentId },
      })
      expect(after).toMatchObject({
        messageId: edit.userMessageId,
        status: "READY",
        transcript: SETUP_REHEARSAL_TRANSCRIPT,
        processingAttempts: 1,
        storagePath: ready.storagePath,
        contentDigest: digest,
        audioBudgetReserved: true,
      })
      expect(
        await setupAttachmentStorage("QA").read({
          target: setupAttachmentTarget(after),
        }),
      ).toEqual(audio)
      const consumed = whatsAppVoiceReviewContentSchema.parse(
        (
          await db.assistantWhatsAppInbox.findUniqueOrThrow({
            where: { id: inbox.id },
          })
        ).content,
      )
      expect(consumed.review).toMatchObject({
        consumedBy: edit.id,
        decision: "edit",
        transcriptDigest: review.review.transcriptDigest,
      })
      const pending = await db.assistantActionProposal.findFirstOrThrow({
        where: { tenantId },
      })
      proposalId = pending.id
      expect(pending).toMatchObject({
        actorUserId: userId,
        conversationId: fixture.conversationId,
        storeId,
        action: "sale_record",
        status: "PENDING",
        revision: 1,
        executedResult: null,
      })
      expect(simpleSaleAction.parse(pending.payload)).toMatchObject({
        receivedMinor: 50000,
        accountName: "Shop cash",
        method: "cash",
        createAccount: true,
        customerChoice: "walk_in",
        attachmentIds: [],
      })
      const reply = await db.assistantMessage.findUniqueOrThrow({
        where: { id: run.assistantMessageId },
      })
      const parts = z.array(generalStoredPartSchema).parse(reply.parts)
      expect(parts).toContainEqual({
        type: "data-general-proposal-reference",
        data: {
          proposalId,
          revision: pending.revision,
          payloadHash: pending.payloadHash,
        },
      })
      expect(
        await db.assistantActionProposal.count({ where: { tenantId } }),
      ).toBe(1)
      const actionOutbox = await db.assistantWhatsAppOutbox.findFirstOrThrow({
        where: { inboxId: edit.id },
      })
      expect(actionOutbox).toMatchObject({
        renderKind: "action_review",
        runId: completedRunId,
        messageId: run.assistantMessageId,
      })
      expect(actionOutbox.content).toContain("500")
      const generalBudget = await db.assistantBudget.findUniqueOrThrow({
        where: { scopeKey: generalKey },
      })
      expect(generalBudget).toMatchObject({
        requests: 1,
        tokens: 0,
        audioSeconds: 0,
        visionImages: 0,
      })
      const replay = await fixture.incoming(
        `Edit transcript: ${correctedText}`,
        accepted.providerMessageId,
      )
      expect(await processAssistantChannelTurn(replay.id, deps)).toMatchObject({
        status: "completed",
      })
      expect(
        await db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: replay.id },
        }),
      ).toMatchObject({
        runId: null,
        content: { type: "channel_notice", code: "VOICE_INVALID" },
      })
      expect(turnCalls).toBe(1)
      expect(
        await db.assistantRun.count({ where: { conversation: { tenantId } } }),
      ).toBe(1)
      expect(
        await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: proposalId },
        }),
      ).toEqual(pending)
      expect(
        await db.assistantActionProposal.count({ where: { tenantId } }),
      ).toBe(1)
      expect(
        await db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: generalKey },
        }),
      ).toEqual(generalBudget)
      expect(
        await db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: setupKey },
        }),
      ).toEqual(budget)
      expect(
        await db.assistantTranscriptionAttempt.count({
          where: { attachmentId },
        }),
      ).toBe(1)
      expect(
        await db.assistantUsageEvent.count({
          where: { tenantId, requestClass: "transcribe" },
        }),
      ).toBe(1)
      expect(
        await db.assistantUsageEvent.count({
          where: {
            tenantId,
            requestClass: "chat",
            runId: completedRunId,
            provider: "ewatrade-rehearsal",
            model: "rehearsal-v1",
            totalTokens: null,
          },
        }),
      ).toBe(1)
      for (const count of await Promise.all([
        db.customer.count({ where: { tenantId } }),
        db.commercialOrder.count({ where: { tenantId } }),
        db.financeBook.count({ where: { tenantId } }),
        db.catalogItem.count({ where: { tenantId } }),
        db.stockOperation.count({ where: { tenantId } }),
        db.businessActivityEvent.count({ where: { tenantId } }),
      ]))
        expect(count).toBe(0)
    } finally {
      fetchTrap.mockRestore()
      expect(externalFetchCalls).toBe(0)
    }
  }, 300_000)
})
