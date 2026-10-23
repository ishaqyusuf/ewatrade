import { afterAll, beforeAll, expect, test } from "bun:test"
import { createHmac, randomUUID } from "node:crypto"
import { DirectMetaWhatsAppProvider } from "@ewatrade/communications"
import { PrismaClient } from "@ewatrade/db"
import {
  acceptAssistantWhatsAppIngress,
  acceptAssistantWhatsAppStatus,
  beginAssistantWhatsAppDelivery,
  claimAssistantWhatsAppLink,
  confirmAssistantWhatsAppLink,
  createAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
  finishAssistantWhatsAppDelivery,
  firstAssistantWhatsAppOutboxForIngress,
  nextAssistantWhatsAppOutbox,
  processAssistantWhatsAppControl,
  readAssistantWhatsAppLink,
} from "@ewatrade/db/assistant-whatsapp"
import { OpenAPIHono } from "@hono/zod-openapi"
import { PrismaPg } from "@prisma/adapter-pg"
import { assertQaAccessAcceptanceDatabase } from "../../../../packages/db/src/queries/acceptance/qa-access/database"
import { processPlatformWhatsAppEvent } from "../communications/whatsapp-platform-runtime"
import { handleWhatsAppWebhookRequest } from "../communications/whatsapp-runtime"
import { processAssistantChannelDelivery } from "./channel-delivery"
import {
  defaultChannelTurnDependencies,
  processAssistantChannelTurn,
} from "./channel-turn"
import { registerAssistantChannelTurnRoute } from "./channel-turn-route"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const run = enabled ? test : test.skip
const marker = `wa-controls-http-${randomUUID()}`
const userId = `${marker}-user`
const phoneNumberId = "90000000000003"
const senderId = `239${Date.now().toString().slice(-10)}`
const businessA = `${marker}-a`
const businessB = `${marker}-b`
const storeA = `${marker}-a-store`
const storeB = `${marker}-b-store-1`
const storeB2 = `${marker}-b-store-2`
const secret = "synthetic-control-signature-only"
const serviceKey = "synthetic-worker-only"
let db: PrismaClient
const originalSecret = process.env.META_APP_SECRET
const previousPilotTenants = process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS
const env = {
  ASSISTANT_WHATSAPP_ENABLED: "true",
  ASSISTANT_WHATSAPP_PILOT_USER_IDS: userId,
  ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: [businessA, businessB].join(","),
  ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "2348000000000",
  WHATSAPP_OTP_PHONE_NUMBER_ID: phoneNumberId,
  WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-no-live-provider",
}
const turns: string[] = []
let providerCalls = 0
let providerId = ""
let callbackData = ""
let sentBody = ""
const fakeProvider = new DirectMetaWhatsAppProvider({
  fetch: Object.assign(
    async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.to).toBe(senderId)
      expect(body.type).toBe("text")
      providerCalls++
      providerId = `${marker}-provider-${providerCalls}`
      callbackData = body.biz_opaque_callback_data
      sentBody = body.text.body
      return Response.json({ messages: [{ id: providerId }] })
    },
    { preconnect: fetch.preconnect },
  ) as typeof fetch,
})
const actor = (tenantId: string, storeId: string) => ({
  userId,
  sessionId: marker,
  tenantId,
  storeId,
  membershipId: `${tenantId}-member`,
})
beforeAll(async () => {
  if (!enabled) return
  assertQaAccessAcceptanceDatabase()
  if (
    new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname !==
    "/ewatrade_qa_v1"
  )
    throw Error("Explicit local QA target required")
  db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.EWATRADE_DATABASE_URL,
      max: 2,
    }),
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  })
  process.env.META_APP_SECRET = secret
  process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = [businessA, businessB].join(
    ",",
  )
  const now = new Date()
  await db.$transaction(async (tx) => {
    await tx.user.create({
      data: { id: userId, email: `${marker}@example.test`, ageBand: "ADULT" },
    })
    await tx.session.create({
      data: {
        id: marker,
        userId,
        token: randomUUID(),
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
      },
    })
    await tx.tenant.createMany({
      data: [businessA, businessB].map((id, i) => ({
        id,
        slug: id,
        name: i ? "HTTP business B" : "HTTP business A",
        type: "MERCHANT" as const,
        enabledModes: ["MERCHANT" as const],
        dataClassification: "QA" as const,
        qaMarkedAt: now,
        qaSourceDomain: "assistant-controls-http.test",
      })),
    })
    await tx.membership.createMany({
      data: [businessA, businessB].map((tenantId) => ({
        id: `${tenantId}-member`,
        userId,
        tenantId,
        role: "OWNER" as const,
        status: "ACTIVE" as const,
      })),
    })
    await tx.store.createMany({
      data: [
        {
          id: storeA,
          slug: storeA,
          tenantId: businessA,
          name: "HTTP Store A",
          status: "ACTIVE",
        },
        {
          id: storeB,
          slug: storeB,
          tenantId: businessB,
          name: "HTTP Store B1",
          status: "ACTIVE",
        },
        {
          id: storeB2,
          slug: storeB2,
          tenantId: businessB,
          name: "HTTP Store B2",
          status: "ACTIVE",
        },
      ],
    })
  })
}, 60_000)
afterAll(async () => {
  if (previousPilotTenants === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_WHATSAPP_PILOT_TENANT_IDS")
  else process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = previousPilotTenants
  if (originalSecret === undefined)
    Reflect.deleteProperty(process.env, "META_APP_SECRET")
  else process.env.META_APP_SECRET = originalSecret
  if (!db) return
  try {
    await db.tenant.deleteMany({
      where: {
        id: { in: [businessA, businessB] },
        qaSourceDomain: "assistant-controls-http.test",
      },
    })
    await db.user.deleteMany({
      where: { id: userId, email: `${marker}@example.test` },
    })
    expect(
      await db.assistantWhatsAppIdentity.count({ where: { userId } }),
    ).toBe(0)
  } finally {
    await db.$disconnect()
  }
}, 60_000)
async function webhook(value: unknown) {
  const body = JSON.stringify({ entry: [{ changes: [{ value }] }] })
  return handleWhatsAppWebhookRequest(
    new Request("https://api.example.test/api/webhooks/whatsapp", {
      method: "POST",
      body,
      headers: {
        "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
      },
    }),
    marker,
    {
      processPlatformEvent: (event) =>
        processPlatformWhatsAppEvent(event, {
          env,
          receipt: (event) => acceptAssistantWhatsAppStatus(db, event),
          accept: (input, permitted) =>
            acceptAssistantWhatsAppIngress(db, input, permitted),
          enqueue: async (id) => {
            turns.push(id)
          },
          claim: (input) => claimAssistantWhatsAppLink(db, input),
          disconnect: (input) => disconnectAssistantWhatsApp(db, input),
        }),
    },
  )
}
async function incoming(text: string, replyTo?: string, sender = senderId) {
  const response = await webhook({
    metadata: { phone_number_id: phoneNumberId },
    messages: [
      {
        id: `${marker}-in-${randomUUID()}`,
        from: sender,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body: text },
        ...(replyTo ? { context: { id: replyTo } } : {}),
      },
    ],
  })
  expect(response.status).toBe(200)
}
run(
  "signed existing platform webhook -> ID-only control worker -> actual Meta adapter with fake fetch -> exact native selection",
  async () => {
    const linkA = await createAssistantWhatsAppLink(
      db,
      actor(businessA, storeA),
      phoneNumberId,
    )
    await incoming(`Connect to EwaTrade: ${linkA.code}`)
    const pendingA = await readAssistantWhatsAppLink(
      db,
      actor(businessA, storeA),
      linkA.id,
      phoneNumberId,
    )
    await confirmAssistantWhatsAppLink(db, actor(businessA, storeA), {
      linkId: linkA.id,
      expectedRevision: pendingA.revision,
      phoneNumberId,
    })
    const identity = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
      where: { phoneNumberId_senderId: { phoneNumberId, senderId } },
    })
    if (!identity.activeBindingId)
      throw Error("Confirmation did not bootstrap its exact General chat")
    const initial = await db.assistantWhatsAppBinding.findUniqueOrThrow({
      where: { id: identity.activeBindingId },
      include: { conversation: true },
    })
    expect(initial.conversation).toMatchObject({
      tenantId: businessA,
      storeId: storeA,
      ownerUserId: userId,
      purpose: "GENERAL",
      status: "ACTIVE",
    })
    const linkB = await createAssistantWhatsAppLink(
      db,
      actor(businessB, storeB),
      phoneNumberId,
    )
    await incoming(`Connect to EwaTrade: ${linkB.code}`)
    const pendingB = await readAssistantWhatsAppLink(
      db,
      actor(businessB, storeB),
      linkB.id,
      phoneNumberId,
    )
    await confirmAssistantWhatsAppLink(db, actor(businessB, storeB), {
      linkId: linkB.id,
      expectedRevision: pendingB.revision,
      phoneNumberId,
    })
    expect(
      (
        await db.assistantWhatsAppIdentity.findUniqueOrThrow({
          where: { id: identity.id },
        })
      ).activeBindingId,
    ).toBe(initial.id)
    expect(turns).toHaveLength(0)
    const worker = new OpenAPIHono()
    const deliveries: string[] = []
    registerAssistantChannelTurnRoute(worker, {
      secret: () => serviceKey,
      process: (id) =>
        processAssistantChannelTurn(id, {
          ...defaultChannelTurnDependencies(),
          enabled: () => true,
          control: (id) => processAssistantWhatsAppControl(db, id, [userId]),
          claim: async () => {
            throw Error("Menu must not enter model claim")
          },
        }),
      dispatch: async (id) => {
        const outbox = await firstAssistantWhatsAppOutboxForIngress(db, id)
        if (outbox) deliveries.push(outbox.id)
      },
    })
    const cycle = async (text: string, quote?: string) => {
      const before = turns.length
      await incoming(text, quote)
      expect(turns).toHaveLength(before + 1)
      const ingressId = turns.at(-1)
      if (!ingressId) throw Error("Missing durable control ID")
      const response = await worker.request(
        "/api/internal/assistant/channel-turn",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-key": serviceKey,
          },
          body: JSON.stringify({ ingressId }),
        },
      )
      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.status).toBe("completed")
      expect(JSON.stringify(result)).not.toContain("HTTP business")
      const outboxId = deliveries.at(-1)
      if (!outboxId) throw Error("Missing durable menu outbox")
      expect(
        await processAssistantChannelDelivery(outboxId, {
          config: () => ({
            accessToken: "synthetic-no-live-provider",
            phoneNumberId,
            displayNumber: env.ASSISTANT_WHATSAPP_DISPLAY_NUMBER,
            permittedUserIds: [userId],
          }),
          begin: (id, options) =>
            beginAssistantWhatsAppDelivery(db, id, {
              ...options,
              providerMode: "test",
            }),
          finish: (proof, outcome) =>
            finishAssistantWhatsAppDelivery(db, proof, outcome),
          send: (input) => fakeProvider.sendText(input),
          next: (id) => nextAssistantWhatsAppOutbox(db, id),
        }),
      ).toMatchObject({ status: "sent" })
      return { providerId, callbackData, body: sentBody, outboxId }
    }
    const business = await cycle("Business")
    expect(business.body).toContain("1. HTTP business A")
    expect(business.body).toContain("2. HTTP business B")
    const stores = await cycle("Choose 2", business.providerId)
    expect(stores.body).toContain("Choose a Store · HTTP business B")
    expect(stores.body).toContain("1. HTTP Store B1")
    expect(stores.body).toContain("2. HTTP Store B2")
    const review = await cycle("Choose 2", stores.providerId)
    expect(review.body).toContain("Switching starts a new chat")
    const selected = await cycle("Choose 1", review.providerId)
    expect(selected.body).toContain("New chat started")
    expect(selected.body).toContain("HTTP Store B2")
    const active = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
      where: { id: identity.id },
    })
    expect(
      (
        await db.assistantWhatsAppBinding.findUniqueOrThrow({
          where: { id: active.activeBindingId ?? "missing" },
          include: { conversation: true },
        })
      ).conversation,
    ).toMatchObject({
      tenantId: businessB,
      storeId: storeB2,
      purpose: "GENERAL",
    })
    expect(
      await db.assistantRun.count({ where: { actorUserId: userId } }),
    ).toBe(0)
    expect(await db.session.count({ where: { userId } })).toBe(1)
    const before = turns.length
    await incoming("123456", undefined, "2340000000007")
    expect(turns).toHaveLength(before)
    expect(
      await db.assistantWhatsAppIdentity.count({ where: { userId } }),
    ).toBe(1)
    const receipt = await webhook({
      metadata: { phone_number_id: phoneNumberId },
      statuses: [
        {
          id: selected.providerId,
          recipient_id: senderId,
          status: "read",
          timestamp: String(Math.floor(Date.now() / 1000)),
          biz_opaque_callback_data: selected.callbackData,
        },
      ],
    })
    expect(receipt.status).toBe(200)
    expect(
      (
        await db.assistantWhatsAppOutbox.findUniqueOrThrow({
          where: { id: selected.outboxId },
        })
      ).state,
    ).toBe("READ")
    expect(providerCalls).toBe(4)
  },
  300_000,
)
