import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import {
  generalActionSchema,
  generalReceiptSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  generalReadContinuationContext,
  nextGeneralReadRequest,
  parseGeneralReadContinuation,
} from "@ewatrade/assistant/general/read-continuation"
import { appendAssistantMessage } from "@ewatrade/db/assistant"
import {
  settleAssistantWhatsAppInbox,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import { createSimpleCatalogItem } from "@ewatrade/db/queries"
import type { Prisma } from "@ewatrade/db/types"
import { z } from "zod"
import { assistantRouter } from "../trpc/routers/assistant"
import { catalogRouter } from "../trpc/routers/catalog"
import { inventoryRouter } from "../trpc/routers/inventory"
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

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-stock-handoff")
const appOrigin = "https://dashboard.example.test"
const previousOrigin = process.env.DASHBOARD_URL
const previousRehearsal = process.env.ASSISTANT_REHEARSAL_MODE
const catalogCommandId = `${fixture.marker}-catalog`
const originalName = "Synthetic saved stock receipt product"
const renamedName = "Synthetic renamed stock receipt product"
let catalogItemId = ""
let balanceSourceId = ""
let enteredInventoryUnitId = ""
let configurationVersionId = ""

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  process.env.DASHBOARD_URL = appOrigin
  process.env.ASSISTANT_REHEARSAL_MODE = "true"
  const { db, tenantId, storeId, userId } = fixture
  const item = await createSimpleCatalogItem(db, {
    tenantId,
    storeId,
    actorUserId: userId,
    clientOperationId: catalogCommandId,
    kind: "product",
    name: originalName,
    canonicalUnitName: "Piece",
    priceMinor: 12500,
    openingStockQuantity: "0",
  })
  catalogItemId = item.id
  expect(await db.stockBalanceSource.count({ where: { tenantId } })).toBe(0)
  expect(await db.stockOperation.count({ where: { tenantId } })).toBe(0)
  const offering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId },
  })
  // This real protected app query canonically creates the zero Store source.
  // It is a deliberate setup write, not a claimed read-only observation.
  const availability = await inventoryRouter
    .createCaller(await fixture.browserContext())
    .offeringAvailability({ offeringId: offering.id, storeId })
  balanceSourceId = availability.balanceSourceId
  enteredInventoryUnitId = availability.enteredInventoryUnitId
  configurationVersionId = availability.configurationVersionId
  expect(availability).toMatchObject({
    onHandQuantity: "0",
    reservedQuantity: "0",
    revision: 0,
    factor: "1",
  })
  expect(await db.stockBalanceSource.count({ where: { tenantId } })).toBe(1)
  expect(await db.stockOperation.count({ where: { tenantId } })).toBe(0)
}, 120_000)

/** Only the explicit selected chat and the exact empty canonical link bootstrap may exist. */
async function assertOwnedStockChats(
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

/** Refuse cleanup unless every stock/domain row is attributed to this exact QA fixture. */
async function assertOwnedStockCleanup() {
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
      await assertOwnedStockChats(tx)
      const items = await tx.catalogItem.findMany({ where: { tenantId } })
      for (const item of items) expect(item.id).toBe(catalogItemId)
      const proposals = await tx.assistantActionProposal.findMany({
        where: { tenantId },
      })
      expect(proposals.length).toBeLessThanOrEqual(1)
      for (const proposal of proposals)
        expect(proposal).toMatchObject({
          actorUserId: userId,
          storeId,
          conversationId,
          action: "stock_receive",
          targetRecordId: balanceSourceId,
        })
      const keys = new Set(proposals.map((proposal) => proposal.idempotencyKey))
      const sources = await tx.stockBalanceSource.findMany({
        where: { tenantId },
        include: { product: true },
      })
      expect(sources.length).toBeLessThanOrEqual(1)
      for (const source of sources)
        expect(source).toMatchObject({
          id: balanceSourceId,
          storeId,
          inventoryUnitId: enteredInventoryUnitId,
          custodyType: "STORE",
          custodyReferenceId: "",
          parentBalanceSourceId: null,
          product: { catalogItemId },
        })
      const operations = await tx.stockOperation.findMany({
        where: { tenantId },
        include: { movements: true },
      })
      expect(operations.length).toBeLessThanOrEqual(1)
      for (const operation of operations) {
        expect(operation).toMatchObject({
          storeId,
          actorUserId: userId,
          type: "RECEIPT",
          source: "assistant",
          linkedOperationId: null,
          correctionOfOperationId: null,
        })
        expect(keys.has(operation.clientOperationId)).toBe(true)
        expect(operation.movements).toHaveLength(1)
        for (const movement of operation.movements) {
          expect(movement).toMatchObject({
            balanceSourceId,
            enteredInventoryUnitId,
            configurationVersionId,
            reversalOfMovementId: null,
          })
          expect(movement.enteredQuantity.toFixed()).toBe("2.5")
          expect(movement.signedCanonicalEffect.toFixed()).toBe("2.5")
        }
      }
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
      const events = await tx.businessActivityEvent.findMany({
        where: { tenantId },
      })
      for (const event of events) expect(event.actorUserId).toBe(userId)
      const forbidden = await Promise.all([
        tx.financeBook.count({ where: { tenantId } }),
        tx.customer.count({ where: { tenantId } }),
        tx.customerLedgerEntry.count({ where: { tenantId } }),
        tx.customerLedgerAccount.count({ where: { tenantId } }),
        tx.commercialOrder.count({ where: { tenantId } }),
        tx.assistantAttachment.count({ where: { tenantId } }),
        tx.serviceJob.count({ where: { tenantId } }),
        tx.stockReservation.count({ where: { tenantId } }),
        tx.stockCount.count({ where: { tenantId } }),
        tx.stockTransfer.count({ where: { tenantId } }),
        tx.assistantUsageEvent.count({ where: { tenantId } }),
      ])
      for (const count of forbidden) expect(count).toBe(0)
      // Exact event cleanup precedes the neutral factory's guarded stock dependency cleanup.
      await tx.businessActivityEvent.deleteMany({
        where: { tenantId, id: { in: events.map((event) => event.id) } },
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      try {
        await assertOwnedStockCleanup()
      } catch (error) {
        await fixture.db.$disconnect()
        throw new Error(
          `Stock handoff cleanup unverified; retained fixture ${fixture.tenantId}`,
          { cause: error },
        )
      }
    }
    await fixture.cleanup()
  } finally {
    if (previousOrigin === undefined)
      Reflect.deleteProperty(process.env, "DASHBOARD_URL")
    else process.env.DASHBOARD_URL = previousOrigin
    if (previousRehearsal === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_REHEARSAL_MODE")
    else process.env.ASSISTANT_REHEARSAL_MODE = previousRehearsal
  }
}, 90_000)

/** Actual linked tool and durable transport. Only the model completion and Meta HTTP outcome are synthetic. */
async function handoff(action: "stock_receive", text: string) {
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
  if (!execute) throw Error("Expected current canonical inventory app handoff")
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
  const existingChatIds = await assertOwnedStockChats(db)
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
  expect(await assertOwnedStockChats(db)).toEqual(existingChatIds)
  expect(
    await db.assistantMessage.count({
      where: { conversationId, id: inbox.userMessageId, role: "user" },
    }),
  ).toBe(1)
  return browser
}

/** Positive reads of this receipt only: historical evidence and one compatible current source. */
async function readSavedReceipt(operationId: string, movementId: string) {
  const { db, tenantId, storeId, conversationId } = fixture
  const answers: GeneralAnswer[] = []
  const ctx = await fixture.context(`${fixture.marker}-saved-stock-reads`)
  expect(ctx.session.session).toBeNull()
  const tools = createGeneralTools(
    ctx,
    conversationId,
    () => {
      throw Error("Stock reads cannot draft")
    },
    (answer) => answers.push(answer),
  )
  const readOperation = tools.readStockOperation?.execute
  const readBalances = tools.readInventoryBalances?.execute
  const readTotals = tools.readInventoryTotals?.execute
  if (!readOperation || !readBalances || !readTotals)
    throw Error(
      "Expected currently eligible stock evidence/source/compatible-total reads",
    )
  const before = Date.now()
  const audit = z
    .object({
      status: z.literal("available"),
      storeId: z.literal(storeId),
      asOf: z.string(),
      data: z.object({
        id: z.literal(operationId),
        type: z.literal("RECEIPT"),
        canonicalNetEffect: z.literal("2.5"),
        movements: z.array(
          z.object({
            id: z.string(),
            balanceSourceId: z.string(),
            configurationVersionId: z.string(),
            enteredInventoryUnitId: z.string(),
            enteredInventoryUnitName: z.string(),
            enteredQuantity: z.string(),
            signedCanonicalEffect: z.string(),
            unitFactorSnapshot: z.string(),
            previousOnHandQuantity: z.string(),
            resultingOnHandQuantity: z.string(),
            totalCostMinorSnapshot: z.null(),
          }),
        ),
      }),
    })
    .parse(
      await readOperation(
        { operationId },
        { toolCallId: "owned-receipt-original", messages: [] },
      ),
    )
  expect(audit.data.movements).toEqual([
    {
      id: movementId,
      balanceSourceId,
      configurationVersionId,
      enteredInventoryUnitId,
      enteredInventoryUnitName: "Piece",
      enteredQuantity: "2.5",
      signedCanonicalEffect: "2.5",
      unitFactorSnapshot: "1",
      previousOnHandQuantity: "0",
      resultingOnHandQuantity: "2.5",
      totalCostMinorSnapshot: null,
    },
  ])
  const balances = z
    .object({
      status: z.literal("available"),
      storeId: z.literal(storeId),
      asOf: z.string(),
      data: z.object({
        rows: z.array(
          z.object({
            balanceSourceId: z.string(),
            catalogItemId: z.string(),
            inventoryUnitId: z.string(),
            inventoryUnitName: z.string(),
            configurationVersionId: z.string(),
            inventoryUnitFactor: z.string(),
            onHandQuantity: z.string(),
            reservedQuantity: z.string(),
            availableQuantity: z.string(),
            revision: z.number(),
            custodyType: z.string(),
          }),
        ),
        nextCursor: z.null(),
      }),
    })
    .parse(
      await readBalances(
        { catalogItemId },
        { toolCallId: "owned-receipt-balance", messages: [] },
      ),
    )
  expect(balances.data.rows).toEqual([
    {
      balanceSourceId,
      catalogItemId,
      inventoryUnitId: enteredInventoryUnitId,
      inventoryUnitName: "Piece",
      configurationVersionId,
      inventoryUnitFactor: "1",
      onHandQuantity: "2.5",
      reservedQuantity: "0",
      availableQuantity: "2.5",
      revision: 1,
      custodyType: "STORE",
    },
  ])
  const totals = z
    .object({
      status: z.literal("available"),
      storeId: z.literal(storeId),
      asOf: z.string(),
      data: z.object({
        items: z.array(
          z.object({
            configurationVersionId: z.string(),
            canonicalUnitId: z.string(),
            canonicalUnitName: z.string(),
            onHandCanonicalQuantity: z.string(),
            reservedCanonicalQuantity: z.string(),
            availableCanonicalQuantity: z.string(),
            sourceCount: z.number(),
            custodyType: z.string(),
            informationalOnly: z.literal(true),
          }),
        ),
        nextCursor: z.null(),
      }),
    })
    .parse(
      await readTotals(
        { catalogItemId },
        { toolCallId: "owned-receipt-compatible-total", messages: [] },
      ),
    )
  expect(totals.data.items).toEqual([
    {
      configurationVersionId,
      canonicalUnitId: enteredInventoryUnitId,
      canonicalUnitName: "Piece",
      onHandCanonicalQuantity: "2.5",
      reservedCanonicalQuantity: "0",
      availableCanonicalQuantity: "2.5",
      sourceCount: 1,
      custodyType: "STORE",
      informationalOnly: true,
    },
  ])
  const end = Date.now()
  expect(answers).toHaveLength(7)
  for (const asOf of [
    ...[audit, balances, totals].map((row) => row.asOf),
    ...answers.map((answer) => answer.asOf),
  ]) {
    expect(Date.parse(asOf)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(asOf)).toBeLessThanOrEqual(end)
  }
  expect(
    answers.find((answer) => answer.id === `stock_movement_${movementId}`)
      ?.value,
  ).toBe("2.5 Piece entered")
  expect(
    answers.find(
      (answer) => answer.id === `stock_movement_evidence_${movementId}`,
    )?.detail,
  ).toContain(configurationVersionId)
  expect(
    answers.filter((answer) => answer.value === "2.5 Piece available"),
  ).toHaveLength(2)
  expect(
    answers.some((answer) => answer.detail?.includes("revision 1. Unit Piece")),
  ).toBe(true)
  const hints = answers.flatMap((answer) => {
    const hint = parseGeneralReadContinuation(answer.continuation)
    return hint ? [hint] : []
  })
  expect(hints).toEqual([
    {
      version: 1,
      tool: "readStockOperation",
      input: { operationId },
      nextCursor: null,
    },
    {
      version: 1,
      tool: "readInventoryBalances",
      input: { catalogItemId },
      nextCursor: null,
    },
    {
      version: 1,
      tool: "readInventoryTotals",
      input: { catalogItemId },
      nextCursor: null,
    },
  ])
  for (const hint of hints) expect(nextGeneralReadRequest(hint)).toBeUndefined()
  const parts = z
    .array(z.json())
    .parse(
      generalPersistentParts(
        answers.map((data) => ({ type: "data-general-answer", data })),
      ),
    )
  const messageId = `${fixture.marker}-positive-stock-facts`
  await db.$transaction((tx) =>
    appendAssistantMessage(tx, {
      conversationId,
      message: { id: messageId, role: "assistant", parts },
    }),
  )
  const saved = await db.assistantMessage.findUniqueOrThrow({
    where: { id: messageId },
  })
  const restored = z.array(generalStoredPartSchema).parse(saved.parts)
  expect(
    restored.flatMap((part) =>
      part.type === "data-general-answer" ? [part.data] : [],
    ),
  ).toEqual(answers)
  const navigation = generalReadContinuationContext([
    { role: "assistant", parts: restored },
  ])
  expect(navigation).toContain(`"operationId":"${operationId}"`)
  expect(navigation).toContain(`"catalogItemId":"${catalogItemId}"`)
  expect(navigation).toContain('"next":null')
  const rendered = renderWhatsAppFinalReply(restored)
  expect(rendered.kind).toBe("reply")
  const text = rendered.chunks.join("\n")
  for (const exact of [
    operationId,
    movementId,
    "2.5 Piece entered",
    "2.5 Piece available",
    configurationVersionId,
    "Historical movement, not current stock",
    "This page is not a business total",
    "No total cost snapshot returned",
  ])
    expect(text).toContain(exact)
  expect(
    await db.stockBalanceSource.count({ where: { tenantId, storeId } }),
  ).toBe(1)
}

suite("existing stock receipt WhatsApp app-review crossover", () => {
  test("same protected app chat refuses changed target facts, then records one exact receipt and replays its saved outcome", async () => {
    let externalCalls = 0
    const refuse = () => {
      externalCalls += 1
      throw Error("External HTTP forbidden in owned stock fixture")
    }
    const fetchTrap = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(async () => refuse(), { preconnect: refuse }),
    )
    try {
      const { db, tenantId, storeId, userId, conversationId } = fixture
      const browser = await handoff(
        "stock_receive",
        "Open this saved chat in EwaTrade to review incoming stock.",
      )
      const payload = generalActionSchema.parse({
        action: "stock_receive",
        balanceSourceId,
        enteredInventoryUnitId,
        enteredQuantity: "2.5",
        reason: "Synthetic received stock checked",
        source: "assistant",
      })
      const drafted = await draftGeneralProposal(
        browser,
        conversationId,
        payload,
      )
      const pending = await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: drafted.proposalId },
      })
      expect(pending).toMatchObject({
        actorUserId: userId,
        tenantId,
        storeId,
        conversationId,
        action: "stock_receive",
        targetRecordId: balanceSourceId,
        status: "PENDING",
      })
      const reviewed = await generalProposalWithReview(browser, pending)
      if (!reviewed.review)
        throw Error("Expected complete original stock review")
      const reviewText = reviewed.review.join("\n")
      expect(reviewText).toContain(originalName)
      expect(reviewText).toContain("Receive 2.5 Piece")
      expect(reviewText).toContain("On hand: 0 → 2.5 Piece")
      expect(reviewText).toContain(
        "Unit cost unknown; no purchase payment recorded.",
      )
      const oldDecision = {
        proposalId: pending.id,
        revision: pending.revision,
        approvalToken: reviewed.approvalToken,
        decision: "confirm" as const,
      }
      const item = await db.catalogItem.findUniqueOrThrow({
        where: { id: catalogItemId },
      })
      await catalogRouter.createCaller(browser).updateProductDetails({
        catalogItemId,
        expectedUpdatedAt: item.updatedAt.toISOString(),
        name: renamedName,
      })
      await expect(
        decideGeneralProposal(browser, oldDecision),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(await db.stockOperation.count({ where: { tenantId } })).toBe(0)
      const before = await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: balanceSourceId },
      })
      expect(before.onHandQuantity.toFixed()).toBe("0")
      expect(before.revision).toBe(0)
      const stillPending = await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: pending.id },
      })
      expect(stillPending.status).toBe("PENDING")
      const edited = await editGeneralProposal(browser, {
        proposalId: pending.id,
        revision: pending.revision,
        payload,
      })
      expect(edited.revision).toBe(pending.revision + 1)
      const freshRow = await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: pending.id },
      })
      expect(freshRow.targetRevision).not.toBe(pending.targetRevision)
      const fresh = await generalProposalWithReview(browser, freshRow)
      if (!fresh.review) throw Error("Expected complete fresh stock review")
      expect(fresh.review.join("\n")).toContain(renamedName)
      expect(fresh.review.join("\n")).toContain("On hand: 0 → 2.5 Piece")
      const decision = {
        proposalId: freshRow.id,
        revision: freshRow.revision,
        approvalToken: fresh.approvalToken,
        decision: "confirm" as const,
      }
      const completed = await decideGeneralProposal(browser, decision)
      expect(completed.status).toBe("COMPLETED")
      const receipt = generalReceiptSchema.parse(completed.receipt)
      expect(receipt).toMatchObject({
        kind: "inventory",
        catalogItemId,
        title: "Stock received",
      })
      if (receipt.kind !== "inventory")
        throw Error("Canonical stock receipt required")
      expect(receipt.detail).toContain("2.5 Piece received · on hand 2.5 Piece")
      const operation = await db.stockOperation.findUniqueOrThrow({
        where: { id: receipt.recordId },
        include: { movements: true },
      })
      expect(operation).toMatchObject({
        tenantId,
        storeId,
        actorUserId: userId,
        type: "RECEIPT",
        source: "assistant",
        clientOperationId: freshRow.idempotencyKey,
      })
      expect(operation.movements).toHaveLength(1)
      const movement = operation.movements[0]
      if (!movement) throw Error("Exact canonical receipt movement required")
      expect(movement).toMatchObject({
        balanceSourceId,
        enteredInventoryUnitId,
        configurationVersionId,
        unitCostMinorSnapshot: null,
        totalCostMinorSnapshot: null,
      })
      expect(movement.enteredQuantity.toFixed()).toBe("2.5")
      expect(movement.signedCanonicalEffect.toFixed()).toBe("2.5")
      expect(movement.previousOnHandQuantity.toFixed()).toBe("0")
      expect(movement.resultingOnHandQuantity.toFixed()).toBe("2.5")
      const after = await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: balanceSourceId },
      })
      expect(after.onHandQuantity.toFixed()).toBe("2.5")
      expect(after.reservedQuantity.toFixed()).toBe("0")
      expect(after.revision).toBe(1)
      expect((await decideGeneralProposal(browser, decision)).receipt).toEqual(
        completed.receipt,
      )
      expect(await db.stockOperation.count({ where: { tenantId } })).toBe(1)
      await readSavedReceipt(operation.id, movement.id)
      // All three authorized reads must preserve the actual committed source and original evidence.
      expect(
        await db.stockOperation.findUniqueOrThrow({
          where: { id: operation.id },
          include: { movements: true },
        }),
      ).toEqual(operation)
      expect(
        await db.stockMovement.findUniqueOrThrow({
          where: { id: movement.id },
        }),
      ).toEqual(movement)
      expect(
        await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: balanceSourceId },
        }),
      ).toEqual(after)
      expect(await db.assistantRun.count({ where: { conversationId } })).toBe(1)
      expect(
        await db.assistantWhatsAppActionReview.count({
          where: { bindingId: fixture.principal.bindingId },
        }),
      ).toBe(0)
    } finally {
      fetchTrap.mockRestore()
      expect(externalCalls).toBe(0)
    }
  }, 240_000)
})
