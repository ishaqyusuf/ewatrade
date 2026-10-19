import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import {
  generalActionSchema,
  generalReceiptSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import { appendAssistantMessage } from "@ewatrade/db/assistant"
import {
  settleAssistantWhatsAppInbox,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import {
  amendCommercialOrderMetadata,
  createCommercialOrder,
  createSimpleCatalogItem,
  previewCommercialOrderMetadataAmendment,
} from "@ewatrade/db/queries"
import type { Prisma } from "@ewatrade/db/types"
import { z } from "zod"
import { assistantRouter } from "../trpc/routers/assistant"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import {
  isLinkedAssistantIdentity,
  lockLinkedAssistantIdentity,
} from "./channel-principal"
import { generalPersistentParts } from "./general-persistence"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  editGeneralProposal,
  generalProposalWithReview,
} from "./general-proposals"
import { createGeneralTools } from "./general-tools"

type ServiceAction = "service_line_authorize" | "service_line_fulfill"
const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-service-handoff")
const appOrigin = "https://dashboard.example.test"
const previousOrigin = process.env.DASHBOARD_URL
const catalogCommandId = `${fixture.marker}-catalog`
const orderCommandId = `${fixture.marker}-order`
const amendmentCommandId = `${fixture.marker}-amendment`
let catalogItemId = ""
let orderId = ""
let orderLineId = ""

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  process.env.DASHBOARD_URL = appOrigin
  const { db, tenantId, storeId, userId } = fixture
  const item = await createSimpleCatalogItem(db, {
    tenantId,
    storeId,
    actorUserId: userId,
    clientOperationId: catalogCommandId,
    kind: "service",
    name: "Synthetic manual release service",
    priceMinor: 12500,
    workPolicy: "charge_only",
    authorizationPolicy: "manual_release",
    quantityScale: 1,
  })
  catalogItemId = item.id
  const offering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id },
  })
  const order = await createCommercialOrder(db, {
    tenantId,
    storeId,
    actorUserId: userId,
    clientOrderId: orderCommandId,
    schemaVersion: 1,
    fulfillNow: false,
    lines: [
      {
        offeringId: offering.id,
        quantity: "2.5",
        expectedFixedPriceMinor: 12500,
      },
    ],
  })
  orderId = order.id
  const line = await db.commercialOrderLine.findFirstOrThrow({
    where: { orderId },
  })
  orderLineId = line.id
  expect(line.kind).toBe("SERVICE")
  expect(line.quantity.toString()).toBe("2.5")
  // Charge-only policy is deliberately separate from tracked ServiceJob workflows.
  expect(await db.serviceJob.count({ where: { tenantId } })).toBe(0)
}, 120_000)

/** Only the explicit selected chat and the exact empty canonical link bootstrap may exist. */
async function assertOwnedServiceChats(
  db: Pick<
    Prisma.TransactionClient,
    "assistantWhatsAppLink" | "assistantConversation"
  >,
) {
  const { tenantId, storeId, userId, membershipId, conversationId, principal } =
    fixture
  const links = await db.assistantWhatsAppLink.findMany({
    where: {
      tenantId,
      storeId,
      userId,
      membershipId,
      confirmedAt: { not: null },
    },
    select: { id: true, phoneNumberId: true, claimedSenderId: true },
  })
  expect(links).toHaveLength(1)
  const link = links[0]
  if (!link) throw Error("The exact confirmed owned link is required")
  expect(link).toMatchObject({
    phoneNumberId: principal.phoneNumberId,
    claimedSenderId: principal.senderId,
  })
  const bootstrapId = `wa-linked_${link.id}`
  const chats = await db.assistantConversation.findMany({
    where: { tenantId },
    include: {
      setupDraft: true,
      _count: { select: { messages: true, runs: true, proposals: true } },
    },
    orderBy: { id: "asc" },
  })
  const ids = chats.map((chat) => chat.id)
  expect(ids).toEqual([conversationId, bootstrapId].sort())
  for (const chat of chats) {
    expect(chat).toMatchObject({
      tenantId,
      storeId,
      ownerUserId: userId,
      purpose: "GENERAL",
      status: "ACTIVE",
      workflowContext: null,
      setupDraft: null,
    })
    if (chat.id === bootstrapId)
      expect(chat).toMatchObject({
        lastSequence: 0,
        _count: { messages: 0, runs: 0, proposals: 0 },
      })
  }
  return ids
}

async function cleanupOwnedService() {
  const { db, tenantId, storeId, userId, conversationId } = fixture
  await db.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant) return
      expect(tenant).toMatchObject({
        slug: tenantId,
        dataClassification: "QA",
        qaSourceDomain: "assistant-action-confirmation.test",
      })
      await assertOwnedServiceChats(tx)
      const items = await tx.catalogItem.findMany({ where: { tenantId } })
      for (const item of items) expect(item.id).toBe(catalogItemId)
      const orders = await tx.commercialOrder.findMany({ where: { tenantId } })
      for (const order of orders)
        expect(order).toMatchObject({
          id: orderId,
          storeId,
          createdByUserId: userId,
          clientOrderId: orderCommandId,
        })
      const proposals = await tx.assistantActionProposal.findMany({
        where: { tenantId },
      })
      for (const proposal of proposals) {
        expect(proposal).toMatchObject({
          actorUserId: userId,
          storeId,
          conversationId,
          targetRecordId: orderLineId,
        })
        expect(["service_line_authorize", "service_line_fulfill"]).toContain(
          proposal.action,
        )
      }
      const proposalKeys = new Set(
        proposals.map((proposal) => proposal.idempotencyKey),
      )
      const authorizations = await tx.commercialServiceAuthorization.findMany({
        where: { tenantId },
      })
      const performances = await tx.commercialServiceFulfillment.findMany({
        where: { tenantId },
      })
      for (const record of [...authorizations, ...performances]) {
        expect(record).toMatchObject({
          actorUserId: userId,
          orderId,
          orderLineId,
        })
        expect(proposalKeys.has(record.clientOperationId)).toBe(true)
      }
      const amendments = await tx.commercialOrderAmendment.findMany({
        where: { tenantId },
      })
      for (const amendment of amendments)
        expect(amendment).toMatchObject({
          actorUserId: userId,
          orderId,
          clientOperationId: amendmentCommandId,
          kind: "METADATA",
          replacementOrderId: null,
        })
      const activities = await tx.commercialOrderActivity.findMany({
        where: { tenantId },
      })
      for (const activity of activities)
        expect(activity).toMatchObject({ actorUserId: userId, orderId })
      const events = await tx.businessActivityEvent.findMany({
        where: { tenantId },
      })
      for (const event of events) expect(event.actorUserId).toBe(userId)
      const commands = await tx.catalogCommandReceipt.findMany({
        where: { tenantId },
      })
      for (const command of commands)
        expect(command).toMatchObject({
          catalogItemId,
          storeId,
          clientOperationId: catalogCommandId,
          commandType: "CREATE_CATALOG_ITEM",
        })
      const forbidden = await Promise.all([
        tx.financeBook.count({ where: { tenantId } }),
        tx.customerLedgerEntry.count({ where: { tenantId } }),
        tx.customerLedgerAccount.count({ where: { tenantId } }),
        tx.commercialOrderPayment.count({ where: { tenantId } }),
        tx.commercialOrderAttachment.count({ where: { tenantId } }),
        tx.assistantAttachment.count({ where: { tenantId } }),
        tx.stockOperation.count({ where: { tenantId } }),
        tx.stockBalanceSource.count({ where: { tenantId } }),
        tx.serviceJob.count({ where: { tenantId } }),
      ])
      expect(forbidden).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
      await tx.businessActivityEvent.deleteMany({
        where: { tenantId, id: { in: events.map((event) => event.id) } },
      })
      await tx.commercialOrderActivity.deleteMany({
        where: {
          tenantId,
          id: { in: activities.map((activity) => activity.id) },
        },
      })
      await tx.commercialServiceFulfillment.deleteMany({
        where: {
          tenantId,
          id: { in: performances.map((record) => record.id) },
        },
      })
      await tx.commercialServiceAuthorization.deleteMany({
        where: {
          tenantId,
          id: { in: authorizations.map((record) => record.id) },
        },
      })
      await tx.commercialOrderAmendment.deleteMany({
        where: { tenantId, id: { in: amendments.map((record) => record.id) } },
      })
      await tx.commercialOrder.deleteMany({
        where: { tenantId, id: { in: orders.map((order) => order.id) } },
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      try {
        await cleanupOwnedService()
      } catch (error) {
        await fixture.db.$disconnect()
        throw new Error(
          `Service handoff cleanup unverified; retained fixture ${fixture.tenantId}`,
          { cause: error },
        )
      }
    }
    await fixture.cleanup()
  } finally {
    if (previousOrigin === undefined)
      Reflect.deleteProperty(process.env, "DASHBOARD_URL")
    else process.env.DASHBOARD_URL = previousOrigin
  }
}, 90_000)

/** Actual linked tool and durable transport. Only the model completion and Meta HTTP outcome are synthetic. */
async function handoff(action: ServiceAction, text: string) {
  const { db, conversationId, tenantId, storeId, userId } = fixture
  const inbox = await fixture.incoming(text)
  const claimed = await fixture.claim(inbox.id)
  const ctx = await fixture.context(inbox.requestId, claimed.lease)
  expect(ctx.session.session).toBeNull()
  const proposalCount = await db.assistantActionProposal.count({
    where: { tenantId },
  })
  const answers: GeneralAnswer[] = []
  const tools = createGeneralTools(
    ctx,
    conversationId,
    () => {
      throw Error("Handoff cannot draft")
    },
    (answer) => answers.push(answer),
  )
  const execute = tools.handoffAction?.execute
  if (!execute) throw Error("Expected current canonical Service app handoff")
  expect(
    await execute(
      { action },
      { toolCallId: `handoff-${action}`, messages: [] },
    ),
  ).toMatchObject({
    status: "available",
    data: { status: "app_review", action },
  })
  expect(answers).toHaveLength(1)
  expect(answers[0]?.handoff).toMatchObject({
    action,
    reason: "complete_app_review",
    conversation: {
      conversationId,
      purpose: "GENERAL",
      origin: { tenantId, storeId },
    },
  })
  const parts = z
    .array(z.json())
    .parse(
      generalPersistentParts(
        answers.map((data) => ({ type: "data-general-answer", data })),
      ),
    )
  await db.$transaction(async (tx) => {
    if (!isLinkedAssistantIdentity(ctx.session))
      throw Error("Real linked identity required")
    const resolved = await lockLinkedAssistantIdentity(tx, ctx.session)
    await stampAssistantWhatsAppExecution(tx, claimed.lease, resolved)
    expect(
      await appendAssistantMessage(tx, {
        conversationId,
        message: {
          id: inbox.userMessageId,
          role: "user",
          parts: [{ type: "text", text }],
        },
      }),
    ).toBe(true)
    const messageId = randomUUID()
    expect(
      await appendAssistantMessage(tx, {
        conversationId,
        message: { id: messageId, role: "assistant", parts },
      }),
    ).toBe(true)
    const run = await tx.assistantRun.create({
      data: {
        conversationId,
        actorUserId: userId,
        requestId: inbox.requestId,
        provider: "ewatrade-rehearsal",
        model: "synthetic-no-model",
        promptVersion: "synthetic-exact-handoff-output",
        status: "COMPLETED",
        completedAt: new Date(),
        assistantMessageId: messageId,
      },
    })
    await tx.assistantWhatsAppInbox.update({
      where: { id: inbox.id },
      data: { runId: run.id },
    })
  })
  expect(
    await settleAssistantWhatsAppInbox(db, claimed.lease, {
      permittedUserIds: [userId],
    }),
  ).toEqual({ state: "COMPLETED" })
  expect(await db.assistantActionProposal.count({ where: { tenantId } })).toBe(
    proposalCount,
  )
  expect(
    await db.assistantWhatsAppActionReview.count({
      where: { bindingId: fixture.principal.bindingId },
    }),
  ).toBe(0)
  const output = await db.assistantWhatsAppOutbox.findFirstOrThrow({
    where: { inboxId: inbox.id },
  })
  expect(output.renderKind).toBe("reply")
  const delivered = await fixture.fakeAcceptedDelivery(output.id)
  expect(delivered.body).toContain(
    `${appOrigin}/assistant/c/${encodeURIComponent(conversationId)}`,
  )
  expect(delivered.body).toContain("No draft or business change was created")
  const saved = await db.assistantMessage.findFirstOrThrow({
    where: {
      conversationId,
      role: "assistant",
      completedRun: { requestId: inbox.requestId },
    },
  })
  const persisted = z.array(generalStoredPartSchema).parse(saved.parts)
  expect(
    persisted.some(
      (part) =>
        part.type === "data-general-answer" &&
        part.data.handoff?.action === action,
    ),
  ).toBe(true)
  const browser = await fixture.browserContext()
  expect(browser.session.session?.id).toBe(fixture.sessionId)
  expect(browser.assistantConversationId).toBeUndefined()
  expect(browser.tenantContext.tenant.id).toBe(tenantId)
  expect(browser.tenantContext.activeStore?.id).toBe(storeId)
  // Exercise the app's real protected conversation RPC, not a direct transcript read.
  const existingChatIds = await assertOwnedServiceChats(db)
  const resumed = await assistantRouter
    .createCaller(browser)
    .conversation({ conversationId })
  expect(resumed.conversation).toMatchObject({
    id: conversationId,
    tenantId,
    storeId,
    ownerUserId: userId,
    purpose: "GENERAL",
    status: "ACTIVE",
  })
  expect(
    resumed.messages.find((message) => message.id === inbox.userMessageId),
  ).toMatchObject({
    role: "user",
    parts: [{ type: "text", text }],
  })
  const appReply = resumed.messages.find((message) => message.id === saved.id)
  if (!appReply)
    throw Error(
      "The same app chat must contain the exact emitted handoff message",
    )
  const appParts = z.array(generalStoredPartSchema).parse(appReply.parts)
  expect(
    appParts.some(
      (part) =>
        part.type === "data-general-answer" &&
        part.data.handoff?.action === action &&
        part.data.handoff.conversation.conversationId === conversationId,
    ),
  ).toBe(true)
  expect(await assertOwnedServiceChats(db)).toEqual(existingChatIds)
  expect(
    await db.assistantMessage.count({
      where: { conversationId, id: inbox.userMessageId, role: "user" },
    }),
  ).toBe(1)
  return browser
}

suite("existing charge-only Service WhatsApp app-review crossover", () => {
  test("the same saved chat resumes under a real browser Session, stale review refuses, and separate release/performance receipts replay without stock or money effects", async () => {
    const { db, tenantId, storeId, userId, conversationId } = fixture
    const browser = await handoff(
      "service_line_authorize",
      "Open this saved service for manager release in EwaTrade; no performance yet.",
    )
    await expect(
      draftGeneralProposal(
        browser,
        conversationId,
        generalActionSchema.parse({
          action: "service_line_fulfill",
          orderLineId,
          reason: "Cannot perform before manager release",
        }),
      ),
    ).rejects.toThrow()
    const payload = generalActionSchema.parse({
      action: "service_line_authorize",
      orderLineId,
      reason: "Manager reviewed the saved service",
    })
    const draft = await draftGeneralProposal(browser, conversationId, payload)
    const pending = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: draft.proposalId },
    })
    expect(pending).toMatchObject({
      conversationId,
      tenantId,
      storeId,
      actorUserId: userId,
      action: "service_line_authorize",
      targetRecordId: orderLineId,
      status: "PENDING",
    })
    const reviewed = await generalProposalWithReview(browser, pending)
    expect(reviewed.review.join("\n")).toContain("Full saved quantity: 2.5")
    expect(reviewed.review.join("\n")).toContain("Record manager release only")
    expect(reviewed.review.join("\n")).toContain("No physical stock movement")
    const staleDecision = {
      proposalId: pending.id,
      revision: pending.revision,
      approvalToken: reviewed.approvalToken,
      decision: "confirm" as const,
    }
    const patch = { deliveryDueAt: "2026-01-02T00:00:00.000Z" }
    const amendment = await previewCommercialOrderMetadataAmendment(db, {
      tenantId,
      storeId,
      orderId,
      patch,
    })
    expect(amendment.eligible).toBe(true)
    await amendCommercialOrderMetadata(db, {
      tenantId,
      storeId,
      orderId,
      actorUserId: userId,
      clientOperationId: amendmentCommandId,
      expectedReviewDigest: amendment.reviewDigest,
      reason: "Independent saved schedule correction",
      patch,
    })
    await expect(
      decideGeneralProposal(browser, staleDecision),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(
      await db.commercialServiceAuthorization.count({ where: { tenantId } }),
    ).toBe(0)
    expect(
      await db.commercialServiceFulfillment.count({ where: { tenantId } }),
    ).toBe(0)
    expect(
      (
        await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: pending.id },
        })
      ).status,
    ).toBe("PENDING")
    const edited = await editGeneralProposal(browser, {
      proposalId: pending.id,
      revision: pending.revision,
      payload,
    })
    const freshRow = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: pending.id },
    })
    expect(freshRow.targetRevision).not.toBe(pending.targetRevision)
    expect(edited.revision).toBe(pending.revision + 1)
    const fresh = await generalProposalWithReview(browser, freshRow)
    expect(fresh.review.join("\n")).toContain("2026-01-02T00:00:00.000Z")
    const releaseDecision = {
      proposalId: freshRow.id,
      revision: freshRow.revision,
      approvalToken: fresh.approvalToken,
      decision: "confirm" as const,
    }
    const released = await decideGeneralProposal(browser, releaseDecision)
    expect(released.status).toBe("COMPLETED")
    expect(generalReceiptSchema.parse(released.receipt)).toMatchObject({
      kind: "order",
      recordId: orderId,
      title: "Service release recorded",
    })
    expect(
      (await decideGeneralProposal(browser, releaseDecision)).receipt,
    ).toEqual(released.receipt)
    const authorization =
      await db.commercialServiceAuthorization.findFirstOrThrow({
        where: { tenantId, orderLineId },
      })
    expect(authorization).toMatchObject({
      actorUserId: userId,
      orderId,
      clientOperationId: freshRow.idempotencyKey,
    })
    expect(authorization.quantity.toString()).toBe("2.5")
    expect(
      await db.commercialServiceAuthorization.count({ where: { tenantId } }),
    ).toBe(1)
    expect(
      await db.commercialServiceFulfillment.count({ where: { tenantId } }),
    ).toBe(0)
    expect(
      (await db.commercialOrder.findUniqueOrThrow({ where: { id: orderId } }))
        .completedAt,
    ).toBeNull()
    const app = await handoff(
      "service_line_fulfill",
      "Continue this same saved service chat in EwaTrade and review its performance separately.",
    )
    const performDraft = await draftGeneralProposal(
      app,
      conversationId,
      generalActionSchema.parse({
        action: "service_line_fulfill",
        orderLineId,
        reason: "Saved work completed and checked",
      }),
    )
    const performRow = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: performDraft.proposalId },
    })
    const performanceReview = await generalProposalWithReview(app, performRow)
    expect(performanceReview.review.join("\n")).toContain(
      "Record service performance now",
    )
    const performDecision = {
      proposalId: performRow.id,
      revision: performRow.revision,
      approvalToken: performanceReview.approvalToken,
      decision: "confirm" as const,
    }
    const performed = await decideGeneralProposal(app, performDecision)
    expect(generalReceiptSchema.parse(performed.receipt)).toMatchObject({
      kind: "order",
      recordId: orderId,
      title: "Service performance recorded",
    })
    const beforeReplay = await db.commercialServiceFulfillment.findFirstOrThrow(
      { where: { tenantId, orderLineId } },
    )
    expect(beforeReplay).toMatchObject({
      actorUserId: userId,
      orderId,
      clientOperationId: performRow.idempotencyKey,
    })
    expect(beforeReplay.quantity.toString()).toBe("2.5")
    expect((await decideGeneralProposal(app, performDecision)).receipt).toEqual(
      performed.receipt,
    )
    expect(
      await db.commercialServiceFulfillment.findUniqueOrThrow({
        where: { id: beforeReplay.id },
      }),
    ).toEqual(beforeReplay)
    expect(
      await db.commercialServiceFulfillment.count({ where: { tenantId } }),
    ).toBe(1)
    const completedOrder = await db.commercialOrder.findUniqueOrThrow({
      where: { id: orderId },
    })
    expect(completedOrder.status).toBe("COMPLETED")
    expect(completedOrder.completedAt).not.toBeNull()
    expect(await db.assistantRun.count({ where: { conversationId } })).toBe(2)
    expect(
      await db.assistantWhatsAppActionReview.count({
        where: { bindingId: fixture.principal.bindingId },
      }),
    ).toBe(0)
  }, 300_000)
})
