import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { processSetupAttachment } from "@ewatrade/assistant/setup/attachment-processing"
import {
  SETUP_ATTACHMENT_PART,
  setupAttachmentExtractionSchema,
} from "@ewatrade/assistant/setup/attachments"
import {
  appendAssistantMessage,
  assistantBudgetScopeKey,
} from "@ewatrade/db/assistant"
import {
  claimAssistantAttachmentsForMessage,
  readAssistantAttachment,
} from "@ewatrade/db/assistant-attachments"
import {
  acceptAssistantWhatsAppIngress,
  acceptAssistantWhatsAppStatus,
  claimAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
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
import { storedUserParts, withAttachmentText } from "../chat-attachments"
import { generalBudgetScopeKey } from "../general-allowance"
import {
  createDefaultWhatsAppMediaIngestDependencies,
  createWhatsAppMediaIngestor,
} from "./ingest"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-pdf-provenance")
const flags = [
  "ASSISTANT_REHEARSAL_MODE",
  "ASSISTANT_WHATSAPP_MEDIA_ENABLED",
  "LOCAL_PRIVATE_OBJECTS_DIR",
] as const
const previous = new Map(flags.map((key) => [key, process.env[key]]))
const scope = {
  tenantId: fixture.tenantId,
  storeId: fixture.storeId,
  userId: fixture.userId,
}
const pageTexts = [
  "Synthetic receipt 0007 amount 9007199254740993.125",
  "Synthetic page two quantity 0.000000000000000001",
]
const caption = "Read the original page text only; do not create any records."
let privateRoot = ""
let attachmentId = ""
let savedMessageId: string | null = null

/** Valid ASCII PDF with two separate page/content objects and accurate xref offsets. */
function syntheticPdf() {
  const stream = (text: string) => `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const contents = pageTexts.map(stream)
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
    `<< /Length ${contents[0]?.length} >>\nstream\n${contents[0]}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
    `<< /Length ${contents[1]?.length} >>\nstream\n${contents[1]}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let body = "%PDF-1.4\n"
  const offsets: number[] = []
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(body)
}
const pdf = syntheticPdf()
const digest = createHash("sha256").update(pdf).digest("hex")

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  privateRoot = await mkdtemp(join(tmpdir(), "ewatrade-wa-pdf-"))
  process.env.LOCAL_PRIVATE_OBJECTS_DIR = privateRoot
  process.env.ASSISTANT_REHEARSAL_MODE = "true"
  process.env.ASSISTANT_WHATSAPP_MEDIA_ENABLED = "true"
}, 90_000)

async function noEffects() {
  const { db, tenantId } = fixture
  for (const count of await Promise.all([
    db.assistantRun.count({ where: { conversation: { tenantId } } }),
    db.assistantActionProposal.count({ where: { tenantId } }),
    db.customer.count({ where: { tenantId } }),
    db.catalogItem.count({ where: { tenantId } }),
    db.commercialOrder.count({ where: { tenantId } }),
    db.financeBook.count({ where: { tenantId } }),
    db.stockOperation.count({ where: { tenantId } }),
    db.serviceJob.count({ where: { tenantId } }),
    db.businessActivityEvent.count({ where: { tenantId } }),
    db.assistantTranscriptionAttempt.count({
      where: { attachment: { tenantId } },
    }),
  ]))
    expect(count).toBe(0)
  expect(
    await db.assistantBudget.findMany({
      where: {
        scopeKey: {
          in: [
            assistantBudgetScopeKey(tenantId, "SETUP"),
            generalBudgetScopeKey({ tenantId }),
          ],
        },
      },
    }),
  ).toEqual([])
}

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      const { db, tenantId, storeId, userId } = fixture
      try {
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
        if (!link) throw Error("Exact owned confirmed link required")
        expect(link).toMatchObject({
          phoneNumberId: fixture.principal.phoneNumberId,
          claimedSenderId: fixture.principal.senderId,
        })
        const chats = await db.assistantConversation.findMany({
          where: { tenantId },
          include: {
            messages: true,
            setupDraft: true,
            _count: { select: { runs: true, proposals: true } },
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
            _count: { runs: 0, proposals: 0 },
          })
          for (const message of chat.messages)
            expect(message).toMatchObject({
              id: savedMessageId,
              role: "user",
              conversationId: fixture.conversationId,
            })
          if (chat.id !== fixture.conversationId)
            expect(chat).toMatchObject({ lastSequence: 0, messages: [] })
        }
        const rows = await db.assistantAttachment.findMany({
          where: { tenantId },
        })
        expect(rows.length).toBeLessThanOrEqual(1)
        for (const row of rows)
          expect(row).toMatchObject({
            id: attachmentId,
            actorUserId: userId,
            storeId,
            conversationId: fixture.conversationId,
            kind: "PDF",
            contentType: "application/pdf",
            contentDigest: digest,
            sizeBytes: pdf.byteLength,
            messageId: savedMessageId,
            storageProvider: "local_test",
            storageStoreId: "store_localtest",
          })
        for (const usage of await db.assistantUsageEvent.findMany({
          where: { tenantId },
        }))
          expect(usage).toMatchObject({
            attachmentId,
            actorUserId: userId,
            runId: null,
            provider: "ewatrade",
            model: "setup-file-parser-v1",
            requestClass: "extract",
            outcome: "success",
            inputTokens: null,
            outputTokens: null,
            totalTokens: null,
            audioSeconds: null,
            imageCount: null,
          })
        await noEffects()
        // Originals are absent before any owning row is removed. No global maintenance runs.
        for (const row of rows) {
          const storage = setupAttachmentStorage("QA")
          await storage.remove({ target: setupAttachmentTarget(row) })
          await expect(
            storage.read({ target: setupAttachmentTarget(row) }),
          ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" })
        }
        if (privateRoot) {
          const entries = await readdir(privateRoot, {
            recursive: true,
            withFileTypes: true,
          })
          expect(entries.filter((entry) => entry.isFile())).toHaveLength(0)
          await rm(privateRoot, { recursive: true })
        }
      } catch (error) {
        await db.$disconnect()
        throw new Error(
          `PDF cleanup unverified; retained fixture ${tenantId} and private root ${privateRoot}`,
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

/** Actual signed provider metadata, with only downstream ID enqueue captured. */
async function signedPdf() {
  const providerMessageId = `wamid.${fixture.marker}.${randomUUID()}`
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
                  type: "document",
                  document: {
                    id: `pdf-${randomUUID()}`,
                    mime_type: "application/pdf",
                    sha256: digest,
                    filename: "synthetic-two-pages.pdf",
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
  if (!id) throw Error("One owned signed PDF ingress required")
  return fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({ where: { id } })
}

suite("actual WhatsApp PDF default parser and original provenance", () => {
  test("preserves exact page positions and numeric text through private bytes, default processing and saved untrusted attachment context", async () => {
    let externalCalls = 0
    const refuse = () => {
      externalCalls += 1
      throw Error("External fetch forbidden in PDF fixture")
    }
    const fetchTrap = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(async () => refuse(), { preconnect: refuse }),
    )
    try {
      const { db, tenantId, userId, storeId } = fixture
      expect(process.env.ASSISTANT_REHEARSAL_MODE).toBe("true")
      const inbox = await signedPdf()
      const claimed = await fixture.claim(inbox.id)
      const ctx = await createLinkedAssistantContext(
        db,
        fixture.principal,
        inbox.requestId,
        claimed.lease,
      )
      expect(ctx.session.session).toBeNull()
      const defaults = await createDefaultWhatsAppMediaIngestDependencies(ctx)
      if (!defaults)
        throw Error("Actual linked GENERAL media dependencies required")
      const jobs: string[] = []
      let downloads = 0
      const ingest = createWhatsAppMediaIngestor({
        ...defaults,
        download: async (request) => {
          downloads += 1
          expect(request.expectedMediaType).toBe("application/pdf")
          expect(request.expectedSha256).toBe(digest)
          return { bytes: pdf, mediaType: "application/pdf" }
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
        throw Error(`Expected PDF upload, got ${uploaded.state}`)
      attachmentId = uploaded.attachmentId
      expect(jobs).toEqual([attachmentId])
      const original = await readAssistantAttachment(db, scope, attachmentId)
      expect(original).toMatchObject({
        tenantId,
        storeId,
        actorUserId: userId,
        conversationId: fixture.conversationId,
        kind: "PDF",
        contentType: "application/pdf",
        status: "UPLOADED",
        processingAttempts: 0,
        contentDigest: digest,
        sizeBytes: pdf.byteLength,
        storageProvider: "local_test",
        transcript: null,
        messageId: null,
      })
      expect(
        await setupAttachmentStorage("QA").read({
          target: setupAttachmentTarget(original),
        }),
      ).toEqual(pdf)
      expect(
        await processSetupAttachment(
          attachmentId,
          defaultAssistantAttachmentDeps(),
        ),
      ).toEqual({ status: "ready", kind: "PDF" })
      const ready = await readAssistantAttachment(db, scope, attachmentId)
      expect(ready).toMatchObject({
        status: "READY",
        processingAttempts: 1,
        transcript: null,
        errorCode: null,
        messageId: null,
      })
      expect(setupAttachmentExtractionSchema.parse(ready.extraction)).toEqual({
        type: "pages",
        pages: pageTexts.map((text, index) => ({ page: index + 1, text })),
        totalPages: 2,
        truncated: false,
      })
      expect(
        await processSetupAttachment(
          attachmentId,
          defaultAssistantAttachmentDeps(),
        ),
      ).toEqual({ status: "skipped" })
      expect(await ingest(input)).toEqual({
        state: "ready",
        attachmentId,
        kind: "PDF",
        parts: [
          { type: "text", text: caption },
          { type: SETUP_ATTACHMENT_PART, data: { attachmentId } },
        ],
      })
      expect(downloads).toBe(1)
      expect(jobs).toEqual([attachmentId])
      savedMessageId = inbox.userMessageId
      const message = {
        id: savedMessageId,
        role: "user" as const,
        parts: storedUserParts(
          [{ type: "text", text: caption }],
          [ready],
          [attachmentId],
        ),
      }
      await db.$transaction(
        async (tx) => {
          expect(
            await appendAssistantMessage(tx, {
              conversationId: fixture.conversationId,
              message,
            }),
          ).toBe(true)
          expect(
            await claimAssistantAttachmentsForMessage(tx, {
              conversationId: fixture.conversationId,
              actorUserId: userId,
              messageId: message.id,
              attachmentIds: [attachmentId],
            }),
          ).toHaveLength(1)
        },
        { maxWait: 10_000, timeout: 30_000 },
      )
      const saved = await db.assistantMessage.findUniqueOrThrow({
        where: { id: message.id },
      })
      expect(saved.parts).toEqual(message.parts)
      const attributed = await readAssistantAttachment(db, scope, attachmentId)
      expect(attributed.messageId).toBe(message.id)
      expect(
        await setupAttachmentStorage("QA").read({
          target: setupAttachmentTarget(attributed),
        }),
      ).toEqual(pdf)
      const context = JSON.stringify(
        withAttachmentText([message], [attributed]),
      )
      expect(context).toContain("UNTRUSTED_CONTEXT")
      expect(context).toContain(`[page 1]\\n${pageTexts[0]}`)
      expect(context).toContain(`[page 2]\\n${pageTexts[1]}`)
      const usages = await db.assistantUsageEvent.findMany({
        where: { tenantId },
      })
      expect(usages).toHaveLength(1)
      expect(usages[0]).toMatchObject({
        attachmentId,
        actorUserId: userId,
        runId: null,
        provider: "ewatrade",
        model: "setup-file-parser-v1",
        requestClass: "extract",
        outcome: "success",
        totalTokens: null,
      })
      await noEffects()
    } finally {
      fetchTrap.mockRestore()
      expect(externalCalls).toBe(0)
    }
  }, 240_000)
})
