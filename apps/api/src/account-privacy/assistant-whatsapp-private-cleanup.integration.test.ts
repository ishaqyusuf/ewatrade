import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appendAssistantMessage } from "@ewatrade/db/assistant"
import {
  claimAssistantAttachmentProcessing,
  createAssistantAttachmentIntent,
  failAssistantAttachmentProcessing,
  markAssistantAttachmentUploaded,
  pinAssistantAttachmentStorage,
} from "@ewatrade/db/assistant-attachments"
import { recordVoiceAttempt } from "@ewatrade/db/assistant-voice"
import {
  beginAssistantWhatsAppDelivery,
  claimAssistantWhatsAppInbox,
  finishAssistantWhatsAppDelivery,
  settleAssistantWhatsAppNotice,
} from "@ewatrade/db/assistant-whatsapp"
import {
  beginAccountPrivacyReview,
  confirmAccountPrivacyIdentityAccessRevoked,
  countAccountPrivacyPrivateAssistant,
  getAccountPrivacyWorkflow,
  processAccountPrivacyPrivateAssistant,
  requestAccountDeletion,
  revokeAccountPrivacyAccess,
  revokeAccountPrivacyMembershipAccess,
} from "@ewatrade/db/queries"
import { assistantAttachmentStoragePath } from "@ewatrade/private-media/assistant-attachments"
import { assistantWhatsAppPrivacyInventory } from "../../../../packages/db/src/queries/assistant-whatsapp/privacy"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "../assistant/attachment-storage"
import { createAssistantWhatsAppActionFixture } from "../assistant/channel-action-integration-fixture"
import { createLinkedAssistantContext } from "../assistant/channel-principal"
import { removeAccountPrivacyPrivateAttachment } from "./private-assistant-media"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-private-cleanup")
const operatorId = `${fixture.marker}-operator`
const otherId = `${fixture.marker}-other`
const otherMembershipId = `${fixture.marker}-other-member`
const otherChat = `${fixture.marker}-other-chat`
const ownMessageId = `${fixture.marker}-own-message`
const otherMessageId = `${fixture.marker}-other-message`
// Actual owned WAV bytes; no speech adapter/model/provider is run in this privacy fixture.
const bytes = new Uint8Array(44 + 19200)
const wavHeader = new DataView(bytes.buffer)
for (const [at, value] of [
  [0, "RIFF"],
  [8, "WAVE"],
  [12, "fmt "],
  [36, "data"],
] as const)
  bytes.set(new TextEncoder().encode(value), at)
wavHeader.setUint32(4, bytes.length - 8, true)
wavHeader.setUint32(16, 16, true)
wavHeader.setUint16(20, 1, true)
wavHeader.setUint16(22, 1, true)
wavHeader.setUint32(24, 8000, true)
wavHeader.setUint32(28, 16000, true)
wavHeader.setUint16(32, 2, true)
wavHeader.setUint16(34, 16, true)
wavHeader.setUint32(40, 19200, true)
const digest = createHash("sha256").update(bytes).digest("hex")
const policyVersion = `qa-private-${randomUUID()}`
const policy = JSON.stringify({
  version: policyVersion,
  approvalReference:
    "owner-account-deletion-retention-policy-2026-10-12-codex; mechanical disposable QA binding only",
  approvedAt: "2026-10-12T13:48:02.000Z",
  reviewAt: "2026-10-16T13:48:02.000Z",
  mode: "ERASE_PRIVATE_ASSISTANT_DATA",
})
const settings = {
  ACCOUNT_PRIVACY_PROCESSING_ENABLED: "true",
  ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED: "true",
  ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED: "true",
  ACCOUNT_PRIVACY_IDENTITY_OUTCOME_PROCESSING_ENABLED: "true",
  ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION: policyVersion,
  ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_POLICY_JSON: policy,
  ACCOUNT_PRIVACY_APPROVED_PRIVATE_ASSISTANT_POLICY_SHA256: createHash("sha256")
    .update(policy)
    .digest("hex"),
}
const previous = new Map(
  Object.keys(settings).map((key) => [key, process.env[key]]),
)
const previousRoot = process.env.LOCAL_PRIVATE_OBJECTS_DIR
let privateRoot = ""
let attachmentId = ""
let requestId = ""
let bootstrapId = ""
let outboxId = ""
let pendingInboxId = ""

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  const { db, tenantId, storeId, userId } = fixture
  // Verify exact disposable classification before policy toggles or privacy commands.
  expect(
    await db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ).toMatchObject({
    slug: tenantId,
    dataClassification: "QA",
    qaSourceDomain: "assistant-action-confirmation.test",
  })
  const links = await db.assistantWhatsAppLink.findMany({
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
  if (!link) throw Error("Missing exact confirmed synthetic link")
  bootstrapId = `wa-linked_${link.id}`
  Object.assign(process.env, settings)
  privateRoot = await mkdtemp(join(tmpdir(), "ewatrade-wa-private-cleanup-"))
  process.env.LOCAL_PRIVATE_OBJECTS_DIR = privateRoot
  await db.user.update({ where: { id: userId }, data: { emailVerified: true } })
  await db.user.createMany({
    data: [
      {
        id: operatorId,
        email: `${operatorId}@example.test`,
        emailVerified: true,
        isPlatformAdmin: true,
        ageBand: "ADULT",
      },
      {
        id: otherId,
        email: `${otherId}@example.test`,
        emailVerified: true,
        ageBand: "ADULT",
      },
    ],
  })
  await db.membership.create({
    data: {
      id: otherMembershipId,
      userId: otherId,
      tenantId,
      role: "OWNER",
      status: "ACTIVE",
    },
  })
  await db.assistantConversation.create({
    data: {
      id: otherChat,
      tenantId,
      storeId,
      ownerUserId: otherId,
      purpose: "GENERAL",
      status: "ACTIVE",
    },
  })
  await db.$transaction(async (tx) => {
    await appendAssistantMessage(tx, {
      conversationId: fixture.conversationId,
      message: {
        id: ownMessageId,
        role: "user",
        parts: [{ type: "text", text: "Private owned text to erase" }],
      },
    })
    await appendAssistantMessage(tx, {
      conversationId: otherChat,
      message: {
        id: otherMessageId,
        role: "user",
        parts: [
          { type: "text", text: "Other account's private text stays intact" },
        ],
      },
    })
  })
  const intent = await createAssistantAttachmentIntent(
    db,
    { tenantId, storeId, userId },
    {
      conversationId: fixture.conversationId,
      kind: "AUDIO",
      fileName: "owned-private.wav",
      contentType: "audio/wav",
      durationMs: 1200,
      sizeBytes: bytes.byteLength,
      contentDigest: digest,
      maxPerConversation: 5,
      uploadWindowMs: 60_000,
      retentionMs: 3_600_000,
    },
  )
  attachmentId = intent.id
  const storage = setupAttachmentStorage("QA")
  if (!storage.storeId) throw Error("Exact local_test store required")
  const target = setupAttachmentTarget(intent)
  const storagePath = assistantAttachmentStoragePath(target)
  expect(
    await pinAssistantAttachmentStorage(
      db,
      { tenantId, storeId, userId },
      {
        attachmentId,
        storageProvider: storage.provider,
        storageStoreId: storage.storeId,
        storagePath,
      },
    ),
  ).toBe(true)
  await storage.stage({ target, bytes })
  expect(
    await markAssistantAttachmentUploaded(db, {
      attachmentId,
      storageProvider: storage.provider,
      storageStoreId: storage.storeId,
      storagePath,
    }),
  ).toBe(true)
  const claimed = await claimAssistantAttachmentProcessing(db, {
    attachmentId,
    leaseMs: 60_000,
    maxAttempts: 3,
  })
  expect(claimed).toMatchObject({ processingAttempts: 1 })
  await recordVoiceAttempt(db, {
    attachmentId,
    generation: 1,
    ordinal: 1,
    provider: "rehearsal",
    model: "mechanical-private-cancellation",
    outcome: "started",
    audioSeconds: 2,
    billingStatus: "unknown",
  })
  await failAssistantAttachmentProcessing(db, {
    attachmentId,
    generation: 1,
    errorCode: "WHATSAPP_SOURCE_CANCELLED",
    retryable: false,
  })
  expect(
    await db.assistantAttachment.findUniqueOrThrow({
      where: { id: attachmentId },
    }),
  ).toMatchObject({ status: "FAILED", leaseUntil: null })
}, 120_000)

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      const { db, tenantId, storeId, userId } = fixture
      try {
        await db.$transaction(
          async (tx) => {
            expect(
              await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
            ).toMatchObject({
              slug: tenantId,
              dataClassification: "QA",
              qaSourceDomain: "assistant-action-confirmation.test",
            })
            expect(
              await tx.user.findUniqueOrThrow({ where: { id: operatorId } }),
            ).toMatchObject({
              email: `${operatorId}@example.test`,
              isPlatformAdmin: true,
            })
            expect(
              await tx.user.findUniqueOrThrow({ where: { id: otherId } }),
            ).toMatchObject({ email: `${otherId}@example.test` })
            const allowed = new Set([
              fixture.conversationId,
              bootstrapId,
              otherChat,
            ])
            for (const chat of await tx.assistantConversation.findMany({
              where: { tenantId },
              include: { messages: true, setupDraft: true },
            })) {
              expect(allowed.has(chat.id)).toBe(true)
              expect(chat).toMatchObject({
                tenantId,
                storeId,
                purpose: "GENERAL",
                status: "ACTIVE",
                ownerUserId: chat.id === otherChat ? otherId : userId,
                workflowContext: null,
                setupDraft: null,
              })
              for (const message of chat.messages)
                expect([ownMessageId, otherMessageId]).toContain(message.id)
              if (chat.id === bootstrapId)
                expect(chat).toMatchObject({ lastSequence: 0, messages: [] })
            }
            const unresolved = await tx.assistantWhatsAppAttempt.count({
              where: {
                outbox: { inbox: { binding: { identity: { userId } } } },
                state: { in: ["STARTED", "UNKNOWN"] },
              },
            })
            expect(unresolved).toBe(0)
            expect(
              await tx.assistantTranscriptionAttempt.count({
                where: {
                  attachment: { tenantId },
                  OR: [
                    { outcome: "started" },
                    { completedAt: null },
                    { errorCode: "UNKNOWN_OUTCOME" },
                  ],
                },
              }),
            ).toBe(0)
            expect(
              await tx.assistantWhatsAppOutbox.count({
                where: {
                  inbox: { binding: { identity: { userId } } },
                  state: { in: ["SENDING", "UNKNOWN"] },
                },
              }),
            ).toBe(0)
            for (const row of await tx.assistantAttachment.findMany({
              where: { tenantId },
            }))
              expect(row).toMatchObject({
                id: attachmentId,
                conversationId: fixture.conversationId,
                actorUserId: userId,
                storeId,
                storageProvider: "local_test",
                contentDigest: digest,
                sizeBytes: bytes.byteLength,
              })
            const effects = await Promise.all([
              tx.assistantRun.count({ where: { conversation: { tenantId } } }),
              tx.assistantActionProposal.count({ where: { tenantId } }),
              tx.assistantUsageEvent.count({ where: { tenantId } }),
              tx.customer.count({ where: { tenantId } }),
              tx.catalogItem.count({ where: { tenantId } }),
              tx.commercialOrder.count({ where: { tenantId } }),
              tx.financeBook.count({ where: { tenantId } }),
              tx.stockOperation.count({ where: { tenantId } }),
              tx.serviceJob.count({ where: { tenantId } }),
              tx.assistantBudget.count({
                where: { scopeKey: { contains: tenantId } },
              }),
            ])
            for (const count of effects) expect(count).toBe(0)
            const requests = await tx.accountPrivacyRequest.findMany({
              where: {
                OR: [
                  { userId: { in: [userId, otherId, operatorId] } },
                  {
                    verifiedSubjectUserId: {
                      in: [userId, otherId, operatorId],
                    },
                  },
                ],
              },
            })
            for (const request of requests)
              expect(request).toMatchObject({
                id: requestId,
                userId,
                verifiedSubjectUserId: userId,
                requestKey: `account-deletion:${userId}`,
                status: "PROCESSING",
              })
            const outcomes = await tx.accountPrivacyDomainOutcome.findMany({
              where: { requestId },
            })
            for (const row of outcomes) {
              expect(row.userId).toBe(userId)
              expect(row.policyVersion).toBe(policyVersion)
              expect(["MEMBERSHIP", "IDENTITY_ACCESS"]).toContain(row.domain)
            }
            expect(
              await tx.accountPrivacyNoticeAttempt.count({
                where: { requestId },
              }),
            ).toBe(0)
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
        for (const row of await db.assistantAttachment.findMany({
          where: { tenantId },
        }))
          await removeAccountPrivacyPrivateAttachment({
            ...row,
            dataClassification: "QA",
          })
        const entries = await readdir(privateRoot, {
          recursive: true,
          withFileTypes: true,
        })
        expect(entries.filter((entry) => entry.isFile())).toHaveLength(0)
        await rm(privateRoot, { recursive: true })
        await db.$transaction(async (tx) => {
          await tx.accountPrivacyDomainOutcome.deleteMany({
            where: { requestId, userId },
          })
          await tx.accountPrivacyAccessRecoveryEvent.deleteMany({
            where: { requestId, userId },
          })
          await tx.accountPrivacyAccessRevocation.deleteMany({
            where: { requestId, userId },
          })
          await tx.accountPrivacyRequest.deleteMany({
            where: { id: requestId, userId, verifiedSubjectUserId: userId },
          })
          await tx.user.deleteMany({
            where: {
              OR: [
                { id: operatorId, email: `${operatorId}@example.test` },
                { id: otherId, email: `${otherId}@example.test` },
              ],
            },
          })
        })
      } catch (cause) {
        throw new Error(
          `Private cleanup proof retains uncertain fixture ${tenantId} and ${privateRoot}`,
          { cause },
        )
      }
    }
    await fixture.cleanup()
  } finally {
    if (enabled && fixture.db) await fixture.db.$disconnect()
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
    if (previousRoot === undefined)
      Reflect.deleteProperty(process.env, "LOCAL_PRIVATE_OBJECTS_DIR")
    else process.env.LOCAL_PRIVATE_OBJECTS_DIR = previousRoot
  }
}, 90_000)

suite(
  "owned WhatsApp private-data erasure under the existing approved policy",
  () => {
    test("fences queued work, preserves uncertain send proof, deletes exact original bytes before rows, and keeps another account intact", async () => {
      const { db, userId, tenantId, storeId } = fixture
      const ingress = await fixture.incoming("Explain supported files")
      const claimed = await fixture.claim(ingress.id)
      await settleAssistantWhatsAppNotice(db, {
        principal: fixture.principal,
        lease: claimed.lease,
        code: "MEDIA_UNSUPPORTED",
      })
      const outbox = await db.assistantWhatsAppOutbox.findFirstOrThrow({
        where: { inboxId: ingress.id },
      })
      outboxId = outbox.id
      const started = await beginAssistantWhatsAppDelivery(db, outboxId, {
        phoneNumberId: fixture.principal.phoneNumberId,
        permittedUserIds: [userId],
        providerMode: "test",
      })
      expect(started.kind).toBe("started")
      if (started.kind !== "started")
        throw Error("Exact original durable send intent required")
      // No HTTP/provider is called. The original unresolved intent remains the only proof.
      const beforeAttempt = await db.assistantWhatsAppAttempt.findUniqueOrThrow(
        { where: { id: started.proof.attemptId } },
      )
      pendingInboxId = (
        await fixture.incoming("Keep the next private request queued")
      ).id
      const request = await requestAccountDeletion(
        db,
        userId,
        `${fixture.marker}@example.test`,
      )
      requestId = request.id
      const input = { requestId, operatorUserId: operatorId }
      await beginAccountPrivacyReview(db, {
        requestId,
        reviewerUserId: operatorId,
      })
      await revokeAccountPrivacyAccess(db, {
        ...input,
        revokeApple: async () => {
          throw Error("No external provider authorized")
        },
        revokeGoogle: async () => {
          throw Error("No external provider authorized")
        },
      })
      await revokeAccountPrivacyMembershipAccess(db, input)
      await confirmAccountPrivacyIdentityAccessRevoked(db, input)
      expect((await getAccountPrivacyWorkflow(db, input)).nextStep).toBe(
        "ERASE_PRIVATE_ASSISTANT",
      )
      let removals = 0
      await expect(
        processAccountPrivacyPrivateAssistant(db, input, async () => {
          removals++
          throw Error("Uncertain send must block before original bytes")
        }),
      ).rejects.toMatchObject({ code: "PRIVATE_WORK_UNRESOLVED" })
      expect(removals).toBe(0)
      const preserved = await db.assistantWhatsAppAttempt.findUniqueOrThrow({
        where: { id: started.proof.attemptId },
      })
      expect(preserved).toMatchObject({
        state: "UNKNOWN",
        callbackDigest: beforeAttempt.callbackDigest,
        owner: beforeAttempt.owner,
        generation: beforeAttempt.generation,
      })
      expect(
        await db.assistantWhatsAppOutbox.findUniqueOrThrow({
          where: { id: outboxId },
        }),
      ).toMatchObject({ state: "UNKNOWN", content: null })
      expect(
        await db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: pendingInboxId },
        }),
      ).toMatchObject({ state: "CANCELLED", leaseOwner: null })
      const identity = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
        where: {
          phoneNumberId_senderId: {
            phoneNumberId: fixture.principal.phoneNumberId,
            senderId: fixture.principal.senderId,
          },
        },
      })
      expect(identity.revokedAt).not.toBeNull()
      expect(identity.activeBindingId).toBeNull()
      await expect(
        createLinkedAssistantContext(
          db,
          fixture.principal,
          "late-private-cleanup-worker",
        ),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      expect(
        (await claimAssistantWhatsAppInbox(db, pendingInboxId, [userId])).kind,
      ).toBe("idle")
      expect(
        await claimAssistantAttachmentProcessing(db, {
          attachmentId,
          leaseMs: 60_000,
          maxAttempts: 3,
        }),
      ).toBeNull()
      const original = await db.assistantAttachment.findUniqueOrThrow({
        where: { id: attachmentId },
      })
      expect(
        await setupAttachmentStorage("QA").read({
          target: setupAttachmentTarget(original),
        }),
      ).toEqual(bytes)
      expect(
        (
          await beginAssistantWhatsAppDelivery(db, outboxId, {
            phoneNumberId: fixture.principal.phoneNumberId,
            permittedUserIds: [userId],
            providerMode: "test",
          })
        ).kind,
      ).toBe("unknown")
      expect(
        await db.assistantWhatsAppAttempt.count({ where: { outboxId } }),
      ).toBe(1)
      // Mechanical original callback rejection, not provider delivery/erasure evidence or another send.
      expect(
        await finishAssistantWhatsAppDelivery(db, started.proof, {
          kind: "rejected",
        }),
      ).toMatchObject({ state: "FAILED" })
      await expect(
        processAccountPrivacyPrivateAssistant(db, input, async () => {
          removals++
          throw Error("Unresolved transcription must block before bytes")
        }),
      ).rejects.toMatchObject({ code: "PRIVATE_WORK_UNRESOLVED" })
      expect(removals).toBe(0)
      expect(
        await db.assistantTranscriptionAttempt.findMany({
          where: { attachmentId },
        }),
      ).toMatchObject([
        { outcome: "started", completedAt: null, billingStatus: "unknown" },
      ])
      await expect(
        recordVoiceAttempt(db, {
          attachmentId,
          generation: 1,
          ordinal: 2,
          provider: "rehearsal",
          model: "mechanical-private-cancellation",
          outcome: "started",
          audioSeconds: 2,
          billingStatus: "unknown",
        }),
      ).rejects.toThrow("VOICE_CANCELLED")
      expect(
        await db.assistantTranscriptionAttempt.count({
          where: { attachmentId },
        }),
      ).toBe(1)
      // An existing admitted QA attempt may record its known terminal cancellation;
      // this simulated no-provider outcome is not external deletion/billing evidence.
      await recordVoiceAttempt(db, {
        attachmentId,
        generation: 1,
        ordinal: 1,
        provider: "rehearsal",
        model: "mechanical-private-cancellation",
        outcome: "failed",
        errorCode: "VOICE_CANCELLED",
        audioSeconds: 2,
        billingStatus: "not_billable",
      })
      await recordVoiceAttempt(db, {
        attachmentId,
        generation: 1,
        ordinal: 2,
        provider: "rehearsal",
        model: "mechanical-private-cancellation",
        outcome: "success",
        audioSeconds: 2,
        billingStatus: "not_billable",
      })
      expect(
        await db.assistantTranscriptionAttempt.count({
          where: { attachmentId },
        }),
      ).toBe(1)
      await expect(
        processAccountPrivacyPrivateAssistant(db, input, async () => {
          throw Error("Synthetic storage failure")
        }),
      ).rejects.toMatchObject({ code: "MEDIA_DELETION_UNCONFIRMED" })
      expect(
        await db.assistantAttachment.count({
          where: { id: attachmentId, actorUserId: userId },
        }),
      ).toBe(1)
      expect(
        await setupAttachmentStorage("QA").read({
          target: setupAttachmentTarget(original),
        }),
      ).toEqual(bytes)
      const result = await processAccountPrivacyPrivateAssistant(
        db,
        input,
        async (row) => {
          removals++
          expect(row).toMatchObject({
            id: attachmentId,
            tenantId,
            conversationId: fixture.conversationId,
            dataClassification: "QA",
            contentDigest: digest,
          })
          expect(
            await db.assistantAttachment.count({ where: { id: row.id } }),
          ).toBe(1)
          await removeAccountPrivacyPrivateAttachment(row)
          // Original absence is verified by the real adapter while attribution still exists.
          expect(
            await db.assistantAttachment.count({ where: { id: row.id } }),
          ).toBe(1)
        },
      )
      expect(result).toMatchObject({
        remaining: 0,
        replay: false,
        attachmentsRemoved: 1,
        conversationsRemoved: 2,
      })
      expect(removals).toBe(1)
      expect(
        (await countAccountPrivacyPrivateAssistant(db, userId)).total,
      ).toBe(0)
      expect(
        Object.values(
          await assistantWhatsAppPrivacyInventory(db, userId),
        ).every((count) => count === 0),
      ).toBe(true)
      expect(
        await db.assistantConversation.findUniqueOrThrow({
          where: { id: otherChat },
        }),
      ).toMatchObject({ tenantId, storeId, ownerUserId: otherId })
      expect(
        (
          await db.assistantMessage.findUniqueOrThrow({
            where: { id: otherMessageId },
          })
        ).parts,
      ).toEqual([
        { type: "text", text: "Other account's private text stays intact" },
      ])
      expect((await getAccountPrivacyWorkflow(db, input)).nextStep).toBe(
        "CONFIRM_CONVERSATIONS",
      )
      expect(
        await processAccountPrivacyPrivateAssistant(db, input),
      ).toMatchObject({ remaining: 0, replay: true })
      expect(
        await finishAssistantWhatsAppDelivery(db, started.proof, {
          kind: "rejected",
        }),
      ).toBeNull()
      expect(
        (await claimAssistantWhatsAppInbox(db, pendingInboxId, [userId])).kind,
      ).toBe("idle")
      expect(
        await claimAssistantAttachmentProcessing(db, {
          attachmentId,
          leaseMs: 60_000,
          maxAttempts: 3,
        }),
      ).toBeNull()
      expect(
        await db.accountPrivacyDomainOutcome.count({
          where: {
            requestId,
            domain: {
              in: ["EXTERNAL_PROCESSORS", "ACCOUNT_PROFILE", "OUTCOME_NOTICE"],
            },
          },
        }),
      ).toBe(0)
      expect(
        await db.accountPrivacyRequest.findUniqueOrThrow({
          where: { id: requestId },
        }),
      ).toMatchObject({
        status: "PROCESSING",
        userId,
        verifiedSubjectUserId: userId,
      })
    }, 360_000)
  },
)
