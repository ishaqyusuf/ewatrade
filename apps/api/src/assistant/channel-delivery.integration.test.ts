import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  DirectMetaWhatsAppProvider,
  WhatsAppProviderSendError,
} from "@ewatrade/communications"
import { PrismaClient } from "@ewatrade/db"
import {
  acceptAssistantWhatsAppStatus,
  assistantWhatsAppAuthorityDigest,
  assistantWhatsAppPrivacyInventory,
  beginAssistantWhatsAppDelivery,
  finishAssistantWhatsAppDelivery,
  listAssistantWhatsAppOutboxRecovery,
  nextAssistantWhatsAppOutbox,
  resolveAssistantWhatsAppConversation,
} from "@ewatrade/db/assistant-whatsapp"
import { OpenAPIHono } from "@hono/zod-openapi"
import { PrismaPg } from "@prisma/adapter-pg"
import { assertQaAccessAcceptanceDatabase } from "../../../../packages/db/src/queries/acceptance/qa-access/database"
import { stageAssistantWhatsAppOutboxInTransaction } from "../../../../packages/db/src/queries/assistant-whatsapp/outbox"
import {
  type ChannelDeliveryDependencies,
  processAssistantChannelDelivery,
} from "./channel-delivery"
import { registerAssistantChannelDeliveryRoute } from "./channel-delivery-route"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const marker = `wa-delivery-${randomUUID()}`
const userId = `${marker}-user`
const tenantId = `${marker}-tenant`
const storeId = `${marker}-store`
const membershipId = `${marker}-membership`
const identityId = `${marker}-identity`
const grantId = `${marker}-grant`
const phoneNumberId = "90000000000006"
const senderId = `237${Date.now().toString().slice(-10)}`
const previousPilotTenants = process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS
let db: PrismaClient
let sequence = 0
beforeAll(async () => {
  if (!enabled) return
  assertQaAccessAcceptanceDatabase()
  process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = tenantId
  if (
    new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname !==
    "/ewatrade_qa_v1"
  )
    throw Error("Explicit local QA target required")
  db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.EWATRADE_DATABASE_URL,
      max: 3,
    }),
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  })
  await db.$transaction(async (tx) => {
    const now = new Date()
    const expiresAt = new Date(Date.now() + 3600_000)
    await tx.user.create({
      data: { id: userId, email: `${marker}@example.test`, ageBand: "ADULT" },
    })
    await tx.tenant.create({
      data: {
        id: tenantId,
        slug: tenantId,
        name: "Synthetic delivery business",
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        dataClassification: "QA",
        qaMarkedAt: now,
        qaSourceDomain: "assistant-whatsapp-delivery.test",
      },
    })
    await tx.store.create({
      data: {
        id: storeId,
        tenantId,
        slug: storeId,
        name: "Synthetic Store",
        status: "ACTIVE",
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
    await tx.assistantWhatsAppIdentity.create({
      data: { id: identityId, userId, phoneNumberId, senderId },
    })
    await tx.assistantWhatsAppGrant.create({
      data: {
        id: grantId,
        identityId,
        tenantId,
        membershipId,
        storeId,
        consentedAt: now,
        lastUsedAt: now,
        expiresAt,
        idleExpiresAt: expiresAt,
      },
    })
  })
}, 60_000)
afterAll(async () => {
  if (!db) return
  try {
    await db.tenant.deleteMany({
      where: {
        id: tenantId,
        qaSourceDomain: "assistant-whatsapp-delivery.test",
      },
    })
    expect(
      await db.assistantWhatsAppAttempt.count({
        where: { outbox: { inbox: { binding: { identityId } } } },
      }),
    ).toBe(0)
    expect(
      await db.assistantWhatsAppReceipt.count({
        where: { attempt: { outbox: { inbox: { binding: { identityId } } } } },
      }),
    ).toBe(0)
    await db.user.deleteMany({
      where: { id: userId, email: `${marker}@example.test` },
    })
  } finally {
    await db.$disconnect()
    if (previousPilotTenants === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_WHATSAPP_PILOT_TENANT_IDS")
    else process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = previousPilotTenants
  }
}, 60_000)
/** Transport fixtures use the real canonical graph, fresh policy digest and atomic renderer/staging. */
async function savedReply(
  text = "Exact saved reply.",
  occurredAt = new Date(),
) {
  const id = `${marker}-${++sequence}`
  await db.$transaction(async (tx) => {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 3600_000)
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
    await tx.assistantWhatsAppBinding.create({
      data: {
        id,
        identityId,
        grantId,
        identityGeneration: 1,
        grantGeneration: 1,
        selectionGeneration: sequence,
        conversationId: id,
        purpose: "GENERAL",
      },
    })
    await tx.assistantWhatsAppIdentity.update({
      where: { id: identityId },
      data: { activeBindingId: id, selectionGeneration: sequence },
    })
    const resolved = await resolveAssistantWhatsAppConversation(tx, {
      kind: "linked_whatsapp",
      phoneNumberId,
      senderId,
      grantId,
      identityGeneration: 1,
      grantGeneration: 1,
      selectionGeneration: sequence,
      bindingId: id,
    })
    const digest = await assistantWhatsAppAuthorityDigest(tx, resolved)
    await tx.assistantMessage.create({
      data: {
        id,
        conversationId: id,
        sequence: 1,
        role: "assistant",
        parts: [{ type: "text", text }],
      },
    })
    const run = await tx.assistantRun.create({
      data: {
        id,
        conversationId: id,
        actorUserId: userId,
        requestId: id,
        status: "COMPLETED",
        assistantMessageId: id,
        provider: "ewatrade-rehearsal",
        model: "rehearsal-v1",
        promptVersion: "synthetic",
      },
      include: { assistantMessage: { select: { parts: true } } },
    })
    const inbox = await tx.assistantWhatsAppInbox.create({
      data: {
        id,
        bindingId: id,
        sequence: 1,
        phoneNumberId,
        providerMessageId: id,
        requestId: id,
        userMessageId: `${id}-input`,
        contentDigest: "a".repeat(64),
        providerOccurredAt: occurredAt,
        expiresAt,
        state: "COMPLETED",
        executionAuthorityDigest: digest,
        runId: id,
      },
    })
    await stageAssistantWhatsAppOutboxInTransaction(
      tx,
      inbox,
      run,
      digest,
      "Synthetic delivery business · Synthetic Store",
    )
  })
  return db.assistantWhatsAppOutbox.findMany({
    where: { inboxId: id },
    orderBy: { chunkIndex: "asc" },
  })
}
function dependencies(
  send: ChannelDeliveryDependencies["send"],
): ChannelDeliveryDependencies {
  return {
    config: () => ({
      accessToken: "synthetic-no-provider",
      phoneNumberId,
      displayNumber: "2348000000000",
      permittedUserIds: [userId],
    }),
    begin: (id, options) =>
      beginAssistantWhatsAppDelivery(db, id, {
        ...options,
        providerMode: "test",
      }),
    finish: (proof, outcome) =>
      finishAssistantWhatsAppDelivery(db, proof, outcome),
    next: (id) => nextAssistantWhatsAppOutbox(db, id),
    send,
  }
}
const timestamp = () => String(Math.floor(Date.now() / 1000))
suite("actual assistant delivery and signed-receipt repository", () => {
  test("duplicate HTTP workers send once, ordered chunks and callback receipts reconcile unknown without resend", async () => {
    const rows = await savedReply(
      "A complete saved result with exact records. ".repeat(140),
    )
    expect(rows.length).toBeGreaterThan(1)
    const first = rows[0]
    if (!first) throw Error("Missing fixture")
    const recovery = await listAssistantWhatsAppOutboxRecovery(db)
    expect(recovery.some((row) => row.id === first.id)).toBe(true)
    expect(recovery.some((row) => row.id === rows[1]?.id)).toBe(false)
    const calls: Array<Parameters<ChannelDeliveryDependencies["send"]>[0]> = []
    const deps = dependencies(async (input) => {
      calls.push(input)
      return { messageId: `wamid.${marker}.${calls.length}` }
    })
    expect(
      await processAssistantChannelDelivery(rows[1]?.id ?? "", deps),
    ).toEqual({ status: "busy" })
    const workerFailures: Array<{
      name: string
      code: unknown
      message: string
    }> = []
    const app = new OpenAPIHono()
    registerAssistantChannelDeliveryRoute(app, {
      secret: () => "synthetic-machine",
      process: async (id) => {
        try {
          return await processAssistantChannelDelivery(id, deps)
        } catch (error) {
          workerFailures.push({
            name: error instanceof Error ? error.name : "unknown",
            code:
              typeof error === "object" && error && "code" in error
                ? error.code
                : null,
            message: error instanceof Error ? error.message : "unknown",
          })
          throw error
        }
      },
    })
    const response = () =>
      app.request("/api/internal/assistant/channel-delivery", {
        method: "POST",
        headers: { "x-internal-key": "synthetic-machine" },
        body: JSON.stringify({ outboxId: first.id }),
      })
    const results = await Promise.all([response(), response()])
    expect(workerFailures).toEqual([])
    expect(results.every((row) => row.status === 200)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.body).toBe(first.content ?? undefined)
    expect(calls[0]?.to).toBe(senderId)
    const event = {
      phoneNumberId,
      messageId: `wamid.${marker}.1`,
      callbackData: calls[0]?.callbackData,
      recipientId: senderId,
      timestamp: timestamp(),
    }
    expect(
      await acceptAssistantWhatsAppStatus(db, {
        ...event,
        phoneNumberId: "another-endpoint",
        status: "read",
      }),
    ).toBeNull()
    for (const status of [
      "read",
      "delivered",
      "sent",
      "failed",
      "read",
    ] as const)
      await acceptAssistantWhatsAppStatus(db, {
        ...event,
        callbackData: status === "read" ? undefined : event.callbackData,
        status,
      })
    expect(
      (
        await db.assistantWhatsAppOutbox.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).state,
    ).toBe("READ")
    expect(
      await db.assistantWhatsAppReceipt.count({
        where: { attempt: { outboxId: first.id } },
      }),
    ).toBe(4)
    expect(
      (await processAssistantChannelDelivery(rows[1]?.id ?? "", deps)).status,
    ).toBe("sent")
    expect(calls).toHaveLength(2)
    const unknown = (await savedReply())[0]
    if (!unknown) throw Error("Missing fixture")
    let unknownCalls = 0
    let callbackData: string | undefined
    const uncertain = dependencies(async (input) => {
      unknownCalls++
      callbackData = input.callbackData
      throw Error("private transport interruption")
    })
    expect(
      await processAssistantChannelDelivery(unknown.id, uncertain),
    ).toEqual({ status: "unknown" })
    expect(
      await processAssistantChannelDelivery(unknown.id, uncertain),
    ).toEqual({ status: "unknown" })
    expect(unknownCalls).toBe(1)
    expect(
      await acceptAssistantWhatsAppStatus(db, {
        phoneNumberId,
        messageId: "otp-unmatched",
        status: "sent",
        timestamp: timestamp(),
      }),
    ).toBeNull()
    const accepted = await acceptAssistantWhatsAppStatus(db, {
      phoneNumberId,
      messageId: `wamid.${marker}.after-timeout`,
      callbackData,
      recipientId: senderId,
      status: "delivered",
      timestamp: timestamp(),
    })
    expect(accepted?.state).toBe("DELIVERED")
    expect(
      (await processAssistantChannelDelivery(unknown.id, uncertain)).status,
    ).toBe("idle")
    expect(unknownCalls).toBe(1)
    const inventory = await assistantWhatsAppPrivacyInventory(db, userId)
    expect(inventory.assistantWhatsAppAttempts).toBe(3)
    expect(inventory.assistantWhatsAppReceipts).toBe(5)
    const usage = await db.assistantWhatsAppUsageBucket.findMany({
      where: { tenantId, userId, windowKind: "DAY" },
    })
    expect(usage.reduce((total, row) => total + row.deliveryAttempts, 0)).toBe(
      3,
    )
    expect(inventory.assistantWhatsAppUsageBuckets).toBeGreaterThan(0)
  }, 180_000)
  test("fresh permission/canonical/window/QA refusal, bounded definite retry and post-acceptance crash recovery", async () => {
    let sends = 0
    const deps = dependencies(async () => {
      sends++
      return { messageId: `wamid.${marker}.allowed` }
    })
    const blocked = async (
      change: (id: string) => Promise<unknown>,
      restore: () => Promise<unknown> = async () => {},
    ) => {
      const row = (await savedReply())[0]
      if (!row) throw Error("Missing fixture")
      await change(row.id)
      expect((await processAssistantChannelDelivery(row.id, deps)).status).toBe(
        "cancelled",
      )
      await restore()
    }
    await blocked(
      () =>
        db.membership.update({
          where: { id: membershipId },
          data: { role: "CASHIER" },
        }),
      () =>
        db.membership.update({
          where: { id: membershipId },
          data: { role: "OWNER" },
        }),
    )
    await blocked(() =>
      db.membership.update({
        where: { id: membershipId },
        data: { staffAccessRevision: { increment: 1 } },
      }),
    )
    await blocked(async (id) => {
      const row = await db.assistantWhatsAppOutbox.findUniqueOrThrow({
        where: { id },
      })
      if (!row.messageId) throw Error("Missing owned fixture message")
      return db.assistantMessage.delete({ where: { id: row.messageId } })
    })
    await blocked((id) =>
      db.assistantWhatsAppOutbox.update({
        where: { id },
        data: { content: "tampered" },
      }),
    )
    const expired = (
      await savedReply("saved", new Date(Date.now() - 25 * 3600_000))
    )[0]
    if (!expired) throw Error("Missing fixture")
    expect(
      (await processAssistantChannelDelivery(expired.id, deps)).status,
    ).toBe("expired")
    const qa = (await savedReply())[0]
    if (!qa) throw Error("Missing fixture")
    expect(
      (
        await beginAssistantWhatsAppDelivery(db, qa.id, {
          phoneNumberId,
          permittedUserIds: [userId],
        })
      ).kind,
    ).toBe("cancelled")
    expect(sends).toBe(0)
    const retry = (await savedReply())[0]
    if (!retry) throw Error("Missing fixture")
    let now = new Date()
    const reject = {
      ...deps,
      begin: (
        id: string,
        options: { phoneNumberId: string; permittedUserIds: readonly string[] },
      ) =>
        beginAssistantWhatsAppDelivery(
          db,
          id,
          { ...options, providerMode: "test" },
          now,
        ),
      finish: (
        proof: Parameters<typeof finishAssistantWhatsAppDelivery>[1],
        outcome: Parameters<typeof finishAssistantWhatsAppDelivery>[2],
      ) => finishAssistantWhatsAppDelivery(db, proof, outcome, now),
      send: async () => {
        sends++
        throw new WhatsAppProviderSendError(
          "PROVIDER_REJECTED",
          "DEFINITE_FAILURE",
        )
      },
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(
        (await processAssistantChannelDelivery(retry.id, reject)).status,
      ).toBe("failed")
      if (attempt < 2)
        expect(
          (await processAssistantChannelDelivery(retry.id, reject)).status,
        ).toBe("busy")
      now = new Date(now.getTime() + 31_000)
    }
    expect(
      (
        await db.assistantWhatsAppOutbox.findUniqueOrThrow({
          where: { id: retry.id },
        })
      ).state,
    ).toBe("FAILED")
    expect(sends).toBe(3)
    const crash = (await savedReply())[0]
    if (!crash) throw Error("Missing fixture")
    let callbackData: string | undefined
    const provider = new DirectMetaWhatsAppProvider({
      fetch: Object.assign(
        async (_url: unknown, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body))
          callbackData = body.biz_opaque_callback_data
          return Response.json({ messages: [{ id: `wamid.${marker}.crash` }] })
        },
        { preconnect: () => undefined },
      ),
    })
    const failSave = {
      ...deps,
      send: (input: Parameters<typeof provider.sendText>[0]) =>
        provider.sendText(input),
      finish: async () => {
        throw Error("database unavailable after accept")
      },
    }
    await expect(
      processAssistantChannelDelivery(crash.id, failSave),
    ).rejects.toThrow("database unavailable after accept")
    expect(
      (
        await beginAssistantWhatsAppDelivery(
          db,
          crash.id,
          { phoneNumberId, permittedUserIds: [userId], providerMode: "test" },
          new Date(Date.now() + 61_000),
        )
      ).kind,
    ).toBe("unknown")
    expect(
      (
        await acceptAssistantWhatsAppStatus(db, {
          phoneNumberId,
          messageId: `wamid.${marker}.crash`,
          callbackData,
          recipientId: senderId,
          status: "read",
          timestamp: timestamp(),
        })
      )?.state,
    ).toBe("READ")
    expect(
      (await processAssistantChannelDelivery(crash.id, failSave)).status,
    ).toBe("idle")
  }, 240_000)
  test("early receipts beat HTTP completion, stale attempts cannot reconcile a newer effect, and failed chunks stop partial replies", async () => {
    const early = (await savedReply())[0]
    if (!early) throw Error("Missing fixture")
    let sent = 0
    const earlyDeps = dependencies(async (input) => {
      sent++
      const event = {
        phoneNumberId,
        messageId: `wamid.${marker}.early`,
        callbackData: input.callbackData,
        timestamp: timestamp(),
        status: "read" as const,
      }
      expect(
        await acceptAssistantWhatsAppStatus(db, {
          ...event,
          recipientId: "2379999999999",
        }),
      ).toBeNull()
      expect(
        (
          await acceptAssistantWhatsAppStatus(db, {
            ...event,
            recipientId: senderId,
          })
        )?.state,
      ).toBe("READ")
      return { messageId: event.messageId }
    })
    expect(
      (await processAssistantChannelDelivery(early.id, earlyDeps)).status,
    ).toBe("sent")
    expect(
      (
        await db.assistantWhatsAppOutbox.findUniqueOrThrow({
          where: { id: early.id },
        })
      ).state,
    ).toBe("READ")
    expect(sent).toBe(1)
    const stale = (await savedReply())[0]
    if (!stale) throw Error("Missing fixture")
    const options = {
      phoneNumberId,
      permittedUserIds: [userId],
      providerMode: "test" as const,
    }
    const first = await beginAssistantWhatsAppDelivery(db, stale.id, options)
    if (first.kind !== "started") throw Error("Fixture was not admitted")
    await finishAssistantWhatsAppDelivery(db, first.proof, { kind: "rejected" })
    const current = await beginAssistantWhatsAppDelivery(
      db,
      stale.id,
      options,
      new Date(Date.now() + 31_000),
    )
    if (current.kind !== "started")
      throw Error("Retry fixture was not admitted")
    expect(
      await finishAssistantWhatsAppDelivery(db, first.proof, {
        kind: "accepted",
        providerMessageId: `wamid.${marker}.late`,
      }),
    ).toBeNull()
    expect(
      await acceptAssistantWhatsAppStatus(db, {
        phoneNumberId,
        messageId: `wamid.${marker}.late`,
        callbackData: first.callbackData,
        recipientId: senderId,
        timestamp: timestamp(),
        status: "delivered",
      }),
    ).toBeNull()
    expect(
      (
        await db.assistantWhatsAppOutbox.findUniqueOrThrow({
          where: { id: stale.id },
        })
      ).state,
    ).toBe("SENDING")
    await finishAssistantWhatsAppDelivery(db, current.proof, {
      kind: "unknown",
    })
    const chunks = await savedReply(
      "A complete saved result with exact records. ".repeat(140),
    )
    const head = chunks[0]
    const following = chunks[1]
    if (!head || !following) throw Error("Missing fixture chunks")
    await db.assistantWhatsAppOutbox.update({
      where: { id: head.id },
      data: { state: "FAILED" },
    })
    expect(
      (await processAssistantChannelDelivery(following.id, earlyDeps)).status,
    ).toBe("cancelled")
    expect(sent).toBe(1)
  }, 180_000)
  test("delivery quota delays an unstarted reply without losing it or charging an attempt", async () => {
    const output = (await savedReply())[0]
    if (!output) throw Error("Missing fixture")
    let now = new Date()
    const start = new Date(Math.floor(now.getTime() / 60_000) * 60_000)
    const end = new Date(start.getTime() + 60_000)
    await db.assistantWhatsAppUsageBucket.upsert({
      where: {
        tenantId_userId_windowKind_windowStartedAt: {
          tenantId,
          userId,
          windowKind: "MINUTE",
          windowStartedAt: start,
        },
      },
      create: {
        tenantId,
        userId,
        windowKind: "MINUTE",
        windowStartedAt: start,
        windowEndsAt: end,
        expiresAt: new Date(end.getTime() + 3600_000),
        deliveryAttempts: 60,
      },
      update: { deliveryAttempts: 60 },
    })
    let sends = 0
    const base = dependencies(async () => {
      sends++
      return { messageId: `wamid.${marker}.quota` }
    })
    const deps = {
      ...base,
      begin: (
        id: string,
        options: { phoneNumberId: string; permittedUserIds: readonly string[] },
      ) =>
        beginAssistantWhatsAppDelivery(
          db,
          id,
          { ...options, providerMode: "test" },
          now,
        ),
      finish: (
        proof: Parameters<typeof finishAssistantWhatsAppDelivery>[1],
        outcome: Parameters<typeof finishAssistantWhatsAppDelivery>[2],
      ) => finishAssistantWhatsAppDelivery(db, proof, outcome, now),
    }
    expect(
      (await processAssistantChannelDelivery(output.id, deps)).status,
    ).toBe("busy")
    expect(sends).toBe(0)
    expect(
      await db.assistantWhatsAppAttempt.count({
        where: { outboxId: output.id },
      }),
    ).toBe(0)
    const held = await db.assistantWhatsAppOutbox.findUniqueOrThrow({
      where: { id: output.id },
    })
    expect(held.state).toBe("PENDING")
    expect(held.errorCode).toBe("DELIVERY_RATE_LIMITED")
    expect(held.nextAttemptAt?.toISOString()).toBe(end.toISOString())
    now = new Date(end.getTime() + 1)
    expect(
      (await processAssistantChannelDelivery(output.id, deps)).status,
    ).toBe("sent")
    expect(sends).toBe(1)
  }, 120_000)
})
