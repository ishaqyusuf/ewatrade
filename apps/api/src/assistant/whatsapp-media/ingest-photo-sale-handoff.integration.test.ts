import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  generalReceiptSchema,
  simpleExpenseAction,
  simpleExpenseStep,
  simpleMoneyInAction,
  simpleMoneyInStep,
  simpleSaleAction,
  simpleSaleStep,
  simpleTransferAction,
  simpleTransferStep,
} from "@ewatrade/assistant/general/contracts"
import { processSetupAttachment } from "@ewatrade/assistant/setup/attachment-processing"
import { readAssistantAttachment } from "@ewatrade/db/assistant-attachments"
import {
  acceptAssistantWhatsAppIngress,
  acceptAssistantWhatsAppStatus,
  claimAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
  settleAssistantWhatsAppInbox,
} from "@ewatrade/db/assistant-whatsapp"
import { prisma as processingDb } from "@ewatrade/db/client"
import { createFinanceBookInTransaction } from "@ewatrade/db/queries"
import { createLocalTestPrivateObjectPort } from "@ewatrade/private-media/local-test-object-port"
import {
  createOrderAttachmentStorage,
  orderAttachmentStoragePath,
} from "@ewatrade/private-media/order-attachments"
import { financePostingCommandId } from "../../../../../packages/db/src/queries/finance/commands"
import { defaultAssistantAttachmentDeps } from "../../../../../packages/jobs/src/handlers/assistant-attachment-process"
import { processPlatformWhatsAppEvent } from "../../communications/whatsapp-platform-runtime"
import { handleWhatsAppWebhookRequest } from "../../communications/whatsapp-runtime"
import { assistantRouter } from "../../trpc/routers/assistant"
import { financeRouter } from "../../trpc/routers/finance"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "../attachment-storage"
import { createAssistantWhatsAppActionFixture } from "../channel-action-integration-fixture"
import { prepareAssistantWhatsAppMediaTurn } from "../channel-media-turn"
import { createLinkedAssistantContext } from "../channel-principal"
import { buildChannelProposalReview } from "../channel-proposal-review"
import { prepareAssistantWhatsAppReview } from "../channel-review-staging"
import { generalBudgetScopeKey } from "../general-allowance"
import { createGeneralAssistantTurn } from "../general-turn"
import {
  createDefaultWhatsAppMediaIngestDependencies,
  createWhatsAppMediaIngestor,
} from "./ingest"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-cashflow-photo")
const flags = [
  "ASSISTANT_WHATSAPP_MEDIA_ENABLED",
  "ASSISTANT_REHEARSAL_MODE",
  "LOCAL_PRIVATE_OBJECTS_DIR",
  "DASHBOARD_URL",
] as const
const previous = new Map(flags.map((key) => [key, process.env[key]]))
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lK0AAAAASUVORK5CYII=",
    "base64",
  ),
)
const digest = createHash("sha256").update(png).digest("hex")
const origin = "https://dash.example.test"
const rows = [
  { action: "sale_record", caption: "Sale received 125 account: cash" },
  {
    action: "expense_record_simple",
    caption: "Spent 50 on transport from Shop cash",
  },
  { action: "money_in_record", caption: "Put 75 into Shop cash" },
  {
    action: "money_transfer_simple",
    caption: "Move 25 from Shop cash to Bank account",
  },
] as const
// An explicit narrow rerun can join the fourth original to its actual app edit.
// The default remains the complete four-photo case; no implicit filtered pass.
const selectedCase = process.env.ASSISTANT_PHOTO_HANDOFF_CASE
if (selectedCase !== undefined && selectedCase !== "transfer")
  throw Error(
    "Unknown ASSISTANT_PHOTO_HANDOFF_CASE; use transfer or leave unset",
  )
const selectedRows =
  selectedCase === "transfer"
    ? rows.filter((row) => row.action === "money_transfer_simple")
    : rows
const expectedSales = selectedRows.some((row) => row.action === "sale_record")
  ? 1
  : 0
const originalIds = new Set<string>()
const proposalIds = new Set<string>()
const runIds = new Set<string>()
const inboxIds = new Set<string>()
let privateRoot = ""
let bookId = ""
let saleOrderId = ""
let saleProposalId = ""
let copiedId = ""
const scope = {
  tenantId: fixture.tenantId,
  storeId: fixture.storeId,
  userId: fixture.userId,
}
const budgetKey = generalBudgetScopeKey(scope)

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  privateRoot = await mkdtemp(join(tmpdir(), "ewatrade-wa-cashflow-photo-"))
  process.env.LOCAL_PRIVATE_OBJECTS_DIR = privateRoot
  process.env.ASSISTANT_WHATSAPP_MEDIA_ENABLED = "true"
  process.env.ASSISTANT_REHEARSAL_MODE = "true"
  process.env.DASHBOARD_URL = origin
  bookId = (
    await fixture.db.$transaction(
      (tx) =>
        createFinanceBookInTransaction(tx, {
          tenantId: fixture.tenantId,
          actorUserId: fixture.userId,
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
      { maxWait: 10_000, timeout: 30_000 },
    )
  ).id
}, 90_000)

async function signedPhoto(caption: string) {
  const principal = fixture.principal
  const mediaId = `cashflow-photo-${randomUUID()}`
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
                  type: "image",
                  image: {
                    id: mediaId,
                    mime_type: "image/png",
                    sha256: digest,
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
  if (!id) throw Error("Expected exact signed original-photo inbox")
  inboxIds.add(id)
  return fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({ where: { id } })
}

/** Quick sales canonically provision exactly one hidden charge-only Service, never stock. */
async function assertCanonicalHiddenSale() {
  const { db, tenantId, storeId } = fixture
  const items = await db.catalogItem.findMany({
    where: { tenantId },
    include: {
      product: true,
      service: true,
      variants: true,
      offerings: {
        include: {
          productUnitOffering: true,
          serviceOffering: true,
          storeAvailability: true,
        },
      },
    },
  })
  expect(items).toHaveLength(saleOrderId ? 1 : 0)
  if (!saleOrderId) return
  const item = items[0]
  if (!item) throw Error("Canonical quick-sale hidden item required")
  expect(item).toMatchObject({
    tenantId,
    kind: "SERVICE",
    systemRole: "QUICK_SALE",
    slug: "system-quick-sale",
    name: "Quick sale",
    status: "ACTIVE",
    product: null,
  })
  expect(item.service?.catalogItemId).toBe(item.id)
  expect(item.variants).toHaveLength(1)
  const variant = item.variants[0]
  if (!variant) throw Error("Canonical hidden Default variant required")
  expect(variant).toMatchObject({
    catalogItemId: item.id,
    key: "default",
    name: "Default",
    isDefault: true,
    status: "ACTIVE",
  })
  expect(item.offerings).toHaveLength(1)
  const offering = item.offerings[0]
  if (!offering) throw Error("Canonical hidden NGN offering required")
  expect(offering).toMatchObject({
    tenantId,
    catalogItemId: item.id,
    variantId: variant.id,
    key: "default-ngn",
    kind: "SERVICE",
    name: "Quick sale",
    pricingPolicy: "ORDER_TOTAL",
    currencyCode: "NGN",
    status: "ACTIVE",
    productUnitOffering: null,
  })
  expect(offering.serviceOffering).toMatchObject({
    offeringId: offering.id,
    workPolicy: "CHARGE_ONLY",
    authorizationPolicy: "ON_ORDER_CONFIRMATION",
  })
  expect(offering.storeAvailability).toHaveLength(1)
  expect(offering.storeAvailability[0]).toMatchObject({
    offeringId: offering.id,
    storeId,
    isAvailable: true,
  })
  const lines = await db.commercialOrderLine.findMany({
    where: { order: { tenantId } },
    include: { snapshot: true },
  })
  expect(lines).toHaveLength(1)
  const line = lines[0]
  if (!line) throw Error("Exact sale line must own the hidden offering")
  expect(line).toMatchObject({
    orderId: saleOrderId,
    offeringId: offering.id,
    kind: "SERVICE",
    unitPriceMinor: null,
    totalMinor: 12500,
  })
  expect(line.quantity.toFixed()).toBe("1")
  expect(line.snapshot).toMatchObject({
    catalogItemId: item.id,
    offeringId: offering.id,
    variantId: variant.id,
    customLineRole: "QUICK_SALE",
    serviceWorkPolicy: "CHARGE_ONLY",
    serviceAuthorizationPolicy: "ON_ORDER_CONFIRMATION",
    inventoryUnitId: null,
    configurationVersionId: null,
    balanceSourceId: null,
  })
  expect(await db.stockBalanceSource.count({ where: { tenantId } })).toBe(0)
  expect(await db.catalogCommandReceipt.count({ where: { tenantId } })).toBe(0)
}

async function noOtherDomains() {
  await assertCanonicalHiddenSale()
  const db = fixture.db
  const tenantId = fixture.tenantId
  for (const count of await Promise.all([
    db.customer.count({ where: { tenantId } }),
    db.customerLedgerEntry.count({ where: { tenantId } }),
    db.customerLedgerAccount.count({ where: { tenantId } }),
    db.stockOperation.count({ where: { tenantId } }),
    db.serviceJob.count({ where: { tenantId } }),
    db.financeBill.count({ where: { bookId } }),
    db.financeBillPayment.count({ where: { bookId } }),
    db.assistantTranscriptionAttempt.count({
      where: { attachment: { tenantId } },
    }),
    db.financePeriod.count({ where: { bookId } }),
  ]))
    expect(count).toBe(0)
}

async function cleanupOwnedPhotoSale() {
  const { db, tenantId, storeId, userId, conversationId } = fixture
  // Validate ownership and domain effects before physical deletion; keep every
  // row and private-root attribution if any guard or byte removal fails.
  const owned = await db.$transaction(
    async (tx) => {
      expect(
        await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      ).toMatchObject({
        slug: tenantId,
        dataClassification: "QA",
        qaSourceDomain: "assistant-action-confirmation.test",
      })
      expect(
        await tx.user.findUniqueOrThrow({ where: { id: userId } }),
      ).toMatchObject({ email: `${fixture.marker}@example.test` })
      const links = await tx.assistantWhatsAppLink.findMany({
        where: {
          tenantId,
          storeId,
          userId,
          membershipId: fixture.membershipId,
          confirmedAt: { not: null },
          phoneNumberId: fixture.principal.phoneNumberId,
          claimedSenderId: fixture.principal.senderId,
        },
      })
      expect(links).toHaveLength(1)
      const link = links[0]
      if (!link)
        throw Error("Exact confirmed synthetic link required before cleanup")
      const chats = await tx.assistantConversation.findMany({
        where: { tenantId },
        include: { setupDraft: true },
      })
      expect(chats).toHaveLength(2)
      for (const chat of chats) {
        expect([conversationId, `wa-linked_${link.id}`]).toContain(chat.id)
        expect(chat).toMatchObject({
          tenantId,
          storeId,
          ownerUserId: userId,
          purpose: "GENERAL",
          status: "ACTIVE",
          setupDraft: null,
          workflowContext: null,
        })
      }
      for (const inbox of await tx.assistantWhatsAppInbox.findMany({
        where: { binding: { identity: { userId } } },
      })) {
        expect(inboxIds.has(inbox.id)).toBe(true)
        expect(inbox).toMatchObject({ kind: "TURN", identityId: null })
      }
      const proposals = await tx.assistantActionProposal.findMany({
        where: { tenantId },
      })
      expect(proposals.length).toBeLessThanOrEqual(selectedRows.length)
      for (const proposal of proposals) {
        expect(proposalIds.has(proposal.id)).toBe(true)
        expect(proposal).toMatchObject({
          actorUserId: userId,
          storeId,
          conversationId,
        })
        expect(selectedRows.some((row) => row.action === proposal.action)).toBe(
          true,
        )
      }
      const sale = proposals.find((row) => row.id === saleProposalId)
      const orders = await tx.commercialOrder.findMany({ where: { tenantId } })
      expect(orders.length).toBeLessThanOrEqual(expectedSales)
      for (const order of orders) {
        if (!sale) throw Error("Order requires exact owned sale proposal")
        expect(order).toMatchObject({
          id: saleOrderId,
          storeId,
          createdByUserId: userId,
          clientOrderId: sale.idempotencyKey,
          totalMinor: 12500,
          amountPaidMinor: 12500,
        })
      }
      const originals = await tx.assistantAttachment.findMany({
        where: { tenantId },
      })
      expect(originals.length).toBeLessThanOrEqual(selectedRows.length)
      for (const row of originals) {
        expect(originalIds.has(row.id)).toBe(true)
        expect(row).toMatchObject({
          conversationId,
          storeId,
          actorUserId: userId,
          kind: "IMAGE",
          contentType: "image/png",
          contentDigest: digest,
          sizeBytes: png.byteLength,
          storageProvider: "local_test",
          storageStoreId: "store_localtest",
        })
      }
      const copies = await tx.commercialOrderAttachment.findMany({
        where: { tenantId },
        include: { activity: true },
      })
      expect(copies.length).toBeLessThanOrEqual(expectedSales)
      for (const row of copies) {
        if (!sale) throw Error("Copied original requires exact sale source")
        expect(row).toMatchObject({
          id: copiedId,
          orderId: saleOrderId,
          kind: "IMAGE",
          status: "READY",
          contentType: "image/png",
          contentDigest: digest,
          sizeBytes: png.byteLength,
          storageProvider: "local_test",
          storageStoreId: "store_localtest",
        })
        expect(row.activity).toMatchObject({
          tenantId,
          orderId: saleOrderId,
          actorUserId: userId,
          source: "assistant",
        })
        expect(
          row.activity.clientActivityId.startsWith(
            `${sale.idempotencyKey}:image:`,
          ),
        ).toBe(true)
        expect(row.storagePath).toBe(
          orderAttachmentStoragePath({
            tenantId,
            orderId: row.orderId,
            attachmentId: row.id,
            contentDigest: digest,
            contentType: row.contentType,
            sizeBytes: row.sizeBytes,
          }),
        )
      }
      const books = await tx.financeBook.findMany({ where: { tenantId } })
      expect(books).toHaveLength(1)
      expect(books[0]).toMatchObject({
        id: bookId,
        createdById: userId,
        currencyCode: "NGN",
      })
      const commands = await tx.financeCommand.findMany({ where: { bookId } })
      for (const row of commands) expect(row.actorUserId).toBe(userId)
      const entries = await tx.financeJournalEntry.findMany({
        where: { bookId },
      })
      const paymentsForSources = await tx.commercialOrderPayment.findMany({
        where: { tenantId },
      })
      const paymentSourceIds = new Set(paymentsForSources.map((row) => row.id))
      const expectedCommandIds = new Set<string>()
      expect(entries).toHaveLength(paymentsForSources.length)
      for (const entry of entries) {
        expect(entry.sourceKind).toBe("COMMERCIAL_ORDER_COLLECTION")
        expect(paymentSourceIds.has(entry.sourceId)).toBe(true)
        expectedCommandIds.add(
          financePostingCommandId(
            `order-collection:${entry.sourceId}`,
            "posting",
          ),
        )
      }
      expect(commands.length).toBe(entries.length)
      for (const command of commands)
        expect(expectedCommandIds.has(command.clientCommandId)).toBe(true)
      for (const row of entries)
        expect(row).toMatchObject({ actorUserId: userId, storeId })
      const payments = await tx.commercialOrderPayment.findMany({
        where: { tenantId },
      })
      expect(payments.length).toBeLessThanOrEqual(expectedSales)
      for (const row of payments)
        expect(row).toMatchObject({
          storeId,
          recordedByUserId: userId,
          orderId: saleOrderId,
          amountMinor: 12500,
        })
      const activities = await tx.commercialOrderActivity.findMany({
        where: { tenantId },
      })
      expect(activities.length).toBeLessThanOrEqual(expectedSales)
      for (const row of activities)
        expect(row).toMatchObject({ orderId: saleOrderId, actorUserId: userId })
      const events = await tx.businessActivityEvent.findMany({
        where: { tenantId },
      })
      expect(events).toHaveLength(0)
      const runs = await tx.assistantRun.findMany({
        where: { conversation: { tenantId } },
      })
      for (const row of runs) {
        expect(runIds.has(row.id)).toBe(true)
        expect(row).toMatchObject({
          conversationId,
          actorUserId: userId,
          provider: "ewatrade-rehearsal",
          model: "rehearsal-v1",
        })
      }
      for (const usage of await tx.assistantUsageEvent.findMany({
        where: { tenantId },
      })) {
        expect(runIds.has(usage.runId ?? "")).toBe(true)
        expect(usage).toMatchObject({
          actorUserId: userId,
          provider: "ewatrade-rehearsal",
          attachmentId: null,
          audioSeconds: null,
          imageCount: null,
        })
      }
      return {
        originals,
        copies,
        orderIds: orders.map((row) => row.id),
        commandIds: commands.map((row) => row.id),
        entryIds: entries.map((row) => row.id),
        paymentIds: payments.map((row) => row.id),
        activityIds: activities.map((row) => row.id),
        eventIds: events.map((row) => row.id),
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
  await noOtherDomains()
  for (const row of owned.originals)
    await setupAttachmentStorage("QA").remove({
      target: setupAttachmentTarget(row),
    })
  const local = createLocalTestPrivateObjectPort<string>({
    rootDir: privateRoot,
  })
  if (!local.port.delete)
    throw Error(
      "Canonical QA original deletion is unavailable; retain attribution",
    )
  for (const row of owned.copies) {
    const target = {
      tenantId,
      orderId: row.orderId,
      attachmentId: row.id,
      contentDigest: row.contentDigest,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
    }
    const path = orderAttachmentStoragePath(target)
    expect(row.storageProvider).toBe("local_test")
    expect(row.storageStoreId).toBe(local.storeId)
    expect(row.storagePath).toBe(path)
    await local.port.delete(path, { abortSignal: AbortSignal.timeout(30_000) })
    await expect(
      createOrderAttachmentStorage("QA").read({ target }),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" })
  }
  expect(
    (
      await readdir(privateRoot, { recursive: true, withFileTypes: true })
    ).filter((entry) => entry.isFile()),
  ).toHaveLength(0)
  await db.$transaction(
    async (tx) => {
      for (const row of owned.originals)
        expect(
          await tx.assistantAttachment.findUniqueOrThrow({
            where: { id: row.id },
          }),
        ).toMatchObject(row)
      for (const row of owned.copies)
        expect(
          await tx.commercialOrderAttachment.findUniqueOrThrow({
            where: { id: row.id },
          }),
        ).toMatchObject({
          tenantId,
          orderId: row.orderId,
          storagePath: row.storagePath,
          contentDigest: row.contentDigest,
        })
      await tx.businessActivityEvent.deleteMany({
        where: { tenantId, id: { in: owned.eventIds } },
      })
      await tx.commercialOrderAttachment.deleteMany({
        where: { tenantId, id: { in: owned.copies.map((row) => row.id) } },
      })
      await tx.commercialOrderPayment.deleteMany({
        where: { tenantId, id: { in: owned.paymentIds } },
      })
      await tx.commercialOrderActivity.deleteMany({
        where: { tenantId, id: { in: owned.activityIds } },
      })
      await tx.commercialOrder.deleteMany({
        where: { tenantId, id: { in: owned.orderIds } },
      })
      await tx.financeCommand.deleteMany({
        where: { bookId, id: { in: owned.commandIds } },
      })
      await tx.financeJournalLine.deleteMany({
        where: { bookId, entryId: { in: owned.entryIds } },
      })
      await tx.financeJournalEntry.deleteMany({
        where: { bookId, id: { in: owned.entryIds } },
      })
      await tx.financeAccount.deleteMany({ where: { bookId } })
      await tx.financeBook.deleteMany({ where: { tenantId, id: bookId } })
      const budget = await tx.assistantBudget.findUnique({
        where: { scopeKey: budgetKey },
      })
      if (budget) {
        expect(budget.requests).toBe(runIds.size)
        expect(budget.tokens).toBe(0)
        await tx.assistantBudget.delete({ where: { scopeKey: budgetKey } })
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
  await rm(privateRoot, { recursive: true })
}

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      try {
        await cleanupOwnedPhotoSale()
      } catch (cause) {
        await fixture.db.$disconnect()
        throw new Error(
          `Photo cashflow cleanup unverified; retained fixture ${fixture.tenantId} and ${privateRoot}`,
          { cause },
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

suite(
  "original WhatsApp photos in all four supported simple cashflow app reviews",
  () => {
    test(selectedCase === "transfer"
      ? "transfer-only: retains the original through actual destination selection, fresh review and Cancel replay"
      : "retains four originals without analysis, preserves exact app continuation and copies only the confirmed sale into Order Notes & photos", async () => {
      const { db, tenantId, userId, storeId, conversationId } = fixture
      let externalCalls = 0
      const fetchTrap = spyOn(globalThis, "fetch").mockImplementation(
        Object.assign(
          async () => {
            externalCalls += 1
            throw Error("External fetch forbidden in original-photo fixture")
          },
          {
            preconnect: () => {
              externalCalls += 1
              throw Error(
                "External preconnect forbidden in original-photo fixture",
              )
            },
          },
        ),
      )
      try {
        const browser = await fixture.browserContext()
        expect(browser.session.session?.id).toBe(fixture.sessionId)
        const caller = assistantRouter.createCaller(browser)
        let downloads = 0
        const queued: string[] = []
        for (const row of selectedRows) {
          const inbox = await signedPhoto(row.caption)
          const claimed = await fixture.claim(inbox.id)
          const ctx = await createLinkedAssistantContext(
            db,
            fixture.principal,
            inbox.requestId,
            claimed.lease,
          )
          expect(ctx.session.session).toBeNull()
          const defaults =
            await createDefaultWhatsAppMediaIngestDependencies(ctx)
          if (!defaults)
            throw Error("Expected actual original-photo dependencies")
          const ingest = createWhatsAppMediaIngestor({
            ...defaults,
            download: async (request) => {
              downloads += 1
              expect(request.expectedMediaType).toBe("image/png")
              expect(request.expectedSha256).toBe(digest)
              return { bytes: png, mediaType: "image/png" }
            },
            enqueue: async (id) => {
              queued.push(id)
            },
          })
          const result = await ingest({
            providerMessageId: inbox.providerMessageId,
            content: inbox.content,
          })
          if (result.state !== "processing")
            throw Error(`Expected canonical stored original: ${result.state}`)
          originalIds.add(result.attachmentId)
          expect(
            await processSetupAttachment(
              result.attachmentId,
              defaultAssistantAttachmentDeps(),
            ),
          ).toEqual({ status: "ready", kind: "IMAGE" })
          const ready = await readAssistantAttachment(
            db,
            scope,
            result.attachmentId,
          )
          expect(ready).toMatchObject({
            kind: "IMAGE",
            status: "READY",
            processingAttempts: 1,
            transcript: null,
            extraction: {
              type: "text",
              text: "Photo attached; not analysed.",
              truncated: false,
            },
          })
          expect(
            await setupAttachmentStorage("QA").read({
              target: setupAttachmentTarget(ready),
            }),
          ).toEqual(png)
          // Actual READY-media preparation does not repeat download or job dispatch.
          const prepared = await prepareAssistantWhatsAppMediaTurn(
            ctx,
            claimed.lease,
            inbox,
          )
          if (prepared.kind !== "input")
            throw Error(`Expected original and caption input: ${prepared.kind}`)
          expect(prepared.parts).toContainEqual({
            type: "text",
            text: row.caption,
          })
          expect(prepared.parts).toContainEqual({
            type: "data-setup-attachment",
            data: { attachmentId: ready.id },
          })
          const turn = await createGeneralAssistantTurn(ctx, {
            conversationId,
            requestId: inbox.requestId,
            message: {
              id: inbox.userMessageId,
              role: "user",
              parts: prepared.parts,
            },
          })
          const run = await db.assistantRun.findFirstOrThrow({
            where: {
              requestId: inbox.requestId,
              actorUserId: userId,
              conversationId,
            },
          })
          runIds.add(run.id)
          const reader = turn.stream.getReader()
          try {
            while (!(await reader.read()).done) {
              /* canonical persisted final only */
            }
          } finally {
            reader.releaseLock()
          }
          expect(await turn.completion).toMatchObject({
            status: "COMPLETED",
            persisted: true,
          })
          const proposal = await db.assistantActionProposal.findFirstOrThrow({
            where: {
              tenantId,
              conversationId,
              action: row.action,
              status: "PENDING",
            },
          })
          proposalIds.add(proposal.id)
          expect(proposal.payload).toMatchObject({
            action: row.action,
            attachmentIds: [ready.id],
          })
          expect(
            await prepareAssistantWhatsAppReview(db, claimed.lease),
          ).toBeUndefined()
          expect((await buildChannelProposalReview(ctx, proposal)).kind).toBe(
            "app_review",
          )
          expect(
            await settleAssistantWhatsAppInbox(db, claimed.lease, {
              permittedUserIds: [userId],
            }),
          ).toEqual({ state: "COMPLETED" })
          const outbox = await db.assistantWhatsAppOutbox.findFirstOrThrow({
            where: { inboxId: inbox.id },
          })
          expect(outbox.renderKind).toBe("app_review")
          expect(outbox.content).toContain(
            "Your saved draft needs the complete review in EwaTrade",
          )
          expect(outbox.content).toContain(
            `${origin}/assistant/c/${encodeURIComponent(conversationId)}`,
          )
          expect(
            await db.assistantWhatsAppActionReview.count({
              where: { bindingId: fixture.principal.bindingId },
            }),
          ).toBe(0)
          const delivered = await fixture.fakeAcceptedDelivery(outbox.id)
          expect(delivered.body).toBe(outbox.content ?? "")
          const app = await caller.conversation({ conversationId })
          expect(app.conversation).toMatchObject({
            id: conversationId,
            tenantId,
            storeId,
            ownerUserId: userId,
            purpose: "GENERAL",
            status: "ACTIVE",
          })
          const savedSource = app.messages.find(
            (message) => message.id === inbox.userMessageId,
          )
          expect(savedSource?.parts).toContainEqual({
            type: "text",
            text: row.caption,
          })
          expect(JSON.stringify(savedSource?.parts)).toContain(ready.id)
          let reviewed = app.proposals.find(
            (candidate) => candidate.id === proposal.id,
          )
          if (!reviewed)
            throw Error(
              "Exact saved proposal must be available in actual app read",
            )
          expect(reviewed).toMatchObject({
            id: proposal.id,
            revision: proposal.revision,
            status: "PENDING",
            payload: { action: row.action, attachmentIds: [ready.id] },
          })
          if (row.action === "money_transfer_simple") {
            const incomplete = simpleTransferAction.parse(reviewed.payload)
            expect(simpleTransferStep(incomplete)).toBe("to")
            expect(reviewed.question).toBe("To which account?")
            expect(reviewed.approvalToken).toBeUndefined()
            expect(incomplete.attachmentIds).toEqual([ready.id])
            // Resolve the incomplete caption through the actual protected app
            // controls. The delivered WhatsApp handoff still refers to revision1.
            const options = await financeRouter
              .createCaller(browser)
              .moneyAccounts({ bookId })
            expect(options.book.id).toBe(bookId)
            const banks = options.accounts.filter(
              (account) =>
                account.code === "1100" &&
                account.name === "Bank account" &&
                account.purpose === "BANK",
            )
            expect(banks).toHaveLength(1)
            const bank = banks[0]
            if (!bank)
              throw Error("Exact canonical Bank account option required")
            const edited = await caller.editProposal({
              proposalId: proposal.id,
              revision: proposal.revision,
              payload: simpleTransferAction.parse({
                ...incomplete,
                toMoneyAccountId: bank.id,
                toAccountName: bank.name,
                newToAccount: undefined,
              }),
            })
            expect(edited.id).toBe(proposal.id)
            expect(edited.revision).toBe(proposal.revision + 1)
            expect(
              simpleTransferAction.parse(edited.payload).attachmentIds,
            ).toEqual([ready.id])
            const freshApp = await caller.conversation({ conversationId })
            expect(freshApp.conversation.id).toBe(conversationId)
            expect(freshApp.messages).toEqual(app.messages)
            reviewed = freshApp.proposals.find(
              (candidate) => candidate.id === proposal.id,
            )
            if (!reviewed)
              throw Error(
                "Exact edited transfer must remain in its original saved chat",
              )
            expect(reviewed.revision).toBe(edited.revision)
            expect(reviewed.payload).toEqual(edited.payload)
            expect(reviewed.question).toBeUndefined()
            const fullReview = JSON.stringify(reviewed.presentation)
            expect(fullReview).toContain("Shop cash")
            expect(fullReview).toContain(bank.name)
            expect(fullReview).toContain("25.00")
            expect(
              simpleTransferAction.parse(reviewed.payload).toMoneyAccountId,
            ).toBe(bank.id)
            await expect(
              caller.decideProposal({
                proposalId: proposal.id,
                revision: proposal.revision,
                decision: "confirm",
              }),
            ).rejects.toMatchObject({ code: "CONFLICT" })
            expect(
              await db.assistantActionProposal.findUniqueOrThrow({
                where: { id: proposal.id },
              }),
            ).toMatchObject({
              status: "PENDING",
              revision: edited.revision,
              conversationId,
            })
            const savedHandoff =
              await db.assistantWhatsAppOutbox.findUniqueOrThrow({
                where: { id: outbox.id },
              })
            expect(savedHandoff.content).toBe(outbox.content)
            expect(savedHandoff.contentDigest).toBe(outbox.contentDigest)
            expect(savedHandoff.renderKind).toBe("app_review")
            expect(
              await db.assistantWhatsAppActionReview.count({
                where: { bindingId: fixture.principal.bindingId },
              }),
            ).toBe(0)
          }
          expect(reviewed.approvalToken).toBeTruthy()
          expect(reviewed.presentation).toBeDefined()
          switch (row.action) {
            case "sale_record":
              expect(
                simpleSaleStep(simpleSaleAction.parse(reviewed.payload)),
              ).toBe("review")
              break
            case "expense_record_simple":
              expect(
                simpleExpenseStep(simpleExpenseAction.parse(reviewed.payload)),
              ).toBe("review")
              break
            case "money_in_record":
              expect(
                simpleMoneyInStep(simpleMoneyInAction.parse(reviewed.payload)),
              ).toBe("review")
              break
            case "money_transfer_simple":
              expect(
                simpleTransferStep(
                  simpleTransferAction.parse(reviewed.payload),
                ),
              ).toBe("review")
              break
          }
          expect(
            JSON.stringify({ messages: app.messages, outbox: outbox.content }),
          ).not.toContain(reviewed.approvalToken ?? "missing-approval")
          const retained = await readAssistantAttachment(db, scope, ready.id)
          expect(retained).toMatchObject({
            contentDigest: digest,
            contentType: "image/png",
            sizeBytes: png.byteLength,
            messageId: inbox.userMessageId,
            extraction: ready.extraction,
          })
          expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(
            saleOrderId ? 1 : 0,
          )
          expect(
            await db.commercialOrderAttachment.count({ where: { tenantId } }),
          ).toBe(saleOrderId ? 1 : 0)
          await noOtherDomains()
          const decision = {
            proposalId: proposal.id,
            revision: reviewed.revision,
            approvalToken: reviewed.approvalToken,
            decision:
              row.action === "sale_record"
                ? ("confirm" as const)
                : ("cancel" as const),
          }
          const decided = await caller.decideProposal(decision)
          if (row.action === "sale_record") {
            saleProposalId = proposal.id
            expect(decided.status).toBe("COMPLETED")
            const receipt = generalReceiptSchema.parse(decided.receipt)
            if (receipt.kind !== "order")
              throw Error("Actual sale order receipt required")
            saleOrderId = receipt.recordId
            expect(receipt.title).toBe("Sale saved")
            const copy = await db.commercialOrderAttachment.findFirstOrThrow({
              where: { tenantId, orderId: saleOrderId },
              include: { activity: true },
            })
            copiedId = copy.id
            expect(copy).toMatchObject({
              kind: "IMAGE",
              status: "READY",
              contentDigest: digest,
              contentType: "image/png",
              sizeBytes: png.byteLength,
              originalFileName: ready.fileName,
              storageProvider: "local_test",
              storageStoreId: "store_localtest",
            })
            expect(copy.activity).toMatchObject({
              tenantId,
              orderId: saleOrderId,
              actorUserId: userId,
              source: "assistant",
              clientActivityId: `${proposal.idempotencyKey}:image:${ready.id}`,
            })
            expect(
              await createOrderAttachmentStorage("QA").read({
                target: {
                  tenantId,
                  orderId: saleOrderId,
                  attachmentId: copy.id,
                  contentDigest: digest,
                  contentType: "image/png",
                  sizeBytes: png.byteLength,
                },
              }),
            ).toEqual(png)
            expect(
              await db.commercialOrderPayment.count({
                where: { tenantId, orderId: saleOrderId, amountMinor: 12500 },
              }),
            ).toBe(1)
          } else {
            expect(decided.status).toBe("CANCELLED")
            expect(decided.receipt).toBeNull()
          }
          const effectSnapshot = async () => ({
            orders: await db.commercialOrder.count({ where: { tenantId } }),
            payments: await db.commercialOrderPayment.count({
              where: { tenantId },
            }),
            copies: await db.commercialOrderAttachment.count({
              where: { tenantId },
            }),
            journals: await db.financeJournalEntry.count({ where: { bookId } }),
            commands: await db.financeCommand.count({ where: { bookId } }),
          })
          const beforeReplay = await effectSnapshot()
          expect(await caller.decideProposal(decision)).toEqual(decided)
          expect(await effectSnapshot()).toEqual(beforeReplay)
          expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(
            expectedSales,
          )
          expect(
            await db.commercialOrderAttachment.count({ where: { tenantId } }),
          ).toBe(expectedSales)
          await noOtherDomains()
        }
        expect(downloads).toBe(selectedRows.length)
        expect(new Set(queued)).toEqual(originalIds)
        expect(await db.assistantRun.count({ where: { conversationId } })).toBe(
          selectedRows.length,
        )
        expect(
          await db.assistantUsageEvent.count({
            where: {
              tenantId,
              requestClass: { in: ["vision", "extract", "transcribe"] },
            },
          }),
        ).toBe(0)
        expect(
          await db.assistantUsageEvent.count({ where: { tenantId } }),
        ).toBe(selectedRows.length)
        expect(
          await db.assistantBudget.findUniqueOrThrow({
            where: { scopeKey: budgetKey },
          }),
        ).toMatchObject({ requests: selectedRows.length, tokens: 0 })
        expect(
          await db.financeJournalEntry.count({
            where: { bookId, sourceKind: "OWNER_CONTRIBUTION" },
          }),
        ).toBe(0)
        expect(
          await db.financeJournalEntry.count({
            where: { bookId, sourceKind: "TRANSFER" },
          }),
        ).toBe(0)
        expect(
          await db.assistantActionProposal.count({
            where: { tenantId, status: "COMPLETED" },
          }),
        ).toBe(expectedSales)
        expect(
          await db.assistantActionProposal.count({
            where: { tenantId, status: "CANCELLED" },
          }),
        ).toBe(selectedRows.length - expectedSales)
      } finally {
        fetchTrap.mockRestore()
        expect(externalCalls).toBe(0)
      }
    }, 600_000)
  },
)
