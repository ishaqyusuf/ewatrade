import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import {
  type WhatsAppGrantPrincipal,
  type WhatsAppWebActor,
  claimAssistantWhatsAppLink,
  confirmAssistantWhatsAppLink,
  createAssistantWhatsAppLink,
  readAssistantWhatsAppLink,
  resolveAssistantWhatsAppGrant,
  revokeAssistantWhatsAppGrant,
} from "./index"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const previousPilotTenants = process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS
let db: PrismaClient
const prefix = `wa-assistant-${randomUUID()}`
const now = new Date()
const userId = `${prefix}-user`
const tenantId = `${prefix}-tenant`
const storeId = `${prefix}-store`
const membershipId = `${prefix}-member`
const sessionId = `${prefix}-session`
const actor: WhatsAppWebActor = {
  userId,
  tenantId,
  storeId,
  membershipId,
  sessionId,
}
const phoneNumberId = "90000000000001"
// Synthetic, random suffix prevents overlapping test runs from sharing a sender identity.
const senderId = `234${Date.now().toString().slice(-10)}`

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
      max: 2,
    }),
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  })
  await db.$transaction(async (tx) => {
    await tx.user.create({
      data: { id: userId, email: `${prefix}@example.test`, ageBand: "ADULT" },
    })
    await tx.tenant.create({
      data: {
        id: tenantId,
        slug: tenantId,
        name: "WhatsApp assistant synthetic QA",
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        dataClassification: "QA",
        qaMarkedAt: now,
        qaSourceDomain: "assistant-whatsapp.test",
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
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
      },
    })
  })
}, 60_000)

afterAll(async () => {
  if (!db) return
  try {
    await db.tenant.deleteMany({
      where: { id: tenantId, qaSourceDomain: "assistant-whatsapp.test" },
    })
    await db.user.deleteMany({
      where: { id: userId, email: `${prefix}@example.test` },
    })
  } finally {
    await db.$disconnect()
    if (previousPilotTenants === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_WHATSAPP_PILOT_TENANT_IDS")
    else process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = previousPilotTenants
  }
}, 60_000)

suite("actual linked WhatsApp identity lifecycle on guarded local Neon", () => {
  test("requires fresh real app proof, stages one sender, confirms exact revision, and revokes cached authority", async () => {
    await expect(
      createAssistantWhatsAppLink(
        db,
        { ...actor, sessionId: "not-a-session" },
        phoneNumberId,
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      createAssistantWhatsAppLink(
        db,
        { ...actor, storeId: "unowned-store" },
        phoneNumberId,
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    const link = await createAssistantWhatsAppLink(
      db,
      actor,
      phoneNumberId,
      now,
    )
    const stored = await db.assistantWhatsAppLink.findUniqueOrThrow({
      where: { id: link.id },
    })
    expect(stored.tokenDigest).not.toBe(link.code)
    expect(stored.tokenDigest).not.toContain(link.code)
    expect(
      await db.assistantWhatsAppIdentity.count({ where: { userId } }),
    ).toBe(0)
    await expect(
      confirmAssistantWhatsAppLink(
        db,
        actor,
        { linkId: link.id, expectedRevision: 1, phoneNumberId },
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" })
    const claim = {
      code: link.code,
      phoneNumberId,
      senderId,
      messageId: `${prefix}-inbound`,
    }
    expect(
      await claimAssistantWhatsAppLink(
        db,
        { ...claim, phoneNumberId: "different-number" },
        now,
      ),
    ).toBe(false)
    expect(await claimAssistantWhatsAppLink(db, claim, now)).toBe(true)
    expect(await claimAssistantWhatsAppLink(db, claim, now)).toBe(true)
    expect(
      await claimAssistantWhatsAppLink(
        db,
        { ...claim, senderId: "2348000000099" },
        now,
      ),
    ).toBe(false)
    expect(await db.assistantWhatsAppGrant.count({ where: { tenantId } })).toBe(
      0,
    )
    const pending = await readAssistantWhatsAppLink(
      db,
      actor,
      link.id,
      phoneNumberId,
      now,
    )
    expect(pending.state).toBe("awaiting_confirmation")
    expect(JSON.stringify(pending)).not.toContain(senderId)
    await expect(
      confirmAssistantWhatsAppLink(
        db,
        actor,
        { linkId: link.id, expectedRevision: 1, phoneNumberId },
        now,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    const confirmed = await confirmAssistantWhatsAppLink(
      db,
      actor,
      { linkId: link.id, expectedRevision: pending.revision, phoneNumberId },
      now,
    )
    const principal: WhatsAppGrantPrincipal = {
      kind: "linked_whatsapp",
      grantId: confirmed.id,
      grantGeneration: confirmed.generation,
      identityGeneration: 1,
      phoneNumberId,
      senderId,
    }
    expect(
      (await resolveAssistantWhatsAppGrant(db, principal, now)).scope,
    ).toEqual({ userId, tenantId, storeId, membershipId })
    await expect(
      resolveAssistantWhatsAppGrant(
        db,
        { ...principal, senderId: "2348000000099" },
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await db.membership.update({
      where: { id: membershipId },
      data: { status: "SUSPENDED" },
    })
    await expect(
      resolveAssistantWhatsAppGrant(db, principal, now),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await db.membership.update({
      where: { id: membershipId },
      data: { status: "ACTIVE" },
    })
    expect(
      await revokeAssistantWhatsAppGrant(db, actor, confirmed.id, now),
    ).toEqual({ revoked: true })
    await expect(
      resolveAssistantWhatsAppGrant(db, principal, now),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    const old = await createAssistantWhatsAppLink(db, actor, phoneNumberId, now)
    const replacement = await createAssistantWhatsAppLink(
      db,
      actor,
      phoneNumberId,
      now,
    )
    expect(
      await claimAssistantWhatsAppLink(db, { ...claim, code: old.code }, now),
    ).toBe(false)
    expect(
      await claimAssistantWhatsAppLink(
        db,
        { ...claim, code: replacement.code },
        new Date(now.getTime() + 5 * 60_000),
      ),
    ).toBe(false)
  }, 120_000)
})
