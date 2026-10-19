import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash, createHmac, randomUUID } from "node:crypto"
import {
  whatsAppMediaContentSchema,
  whatsAppVoiceReviewContentSchema,
} from "@ewatrade/assistant/channels/media"
import {
  SETUP_ATTACHMENTS_PER_CONVERSATION,
  SETUP_ATTACHMENT_RETENTION_MS,
  SETUP_ATTACHMENT_UPLOAD_WINDOW_MS,
} from "@ewatrade/assistant/setup/attachments"
import {
  claimAssistantAttachmentProcessing,
  completeAssistantAttachmentProcessing,
  createAssistantAttachmentIntent,
  markAssistantAttachmentUploaded,
  pinAssistantAttachmentStorage,
} from "@ewatrade/db/assistant-attachments"
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
import { processPlatformWhatsAppEvent } from "../communications/whatsapp-platform-runtime"
import { handleWhatsAppWebhookRequest } from "../communications/whatsapp-runtime"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { prepareAssistantWhatsAppMediaTurn } from "./channel-media-turn"
import {
  createLinkedAssistantContext,
  isLinkedAssistantIdentity,
} from "./channel-principal"
import {
  type ChannelTurnDependencies,
  processAssistantChannelTurn,
} from "./channel-turn"
import { generalBudgetScopeKey } from "./general-allowance"
import { createGeneralAssistantTurn } from "./general-turn"
import {
  type GeneralTurnInput,
  generalTurnInputSchema,
} from "./general-turn-contract"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-voice")
const flags = [
  "ASSISTANT_REHEARSAL_MODE",
  "ASSISTANT_WHATSAPP_MEDIA_ENABLED",
] as const
const previous = new Map(flags.map((name) => [name, process.env[name]]))
const fixtureAppSecret = "synthetic-action-webhook-secret"
let deps: ChannelTurnDependencies
let modelTurns = 0
const modelInputs: GeneralTurnInput[] = []

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  process.env.ASSISTANT_REHEARSAL_MODE = "true"
  process.env.ASSISTANT_WHATSAPP_MEDIA_ENABLED = "true"
  deps = {
    enabled: () => true,
    claim: (id) =>
      claimAssistantWhatsAppInbox(fixture.db, id, [fixture.userId]),
    recover: (lease) => recoverAssistantWhatsAppInboxRun(fixture.db, lease),
    context: async (principal, requestId, lease) => {
      const ctx = await createLinkedAssistantContext(
        fixture.db,
        principal,
        requestId,
        lease,
      )
      expect(isLinkedAssistantIdentity(ctx.session)).toBe(true)
      expect(ctx.session?.session).toBeNull()
      return ctx
    },
    prepareMedia: prepareAssistantWhatsAppMediaTurn,
    createTurn: async (ctx, input, signal) => {
      modelTurns += 1
      modelInputs.push(generalTurnInputSchema.parse(input))
      return createGeneralAssistantTurn(ctx, input, signal)
    },
    notice: (principal, lease, code) =>
      settleAssistantWhatsAppNotice(fixture.db, { principal, lease, code }),
    settle: (lease, errorCode) =>
      settleAssistantWhatsAppInbox(fixture.db, lease, {
        permittedUserIds: [fixture.userId],
        errorCode,
      }),
    retry: (lease) => retryAssistantWhatsAppInbox(fixture.db, lease),
    next: (bindingId) => nextAssistantWhatsAppInbox(fixture.db, bindingId),
  }
}, 90_000)

afterAll(async () => {
  try {
    if (enabled && fixture.db)
      await fixture.db.assistantBudget.deleteMany({
        where: {
          scopeKey: generalBudgetScopeKey({ tenantId: fixture.tenantId }),
        },
      })
    await fixture.cleanup()
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = value
    }
  }
}, 60_000)

async function requests() {
  return (
    (
      await fixture.db.assistantBudget.findUnique({
        where: {
          scopeKey: generalBudgetScopeKey({ tenantId: fixture.tenantId }),
        },
      })
    )?.requests ?? 0
  )
}

/** Signed actual Meta normalization and durable admission, with only the queue dispatch replaced. */
async function incomingAudio() {
  const identity = await fixture.db.assistantWhatsAppIdentity.findFirstOrThrow({
    where: { userId: fixture.userId },
  })
  const providerMessageId = `wamid.${fixture.marker}.audio.${randomUUID()}`
  const mediaId = `synthetic-audio-${randomUUID()}`
  const body = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: identity.phoneNumberId },
              messages: [
                {
                  id: providerMessageId,
                  from: identity.senderId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "audio",
                  audio: { id: mediaId, mime_type: "audio/ogg", voice: true },
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
  const id = queued[0]
  if (!id) throw Error("Expected ID-only media admission")
  const inbox = await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
    where: { id },
  })
  expect(inbox.kind).toBe("TURN")
  expect(whatsAppMediaContentSchema.parse(inbox.content).media).toMatchObject({
    id: mediaId,
    sourceType: "audio",
    voice: true,
  })
  return { inbox, identity, mediaId }
}

async function voiceReview(transcript: string) {
  const beforeModels = modelTurns
  const beforeRequests = await requests()
  const { inbox, identity, mediaId } = await incomingAudio()
  const scope = {
    tenantId: fixture.tenantId,
    storeId: fixture.storeId,
    userId: fixture.userId,
  }
  const contentDigest = createHash("sha256")
    .update(`synthetic metadata-only audio ${mediaId}`)
    .digest("hex")
  const attachment = await createAssistantAttachmentIntent(fixture.db, scope, {
    conversationId: fixture.conversationId,
    kind: "AUDIO",
    fileName: "synthetic-voice.ogg",
    contentType: "audio/ogg",
    sizeBytes: 64,
    contentDigest,
    durationMs: 2000,
    clientRequestId: assistantWhatsAppMediaClientRequestId(
      identity.phoneNumberId,
      inbox.providerMessageId,
      mediaId,
    ),
    maxPerConversation: SETUP_ATTACHMENTS_PER_CONVERSATION,
    uploadWindowMs: SETUP_ATTACHMENT_UPLOAD_WINDOW_MS,
    retentionMs: SETUP_ATTACHMENT_RETENTION_MS,
  })
  // The synthetic private object does not exist; canonical ownership and lifecycle
  // metadata are exercised without downloading, writing, deleting or transcribing bytes.
  const storage = {
    attachmentId: attachment.id,
    storageProvider: "synthetic-no-object",
    storageStoreId: fixture.storeId,
    storagePath: `private/qa/${fixture.marker}/${attachment.id}.ogg`,
  }
  expect(await pinAssistantAttachmentStorage(fixture.db, scope, storage)).toBe(
    true,
  )
  expect(
    await markAssistantAttachmentUploaded(fixture.db, {
      ...storage,
      durationMs: 2000,
    }),
  ).toBe(true)
  const processing = await claimAssistantAttachmentProcessing(fixture.db, {
    attachmentId: attachment.id,
    leaseMs: 60_000,
    maxAttempts: 3,
  })
  if (!processing) throw Error("Expected canonical audio processing generation")
  await completeAssistantAttachmentProcessing(fixture.db, {
    attachmentId: attachment.id,
    generation: processing.processingAttempts,
    transcript,
    extraction: {},
    durationMs: 2000,
  })
  expect(await processAssistantChannelTurn(inbox.id, deps)).toMatchObject({
    status: "completed",
  })
  const reviewed = await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
    where: { id: inbox.id },
  })
  const content = whatsAppVoiceReviewContentSchema.parse(reviewed.content)
  expect(reviewed.runId).toBeNull()
  expect(content.review).toMatchObject({
    attachmentId: attachment.id,
    processingGeneration: processing.processingAttempts,
    transcriptDigest: createHash("sha256").update(transcript).digest("hex"),
  })
  expect(content.review.consumedBy).toBeUndefined()
  expect(
    await fixture.db.assistantRun.count({
      where: { requestId: inbox.requestId },
    }),
  ).toBe(0)
  const outputs = await fixture.db.assistantWhatsAppOutbox.findMany({
    where: { inboxId: inbox.id },
  })
  expect(outputs).toHaveLength(1)
  const outbox = outputs[0]
  if (!outbox) throw Error("Expected one immutable voice review")
  expect(outbox.renderKind).toBe("voice_review")
  expect(outbox.runId).toBeNull()
  expect(outbox.messageId).toBeNull()
  expect(outbox.content).toContain(transcript)
  expect(outbox.content).toContain(
    "Nothing in this recording has been sent as an assistant request yet",
  )
  const sent = await fixture.fakeAcceptedDelivery(outbox.id)
  expect(modelTurns).toBe(beforeModels)
  expect(await requests()).toBe(beforeRequests)
  return {
    inbox: reviewed,
    attachment,
    content,
    outbox,
    storage,
    providerMessageId: sent.providerMessageId,
  }
}

async function choice(text: string, quote: string) {
  const inbox = await fixture.incoming(text, quote)
  expect(inbox.kind).toBe("TURN")
  expect(await processAssistantChannelTurn(inbox.id, deps)).toMatchObject({
    status: "completed",
  })
  const completed = await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
    where: { id: inbox.id },
  })
  const outputs = await fixture.db.assistantWhatsAppOutbox.findMany({
    where: { inboxId: inbox.id },
    orderBy: { chunkIndex: "asc" },
  })
  expect(outputs.length).toBeGreaterThan(0)
  for (const output of outputs) await fixture.fakeAcceptedDelivery(output.id)
  return { inbox: completed, outputs }
}

async function invalid(text: string, quote: string) {
  const calls = modelTurns
  const allowance = await requests()
  const result = await choice(text, quote)
  expect(result.inbox.content).toEqual({
    type: "channel_notice",
    code: "VOICE_INVALID",
  })
  expect(result.inbox.runId).toBeNull()
  expect(result.outputs).toHaveLength(1)
  expect(result.outputs[0]?.renderKind).toBe("notice")
  expect(modelTurns).toBe(calls)
  expect(await requests()).toBe(allowance)
  return result
}

suite("actual quoted voice transcript review boundary", () => {
  test("raw audio spends no model allowance; wrong quote refuses; Use enters the shared canonical turn once and a replay does not", async () => {
    const beforeModels = modelTurns
    const beforeRequests = await requests()
    const review = await voiceReview("What can you do?")
    await invalid("Use transcript", "wamid.unrelated-voice-review")
    const used = await choice("Use transcript", review.providerMessageId)
    expect(modelTurns).toBe(beforeModels + 1)
    expect(await requests()).toBe(beforeRequests + 1)
    expect(modelInputs.at(-1)?.message.parts[0]).toEqual({
      type: "text",
      text: "What can you do?",
    })
    expect(
      (
        await fixture.db.assistantAttachment.findUniqueOrThrow({
          where: { id: review.attachment.id },
        })
      ).messageId,
    ).toBe(used.inbox.userMessageId)
    const run = await fixture.db.assistantRun.findFirstOrThrow({
      where: {
        requestId: used.inbox.requestId,
        conversationId: fixture.conversationId,
      },
    })
    expect(run.status).toBe("COMPLETED")
    expect(run.assistantMessageId).not.toBeNull()
    const consumed = whatsAppVoiceReviewContentSchema.parse(
      (
        await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: review.inbox.id },
        })
      ).content,
    )
    expect(consumed.review).toMatchObject({
      consumedBy: used.inbox.id,
      decision: "use",
    })
    await invalid("Use transcript", review.providerMessageId)
    expect(modelTurns).toBe(beforeModels + 1)
    expect(await requests()).toBe(beforeRequests + 1)
    expect(
      await fixture.db.assistantActionProposal.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(0)
    expect(
      await fixture.db.session.count({ where: { userId: fixture.userId } }),
    ).toBe(1)
  }, 360_000)

  test("Edit supplies the exact corrected text to the canonical saved user message, preserving audio attribution", async () => {
    const review = await voiceReview("This is the original voice note.")
    const corrected = "What can you do?"
    const beforeModels = modelTurns
    const edited = await choice(
      `Edit transcript: ${corrected}`,
      review.providerMessageId,
    )
    expect(modelTurns).toBe(beforeModels + 1)
    expect(modelInputs.at(-1)?.message.parts[0]).toEqual({
      type: "text",
      text: corrected,
    })
    const message = await fixture.db.assistantMessage.findUniqueOrThrow({
      where: { id: edited.inbox.userMessageId },
    })
    expect(message.parts).toEqual(
      expect.arrayContaining([{ type: "text", text: corrected }]),
    )
    const attachment = await fixture.db.assistantAttachment.findUniqueOrThrow({
      where: { id: review.attachment.id },
    })
    expect(attachment).toMatchObject({
      messageId: edited.inbox.userMessageId,
      storageProvider: review.storage.storageProvider,
      storageStoreId: review.storage.storageStoreId,
      storagePath: review.storage.storagePath,
    })
    const consumed = whatsAppVoiceReviewContentSchema.parse(
      (
        await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: review.inbox.id },
        })
      ).content,
    )
    expect(consumed.review).toMatchObject({
      consumedBy: edited.inbox.id,
      decision: "edit",
    })
    expect(
      await fixture.db.assistantActionProposal.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(0)
  }, 300_000)

  test("Cancel retains expired FAILED storage ownership; generation, expiry and foreign binding never execute an unapproved transcript", async () => {
    const calls = modelTurns
    const allowance = await requests()
    const cancelled = await voiceReview(
      "Do not submit this cancelled recording.",
    )
    const result = await choice(
      "Cancel transcript",
      cancelled.providerMessageId,
    )
    expect(result.inbox.content).toEqual({
      type: "channel_notice",
      code: "VOICE_CANCELLED",
    })
    const retained = await fixture.db.assistantAttachment.findUniqueOrThrow({
      where: { id: cancelled.attachment.id },
    })
    expect(retained).toMatchObject({
      status: "FAILED",
      errorCode: "VOICE_CANCELLED",
      transcript: null,
      messageId: null,
      storageProvider: cancelled.storage.storageProvider,
      storageStoreId: cancelled.storage.storageStoreId,
      storagePath: cancelled.storage.storagePath,
    })
    expect(retained.retentionUntil.getTime()).toBeLessThan(Date.now())
    await invalid("Use transcript", cancelled.providerMessageId)

    const generation = await voiceReview(
      "This transcript belongs to generation one.",
    )
    await fixture.db.assistantAttachment.update({
      where: { id: generation.attachment.id },
      data: { processingAttempts: { increment: 1 } },
    })
    await invalid("Use transcript", generation.providerMessageId)
    expect(
      (
        await fixture.db.assistantAttachment.findUniqueOrThrow({
          where: { id: generation.attachment.id },
        })
      ).messageId,
    ).toBeNull()

    const expired = await voiceReview(
      "This voice review will expire before approval.",
    )
    await fixture.db.assistantWhatsAppInbox.update({
      where: { id: expired.inbox.id },
      data: {
        content: {
          ...expired.content,
          review: {
            ...expired.content.review,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      },
    })
    await invalid("Use transcript", expired.providerMessageId)
    expect(
      (
        await fixture.db.assistantAttachment.findUniqueOrThrow({
          where: { id: expired.attachment.id },
        })
      ).messageId,
    ).toBeNull()

    const forwarded = await voiceReview(
      "This voice review belongs to the original saved chat.",
    )
    const originalConversation = fixture.conversationId
    await fixture.switchConversation()
    await invalid("Use transcript", forwarded.providerMessageId)
    expect(
      await fixture.db.assistantAttachment.findUniqueOrThrow({
        where: { id: forwarded.attachment.id },
      }),
    ).toMatchObject({
      conversationId: originalConversation,
      messageId: null,
      storagePath: forwarded.storage.storagePath,
    })
    expect(modelTurns).toBe(calls)
    expect(await requests()).toBe(allowance)
    expect(
      await fixture.db.assistantActionProposal.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(0)
    expect(
      await fixture.db.customer.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(0)
  }, 600_000)
})
