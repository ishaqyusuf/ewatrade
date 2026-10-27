import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import {
  type GeneralAnswer,
  generalAnswerSchema,
} from "@ewatrade/assistant/general/contracts"
import { PrismaClient } from "@ewatrade/db"
import {
  type WhatsAppGrantPrincipal,
  changeAssistantWhatsAppStore,
  claimAssistantWhatsAppLink,
  confirmAssistantWhatsAppLink,
  createAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
  resolveAssistantWhatsAppConversation,
  selectAssistantWhatsAppConversation,
} from "@ewatrade/db/assistant-whatsapp"
import { createSimpleCatalogItem } from "@ewatrade/db/queries"
import { OpenAPIHono } from "@hono/zod-openapi"
import { PrismaPg } from "@prisma/adapter-pg"
import { readUIMessageStream } from "ai"
import { assertQaAccessAcceptanceDatabase } from "../../../../packages/db/src/queries/acceptance/qa-access/database"
import { appRouter } from "../trpc/routers/_app"
import {
  createLinkedAssistantContext,
  isLinkedAssistantIdentity,
  requireBrowserIdentity,
} from "./channel-principal"
import {
  GENERAL_BUDGET_LIMITS,
  generalBudgetScopeKey,
} from "./general-allowance"
import { registerGeneralAssistantChatRoutes } from "./general-chat-route"
import type { GeneralContext } from "./general-context"
import { generalPersistentParts } from "./general-persistence"
import { createGeneralTools } from "./general-tools"
import { createGeneralAssistantTurn } from "./general-turn"
import type { GeneralUIMessage } from "./general-turn-contract"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const marker = `wa-context-${randomUUID()}`
const userId = `${marker}-user`
const tenantId = `${marker}-tenant`
const storeId = `${marker}-store`
const otherStoreId = `${marker}-second-store`
const outsiderTenantId = `${marker}-outsider`
const membershipId = `${marker}-member`
const sessionId = `${marker}-session`
const phoneNumberId = "90000000000002"
const senderId = `235${Date.now().toString().slice(-10)}`
const conversationId = `${marker}-chat`
const secondConversationId = `${marker}-second-chat`
const query = `Cobalt${marker.slice(-12)}`
const customerId = `${marker}-customer`
const foreignCustomerId = `${marker}-foreign-customer`
const foreignItemId = `${marker}-foreign-item`
const orderId = `${marker}-order`
let catalogItemId: string
let offeringId: string
const envNames = [
  "ASSISTANT_WHATSAPP_ENABLED",
  "ASSISTANT_WHATSAPP_READS_ENABLED",
  "ASSISTANT_WHATSAPP_WRITES_ENABLED",
  "ASSISTANT_WHATSAPP_DISPLAY_NUMBER",
  "ASSISTANT_WHATSAPP_PILOT_USER_IDS",
  "ASSISTANT_WHATSAPP_PILOT_TENANT_IDS",
  "WHATSAPP_OTP_PHONE_NUMBER_ID",
  "WHATSAPP_OTP_ACCESS_TOKEN",
  "ASSISTANT_APPROVAL_SIGNING_KEY",
  "ASSISTANT_REHEARSAL_MODE",
] as const
const previous = Object.fromEntries(
  envNames.map((key) => [key, process.env[key]]),
)
let db: PrismaClient

beforeAll(async () => {
  if (!enabled) return
  assertQaAccessAcceptanceDatabase()
  if (
    new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname !==
    "/ewatrade_qa_v1"
  )
    throw Error("Explicit local QA target required.")
  Object.assign(process.env, {
    ASSISTANT_REHEARSAL_MODE: "true",
    ASSISTANT_WHATSAPP_ENABLED: "true",
    ASSISTANT_WHATSAPP_READS_ENABLED: "true",
    ASSISTANT_WHATSAPP_WRITES_ENABLED: "false",
    ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "2348000000000",
    ASSISTANT_WHATSAPP_PILOT_USER_IDS: userId,
    ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: tenantId,
    WHATSAPP_OTP_PHONE_NUMBER_ID: phoneNumberId,
    WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-no-provider-use",
    ASSISTANT_APPROVAL_SIGNING_KEY:
      "synthetic-approval-signing-key-000000000000000",
  })
  db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.EWATRADE_DATABASE_URL,
      max: 2,
    }),
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  })
  await db.$transaction(async (tx) => {
    await tx.user.create({
      data: { id: userId, email: `${marker}@example.test`, ageBand: "ADULT" },
    })
    for (const id of [tenantId, outsiderTenantId])
      await tx.tenant.create({
        data: {
          id,
          slug: id,
          name: "Synthetic WhatsApp business",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          qaMarkedAt: new Date(),
          qaSourceDomain: "assistant-channel-context.test",
        },
      })
    await tx.membership.create({
      data: {
        id: membershipId,
        userId,
        tenantId,
        role: "OWNER",
        status: "ACTIVE",
      },
    })
    for (const id of [storeId, otherStoreId])
      await tx.store.create({
        data: {
          id,
          tenantId,
          slug: id,
          name: "Synthetic Store",
          status: "ACTIVE",
        },
      })
    await tx.session.create({
      data: {
        id: sessionId,
        userId,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    })
    for (const id of [conversationId, secondConversationId])
      await tx.assistantConversation.create({
        data: {
          id,
          tenantId,
          storeId,
          ownerUserId: userId,
          purpose: "GENERAL",
          status: "ACTIVE",
        },
      })
    for (const id of [tenantId, outsiderTenantId])
      await tx.customer.create({
        data: {
          id: id === tenantId ? customerId : foreignCustomerId,
          tenantId: id,
          name: query,
        },
      })
    await tx.catalogItem.create({
      data: {
        id: foreignItemId,
        tenantId: outsiderTenantId,
        slug: `${marker}-foreign-item`,
        kind: "PRODUCT",
        status: "ACTIVE",
        name: "Foreign synthetic eggs",
      },
    })
    await tx.commercialOrder.create({
      data: {
        id: orderId,
        tenantId,
        storeId,
        customerId,
        customerName: query,
        clientOrderId: `${marker}-order-client`,
        payloadHash: "synthetic-owned-order",
        orderNumber: "WA-OWN-001",
        createdByUserId: userId,
        currencyCode: "NGN",
        subtotalMinor: 12500,
        totalMinor: 12500,
        amountPaidMinor: 5000,
        paymentStatus: "PARTIALLY_PAID",
        payments: {
          create: {
            tenantId,
            storeId,
            clientPaymentId: `${marker}-payment`,
            recordedByUserId: userId,
            amountMinor: 5000,
            method: "CASH",
            type: "PAYMENT",
          },
        },
      },
    })
  })
  const item = await createSimpleCatalogItem(db, {
    actorUserId: userId,
    tenantId,
    storeId,
    clientOperationId: `${marker}-catalog`,
    kind: "product",
    name: "Synthetic linked eggs",
    canonicalUnitName: "crates",
    openingStockQuantity: "24.12",
    priceMinor: 12345,
  })
  catalogItemId = item.id
  const offering = item.variants[0]?.offerings[0]
  if (!offering) throw Error("Owned synthetic offering missing")
  offeringId = offering.id
}, 60_000)

afterAll(async () => {
  for (const key of envNames) {
    if (previous[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = previous[key]
  }
  if (!db) return
  try {
    await db.assistantBudget.deleteMany({
      where: { scopeKey: generalBudgetScopeKey({ tenantId }) },
    })
    // Delete only this fixture's canonical dependants before their restricted parents.
    await db.commercialOrder.deleteMany({ where: { tenantId } })
    await db.stockMovement.deleteMany({ where: { operation: { tenantId } } })
    await db.stockOperation.deleteMany({ where: { tenantId } })
    await db.stockBalanceSource.deleteMany({ where: { tenantId } })
    await db.catalogPriceChange.deleteMany({ where: { tenantId } })
    await db.catalogCommandReceipt.deleteMany({ where: { tenantId } })
    await db.tenant.deleteMany({
      where: {
        id: { in: [tenantId, outsiderTenantId] },
        qaSourceDomain: "assistant-channel-context.test",
      },
    })
    await db.user.deleteMany({
      where: { id: userId, email: `${marker}@example.test` },
    })
  } finally {
    await db.$disconnect()
  }
}, 60_000)

suite("actual linked principal and canonical domain callers", () => {
  test("reads through the shared tool without a browser Session and rejects stale, foreign, write or revoked context", async () => {
    const actor = { userId, tenantId, storeId, membershipId, sessionId }
    const link = await createAssistantWhatsAppLink(db, actor, phoneNumberId)
    expect(
      await claimAssistantWhatsAppLink(db, {
        code: link.code,
        phoneNumberId,
        senderId,
        messageId: `${marker}-claim`,
      }),
    ).toBe(true)
    const grant = await confirmAssistantWhatsAppLink(db, actor, {
      linkId: link.id,
      expectedRevision: 2,
      phoneNumberId,
    })
    const principal: WhatsAppGrantPrincipal = {
      kind: "linked_whatsapp",
      grantId: grant.id,
      grantGeneration: grant.generation,
      identityGeneration: 1,
      phoneNumberId,
      senderId,
    }
    const binding = await selectAssistantWhatsAppConversation(
      db,
      principal,
      conversationId,
    )
    expect(
      await selectAssistantWhatsAppConversation(db, principal, conversationId),
    ).toEqual(binding)
    await expect(
      selectAssistantWhatsAppConversation(
        db,
        principal,
        "unowned-conversation",
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    const ctx = (await createLinkedAssistantContext(
      db,
      binding,
      marker,
    )) as GeneralContext
    expect(isLinkedAssistantIdentity(ctx.session)).toBe(true)
    expect(ctx.session.session).toBeNull()
    expect(() => requireBrowserIdentity(ctx.session)).toThrow()
    expect(ctx.isInternalRequest).toBe(false)
    expect(ctx.assistantConversationId).toBe(conversationId)
    expect(await db.session.count({ where: { userId } })).toBe(1)
    const direct = await appRouter
      .createCaller({ ...ctx, assistantReadCapabilityId: "search.records" })
      .search.global({ query })
    expect(
      direct.filter((item) => item.type === "customer" && item.title === query),
    ).toHaveLength(1)
    const facts: GeneralAnswer[] = []
    const tools = createGeneralTools(
      ctx,
      conversationId,
      () => {},
      (answer) => facts.push(answer),
    )
    expect(Object.keys(tools).sort()).toEqual(
      [
        "searchRecords",
        "readCatalogHistory",
        "readCatalogItem",
        "readInventoryTotals",
        "readInventoryBalances",
        "readOfferingStock",
        "readOrders",
        "readSalesSummary",
        "readOrder",
        "readCustomer",
        "readOrderSummary",
        "readLowStock",
        "readCatalogCount",
        "readOrderContactCount",
        "readCustomerCount",
        "readStoreCount",
        "readCustomers",
        "readCatalogPage",
        "lookupOpenOrders",
        "readPurchaseRegistrations",
        "readPurchaseRecognition",
        "readPurchaseBills",
        "readPurchaseBill",
        "readSuppliers",
        "readSupplierStatement",
        "readExpenseCategories",
        "readMoneyAccountBalances",
        "readMoneyAccounts",
        "readServices",
        "readReceivables",
        "readCustomerAccounts",
        "readStockCount",
        "readStockOperations",
        "readStockOperation",
        "readInventoryCloseouts",
        "readInventoryCloseout",
        "readStockTransfers",
        "readStockTransfer",
        "handoffAction",
      ].sort(),
    )
    const search = tools.searchRecords?.execute
    if (!search) throw Error("Shared search tool missing")
    const result = (await search(
      { query },
      { toolCallId: "linked-search", messages: [] },
    )) as { status: string; data: Array<{ type: string; title: string }> }
    expect(result.status).toBe("available")
    expect(
      result.data.filter(
        (item) => item.type === "customer" && item.title === query,
      ),
    ).toHaveLength(1)
    const customerCaller = appRouter.createCaller({
      ...ctx,
      assistantReadCapabilityId: "customers.read",
    })
    expect(
      await customerCaller.customers.getById({ customerId }),
    ).toMatchObject({ id: customerId, name: query })
    await expect(
      customerCaller.customers.getById({ customerId: foreignCustomerId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    const catalogCaller = appRouter.createCaller({
      ...ctx,
      assistantReadCapabilityId: "catalog.item.read",
    })
    await expect(
      catalogCaller.catalog.detail.overview({ itemId: foreignItemId, storeId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      catalogCaller.catalog.detail.overview({
        itemId: `${marker}-missing-item`,
        storeId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    const catalogRead = tools.readCatalogItem?.execute
    const stockRead = tools.readOfferingStock?.execute
    const orderRead = tools.readOrder?.execute
    if (!catalogRead || !stockRead || !orderRead)
      throw Error("Approved linked read tool missing")
    expect(
      await catalogRead(
        { itemId: catalogItemId },
        { toolCallId: "linked-catalog", messages: [] },
      ),
    ).toMatchObject({ status: "available", data: { id: catalogItemId } })
    expect(
      await stockRead(
        { offeringId },
        { toolCallId: "linked-stock", messages: [] },
      ),
    ).toMatchObject({
      status: "available",
      data: { availableOfferingQuantity: "24.12", offeringUnitName: "crates" },
    })
    expect(
      await orderRead(
        { orderId },
        { toolCallId: "linked-order", messages: [] },
      ),
    ).toMatchObject({
      status: "available",
      data: { id: orderId, balanceDueMinor: 7500 },
    })
    expect(facts.some((answer) => answer.value === "₦123.45")).toBe(true)
    expect(
      facts.some((answer) => answer.value === "24.12 crates available"),
    ).toBe(true)
    expect(
      facts.some(
        (answer) =>
          answer.value === "₦125.00" && answer.detail.includes("unpaid ₦75.00"),
      ),
    ).toBe(true)
    expect(
      facts.some(
        (answer) =>
          answer.title === "Recorded payment" && answer.value === "₦50.00",
      ),
    ).toBe(true)
    expect(
      facts.every((answer) => generalAnswerSchema.safeParse(answer).success),
    ).toBe(true)
    // Actual shared turn: canonical customer facts, durable saved answer and shared usage.
    const turnInput = {
      conversationId,
      requestId: `${marker}-turn`,
      message: {
        id: `${marker}-message`,
        role: "user" as const,
        parts: [{ type: "text" as const, text: `read customer ${customerId}` }],
      },
    }
    const turn = await createGeneralAssistantTurn(ctx, turnInput)
    let answer: GeneralUIMessage | undefined
    for await (const message of readUIMessageStream<GeneralUIMessage>({
      stream: turn.stream,
    }))
      answer = message
    const completion = await turn.completion
    expect(completion).toMatchObject({
      runId: turn.runId,
      status: "COMPLETED",
      persisted: true,
    })
    expect(completion.assistantMessageId).toBeTruthy()
    expect(answer?.parts.some((part) => part.type === "text")).toBe(true)
    if (!completion.assistantMessageId)
      throw Error("Shared reply was not persisted")
    const saved = await db.assistantMessage.findUniqueOrThrow({
      where: { id: completion.assistantMessageId },
    })
    expect(saved.conversationId).toBe(conversationId)
    expect<unknown>(saved.parts).toEqual(
      generalPersistentParts(answer?.parts ?? []),
    )
    const savedFacts = generalPersistentParts(
      Array.isArray(saved.parts) ? saved.parts : [],
    ).flatMap((part) =>
      part.type === "data-general-answer" ? [part.data] : [],
    )
    expect(
      savedFacts.some(
        (answer) => answer.title === query && answer.value === "Saved customer",
      ),
    ).toBe(true)
    expect(
      savedFacts.some(
        (answer) =>
          answer.title === "WA-OWN-001" &&
          answer.detail.includes("PARTIALLY_PAID"),
      ),
    ).toBe(true)
    expect(
      savedFacts.every(
        (answer) => generalAnswerSchema.safeParse(answer).success,
      ),
    ).toBe(true)
    const rendered = renderWhatsAppFinalReply(saved.parts)
    expect(rendered.kind).toBe("reply")
    expect(rendered.chunks.join("\n")).toContain(query)
    expect(rendered.chunks.join("\n")).toContain("WA-OWN-001")
    expect(rendered.chunks.join("\n")).not.toContain(customerId)
    const run = await db.assistantRun.findUniqueOrThrow({
      where: { id: turn.runId },
    })
    expect(run.provider).toBe("ewatrade-rehearsal")
    expect(run.promptVersion).toContain("/whatsapp-v1")
    const usage = await db.assistantUsageEvent.findFirstOrThrow({
      where: { runId: turn.runId },
    })
    expect(usage.outcome).toBe("success")
    expect(usage.stepCount).toBeGreaterThanOrEqual(2)
    const budgetKey = generalBudgetScopeKey({ tenantId })
    const budget = await db.assistantBudget.findUniqueOrThrow({
      where: { scopeKey: budgetKey },
    })
    expect(budget.requests).toBe(1)
    await expect(
      createGeneralAssistantTurn(ctx, turnInput),
    ).rejects.toMatchObject({ code: "REQUEST_REPLAYED", status: 409 })
    expect(
      (
        await db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: budgetKey },
        })
      ).requests,
    ).toBe(1)
    expect(await db.assistantRun.count({ where: { conversationId } })).toBe(1)
    // Existing browser transport consumes the same service, budget and history.
    const browser: GeneralContext = {
      ...ctx,
      session: {
        session: await db.session.findUniqueOrThrow({
          where: { id: sessionId },
        }),
        user: await db.user.findUniqueOrThrow({ where: { id: userId } }),
      },
      assistantConversationId: undefined,
      requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    }
    const app = new OpenAPIHono()
    let browserTurn:
      | Awaited<ReturnType<typeof createGeneralAssistantTurn>>
      | undefined
    registerGeneralAssistantChatRoutes(app, {
      admit: async () => browser,
      createTurn: async (...args) => {
        browserTurn = await createGeneralAssistantTurn(...args)
        return browserTurn
      },
    })
    const response = await app.request("/api/assistant/general/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...turnInput,
        requestId: `${marker}-browser`,
        message: { ...turnInput.message, id: `${marker}-browser-message` },
      }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const chunks = (await response.text())
      .split("\n")
      .flatMap((line) =>
        line.startsWith("data: {") ? [JSON.parse(line.slice(6))] : [],
      )
    expect(
      chunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.delta)
        .join(""),
    ).toBe("Here's what I found.")
    if (!browserTurn) throw Error("Browser turn did not start")
    expect(await browserTurn.completion).toMatchObject({
      status: "COMPLETED",
      persisted: true,
    })
    expect(
      (
        await db.assistantRun.findUniqueOrThrow({
          where: { id: browserTurn.runId },
        })
      ).promptVersion,
    ).not.toContain("/whatsapp-v1")
    expect(
      (
        await db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: budgetKey },
        })
      ).requests,
    ).toBe(2)
    expect(
      await db.assistantUsageEvent.count({
        where: { run: { conversationId } },
      }),
    ).toBe(2)
    await expect(
      createGeneralAssistantTurn(ctx, {
        ...turnInput,
        conversationId: secondConversationId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      createGeneralAssistantTurn(ctx, { ...turnInput, actorUserId: "foreign" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      createGeneralAssistantTurn(ctx, {
        ...turnInput,
        message: {
          ...turnInput.message,
          parts: [
            {
              type: "data-setup-attachment",
              data: { attachmentId: "foreign-attachment" },
            },
          ],
        },
      }),
    ).rejects.toBeDefined()
    expect(await db.assistantRun.count({ where: { conversationId } })).toBe(2)
    const active = await db.assistantRun.create({
      data: {
        actorUserId: userId,
        conversationId,
        model: "rehearsal-v1",
        provider: "ewatrade-rehearsal",
        promptVersion: "synthetic",
        requestId: `${marker}-active`,
      },
    })
    await expect(
      createGeneralAssistantTurn(ctx, {
        ...turnInput,
        requestId: `${marker}-while-active`,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await db.assistantRun.delete({ where: { id: active.id } })
    await db.assistantBudget.update({
      where: { scopeKey: budgetKey },
      data: { tokens: GENERAL_BUDGET_LIMITS.maxTokens },
    })
    await expect(
      createGeneralAssistantTurn(ctx, {
        ...turnInput,
        requestId: `${marker}-budget`,
        message: { ...turnInput.message, id: `${marker}-budget-message` },
      }),
    ).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED", status: 429 })
    expect(
      await db.assistantRun.count({
        where: {
          conversationId,
          status: "FAILED",
          errorCode: "BUDGET_EXHAUSTED",
        },
      }),
    ).toBe(1)
    expect(
      (
        await db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: budgetKey },
        })
      ).tokens,
    ).toBe(GENERAL_BUDGET_LIMITS.maxTokens)
    await db.assistantBudget.update({
      where: { scopeKey: budgetKey },
      data: { requests: 2, tokens: 0 },
    })
    await db.membership.update({
      where: { id: membershipId },
      data: { role: "CASHIER" },
    })
    const narrowed = (await search(
      { query },
      { toolCallId: "role-narrowed", messages: [] },
    )) as { status: string; data: Array<{ type: string }> }
    expect(narrowed.status).toBe("available")
    expect(narrowed.data.some((item) => item.type === "customer")).toBe(false)
    await db.membership.update({
      where: { id: membershipId },
      data: { role: "OWNER" },
    })
    await expect(
      appRouter.createCaller(ctx).assistant.start(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      appRouter.createCaller(ctx).accountPrivacy.deletionRequest(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      appRouter
        .createCaller({ ...ctx, assistantReadCapabilityId: "search.records" })
        .orders.get({ orderId: "guessed" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    const second = await selectAssistantWhatsAppConversation(
      db,
      principal,
      secondConversationId,
    )
    await expect(
      resolveAssistantWhatsAppConversation(db, binding),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      appRouter
        .createCaller({ ...ctx, assistantReadCapabilityId: "search.records" })
        .search.global({ query }),
    ).rejects.toBeDefined()
    expect(
      (
        await db.assistantConversation.findUniqueOrThrow({
          where: { id: conversationId },
        })
      ).status,
    ).toBe("ACTIVE")
    await expect(
      createGeneralAssistantTurn(ctx, {
        ...turnInput,
        requestId: `${marker}-stale`,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(
      (await resolveAssistantWhatsAppConversation(db, second)).conversation.id,
    ).toBe(secondConversationId)
    await db.assistantConversation.update({
      where: { id: secondConversationId },
      data: { purpose: "SETUP" },
    })
    await expect(
      resolveAssistantWhatsAppConversation(db, second),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await db.assistantConversation.update({
      where: { id: secondConversationId },
      data: { purpose: "GENERAL" },
    })
    process.env.ASSISTANT_WHATSAPP_ENABLED = "false"
    await expect(
      createLinkedAssistantContext(db, second, marker),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    process.env.ASSISTANT_WHATSAPP_ENABLED = "true"
    await db.membership.update({
      where: { id: membershipId },
      data: { status: "SUSPENDED" },
    })
    await expect(
      createLinkedAssistantContext(db, second, marker),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await db.membership.update({
      where: { id: membershipId },
      data: { status: "ACTIVE" },
    })
    const moved = await changeAssistantWhatsAppStore(
      db,
      principal,
      otherStoreId,
    )
    expect(moved.tenantContext.activeStore?.id).toBe(otherStoreId)
    await expect(
      resolveAssistantWhatsAppConversation(db, second),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      selectAssistantWhatsAppConversation(db, moved.principal, conversationId),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await db.membership.update({
      where: { id: membershipId },
      data: { status: "SUSPENDED" },
    })
    expect(
      await disconnectAssistantWhatsApp(db, { phoneNumberId, senderId }),
    ).toEqual({ disconnected: true })
    expect(
      (
        await db.assistantWhatsAppIdentity.findUniqueOrThrow({
          where: { phoneNumberId_senderId: { phoneNumberId, senderId } },
        })
      ).revokedAt,
    ).not.toBeNull()
    expect(await db.session.count({ where: { userId } })).toBe(1)
  }, 240_000)
})
