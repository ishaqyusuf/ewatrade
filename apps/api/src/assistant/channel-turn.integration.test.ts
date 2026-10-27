import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { createHash } from "node:crypto"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import { whatsAppTurnResultSchema } from "@ewatrade/assistant/channels/worker"
import { PrismaClient } from "@ewatrade/db"
import {
  acceptAssistantWhatsAppIngress,
  assertAssistantWhatsAppInboxLease,
  beginAssistantWhatsAppDelivery,
  claimAssistantWhatsAppInbox,
  claimAssistantWhatsAppLink,
  confirmAssistantWhatsAppLink,
  createAssistantWhatsAppLink,
  expireAssistantWhatsAppInbox,
  finishAssistantWhatsAppDelivery,
  listAssistantWhatsAppInboxRecovery,
  nextAssistantWhatsAppInbox,
  processAssistantWhatsAppControl,
  recoverAssistantWhatsAppInboxRun,
  retryAssistantWhatsAppInbox,
  selectAssistantWhatsAppConversation,
  settleAssistantWhatsAppInbox,
} from "@ewatrade/db/assistant-whatsapp"
import {
  assistantWhatsAppPrivacyInventory,
  expireAssistantWhatsAppOutbox,
} from "@ewatrade/db/assistant-whatsapp"
import { OpenAPIHono } from "@hono/zod-openapi"
import { PrismaPg } from "@prisma/adapter-pg"
import { assertQaAccessAcceptanceDatabase } from "../../../../packages/db/src/queries/acceptance/qa-access/database"
import { appRouter } from "../trpc/routers/_app"
import { createLinkedAssistantContext } from "./channel-principal"
import {
  type ChannelTurnDependencies,
  processAssistantChannelTurn,
} from "./channel-turn"
import { registerAssistantChannelTurnRoute } from "./channel-turn-route"
import {
  GENERAL_BUDGET_LIMITS,
  generalBudgetScopeKey,
} from "./general-allowance"
import type { GeneralContext } from "./general-context"
import { createGeneralAssistantTurn } from "./general-turn"
import { GeneralTurnError } from "./general-turn-contract"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const marker = `wa-worker-${randomUUID()}`
const userId = `${marker}-user`
const tenantId = `${marker}-tenant`
const storeId = `${marker}-store`
const membershipId = `${marker}-member`
const sessionId = `${marker}-session`
const conversationId = `${marker}-chat`
const phoneNumberId = "90000000000004"
const senderId = `237${Date.now().toString().slice(-10)}`
const names = [
  "ASSISTANT_REHEARSAL_MODE",
  "ASSISTANT_WHATSAPP_ENABLED",
  "ASSISTANT_WHATSAPP_READS_ENABLED",
  "ASSISTANT_WHATSAPP_DISPLAY_NUMBER",
  "ASSISTANT_WHATSAPP_PILOT_USER_IDS",
  "ASSISTANT_WHATSAPP_PILOT_TENANT_IDS",
  "WHATSAPP_OTP_PHONE_NUMBER_ID",
  "WHATSAPP_OTP_ACCESS_TOKEN",
  "ASSISTANT_APPROVAL_SIGNING_KEY",
] as const
const previous = Object.fromEntries(names.map((key) => [key, process.env[key]]))
let db: PrismaClient
let deps: ChannelTurnDependencies
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
    ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "2348000000000",
    ASSISTANT_WHATSAPP_PILOT_USER_IDS: userId,
    ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: tenantId,
    WHATSAPP_OTP_PHONE_NUMBER_ID: phoneNumberId,
    WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-no-provider",
    ASSISTANT_APPROVAL_SIGNING_KEY:
      "synthetic-approval-signing-key-000000000000000",
  })
  db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.EWATRADE_DATABASE_URL,
      max: 3,
    }),
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  })
  await db.$transaction(async (tx) => {
    await tx.user.create({
      data: { id: userId, email: `${marker}@example.test`, ageBand: "ADULT" },
    })
    await tx.tenant.create({
      data: {
        id: tenantId,
        slug: tenantId,
        name: "Synthetic worker business",
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        dataClassification: "QA",
        qaMarkedAt: new Date(),
        qaSourceDomain: "assistant-whatsapp-worker.test",
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
    await tx.store.create({
      data: {
        id: storeId,
        tenantId,
        slug: storeId,
        name: "Synthetic Store",
        status: "ACTIVE",
      },
    })
    await tx.session.create({
      data: {
        id: sessionId,
        userId,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    })
    await tx.assistantConversation.create({
      data: {
        id: conversationId,
        tenantId,
        storeId,
        ownerUserId: userId,
        purpose: "GENERAL",
        status: "ACTIVE",
      },
    })
  })
  const actor = { userId, tenantId, storeId, membershipId, sessionId }
  const link = await createAssistantWhatsAppLink(db, actor, phoneNumberId)
  await claimAssistantWhatsAppLink(db, {
    code: link.code,
    phoneNumberId,
    senderId,
    messageId: `${marker}-claim`,
  })
  const grant = await confirmAssistantWhatsAppLink(db, actor, {
    linkId: link.id,
    expectedRevision: 2,
    phoneNumberId,
  })
  await selectAssistantWhatsAppConversation(
    db,
    {
      kind: "linked_whatsapp",
      grantId: grant.id,
      grantGeneration: grant.generation,
      identityGeneration: 1,
      phoneNumberId,
      senderId,
    },
    conversationId,
  )
  deps = {
    enabled: () => true,
    control: (id) => processAssistantWhatsAppControl(db, id, [userId]),
    claim: (id) => claimAssistantWhatsAppInbox(db, id, [userId]),
    recover: (lease) => recoverAssistantWhatsAppInboxRun(db, lease),
    context: (principal, requestId, lease) =>
      createLinkedAssistantContext(db, principal, requestId, lease),
    createTurn: createGeneralAssistantTurn,
    settle: (lease, errorCode) =>
      settleAssistantWhatsAppInbox(db, lease, {
        permittedUserIds: [userId],
        errorCode,
      }),
    retry: (lease) => retryAssistantWhatsAppInbox(db, lease),
    next: (bindingId) => nextAssistantWhatsAppInbox(db, bindingId),
  }
}, 90_000)
afterAll(async () => {
  for (const key of names) {
    if (previous[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = previous[key]
  }
  if (!db) return
  try {
    await db.assistantBudget.deleteMany({
      where: { scopeKey: generalBudgetScopeKey({ tenantId }) },
    })
    await db.tenant.deleteMany({
      where: { id: tenantId, qaSourceDomain: "assistant-whatsapp-worker.test" },
    })
    await db.user.deleteMany({
      where: { id: userId, email: `${marker}@example.test` },
    })
  } finally {
    await db.$disconnect()
  }
}, 60_000)
async function incoming(n: number, text = "hello") {
  const receipt = await acceptAssistantWhatsAppIngress(
    db,
    {
      phoneNumberId,
      senderId,
      providerMessageId: `${marker}-${n}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text,
    },
    [userId],
  )
  if (receipt.kind === "ignored")
    throw Error(`Synthetic ingress refused: ${receipt.reason}`)
  return receipt
}
async function drain(
  turn: Awaited<ReturnType<typeof createGeneralAssistantTurn>>,
) {
  const reader = turn.stream.getReader()
  try {
    while (!(await reader.read()).done) {}
  } finally {
    reader.releaseLock()
  }
  return turn.completion
}

suite("actual durable worker and shared GENERAL turn", () => {
  test("orders turns, recovers saved replies without another model allowance and fences stale workers", async () => {
    const first = await incoming(1, "search synthetic rice")
    const second = await incoming(2)
    expect(await processAssistantChannelTurn(second.id, deps)).toEqual({
      status: "busy",
    })
    expect(await db.assistantRun.count({ where: { conversationId } })).toBe(0)
    expect(
      (await listAssistantWhatsAppInboxRecovery(db)).some(
        (row) => row.id === first.id,
      ),
    ).toBe(true)
    const app = new OpenAPIHono()
    registerAssistantChannelTurnRoute(app, {
      secret: () => "synthetic-worker-key",
      process: (id) => processAssistantChannelTurn(id, deps),
    })
    const throughHttp = async () => {
      const response = await app.request(
        "/api/internal/assistant/channel-turn",
        {
          method: "POST",
          headers: { "x-internal-key": "synthetic-worker-key" },
          body: JSON.stringify({ ingressId: first.id }),
        },
      )
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("no-store")
      return whatsAppTurnResultSchema.parse(await response.json())
    }
    const outcomes = await Promise.all([
      throughHttp(),
      processAssistantChannelTurn(first.id, deps),
    ])
    expect(outcomes.map((row) => row.status).sort()).toEqual([
      "busy",
      "completed",
    ])
    expect(outcomes.some((row) => row.nextIngressId === second.id)).toBe(true)
    const firstRow = await db.assistantWhatsAppInbox.findUniqueOrThrow({
      where: { id: first.id },
    })
    expect(firstRow.state).toBe("COMPLETED")
    const firstRun = await db.assistantRun.findFirstOrThrow({
      where: { actorUserId: userId, requestId: first.requestId },
      include: { assistantMessage: true },
    })
    expect(firstRun.assistantMessage?.role).toBe("assistant")
    expect(firstRun.assistantMessage?.conversationId).toBe(conversationId)
    expect(firstRow.runId).toBe(firstRun.id)
    expect(firstRow.executionAuthorityDigest).toMatch(/^[a-f0-9]{64}$/)
    const firstOutput = await db.assistantWhatsAppOutbox.findMany({
      where: { inboxId: first.id },
      orderBy: { chunkIndex: "asc" },
    })
    expect(firstOutput.map((row) => row.content)).toEqual(
      renderWhatsAppFinalReply(firstRun.assistantMessage?.parts, {
        scopeLabel: "Synthetic worker business · Synthetic Store",
      }).chunks,
    )
    expect(
      firstOutput.every(
        (row) =>
          row.state === "PENDING" &&
          row.runId === firstRun.id &&
          row.messageId === firstRun.assistantMessageId &&
          row.authorityDigest === firstRow.executionAuthorityDigest,
      ),
    ).toBe(true)
    expect(firstOutput[0]?.content).toContain("No matching records shown")
    expect(firstOutput[0]?.contentDigest).toBe(
      createHash("sha256")
        .update(firstOutput[0]?.content ?? "")
        .digest("hex"),
    )

    expect(await processAssistantChannelTurn(first.id, deps)).toMatchObject({
      status: "idle",
      nextIngressId: second.id,
    })
    expect(await processAssistantChannelTurn(second.id, deps)).toMatchObject({
      status: "completed",
    })
    expect(
      (
        await db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: generalBudgetScopeKey({ tenantId }) },
        })
      ).requests,
    ).toBe(2)
    const crash = await incoming(3)
    const abandoned = await claimAssistantWhatsAppInbox(db, crash.id, [userId])
    if (abandoned.kind !== "claimed")
      throw Error("Expected crashed worker claim")
    const ctx = await createLinkedAssistantContext(
      db,
      abandoned.principal,
      abandoned.inbox.requestId,
      abandoned.lease,
    )
    const done = await drain(
      await createGeneralAssistantTurn(ctx as GeneralContext, {
        conversationId,
        requestId: abandoned.inbox.requestId,
        message: {
          id: abandoned.inbox.userMessageId,
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
      }),
    )
    expect(done).toMatchObject({ status: "COMPLETED", persisted: true })
    await db.assistantWhatsAppInbox.update({
      where: { id: crash.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1), attempts: 4 },
    })
    expect(await processAssistantChannelTurn(crash.id, deps)).toEqual({
      status: "completed",
    })
    const recovered = await db.assistantWhatsAppInbox.findUniqueOrThrow({
      where: { id: crash.id },
    })
    expect(recovered.runId).toBe(done.runId)
    const recoveredOutput = await db.assistantWhatsAppOutbox.findMany({
      where: { inboxId: crash.id },
    })
    expect(recoveredOutput).toHaveLength(1)
    expect(recoveredOutput[0]?.messageId).toBe(done.assistantMessageId)
    expect(await processAssistantChannelTurn(crash.id, deps)).toEqual({
      status: "idle",
    })
    expect(
      await db.assistantWhatsAppOutbox.count({ where: { inboxId: crash.id } }),
    ).toBe(1)

    expect(
      (await db.assistantRun.findUniqueOrThrow({ where: { id: done.runId } }))
        .assistantMessageId,
    ).toBe(done.assistantMessageId)
    expect(
      (
        await db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: generalBudgetScopeKey({ tenantId }) },
        })
      ).requests,
    ).toBe(3)
    expect(
      await db.assistantUsageEvent.count({
        where: { run: { conversationId } },
      }),
    ).toBe(3)
    const stale = await incoming(4)
    const old = await claimAssistantWhatsAppInbox(db, stale.id, [userId])
    if (old.kind !== "claimed") throw Error("Expected old claim")
    const oldContext = await createLinkedAssistantContext(
      db,
      old.principal,
      old.inbox.requestId,
      old.lease,
    )
    await db.assistantWhatsAppInbox.update({
      where: { id: stale.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1) },
    })
    const fresh = await claimAssistantWhatsAppInbox(db, stale.id, [userId])
    if (fresh.kind !== "claimed") throw Error("Expected fresh claim")
    expect(fresh.lease.generation).toBe(old.lease.generation + 1)
    await expect(
      appRouter
        .createCaller({
          ...oldContext,
          assistantReadCapabilityId: "search.records",
        })
        .search.global({ query: "synthetic" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      assertAssistantWhatsAppInboxLease(db, old.lease),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      createLinkedAssistantContext(
        db,
        old.principal,
        old.inbox.requestId,
        old.lease,
      ),
    ).rejects.toBeDefined()
    expect(
      await settleAssistantWhatsAppInbox(db, old.lease, {
        permittedUserIds: [userId],
      }),
    ).toBeNull()
    expect((await retryAssistantWhatsAppInbox(db, old.lease)).count).toBe(0)
    expect(
      await settleAssistantWhatsAppInbox(db, fresh.lease, {
        permittedUserIds: [],
      }),
    ).toEqual({ state: "CANCELLED" })
    const cancelled = await db.assistantWhatsAppInbox.findUniqueOrThrow({
      where: { id: stale.id },
    })
    expect(cancelled.state).toBe("CANCELLED")
    expect(cancelled.content).toBeNull()
    const delayed = await incoming(5)
    expect(
      await processAssistantChannelTurn(delayed.id, {
        ...deps,
        createTurn: async () => {
          throw new GeneralTurnError(
            503,
            "ASSISTANT_UNAVAILABLE",
            "Unavailable",
          )
        },
      }),
    ).toEqual({ status: "retry" })
    const pending = await db.assistantWhatsAppInbox.findUniqueOrThrow({
      where: { id: delayed.id },
    })
    expect(pending.state).toBe("PENDING")
    expect(pending.nextAttemptAt).not.toBeNull()
    expect(await processAssistantChannelTurn(delayed.id, deps)).toEqual({
      status: "busy",
    })
    expect(
      (
        await db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: delayed.id },
        })
      ).attempts,
    ).toBe(1)
    await db.assistantWhatsAppInbox.update({
      where: { id: delayed.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    })
    expect(
      await expireAssistantWhatsAppInbox(db, new Date(), [delayed.id]),
    ).toMatchObject({
      cleared: 1,
    })
    const expired = await db.assistantWhatsAppInbox.findUniqueOrThrow({
      where: { id: delayed.id },
    })
    expect(expired.state).toBe("EXPIRED")
    expect(expired.content).toBeNull()
    const beforeExpiry = await assistantWhatsAppPrivacyInventory(db, userId)
    expect(beforeExpiry.assistantWhatsAppOutbox).toBe(3)
    const outputId = recoveredOutput[0]?.id
    if (!outputId) throw Error("Expected queued response")
    await db.assistantWhatsAppOutbox.update({
      where: { id: outputId },
      data: { expiresAt: new Date(Date.now() - 1) },
    })
    expect(
      await expireAssistantWhatsAppOutbox(db, new Date(), [outputId]),
    ).toEqual({ cleared: 1 })
    const expiredOutput = await db.assistantWhatsAppOutbox.findUniqueOrThrow({
      where: { id: outputId },
    })
    expect(expiredOutput.content).toBeNull()
    expect(expiredOutput.state).toBe("EXPIRED")
    expect(
      (await assistantWhatsAppPrivacyInventory(db, userId))
        .assistantWhatsAppOutbox,
    ).toBe(3)

    expect(await db.session.count({ where: { userId } })).toBe(1)
  }, 240_000)
  test("permission changes cancel saved output and outbox insertion rolls back atomically with settlement", async () => {
    const saveWithoutSettlement = async (ordinal: number) => {
      const received = await incoming(ordinal)
      const claim = await claimAssistantWhatsAppInbox(db, received.id, [userId])
      if (claim.kind !== "claimed") throw Error("Expected live claim")
      const ctx = await createLinkedAssistantContext(
        db,
        claim.principal,
        claim.inbox.requestId,
        claim.lease,
      )
      const result = await drain(
        await createGeneralAssistantTurn(ctx as GeneralContext, {
          conversationId,
          requestId: claim.inbox.requestId,
          message: {
            id: claim.inbox.userMessageId,
            role: "user",
            parts: [{ type: "text", text: "hello" }],
          },
        }),
      )
      expect(result.status).toBe("COMPLETED")
      return { received, claim, result }
    }
    const role = await saveWithoutSettlement(6)
    try {
      await db.membership.update({
        where: { id: membershipId },
        data: { role: "CASHIER" },
      })
      await expect(
        createLinkedAssistantContext(
          db,
          role.claim.principal,
          role.claim.inbox.requestId,
          role.claim.lease,
        ),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      expect(
        await settleAssistantWhatsAppInbox(db, role.claim.lease, {
          permittedUserIds: [userId],
        }),
      ).toEqual({ state: "CANCELLED" })
      expect(
        await db.assistantWhatsAppOutbox.count({
          where: { inboxId: role.received.id },
        }),
      ).toBe(0)
      expect(
        (
          await db.assistantRun.findUniqueOrThrow({
            where: { id: role.result.runId },
          })
        ).status,
      ).toBe("COMPLETED")
    } finally {
      await db.membership.update({
        where: { id: membershipId },
        data: { role: "OWNER" },
      })
    }
    const revision = await saveWithoutSettlement(7)
    await db.membership.update({
      where: { id: membershipId },
      data: { staffAccessRevision: { increment: 1 } },
    })
    expect(
      await settleAssistantWhatsAppInbox(db, revision.claim.lease, {
        permittedUserIds: [userId],
      }),
    ).toEqual({ state: "CANCELLED" })
    expect(
      await db.assistantWhatsAppOutbox.count({
        where: { inboxId: revision.received.id },
      }),
    ).toBe(0)
    const atomic = await saveWithoutSettlement(8)
    const failing = db.$extends({
      query: {
        assistantWhatsAppInbox: {
          async update({ args, query }) {
            if (
              args.where.id === atomic.received.id &&
              args.data.state === "COMPLETED"
            )
              throw Error("Synthetic settle storage failure")
            return query(args)
          },
        },
      },
    })
    await expect(
      settleAssistantWhatsAppInbox(
        failing as unknown as PrismaClient,
        atomic.claim.lease,
        { permittedUserIds: [userId] },
      ),
    ).rejects.toThrow("Synthetic settle storage failure")
    expect(
      await db.assistantWhatsAppOutbox.count({
        where: { inboxId: atomic.received.id },
      }),
    ).toBe(0)
    expect(
      (
        await db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: atomic.received.id },
        })
      ).state,
    ).toBe("PROCESSING")
    expect(
      await settleAssistantWhatsAppInbox(db, atomic.claim.lease, {
        permittedUserIds: [userId],
      }),
    ).toEqual({ state: "COMPLETED" })
    expect(
      await db.assistantWhatsAppOutbox.count({
        where: { inboxId: atomic.received.id },
      }),
    ).toBe(1)
    expect(
      (
        await db.assistantRun.findUniqueOrThrow({
          where: { id: atomic.result.runId },
        })
      ).status,
    ).toBe("COMPLETED")
  }, 240_000)
  test("browser and WhatsApp consume one model allowance while saved delivery is independent and policy changes cancel old output", async () => {
    // A new bound chat leaves earlier pending chunks under their original FIFO/selection.
    const conversationId = `${marker}-budget-chat`
    await db.assistantConversation.create({
      data: {
        id: conversationId,
        tenantId,
        storeId,
        ownerUserId: userId,
        purpose: "GENERAL",
        status: "ACTIVE",
      },
    })
    const identity = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
      where: { phoneNumberId_senderId: { phoneNumberId, senderId } },
    })
    if (!identity.activeBindingId) throw Error("Missing owned binding")
    const binding = await db.assistantWhatsAppBinding.findUniqueOrThrow({
      where: { id: identity.activeBindingId },
    })
    await selectAssistantWhatsAppConversation(
      db,
      {
        kind: "linked_whatsapp",
        phoneNumberId,
        senderId,
        grantId: binding.grantId,
        grantGeneration: binding.grantGeneration,
        identityGeneration: binding.identityGeneration,
      },
      conversationId,
    )
    const budgetKey = generalBudgetScopeKey({ tenantId })
    const lastSlot = () =>
      db.assistantBudget.upsert({
        where: { scopeKey: budgetKey },
        create: {
          scopeKey: budgetKey,
          windowStartedAt: new Date(),
          requests: 0,
          tokens: GENERAL_BUDGET_LIMITS.maxTokens - 1,
        },
        update: { requests: 0, tokens: GENERAL_BUDGET_LIMITS.maxTokens - 1 },
      })
    const received = await incoming(9)
    const claim = await claimAssistantWhatsAppInbox(db, received.id, [userId])
    if (claim.kind !== "claimed") throw Error("Fixture admission failed")
    const linked = (await createLinkedAssistantContext(
      db,
      claim.principal,
      claim.inbox.requestId,
      claim.lease,
    )) as GeneralContext
    const browser: GeneralContext = {
      ...linked,
      session: {
        session: await db.session.findUniqueOrThrow({
          where: { id: sessionId },
        }),
        user: await db.user.findUniqueOrThrow({ where: { id: userId } }),
      },
      assistantConversationId: undefined,
      requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    }
    const message = (id: string) => ({
      id,
      role: "user" as const,
      parts: [{ type: "text" as const, text: "hello" }],
    })
    await lastSlot()
    expect(
      (
        await drain(
          await createGeneralAssistantTurn(browser, {
            conversationId,
            requestId: `${marker}-browser-last`,
            message: message(`${marker}-browser-input`),
          }),
        )
      ).status,
    ).toBe("COMPLETED")
    await expect(
      createGeneralAssistantTurn(linked, {
        conversationId,
        requestId: claim.inbox.requestId,
        message: message(claim.inbox.userMessageId),
      }),
    ).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" })
    expect(
      await settleAssistantWhatsAppInbox(db, claim.lease, {
        permittedUserIds: [userId],
      }),
    ).toEqual({ state: "FAILED" })
    expect(
      (
        await db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: budgetKey },
        })
      ).tokens,
    ).toBeGreaterThanOrEqual(GENERAL_BUDGET_LIMITS.maxTokens)
    expect(
      await db.assistantWhatsAppOutbox.count({
        where: { inboxId: received.id },
      }),
    ).toBe(0)
    await lastSlot()
    const next = await incoming(10)
    expect((await processAssistantChannelTurn(next.id, deps)).status).toBe(
      "completed",
    )
    await expect(
      createGeneralAssistantTurn(browser, {
        conversationId,
        requestId: `${marker}-browser-exhausted`,
        message: message(`${marker}-browser-exhausted-input`),
      }),
    ).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" })
    const output = await db.assistantWhatsAppOutbox.findFirstOrThrow({
      where: { inboxId: next.id },
    })
    const delivery = await beginAssistantWhatsAppDelivery(db, output.id, {
      phoneNumberId,
      permittedUserIds: [userId],
      providerMode: "test",
    })
    expect(delivery.kind).toBe("started")
    if (delivery.kind !== "started")
      throw Error("Saved reply should not need a model allowance")
    await finishAssistantWhatsAppDelivery(db, delivery.proof, {
      kind: "accepted",
      providerMessageId: `wamid.${marker}.budget`,
    })
    expect(
      (
        await db.assistantBudget.findUniqueOrThrow({
          where: { scopeKey: budgetKey },
        })
      ).tokens,
    ).toBeGreaterThanOrEqual(GENERAL_BUDGET_LIMITS.maxTokens)
    expect(
      (
        await db.assistantWhatsAppOutbox.findUniqueOrThrow({
          where: { id: output.id },
        })
      ).state,
    ).toBe("SENT")
    await lastSlot()
    const changed = await incoming(11)
    const pending = await claimAssistantWhatsAppInbox(db, changed.id, [userId])
    if (pending.kind !== "claimed") throw Error("Fixture admission failed")
    const ctx = (await createLinkedAssistantContext(
      db,
      pending.principal,
      pending.inbox.requestId,
      pending.lease,
    )) as GeneralContext
    expect(
      (
        await drain(
          await createGeneralAssistantTurn(ctx, {
            conversationId,
            requestId: pending.inbox.requestId,
            message: message(pending.inbox.userMessageId),
          }),
        )
      ).status,
    ).toBe("COMPLETED")
    try {
      process.env.ASSISTANT_WHATSAPP_READS_ENABLED = "false"
      await expect(
        createLinkedAssistantContext(
          db,
          pending.principal,
          pending.inbox.requestId,
          pending.lease,
        ),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      expect(
        await settleAssistantWhatsAppInbox(db, pending.lease, {
          permittedUserIds: [userId],
        }),
      ).toEqual({ state: "CANCELLED" })
      expect(
        await db.assistantWhatsAppOutbox.count({
          where: { inboxId: changed.id },
        }),
      ).toBe(0)
    } finally {
      process.env.ASSISTANT_WHATSAPP_READS_ENABLED = "true"
    }
  }, 180_000)
})
