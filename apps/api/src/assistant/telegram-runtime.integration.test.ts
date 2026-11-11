import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { randomInt, randomUUID } from "node:crypto"
import type { DirectTelegramBotProvider } from "@ewatrade/communications"
import { OpenAPIHono } from "@hono/zod-openapi"
import { assertQaAccessAcceptanceDatabase } from "../../../../packages/db/src/queries/acceptance/qa-access/database"
import { registerAssistantTelegramRoutes } from "../communications/telegram-routes"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const marker = `telegram-assistant-${randomUUID()}`
const source = "assistant-telegram-runtime.test"
const actor = {
  userId: `${marker}-user`,
  tenantId: `${marker}-tenant`,
  storeId: `${marker}-store`,
  membershipId: `${marker}-membership`,
  sessionId: `${marker}-session`,
}
const email = `${marker}@example.test`
const botId = randomInt(1_000_000_000, 9_999_999_999)
const telegramId = randomInt(10_000_000_000, 99_999_999_999)
const webhookSecret = "synthetic-telegram-webhook-secret"
const workerSecret = "synthetic-telegram-worker-secret"
const existingName = `Existing customer ${marker.slice(-8)}`
const addedName = `New customer ${marker.slice(-8)}`
const businessName = "Synthetic Telegram business"
const storeName = "Synthetic Telegram Store"
const environment = {
  APP_ENV: "local",
  ASSISTANT_REHEARSAL_MODE: "true",
  ASSISTANT_TELEGRAM_ENABLED: "true",
  ASSISTANT_TELEGRAM_BOT_ID: String(botId),
  ASSISTANT_TELEGRAM_BOT_USERNAME: "ewatrade_rehearsal_bot",
  ASSISTANT_TELEGRAM_BOT_TOKEN: `${botId}:synthetic-telegram-bot-token`,
  ASSISTANT_TELEGRAM_WEBHOOK_SECRET: webhookSecret,
  ASSISTANT_TELEGRAM_PILOT_USER_IDS: actor.userId,
  ASSISTANT_TELEGRAM_PILOT_TENANT_IDS: actor.tenantId,
  ASSISTANT_TELEGRAM_RELEASED_CAPABILITY_IDS: "customers.page,customers.create",
  ASSISTANT_APPROVAL_SIGNING_KEY: "synthetic-telegram-approval-signing-key",
  ASSISTANT_APPROVAL_SIGNING_KEY_VERSION: "v1",
}
const previous = new Map(
  Object.keys(environment).map((key) => [key, process.env[key]]),
)

type Delivery = Parameters<DirectTelegramBotProvider["sendMessage"]>[0] & {
  messageId: string
}
const queuedTurns: string[] = []
const queuedDeliveries: string[] = []
const deliveries: Delivery[] = []
const acknowledged: string[] = []
let update = 0
let externalCalls = 0
let created = false
let db: typeof import("@ewatrade/db").prisma | undefined
let links: typeof import("@ewatrade/db/assistant-telegram")
const app = new OpenAPIHono()

function installFetchTrap() {
  const refuse = () => {
    externalCalls++
    throw Error("External fetch forbidden in Telegram rehearsal")
  }
  return spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => refuse(), { preconnect: refuse }),
  )
}
let fetchTrap: ReturnType<typeof installFetchTrap> | undefined

async function send(
  input: Parameters<DirectTelegramBotProvider["sendMessage"]>[0],
) {
  const messageId = String(deliveries.length + 1000)
  deliveries.push({ ...input, messageId })
  return { status: "accepted" as const, messageId }
}

function chatMessage(messageId: number) {
  return {
    message_id: messageId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: telegramId, type: "private" },
  }
}

const sender = { id: telegramId, is_bot: false }
function messageUpdate(text: string) {
  return {
    update_id: ++update,
    message: { ...chatMessage(update), from: sender, text },
  }
}
function callbackUpdate(data: string, messageId: string) {
  return {
    update_id: ++update,
    callback_query: {
      id: String(update),
      from: sender,
      message: {
        ...chatMessage(Number(messageId)),
        from: { id: botId, is_bot: true },
      },
      data,
    },
  }
}

async function webhook(body: unknown) {
  const response = await app.request("/api/webhooks/telegram", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": webhookSecret },
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(200)
}

async function worker(
  route: "turn" | "delivery",
  body: { ingressId: string } | { outboxId: string },
) {
  const response = await app.request(
    `/api/internal/assistant/telegram-${route}`,
    {
      method: "POST",
      headers: { "x-internal-key": workerSecret },
      body: JSON.stringify(body),
    },
  )
  expect(response.status).toBe(200)
  return response.json()
}

async function exchange(body: unknown) {
  const previousDelivery = deliveries.length
  const previousTurns = queuedTurns.length
  await webhook(body)
  expect(queuedTurns).toHaveLength(previousTurns + 1)
  const ingressId = queuedTurns.at(-1)
  if (!ingressId) throw Error("Expected durable Telegram ingress")
  const previousJobs = queuedDeliveries.length
  expect(await worker("turn", { ingressId })).toMatchObject({
    status: "completed",
  })
  expect(queuedDeliveries).toHaveLength(previousJobs + 1)
  let outboxId = queuedDeliveries.at(-1)
  while (outboxId) {
    const delivered = await worker("delivery", { outboxId })
    expect(delivered.status).toBe("sent")
    outboxId = delivered.nextOutboxId
  }
  return deliveries.slice(previousDelivery)
}

suite("Telegram assistant against guarded development QA", () => {
  beforeAll(async () => {
    assertQaAccessAcceptanceDatabase()
    if (
      new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname !==
      "/ewatrade_qa_v1"
    )
      throw Error("Explicit ewatrade_qa_v1 local QA target required.")
    Object.assign(process.env, environment)
    fetchTrap = installFetchTrap()
    const { prisma } = await import("@ewatrade/db")
    db = prisma
    links = await import("@ewatrade/db/assistant-telegram")
    const runtime = await import("./telegram-runtime")
    registerAssistantTelegramRoutes(app, {
      workerSecret: () => workerSecret,
      accept: runtime.acceptAssistantTelegramUpdate,
      enqueueTurn: async (id) => {
        queuedTurns.push(id)
      },
      processTurn: (id) =>
        runtime.processAssistantTelegramTurn(id, {
          enqueueDelivery: async (outboxId) => {
            queuedDeliveries.push(outboxId)
          },
        }),
      processDelivery: (id) =>
        runtime.processAssistantTelegramDelivery(id, { send }),
      provider: () => ({
        sendMessage: send,
        answerCallbackQuery: async (id) => {
          acknowledged.push(id)
          return true
        },
      }),
    })
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: { id: actor.userId, email, ageBand: "ADULT" },
      })
      await tx.tenant.create({
        data: {
          id: actor.tenantId,
          slug: actor.tenantId,
          name: businessName,
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          currencyCode: "NGN",
          metadata: { retailOps: { subscription: { planId: "pro" } } },
          dataClassification: "QA",
          qaMarkedAt: new Date(),
          qaSourceDomain: source,
        },
      })
      await tx.membership.create({
        data: {
          id: actor.membershipId,
          userId: actor.userId,
          tenantId: actor.tenantId,
          role: "OWNER",
          status: "ACTIVE",
        },
      })
      await tx.store.create({
        data: {
          id: actor.storeId,
          tenantId: actor.tenantId,
          slug: actor.storeId,
          name: storeName,
          status: "ACTIVE",
        },
      })
      await tx.session.create({
        data: {
          id: actor.sessionId,
          userId: actor.userId,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 60 * 60_000),
        },
      })
      await tx.customer.create({
        data: { name: existingName, tenantId: actor.tenantId },
      })
    })
    created = true
  }, 90_000)

  afterAll(async () => {
    try {
      if (db && created) {
        const { tenantId, userId } = actor
        const scopeKey = { startsWith: `assistant:${tenantId}:GENERAL:` }
        const owned = {
          id: tenantId,
          slug: tenantId,
          qaSourceDomain: source,
          dataClassification: "QA" as const,
        }
        expect(await db.tenant.count({ where: owned })).toBe(1)
        const customers = await db.customer.findMany({
          where: { tenantId },
          select: { name: true },
        })
        for (const customer of customers)
          expect([existingName, addedName]).toContain(customer.name)
        expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(0)
        expect(await db.financeBook.count({ where: { tenantId } })).toBe(0)
        await db.$transaction([
          db.assistantBudget.deleteMany({ where: { scopeKey } }),
          db.tenant.deleteMany({ where: owned }),
          db.user.deleteMany({ where: { id: userId, email } }),
        ])
        expect(await db.tenant.count({ where: { id: tenantId } })).toBe(0)
        expect(await db.user.count({ where: { id: userId } })).toBe(0)
        expect(
          await db.assistantTelegramIdentity.count({ where: { userId } }),
        ).toBe(0)
        expect(
          await db.assistantActionProposal.count({ where: { tenantId } }),
        ).toBe(0)
        expect(await db.assistantBudget.count({ where: { scopeKey } })).toBe(0)
      }
    } finally {
      fetchTrap?.mockRestore()
      for (const [key, value] of previous) {
        if (value === undefined) Reflect.deleteProperty(process.env, key)
        else process.env[key] = value
      }
      await db?.$disconnect()
    }
  }, 90_000)

  test("links a private chat, reads a saved customer, confirms a draft, and replays one receipt", async () => {
    if (!db) throw Error("Guarded Telegram fixture unavailable")
    const { tenantId } = actor
    const providerBot = String(botId)
    const link = await links.createAssistantTelegramLink(db, actor, providerBot)
    await webhook(messageUpdate(`/start ${link.code}`))
    const pending = await links.readAssistantTelegramLink(
      db,
      actor,
      link.id,
      providerBot,
    )
    expect(pending.state).toBe("awaiting_confirmation")
    expect(queuedTurns).toHaveLength(0)
    expect(deliveries.at(-1)?.text).toContain(
      pending.maskedSender ?? "missing-sender",
    )
    await links.confirmAssistantTelegramLink(db, actor, {
      linkId: link.id,
      revision: pending.revision,
      botId: providerBot,
    })

    const read = await exchange(
      messageUpdate(`list customers matching ${existingName}`),
    )
    const readText = read.map(({ text }) => text).join("\n")
    expect(readText).toContain(existingName)
    expect(readText).toContain(storeName)

    const draft = await exchange(messageUpdate(`add customer ${addedName}`))
    const review = draft.find((reply) => reply.buttons?.length)
    const confirm = review?.buttons
      ?.flat()
      .find((button) => button.text === "Confirm")?.callbackData
    if (!review || !confirm)
      throw Error("Expected native Telegram customer confirmation")
    expect(review.text).toContain(addedName)
    expect(
      await db.customer.count({ where: { tenantId, name: addedName } }),
    ).toBe(0)

    const wrong = await exchange(
      callbackUpdate(confirm, String(Number(review.messageId) + 50_000)),
    )
    expect(wrong.map(({ text }) => text).join("\n")).toContain(
      "review has expired or changed",
    )
    expect(
      await db.customer.count({ where: { tenantId, name: addedName } }),
    ).toBe(0)

    const action = callbackUpdate(confirm, review.messageId)
    const first = await exchange(action)
    expect(first.map(({ text }) => text).join("\n")).toContain("Customer added")
    const beforeDuplicate = queuedTurns.length
    await webhook(action)
    expect(queuedTurns).toHaveLength(beforeDuplicate)
    const duplicate = await exchange(callbackUpdate(confirm, review.messageId))
    expect(duplicate.map(({ text }) => text)).toEqual(
      first.map(({ text }) => text),
    )
    expect(
      await db.customer.count({ where: { tenantId, name: addedName } }),
    ).toBe(1)
    const proposal = await db.assistantActionProposal.findFirstOrThrow({
      where: { tenantId },
    })
    expect(proposal).toMatchObject({
      action: "customer_create",
      status: "COMPLETED",
      executedResult: { kind: "customer", detail: addedName },
    })
    const runs = await db.assistantRun.findMany({
      where: { conversation: { tenantId } },
      select: { provider: true, status: true },
    })
    expect(runs).toEqual([
      { provider: "ewatrade-rehearsal", status: "COMPLETED" },
      { provider: "ewatrade-rehearsal", status: "COMPLETED" },
    ])
    expect(acknowledged).toHaveLength(4)
    expect(externalCalls).toBe(0)
  }, 240_000)
})
