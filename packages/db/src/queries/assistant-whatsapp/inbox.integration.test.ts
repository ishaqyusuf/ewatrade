import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@ewatrade/db"
import { PrismaPg } from "@prisma/adapter-pg"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import {
  acceptAssistantWhatsAppIngress,
  assistantWhatsAppPrivacyInventory,
  claimAssistantWhatsAppLink,
  confirmAssistantWhatsAppLink,
  createAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
  selectAssistantWhatsAppConversation,
} from "./index"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const marker = `wa-inbox-${randomUUID()}`
const userId = `${marker}-user`
const tenantId = `${marker}-tenant`
const storeId = `${marker}-store`
const membershipId = `${marker}-member`
const sessionId = `${marker}-session`
const conversationId = `${marker}-chat`
const secondConversationId = `${marker}-second-chat`
const phoneNumberId = "90000000000003"
const senderId = `236${Date.now().toString().slice(-10)}`
const previousPilotTenants = process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS
let db: PrismaClient
beforeAll(async () => {
  if (!enabled) return
  assertQaAccessAcceptanceDatabase()
  process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = tenantId
  if (
    new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname !==
    "/ewatrade_qa_v1"
  )
    throw Error("Explicit local QA target required.")
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
        name: "Synthetic inbox business",
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        dataClassification: "QA",
        qaMarkedAt: new Date(),
        qaSourceDomain: "assistant-whatsapp-inbox.test",
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
  })
}, 60_000)
afterAll(async () => {
  if (!db) return
  try {
    await db.tenant.deleteMany({
      where: { id: tenantId, qaSourceDomain: "assistant-whatsapp-inbox.test" },
    })
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

suite("durable assistant WhatsApp ingress on guarded local Neon", () => {
  test("deduplicates concurrent verified input without retargeting and preserves private attribution", async () => {
    const input = {
      phoneNumberId,
      senderId,
      providerMessageId: `${marker}-provider-1`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: "123456",
    }
    expect(
      await acceptAssistantWhatsAppIngress(db, input, [userId]),
    ).toMatchObject({ kind: "ignored", reason: "unlinked" })
    expect(
      await db.assistantWhatsAppInbox.count({ where: { phoneNumberId } }),
    ).toBe(0)
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
    const principal = {
      kind: "linked_whatsapp" as const,
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
      await acceptAssistantWhatsAppIngress(
        db,
        { ...input, timestamp: String(Math.floor(Date.now() / 1000) - 300) },
        [userId],
      ),
    ).toMatchObject({ kind: "ignored", reason: "stale" })
    const fresh = { ...input, timestamp: String(Math.floor(Date.now() / 1000)) }
    expect(await acceptAssistantWhatsAppIngress(db, fresh, [])).toMatchObject({
      kind: "ignored",
      reason: "unlinked",
    })
    const receipts = await Promise.all([
      acceptAssistantWhatsAppIngress(db, fresh, [userId]),
      acceptAssistantWhatsAppIngress(db, fresh, [userId]),
    ])
    expect(receipts.map((row) => row.kind).sort()).toEqual([
      "accepted",
      "duplicate",
    ])
    const accepted = receipts.find((row) => row.kind === "accepted")
    if (!accepted || accepted.kind === "ignored")
      throw Error("No durable receipt")
    expect(accepted.bindingId).toBe(binding.bindingId)
    const usage = await db.assistantWhatsAppUsageBucket.findMany({
      where: { tenantId, userId, windowKind: "DAY" },
    })
    expect(usage.reduce((total, row) => total + row.ingress, 0)).toBe(1)
    expect(
      await db.assistantWhatsAppInbox.count({ where: { phoneNumberId } }),
    ).toBe(1)
    const row = await db.assistantWhatsAppInbox.findUniqueOrThrow({
      where: { id: accepted.id },
    })
    expect(row.state).toBe("PENDING")
    expect(row.sequence).toBe(1)
    expect(row.requestId).toBe(accepted.requestId)
    expect(row.content).toEqual({ type: "text", text: "123456" })
    const quotaNow = new Date()
    const start = new Date(Math.floor(quotaNow.getTime() / 60_000) * 60_000)
    const end = new Date(start.getTime() + 60_000)
    const quota = await db.assistantWhatsAppUsageBucket.upsert({
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
        ingress: 20,
      },
      update: { ingress: 20 },
    })
    try {
      expect(
        (await acceptAssistantWhatsAppIngress(db, fresh, [userId], quotaNow))
          .kind,
      ).toBe("duplicate")
      expect(
        await acceptAssistantWhatsAppIngress(
          db,
          { ...fresh, providerMessageId: `${marker}-limited` },
          [userId],
          quotaNow,
        ),
      ).toEqual({ kind: "ignored", reason: "rate_limited" })
      expect(
        await db.assistantWhatsAppInbox.count({
          where: { bindingId: binding.bindingId },
        }),
      ).toBe(1)
    } finally {
      await db.assistantWhatsAppUsageBucket.update({
        where: { id: quota.id },
        data: { ingress: 1 },
      })
    }

    expect(
      row.expiresAt.getTime() - row.providerOccurredAt.getTime(),
    ).toBeLessThanOrEqual(24 * 3600_000)
    expect(await db.assistantMessage.count({ where: { conversationId } })).toBe(
      0,
    )
    expect(await db.assistantRun.count({ where: { conversationId } })).toBe(0)
    expect(
      await acceptAssistantWhatsAppIngress(db, { ...fresh, text: "changed" }, [
        userId,
      ]),
    ).toMatchObject({ kind: "ignored", reason: "collision" })
    expect(
      await acceptAssistantWhatsAppIngress(
        db,
        { ...fresh, senderId: "2368000000000" },
        [userId],
      ),
    ).toMatchObject({ kind: "ignored", reason: "collision" })
    expect(
      await acceptAssistantWhatsAppIngress(
        db,
        { ...fresh, actorUserId: "foreign" },
        [userId],
      ),
    ).toMatchObject({ kind: "ignored", reason: "invalid" })
    await db.membership.update({
      where: { id: membershipId },
      data: { status: "SUSPENDED" },
    })
    expect(
      await acceptAssistantWhatsAppIngress(
        db,
        { ...fresh, providerMessageId: `${marker}-suspended` },
        [userId],
      ),
    ).toMatchObject({ kind: "ignored", reason: "unavailable" })
    await db.membership.update({
      where: { id: membershipId },
      data: { status: "ACTIVE" },
    })
    const second = await selectAssistantWhatsAppConversation(
      db,
      principal,
      secondConversationId,
    )
    expect(
      await acceptAssistantWhatsAppIngress(db, fresh, [userId]),
    ).toMatchObject({
      kind: "duplicate",
      id: row.id,
      bindingId: binding.bindingId,
      requestId: row.requestId,
    })
    const next = await acceptAssistantWhatsAppIngress(
      db,
      {
        ...fresh,
        providerMessageId: `${marker}-provider-2`,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "interactive",
        text: undefined,
        quickActionId: "opaque-proof-never-store",
      },
      [userId],
    )
    if (next.kind === "ignored")
      throw Error(`New bound ingress refused: ${next.reason}`)
    expect(next.bindingId).toBe(second.bindingId)
    const nextRow = await db.assistantWhatsAppInbox.findUniqueOrThrow({
      where: { id: next.id },
    })
    expect(nextRow.sequence).toBe(1)
    expect(JSON.stringify(nextRow.content)).not.toContain(
      "opaque-proof-never-store",
    )
    expect(nextRow.content).toMatchObject({
      type: "interactive",
      quickActionDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(
      (
        await db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).bindingId,
    ).toBe(binding.bindingId)
    expect(
      (await assistantWhatsAppPrivacyInventory(db, userId))
        .assistantWhatsAppInbox,
    ).toBe(2)
    await disconnectAssistantWhatsApp(db, { phoneNumberId, senderId })
    expect(
      await acceptAssistantWhatsAppIngress(
        db,
        { ...fresh, providerMessageId: `${marker}-revoked` },
        [userId],
      ),
    ).toMatchObject({ kind: "ignored", reason: "unlinked" })
    expect(
      (await assistantWhatsAppPrivacyInventory(db, userId))
        .assistantWhatsAppInbox,
    ).toBe(2)
    expect(
      await db.assistantWhatsAppInbox.count({ where: { phoneNumberId } }),
    ).toBe(2)
    // Metadata remains attributable after content is cleared; no deletion-completion blind spot.
    await db.assistantWhatsAppInbox.update({
      where: { id: row.id },
      data: { state: "EXPIRED", content: { cleared: true } },
    })
    expect(
      (await assistantWhatsAppPrivacyInventory(db, userId))
        .assistantWhatsAppInbox,
    ).toBe(2)
  }, 240_000)
})
