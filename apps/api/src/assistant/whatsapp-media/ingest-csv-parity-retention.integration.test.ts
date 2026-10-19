import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { whatsAppMediaContentSchema } from "@ewatrade/assistant/channels/media"
import { processSetupAttachment } from "@ewatrade/assistant/setup/attachment-processing"
import {
  type SetupAttachmentExtraction,
  setupTableExtractionSchema,
} from "@ewatrade/assistant/setup/attachments"
import {
  appendAssistantMessage,
  assistantBudgetScopeKey,
  createSetupConversation,
} from "@ewatrade/db/assistant"
import {
  claimAssistantAttachmentsForMessage,
  markAssistantAttachmentUploaded,
  pinAssistantAttachmentStorage,
  readAssistantAttachment,
} from "@ewatrade/db/assistant-attachments"
import {
  type WhatsAppConversationPrincipal,
  acceptAssistantWhatsAppIngress,
  acceptAssistantWhatsAppStatus,
  claimAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
  selectAssistantWhatsAppScope,
} from "@ewatrade/db/assistant-whatsapp"
import { prisma as processingDb } from "@ewatrade/db/client"
import { assistantAttachmentStoragePath } from "@ewatrade/private-media/assistant-attachments"
import { defaultAssistantAttachmentDeps } from "../../../../../packages/jobs/src/handlers/assistant-attachment-process"
import {
  type AssistantMaintenanceDeps,
  assistantMaintenanceHandler,
  defaultAssistantMaintenanceDeps,
} from "../../../../../packages/jobs/src/handlers/assistant-maintenance"
import { processPlatformWhatsAppEvent } from "../../communications/whatsapp-platform-runtime"
import { handleWhatsAppWebhookRequest } from "../../communications/whatsapp-runtime"
import { setupAssistantAttachmentsRouter } from "../../trpc/routers/setup-assistant-attachments"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "../attachment-storage"
import { createAssistantWhatsAppActionFixture } from "../channel-action-integration-fixture"
import { createLinkedAssistantContext } from "../channel-principal"
import {
  storedUserParts,
  withAttachmentText,
  withExpiredAttachments,
} from "../chat-attachments"
import {
  createDefaultWhatsAppMediaIngestDependencies,
  createWhatsAppMediaIngestor,
} from "./ingest"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-csv-parity")
const flags = [
  "ASSISTANT_WHATSAPP_MEDIA_ENABLED",
  "ASSISTANT_WHATSAPP_SETUP_ENABLED",
  "LOCAL_PRIVATE_OBJECTS_DIR",
] as const
const previous = new Map(flags.map((key) => [key, process.env[key]]))
const csv = new TextEncoder().encode(
  'Name,SKU,Price,Note\r\n"Synthetic comma, item",0007,9007199254740993.125,"Keep exact text"\r\n\r\nSynthetic second,0008,0.000000000000000001,"No imported records"\r\n',
)
const digest = createHash("sha256").update(csv).digest("hex")
const caption = "Read these two source rows; do not create or import anything."
const attachmentIds = new Set<string>()
const messageIds = new Set<string>()
let privateRoot = ""
let setupId = ""
let principal: WhatsAppConversationPrincipal
let browser: Awaited<ReturnType<typeof fixture.browserContext>>

const scope = {
  tenantId: fixture.tenantId,
  storeId: fixture.storeId,
  userId: fixture.userId,
}

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  privateRoot = await mkdtemp(join(tmpdir(), "ewatrade-wa-csv-parity-"))
  process.env.LOCAL_PRIVATE_OBJECTS_DIR = privateRoot
  process.env.ASSISTANT_WHATSAPP_MEDIA_ENABLED = "true"
  process.env.ASSISTANT_WHATSAPP_SETUP_ENABLED = "true"
  browser = await fixture.browserContext()
  principal = fixture.principal
  const caller = setupAssistantAttachmentsRouter.createCaller(browser)
  const deniedApp = await caller.createIntent({
    conversationId: fixture.conversationId,
    clientRequestId: randomUUID(),
    fileName: "ordinary-general.csv",
    contentType: "text/csv",
    sizeBytes: csv.byteLength,
    contentDigest: digest,
  })
  expect(deniedApp).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE" })
  const deniedInbox = await signedCsv()
  const deniedClaim = await fixture.claim(deniedInbox.id)
  const deniedContext = await createLinkedAssistantContext(
    fixture.db,
    principal,
    deniedInbox.requestId,
    deniedClaim.lease,
  )
  const deniedDefaults =
    await createDefaultWhatsAppMediaIngestDependencies(deniedContext)
  if (!deniedDefaults) throw Error("Expected real General ingest dependencies")
  let deniedDownloads = 0
  const deniedIngest = createWhatsAppMediaIngestor({
    ...deniedDefaults,
    download: async () => {
      deniedDownloads += 1
      throw Error("General CSV must refuse before download")
    },
    enqueue: async () => {
      throw Error("General CSV must not enqueue")
    },
  })
  expect(
    await deniedIngest({
      providerMessageId: deniedInbox.providerMessageId,
      content: deniedInbox.content,
    }),
  ).toMatchObject({ state: "refused", code: "MEDIA_NOT_AVAILABLE" })
  expect(deniedDownloads).toBe(0)
  expect(
    await fixture.db.assistantAttachment.count({
      where: { tenantId: fixture.tenantId },
    }),
  ).toBe(0)
  setupId = (
    await createSetupConversation(fixture.db, scope, [], { status: "ACTIVE" })
  ).id
  const identity = await fixture.db.assistantWhatsAppIdentity.findFirstOrThrow({
    where: { userId: fixture.userId },
  })
  const grant = await fixture.db.assistantWhatsAppGrant.findUniqueOrThrow({
    where: { id: fixture.principal.grantId },
  })
  const selected = await selectAssistantWhatsAppScope(
    fixture.db,
    { userId: fixture.userId, sessionId: fixture.sessionId },
    identity.phoneNumberId,
    {
      identityId: identity.id,
      grantId: grant.id,
      storeId: fixture.storeId,
      requestId: randomUUID(),
      expectedIdentityGeneration: identity.generation,
      expectedSelectionGeneration: identity.selectionGeneration,
      expectedGrantGeneration: grant.generation,
      action: { kind: "resume", conversationId: setupId, purpose: "SETUP" },
    },
  )
  if (selected.state !== "selected")
    throw Error("Expected actual owned Setup selection")
  principal = {
    kind: "linked_whatsapp",
    phoneNumberId: identity.phoneNumberId,
    senderId: identity.senderId,
    grantId: selected.grantId,
    grantGeneration: selected.grantGeneration,
    bindingId: selected.bindingId,
    identityGeneration: selected.identityGeneration,
    selectionGeneration: selected.selectionGeneration,
  }
}, 90_000)

async function noEffects() {
  const db = fixture.db
  for (const count of await Promise.all([
    db.assistantRun.count({
      where: { conversation: { tenantId: fixture.tenantId } },
    }),
    db.assistantActionProposal.count({ where: { tenantId: fixture.tenantId } }),
    db.customer.count({ where: { tenantId: fixture.tenantId } }),
    db.catalogItem.count({ where: { tenantId: fixture.tenantId } }),
    db.commercialOrder.count({ where: { tenantId: fixture.tenantId } }),
    db.financeBook.count({ where: { tenantId: fixture.tenantId } }),
    db.stockOperation.count({ where: { tenantId: fixture.tenantId } }),
    db.serviceJob.count({ where: { tenantId: fixture.tenantId } }),
    db.assistantTranscriptionAttempt.count({
      where: { attachment: { tenantId: fixture.tenantId } },
    }),
  ]))
    expect(count).toBe(0)
}

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      // All guards precede removal. On failure keep the unique QA root and its
      // original-byte attribution; never delete a Tenant after uncertain storage.
      const tenant = await fixture.db.tenant.findUniqueOrThrow({
        where: { id: fixture.tenantId },
      })
      expect(tenant).toMatchObject({
        slug: fixture.tenantId,
        dataClassification: "QA",
        qaSourceDomain: "assistant-action-confirmation.test",
      })
      expect(
        await fixture.db.user.findUniqueOrThrow({
          where: { id: fixture.userId },
        }),
      ).toMatchObject({ email: `${fixture.marker}@example.test` })
      const conversation =
        await fixture.db.assistantConversation.findUniqueOrThrow({
          where: { id: setupId },
          include: {
            setupDraft: { include: { entities: true } },
            messages: true,
          },
        })
      expect(conversation).toMatchObject({
        tenantId: fixture.tenantId,
        storeId: fixture.storeId,
        ownerUserId: fixture.userId,
        purpose: "SETUP",
        status: "ACTIVE",
      })
      expect(conversation.setupDraft?.entities).toEqual([])
      for (const message of conversation.messages) {
        expect(messageIds.has(message.id)).toBe(true)
        expect(message.role).toBe("user")
      }
      await noEffects()
      const rows = await fixture.db.assistantAttachment.findMany({
        where: { tenantId: fixture.tenantId },
      })
      expect(rows.length).toBeLessThanOrEqual(2)
      for (const row of rows) {
        expect(attachmentIds.has(row.id)).toBe(true)
        expect(row).toMatchObject({
          actorUserId: fixture.userId,
          storeId: fixture.storeId,
          conversationId: setupId,
          kind: "SPREADSHEET",
          contentType: "text/csv",
          contentDigest: digest,
          sizeBytes: csv.byteLength,
        })
        if (row.messageId) expect(messageIds.has(row.messageId)).toBe(true)
        if (row.storagePath) {
          expect(row.storageProvider).toBe("local_test")
          expect(row.storageStoreId).toBe("store_localtest")
          await setupAttachmentStorage("QA").remove({
            target: setupAttachmentTarget(row),
          })
        } else {
          expect(row.errorCode).toBe("RETENTION_EXPIRED")
          expect(row.storageProvider).toBeNull()
          expect(row.storageStoreId).toBeNull()
        }
      }
      for (const usage of await fixture.db.assistantUsageEvent.findMany({
        where: { tenantId: fixture.tenantId },
      })) {
        expect(usage.actorUserId).toBe(fixture.userId)
        expect(attachmentIds.has(usage.attachmentId ?? "")).toBe(true)
        expect(usage).toMatchObject({
          provider: "ewatrade",
          model: "setup-file-parser-v1",
          requestClass: "extract",
          outcome: "success",
          runId: null,
          audioSeconds: null,
          imageCount: null,
        })
      }
      expect(
        await fixture.db.assistantBudget.count({
          where: {
            scopeKey: assistantBudgetScopeKey(fixture.tenantId, "SETUP"),
          },
        }),
      ).toBe(0)
      const entries = await readdir(privateRoot, {
        recursive: true,
        withFileTypes: true,
      })
      expect(entries.filter((entry) => entry.isFile())).toHaveLength(0)
      await rm(privateRoot, { recursive: true })
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

async function signedCsv() {
  const mediaId = `csv-${randomUUID()}`
  const body = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: principal.phoneNumberId },
              messages: [
                {
                  id: `wamid.${fixture.marker}.${randomUUID()}`,
                  from: principal.senderId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "document",
                  document: {
                    id: mediaId,
                    mime_type: "text/csv",
                    sha256: digest,
                    filename: "synthetic.csv",
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
        "x-hub-signature-256": `sha256=${createHmacForFixture(body)}`,
      },
    }),
    fixture.marker,
    {
      processPlatformEvent: (event) =>
        processPlatformWhatsAppEvent(event, {
          env: process.env,
          receipt: (value) => acceptAssistantWhatsAppStatus(fixture.db, value),
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
  if (!id) throw Error("Expected exact signed CSV inbox")
  const inbox = await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
    where: { id },
  })
  expect(whatsAppMediaContentSchema.parse(inbox.content)).toMatchObject({
    type: "media",
    text: caption,
    media: {
      id: mediaId,
      mediaType: "text/csv",
      sourceType: "document",
      sha256: digest,
    },
  })
  return inbox
}

function createHmacForFixture(body: string) {
  return createHmac("sha256", "synthetic-action-webhook-secret")
    .update(body)
    .digest("hex")
}

suite(
  "actual Setup CSV app/WhatsApp processing and bytes-first retention",
  () => {
    test("keeps exact source rows through the same default job and clears only after original deletion", async () => {
      // The browser context contains the fixture's real persisted Session. The
      // linked context below is separately issued from the actual selected grant.
      const caller = setupAssistantAttachmentsRouter.createCaller(browser)
      const inbox = await signedCsv()
      const claimed = await fixture.claim(inbox.id)
      const ctx = await createLinkedAssistantContext(
        fixture.db,
        principal,
        inbox.requestId,
        claimed.lease,
      )
      expect(ctx.session.session).toBeNull()
      const defaults = await createDefaultWhatsAppMediaIngestDependencies(ctx)
      if (!defaults) throw Error("Expected canonical selected Setup ingest")
      let externalCalls = 0
      const fetchTrap = spyOn(globalThis, "fetch").mockImplementation(
        Object.assign(
          async () => {
            externalCalls += 1
            throw Error("External fetch forbidden in CSV fixture")
          },
          {
            preconnect: () => {
              externalCalls += 1
              throw Error("External preconnect forbidden in CSV fixture")
            },
          },
        ),
      )
      try {
        const jobs: string[] = []
        let downloads = 0
        const ingest = createWhatsAppMediaIngestor({
          ...defaults,
          download: async (request) => {
            downloads += 1
            expect(request.expectedMediaType).toBe("text/csv")
            expect(request.expectedSha256).toBe(digest)
            return { bytes: csv, mediaType: "text/csv" }
          },
          enqueue: async (id) => {
            jobs.push(id)
          },
        })
        const input = {
          providerMessageId: inbox.providerMessageId,
          content: inbox.content,
        }
        const uploaded = await ingest(input)
        if (uploaded.state !== "processing")
          throw Error(`Expected actual CSV upload, got ${uploaded.state}`)
        attachmentIds.add(uploaded.attachmentId)
        expect(jobs).toEqual([uploaded.attachmentId])
        const appIntent = await caller.createIntent({
          conversationId: setupId,
          clientRequestId: randomUUID(),
          fileName: "ordinary-app.csv",
          contentType: "text/csv",
          sizeBytes: csv.byteLength,
          contentDigest: digest,
        })
        if (!appIntent.ok)
          throw Error(`Expected canonical app CSV intent: ${appIntent.reason}`)
        const appId = appIntent.attachment.id
        attachmentIds.add(appId)
        const appRow = await readAssistantAttachment(fixture.db, scope, appId)
        const storage = setupAttachmentStorage("QA")
        const appTarget = setupAttachmentTarget(appRow)
        if (!storage.storeId) throw Error("Expected actual QA store")
        expect(
          await pinAssistantAttachmentStorage(fixture.db, scope, {
            attachmentId: appId,
            storageProvider: storage.provider,
            storageStoreId: storage.storeId,
            storagePath: assistantAttachmentStoragePath(appTarget),
          }),
        ).toBe(true)
        const staged = await storage.stage({ target: appTarget, bytes: csv })
        expect(
          await markAssistantAttachmentUploaded(fixture.db, {
            attachmentId: appId,
            storageProvider: storage.provider,
            storageStoreId: storage.storeId,
            storagePath: staged.storagePath,
          }),
        ).toBe(true)
        const expected = {
          type: "table",
          sheetName: null,
          columns: ["Name", "SKU", "Price", "Note"],
          rows: [
            [
              "Synthetic comma, item",
              "0007",
              "9007199254740993.125",
              "Keep exact text",
            ],
            [
              "Synthetic second",
              "0008",
              "0.000000000000000001",
              "No imported records",
            ],
          ],
          rowNumbers: [2, 4],
          totalRows: 2,
          truncated: false,
        } satisfies SetupAttachmentExtraction
        const messages = []
        for (const id of [uploaded.attachmentId, appId]) {
          const before = await readAssistantAttachment(fixture.db, scope, id)
          expect(before).toMatchObject({
            status: "UPLOADED",
            contentDigest: digest,
            contentType: "text/csv",
            sizeBytes: csv.byteLength,
            processingAttempts: 0,
            messageId: null,
            storageProvider: "local_test",
          })
          expect(
            await storage.read({ target: setupAttachmentTarget(before) }),
          ).toEqual(csv)
          expect(
            await processSetupAttachment(id, defaultAssistantAttachmentDeps()),
          ).toEqual({ status: "ready", kind: "SPREADSHEET" })
          const ready = await readAssistantAttachment(fixture.db, scope, id)
          expect(ready).toMatchObject({
            status: "READY",
            processingAttempts: 1,
            transcript: null,
            errorCode: null,
          })
          expect(setupTableExtractionSchema.parse(ready.extraction)).toEqual(
            expected,
          )
          expect(
            await processSetupAttachment(id, defaultAssistantAttachmentDeps()),
          ).toEqual({ status: "skipped" })
          const messageId = `${fixture.marker}-${id === appId ? "app" : "whatsapp"}-source`
          messageIds.add(messageId)
          const message = {
            id: messageId,
            role: "user" as const,
            parts: storedUserParts(
              [{ type: "text", text: caption }],
              [ready],
              [id],
            ),
          }
          await fixture.db.$transaction(
            async (tx) => {
              expect(
                await appendAssistantMessage(tx, {
                  conversationId: setupId,
                  message,
                }),
              ).toBe(true)
              expect(
                await claimAssistantAttachmentsForMessage(tx, {
                  conversationId: setupId,
                  actorUserId: fixture.userId,
                  messageId,
                  attachmentIds: [id],
                }),
              ).toHaveLength(1)
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
          const saved = await fixture.db.assistantMessage.findUniqueOrThrow({
            where: { id: messageId },
          })
          expect(saved.parts).toEqual(message.parts)
          const modelText = JSON.stringify(
            withAttachmentText([message], [ready]),
          )
          expect(modelText).toContain(
            "[row 2] Synthetic comma, item | 0007 | 9007199254740993.125",
          )
          expect(modelText).toContain(
            "[row 4] Synthetic second | 0008 | 0.000000000000000001",
          )
          expect(modelText).toContain("UNTRUSTED_CONTEXT")
          messages.push(message)
        }
        expect(downloads).toBe(1)
        expect(jobs).toEqual([uploaded.attachmentId])
        const usages = await fixture.db.assistantUsageEvent.findMany({
          where: { tenantId: fixture.tenantId },
        })
        expect(usages).toHaveLength(2)
        expect(new Set(usages.map((row) => row.attachmentId))).toEqual(
          attachmentIds,
        )
        for (const row of usages)
          expect(row).toMatchObject({
            provider: "ewatrade",
            model: "setup-file-parser-v1",
            requestClass: "extract",
            outcome: "success",
            runId: null,
          })
        await noEffects()
        const originals = await fixture.db.assistantAttachment.findMany({
          where: {
            id: { in: [...attachmentIds] },
            tenantId: fixture.tenantId,
            conversationId: setupId,
            actorUserId: fixture.userId,
          },
        })
        expect(originals).toHaveLength(2)
        const expiredAt = new Date(Date.now() - 1000)
        expect(
          (
            await fixture.db.assistantAttachment.updateMany({
              where: {
                id: { in: [...attachmentIds] },
                tenantId: fixture.tenantId,
                conversationId: setupId,
                actorUserId: fixture.userId,
                status: "READY",
              },
              data: { retentionUntil: expiredAt },
            })
          ).count,
        ).toBe(2)
        const expiredOriginals = await fixture.db.assistantAttachment.findMany({
          where: {
            id: { in: [...attachmentIds] },
            tenantId: fixture.tenantId,
            storeId: fixture.storeId,
            conversationId: setupId,
            actorUserId: fixture.userId,
            retentionUntil: { lt: new Date() },
            status: "READY",
          },
        })
        expect(expiredOriginals).toHaveLength(2)
        const candidates = expiredOriginals.map((row) => ({
          ...row,
          dataClassification: "QA" as const,
        }))
        const maintenance = defaultAssistantMaintenanceDeps()
        const order: string[] = []
        const deps: AssistantMaintenanceDeps = {
          ...maintenance,
          now: () => new Date(),
          // Deliberately no global maintenance or abandoned-run query on shared QA.
          failAbandonedRuns: async () => ({ failed: 0 }),
          listExpired: async () => candidates,
          removeBytes: async (row) => {
            expect(attachmentIds.has(row.id)).toBe(true)
            expect(
              await fixture.db.assistantAttachment.findUniqueOrThrow({
                where: { id: row.id },
              }),
            ).toMatchObject({ storagePath: row.storagePath, errorCode: null })
            expect(
              await storage.read({
                target: setupAttachmentTarget({
                  ...row,
                  conversationId: setupId,
                }),
              }),
            ).toEqual(csv)
            await maintenance.removeBytes(row)
            order.push(`bytes:${row.id}`)
          },
          expire: async (row) => {
            expect(order.at(-1)).toBe(`bytes:${row.id}`)
            await expect(
              storage.read({ target: setupAttachmentTarget(row) }),
            ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" })
            // Original attribution still exists until the real expire helper runs.
            expect(
              (
                await fixture.db.assistantAttachment.findUniqueOrThrow({
                  where: { id: row.id },
                })
              ).storagePath,
            ).toBe(row.storagePath)
            const result = await maintenance.expire(row)
            order.push(`row:${row.id}`)
            return result
          },
        }
        expect(await assistantMaintenanceHandler(deps)).toEqual({
          abandonedRuns: 0,
          deleted: 0,
          cleared: 2,
          kept: 0,
        })
        expect(order).toEqual(
          candidates.flatMap((row) => [`bytes:${row.id}`, `row:${row.id}`]),
        )
        for (const row of await fixture.db.assistantAttachment.findMany({
          where: { tenantId: fixture.tenantId },
        })) {
          expect(row).toMatchObject({
            errorCode: "RETENTION_EXPIRED",
            storagePath: null,
            storageProvider: null,
            storageStoreId: null,
            transcript: null,
            extraction: null,
            contentDigest: digest,
            contentType: "text/csv",
          })
          expect(messageIds.has(row.messageId ?? "")).toBe(true)
          expect(
            await processSetupAttachment(
              row.id,
              defaultAssistantAttachmentDeps(),
            ),
          ).toEqual({ status: "skipped" })
        }
        const expiredRows = await fixture.db.assistantAttachment.findMany({
          where: { tenantId: fixture.tenantId },
        })
        const visible = withExpiredAttachments(messages, attachmentIds)
        expect(JSON.stringify(visible)).toContain('"expired":true')
        const afterRetention = JSON.stringify(
          withAttachmentText(messages, expiredRows),
        )
        expect(afterRetention).toContain(
          "its content was deleted and is no longer available",
        )
        expect(afterRetention).not.toContain("9007199254740993.125")
        for (const message of messages)
          expect(
            (
              await fixture.db.assistantMessage.findUniqueOrThrow({
                where: { id: message.id },
              })
            ).parts,
          ).toEqual(message.parts)
        expect(
          await fixture.db.assistantUsageEvent.count({
            where: { tenantId: fixture.tenantId },
          }),
        ).toBe(2)
        await noEffects()
      } finally {
        fetchTrap.mockRestore()
        expect(externalCalls).toBe(0)
      }
    }, 240_000)
  },
)
