import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ProductFormSnapshot } from "@ewatrade/assistant/product/contracts"
import {
  appendAssistantMessage,
  createProductConversation,
  createSetupConversation,
  upsertSetupDraftEntitiesInTransaction,
} from "@ewatrade/db/assistant"
import {
  createAssistantAttachmentIntent,
  markAssistantAttachmentUploaded,
  pinAssistantAttachmentStorage,
} from "@ewatrade/db/assistant-attachments"
import {
  readAssistantPrivateExport,
  validateAssistantPrivateExportSnapshot,
} from "@ewatrade/db/assistant-private-export"
import { assistantAttachmentStoragePath } from "@ewatrade/private-media/assistant-attachments"
import { Hono } from "hono"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "../assistant/attachment-storage"
import { createAssistantWhatsAppActionFixture } from "../assistant/channel-action-integration-fixture"
import {
  assistantPrivateExportResponse,
  defaultAssistantPrivateExportDependencies,
} from "./assistant-export"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-own-export")
const foreignId = `${fixture.marker}-foreign-user`
const foreignChat = `${fixture.marker}-foreign-chat`
const mixedRun = `${fixture.marker}-mixed-run`
const usageId = `${fixture.marker}-usage`
const requestId = `${fixture.marker}-privacy`
const original = new TextEncoder().encode(
  "Synthetic private original document\nExact value 123.45\n",
)
const digest = createHash("sha256").update(original).digest("hex")
const previousRoot = process.env.LOCAL_PRIVATE_OBJECTS_DIR
let privateRoot = ""
let setupId = ""
let productId = ""
let attachmentId = ""
const messageIds = new Set<string>()

async function append(conversationId: string, text: string) {
  const id = `${fixture.marker}-message-${randomUUID()}`
  messageIds.add(id)
  await fixture.db.$transaction((tx) =>
    appendAssistantMessage(tx, {
      conversationId,
      message: { id, role: "user", parts: [{ type: "text", text }] },
    }),
  )
}

beforeAll(async () => {
  if (!enabled) return
  // Neutral factory enforces explicit local ewatrade_qa_v1 before creating any rows.
  await fixture.setup()
  privateRoot = await mkdtemp(join(tmpdir(), "ewatrade-own-assistant-export-"))
  process.env.LOCAL_PRIVATE_OBJECTS_DIR = privateRoot
  const { db, tenantId, storeId, userId } = fixture
  const scope = { tenantId, storeId, userId }
  const setup = await createSetupConversation(db, scope, [], {
    status: "ACTIVE",
  })
  setupId = setup.id
  if (!setup.setupDraft) throw Error("Expected owned canonical Setup draft")
  const setupDraftId = setup.setupDraft.id
  await db.$transaction((tx) =>
    upsertSetupDraftEntitiesInTransaction(tx, {
      draftId: setupDraftId,
      entities: [
        {
          key: "product:private-draft",
          kind: "PRODUCT",
          state: "PROPOSED",
          payload: {
            kind: "product",
            name: "Private staged item",
            unitName: "Piece",
            priceMinor: 12345,
          },
        },
      ],
    }),
  )
  const snapshot: ProductFormSnapshot = {
    form: {
      kind: "product",
      name: "Private Product form",
      description: "Retained local form details",
      unitName: "Piece",
      price: "123.45",
      openingStockQuantity: "",
      usage: "FOR_SALE",
    },
    storeId,
    category: "",
    illustrationId: null,
    photoAssetIds: [],
    sku: "private-sku",
    barcode: "",
    showAdvanced: true,
    showUnits: false,
    showDescription: true,
    showOpeningStock: false,
    selectedHelperKey: null,
    canonicalTransactionScale: 2,
    optionGroups: [],
    variantDrafts: {},
    additionalUnits: [],
  }
  productId = (
    await createProductConversation(db, scope, {
      id: `${fixture.marker}-product`,
      snapshot,
      seed: null,
      opening: "Own Product saved opening",
    })
  ).id
  await append(fixture.conversationId, "Own General private transcript")
  await append(setupId, "Own Setup private transcript")
  await append(productId, "Own Product private transcript")
  await db.user.create({
    data: {
      id: foreignId,
      email: `${foreignId}@example.test`,
      ageBand: "ADULT",
    },
  })
  await db.assistantConversation.create({
    data: {
      id: foreignChat,
      tenantId,
      storeId,
      ownerUserId: foreignId,
      purpose: "GENERAL",
      status: "ACTIVE",
    },
  })
  await append(foreignChat, "FOREIGN PRIVATE TEXT MUST NEVER BE EXPORTED")
  const intent = await createAssistantAttachmentIntent(db, scope, {
    conversationId: fixture.conversationId,
    kind: "TEXT",
    fileName: "private-original.txt",
    contentType: "text/plain",
    sizeBytes: original.byteLength,
    contentDigest: digest,
    maxPerConversation: 5,
    uploadWindowMs: 60_000,
    retentionMs: 3_600_000,
  })
  attachmentId = intent.id
  const storage = setupAttachmentStorage("QA")
  if (!storage.storeId) throw Error("Expected actual owned local_test store")
  const target = setupAttachmentTarget(intent)
  const storagePath = assistantAttachmentStoragePath(target)
  expect(
    await pinAssistantAttachmentStorage(db, scope, {
      attachmentId,
      storageProvider: storage.provider,
      storageStoreId: storage.storeId,
      storagePath,
    }),
  ).toBe(true)
  await storage.stage({ target, bytes: original })
  expect(
    await markAssistantAttachmentUploaded(db, {
      attachmentId,
      storageProvider: storage.provider,
      storageStoreId: storage.storeId,
      storagePath,
    }),
  ).toBe(true)
  // A synthetic saved usage row tests export projection only; no processing, model or provider is run.
  await db.assistantUsageEvent.create({
    data: {
      id: usageId,
      tenantId,
      actorUserId: userId,
      attachmentId,
      provider: "ewatrade-rehearsal",
      model: "synthetic-saved-parse",
      requestClass: "parse",
      outcome: "success",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  })
}, 120_000)

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
            expect(
              await tx.user.findUniqueOrThrow({ where: { id: foreignId } }),
            ).toMatchObject({ email: `${foreignId}@example.test` })
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
            if (!link) throw Error("Missing exact owned confirmed link")
            expect(link).toMatchObject({
              phoneNumberId: fixture.principal.phoneNumberId,
              claimedSenderId: fixture.principal.senderId,
            })
            const bootstrapId = `wa-linked_${link.id}`
            const allowed = new Map([
              [fixture.conversationId, "GENERAL"],
              [setupId, "SETUP"],
              [productId, "PRODUCT_CREATE"],
              [foreignChat, "GENERAL"],
              [bootstrapId, "GENERAL"],
            ])
            const chats = await tx.assistantConversation.findMany({
              where: { tenantId },
              include: { messages: true, setupDraft: true },
            })
            expect(chats).toHaveLength(5)
            for (const chat of chats) {
              expect(allowed.get(chat.id)).toBe(chat.purpose)
              expect(chat).toMatchObject({
                storeId,
                ownerUserId: chat.id === foreignChat ? foreignId : userId,
                status: "ACTIVE",
              })
              if (chat.id === bootstrapId)
                expect(chat).toMatchObject({
                  lastSequence: 0,
                  messages: [],
                  setupDraft: null,
                  workflowContext: null,
                })
              for (const message of chat.messages) {
                if (chat.id === productId && message.role === "assistant")
                  expect(message.parts).toEqual([
                    { type: "text", text: "Own Product saved opening" },
                  ])
                else expect(messageIds.has(message.id)).toBe(true)
              }
            }
            expect(
              await tx.assistantRun.findMany({
                where: { conversation: { tenantId } },
              }),
            ).toEqual([])
            const attachments = await tx.assistantAttachment.findMany({
              where: { tenantId },
            })
            expect(attachments).toHaveLength(1)
            expect(attachments[0]).toMatchObject({
              id: attachmentId,
              actorUserId: userId,
              storeId,
              conversationId: fixture.conversationId,
              contentDigest: digest,
              sizeBytes: original.byteLength,
              storageProvider: "local_test",
              kind: "TEXT",
              status: "UPLOADED",
            })
            expect(
              await tx.assistantUsageEvent.findMany({ where: { tenantId } }),
            ).toMatchObject([
              {
                id: usageId,
                actorUserId: userId,
                attachmentId,
                model: "synthetic-saved-parse",
              },
            ])
            const effects = await Promise.all([
              tx.assistantActionProposal.count({ where: { tenantId } }),
              tx.customer.count({ where: { tenantId } }),
              tx.catalogItem.count({ where: { tenantId } }),
              tx.commercialOrder.count({ where: { tenantId } }),
              tx.financeBook.count({ where: { tenantId } }),
              tx.stockOperation.count({ where: { tenantId } }),
              tx.serviceJob.count({ where: { tenantId } }),
              tx.assistantWhatsAppInbox.count({
                where: {
                  OR: [
                    { identity: { userId } },
                    { binding: { identity: { userId } } },
                  ],
                },
              }),
              tx.assistantBudget.count({
                where: { scopeKey: { contains: tenantId } },
              }),
            ])
            for (const count of effects) expect(count).toBe(0)
            const privacy = await tx.accountPrivacyRequest.findMany({
              where: { userId },
            })
            expect(privacy).toEqual([])
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
        const row = await db.assistantAttachment.findUniqueOrThrow({
          where: { id: attachmentId },
        })
        // Byte ownership verified before erasing database attribution. Failed removal retains all rows/root.
        await setupAttachmentStorage("QA").remove({
          target: setupAttachmentTarget(row),
        })
        const entries = await readdir(privateRoot, {
          recursive: true,
          withFileTypes: true,
        })
        expect(entries.filter((entry) => entry.isFile())).toHaveLength(0)
        await rm(privateRoot, { recursive: true })
        await db.assistantUsageEvent.deleteMany({
          where: { id: usageId, tenantId, actorUserId: userId, attachmentId },
        })
        await db.user.delete({ where: { id: foreignId } })
      } catch (cause) {
        throw new Error(
          `Own assistant export cleanup unverified; retain ${tenantId} and ${privateRoot}`,
          { cause },
        )
      }
    }
    await fixture.cleanup()
  } finally {
    if (enabled && fixture.db) await fixture.db.$disconnect()
    if (previousRoot === undefined)
      Reflect.deleteProperty(process.env, "LOCAL_PRIVATE_OBJECTS_DIR")
    else process.env.LOCAL_PRIVATE_OBJECTS_DIR = previousRoot
  }
}, 90_000)

suite("canonical own-account assistant export", () => {
  test("real Session exports exact own three-purpose history and retained bytes; foreign/shared, changed snapshot, privacy and revoked Session refuse", async () => {
    const { db, userId, tenantId, storeId } = fixture
    const browser = await fixture.browserContext()
    expect(browser.session.session?.id).toBe(fixture.sessionId)
    const deps = defaultAssistantPrivateExportDependencies()
    deps.context = async () => browser
    const app = new Hono()
    app.get("/export", (context) =>
      assistantPrivateExportResponse(context, deps),
    )
    const snapshot = await readAssistantPrivateExport(db, userId)
    expect(
      snapshot.manifest.conversations.map((row) => row.purpose).sort(),
    ).toEqual(["GENERAL", "GENERAL", "PRODUCT_CREATE", "SETUP"])
    expect(snapshot.manifest.usage).toMatchObject([
      {
        provider: "ewatrade-rehearsal",
        model: "synthetic-saved-parse",
        inputTokens: 0,
      },
    ])
    // Account export remains available independently of WhatsApp activation/enrollment.
    process.env.ASSISTANT_WHATSAPP_ENABLED = "false"
    const response = await app.request("/export")
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("content-disposition")).toContain("attachment;")
    const body = await response.json()
    expect(body.scope).toBe("own_private_assistant")
    expect(body.originals).toEqual([
      {
        attachmentId,
        availability: "available",
        encoding: "base64",
        content: Buffer.from(original).toString("base64"),
      },
    ])
    const text = JSON.stringify(body)
    for (const value of [
      "Own General private transcript",
      "Own Setup private transcript",
      "Own Product private transcript",
      "Private staged item",
      "Private Product form",
      "123.45",
      "synthetic-saved-parse",
    ])
      expect(text).toContain(value)
    for (const forbidden of [
      "FOREIGN PRIVATE TEXT",
      foreignId,
      "storagePath",
      "storageStoreId",
      "contentDigest",
      "handoffDigest",
      "snapshotDigest",
      browser.session.session?.token ?? "MISSING_SESSION",
      privateRoot,
    ])
      expect(text).not.toContain(forbidden)
    await append(
      fixture.conversationId,
      "New canonical saved message after export snapshot",
    )
    await expect(
      validateAssistantPrivateExportSnapshot(
        db,
        userId,
        snapshot.snapshotDigest,
      ),
    ).rejects.toMatchObject({ code: "SCOPE_CHANGED" })
    // A real foreign-actor run on this own chat is explicit shared scope, never silently exported.
    await db.assistantRun.create({
      data: {
        id: mixedRun,
        conversationId: fixture.conversationId,
        actorUserId: foreignId,
        requestId: mixedRun,
        provider: "ewatrade-rehearsal",
        model: "synthetic-owned-attribution-check",
        promptVersion: "export-fixture",
        status: "FAILED",
        completedAt: new Date(),
      },
    })
    await expect(readAssistantPrivateExport(db, userId)).rejects.toMatchObject({
      code: "SHARED_SCOPE_REVIEW_REQUIRED",
    })
    const shared = await app.request("/export")
    expect(shared.status).toBe(403)
    expect(await shared.text()).not.toContain("FOREIGN PRIVATE TEXT")
    expect(
      await db.assistantRun.deleteMany({
        where: {
          id: mixedRun,
          conversationId: fixture.conversationId,
          actorUserId: foreignId,
        },
      }),
    ).toMatchObject({ count: 1 })
    // Only synthetic state is seeded; this is an actual read fence, not a deletion workflow claim.
    await db.accountPrivacyRequest.create({
      data: {
        id: requestId,
        requestKey: `account-deletion:${userId}`,
        userId,
        verifiedSubjectUserId: userId,
        verifiedAt: new Date(),
        status: "PROCESSING",
      },
    })
    expect((await app.request("/export")).status).toBe(403)
    await expect(readAssistantPrivateExport(db, userId)).rejects.toMatchObject({
      code: "PRIVACY_BLOCKED",
    })
    expect(
      await db.accountPrivacyRequest.deleteMany({
        where: {
          id: requestId,
          userId,
          verifiedSubjectUserId: userId,
          requestKey: `account-deletion:${userId}`,
          status: "PROCESSING",
        },
      }),
    ).toMatchObject({ count: 1 })
    expect(
      await db.session.deleteMany({ where: { id: fixture.sessionId, userId } }),
    ).toMatchObject({ count: 1 })
    const revoked = await app.request("/export")
    expect(revoked.status).toBe(401)
    expect(revoked.headers.get("content-disposition")).toBeNull()
    expect(await revoked.text()).not.toContain("Own General private transcript")
    expect(
      await db.assistantAttachment.findUniqueOrThrow({
        where: { id: attachmentId },
      }),
    ).toMatchObject({
      tenantId,
      storeId,
      actorUserId: userId,
      status: "UPLOADED",
    })
  }, 300_000)
})
