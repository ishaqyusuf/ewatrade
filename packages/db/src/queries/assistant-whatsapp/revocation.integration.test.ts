import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  whatsAppGrantIdleMs,
  whatsAppGrantLifetimeMs,
} from "@ewatrade/assistant/channels/whatsapp"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import {
  acceptAssistantWhatsAppIngress,
  acceptAssistantWhatsAppStatus,
  claimAssistantWhatsAppLink,
  confirmAssistantWhatsAppLink,
  createAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
  expireAssistantWhatsAppGrants,
  finishAssistantWhatsAppDelivery,
  listAssistantWhatsAppGrants,
  processAssistantWhatsAppControl,
  readAssistantWhatsAppLink,
  resolveAssistantWhatsAppGrant,
  revokeAssistantWhatsAppGrant,
  touchAssistantWhatsAppGrant,
} from "./index"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const marker = `wa-revoke-${randomUUID()}`
const userId = `${marker}-user`
const otherUserId = `${marker}-other`
const actor = { userId, sessionId: `${marker}-session` }
const phoneNumberId = "90000000000001"
const tenants = [0, 1].map((i) => `${marker}-tenant-${i}`)
const tenant = (i: number) =>
  tenants[i] ??
  (() => {
    throw Error("Missing fixture Tenant")
  })()
const store = (i: number) => `${tenant(i)}-store`
const member = (i: number) => `${tenant(i)}-member`
const previousPilotTenants = process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS
let db: PrismaClient
let serial = 0
const now = new Date()
const later = new Date(now.getTime() + 60 * 60_000)
const budgetKey = `assistant:${tenant(0)}:GENERAL:${now.toISOString().slice(0, 7)}`

beforeAll(async () => {
  if (!enabled) return
  assertQaAccessAcceptanceDatabase()
  process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = tenants.join(",")
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
    await tx.user.createMany({
      data: [userId, otherUserId].map((id) => ({
        id,
        email: `${id}@example.test`,
        ageBand: "ADULT" as const,
      })),
    })
    await tx.session.createMany({
      data: [
        actor,
        { userId: otherUserId, sessionId: `${marker}-other-session` },
      ].map((a) => ({
        id: a.sessionId,
        userId: a.userId,
        token: randomUUID(),
        expiresAt: later,
        createdAt: now,
      })),
    })
    await tx.tenant.createMany({
      data: tenants.map((id) => ({
        id,
        slug: id,
        name: "Synthetic lifecycle",
        type: "MERCHANT" as const,
        dataClassification: "QA" as const,
        qaMarkedAt: now,
        qaSourceDomain: "assistant-whatsapp-revocation.test",
      })),
    })
    await tx.membership.createMany({
      data: [0, 1].map((i) => ({
        id: member(i),
        tenantId: tenant(i),
        userId,
        role: "OWNER" as const,
        status: "ACTIVE" as const,
      })),
    })
    await tx.store.createMany({
      data: [0, 1].map((i) => ({
        id: store(i),
        tenantId: tenant(i),
        slug: store(i),
        name: "Synthetic Store",
        status: "ACTIVE" as const,
      })),
    })
  })
}, 60_000)

afterAll(async () => {
  if (!db) return
  try {
    await db.assistantBudget.deleteMany({ where: { scopeKey: budgetKey } })
    await db.tenant.deleteMany({
      where: {
        id: { in: tenants },
        qaSourceDomain: "assistant-whatsapp-revocation.test",
      },
    })
    await db.user.deleteMany({
      where: {
        id: { in: [userId, otherUserId] },
        email: { endsWith: "@example.test" },
      },
    })
  } finally {
    await db.$disconnect()
    if (previousPilotTenants === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_WHATSAPP_PILOT_TENANT_IDS")
    else process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = previousPilotTenants
  }
}, 60_000)

async function fixture(selected = 0) {
  const id = `${marker}-${++serial}`
  const senderId = `239${Date.now().toString().slice(-8)}${serial}`
  const grant = (i: number) => `${id}-grant-${i}`
  const binding = (i: number) => `${id}-binding-${i}`
  const chat = (i: number) => `${id}-chat-${i}`
  await db.$transaction(async (tx) => {
    await tx.assistantWhatsAppIdentity.create({
      data: {
        id,
        userId,
        phoneNumberId,
        senderId,
        selectionGeneration: 2,
        activeBindingId: binding(selected),
        controlSequence: 3,
      },
    })
    await tx.assistantWhatsAppGrant.createMany({
      data: [0, 1].map((i) => ({
        id: grant(i),
        identityId: id,
        tenantId: tenant(i),
        storeId: store(i),
        membershipId: member(i),
        consentedAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + whatsAppGrantLifetimeMs),
        idleExpiresAt: later,
      })),
    })
    await tx.assistantConversation.createMany({
      data: [0, 1].map((i) => ({
        id: chat(i),
        ownerUserId: userId,
        tenantId: tenant(i),
        storeId: store(i),
        purpose: "GENERAL" as const,
        status: "ACTIVE" as const,
        workflowContext: { preserve: "canonical draft" },
      })),
    })
    await tx.assistantWhatsAppBinding.createMany({
      data: [0, 1].map((i) => ({
        id: binding(i),
        identityId: id,
        grantId: grant(i),
        identityGeneration: 1,
        grantGeneration: 1,
        selectionGeneration: i === selected ? 2 : 1,
        inboundSequence: i === 0 ? 3 : 1,
        createdAt: now,
        conversationId: chat(i),
        purpose: "GENERAL" as const,
      })),
    })
    await tx.assistantWhatsAppLink.create({
      data: {
        id: `${id}-link`,
        tokenDigest: randomUUID(),
        phoneNumberId,
        userId,
        tenantId: tenant(0),
        storeId: store(0),
        membershipId: member(0),
        expiresAt: later,
      },
    })
    const inputs = ["pending", "processing", "completed"].flatMap(
      (state, index) =>
        ["turn", "control"].map((kind) => ({
          id: `${id}-${kind}-${state}`,
          phoneNumberId,
          providerMessageId: `${id}-${kind}-${state}`,
          contentDigest: "synthetic",
          kind: kind === "turn" ? ("TURN" as const) : ("CONTROL" as const),
          ...(kind === "turn"
            ? { bindingId: binding(0) }
            : {
                identityId: id,
                identityGeneration: 1,
                selectionGeneration: 2,
              }),
          sequence: index + 1,
          requestId: randomUUID(),
          userMessageId: randomUUID(),
          providerOccurredAt: now,
          expiresAt: later,
          content: { text: "Synthetic queued private payload" },
          state:
            state === "pending"
              ? ("PENDING" as const)
              : state === "processing"
                ? ("PROCESSING" as const)
                : ("COMPLETED" as const),
        })),
    )
    const first = inputs[0]
    if (!first) throw Error("Missing synthetic input")
    inputs.push({
      ...first,
      id: `${id}-other-business`,
      providerMessageId: `${id}-other-business`,
      bindingId: binding(1),
      requestId: randomUUID(),
      userMessageId: randomUUID(),
    })
    await tx.assistantWhatsAppInbox.createMany({ data: inputs })
    await tx.assistantWhatsAppOutbox.createMany({
      data: inputs.map((q, i) => ({
        id: `${q.id}-out`,
        inboxId: q.id,
        phoneNumberId,
        chunkIndex: 0,
        chunkCount: 1,
        rendererVersion: "synthetic",
        renderKind: q.kind === "CONTROL" ? "control" : "reply",
        authorityDigest: "synthetic",
        content: "Synthetic private reply",
        contentDigest: "synthetic",
        expiresAt: later,
        state:
          i === 2 || i === 3
            ? ("SENDING" as const)
            : i === 4 || i === 5
              ? ("SENT" as const)
              : ("PENDING" as const),
        leaseGeneration: i === 2 || i === 3 ? 1 : 0,
        attempts: i === 2 || i === 3 ? 1 : 0,
        leaseOwner: marker,
      })),
    })
    await tx.assistantWhatsAppAttempt.createMany({
      data: ["turn", "control"].map((kind) => ({
        id: `${id}-${kind}-attempt`,
        outboxId: `${id}-${kind}-processing-out`,
        generation: 1,
        owner: marker,
        callbackDigest: `${id}-${kind}-callback`,
        startedAt: now,
      })),
    })
  })
  return {
    id,
    senderId,
    grant,
    binding,
    chat,
    principal: {
      kind: "linked_whatsapp" as const,
      phoneNumberId,
      senderId,
      grantId: grant(0),
      grantGeneration: 1,
      identityGeneration: 1,
    },
  }
}

suite(
  "owned revocation, expiry and relink on guarded local Neon without provider effects",
  () => {
    test("owner can revoke after losing business access; other owner/session denied; typed queues clear with original effect proof", async () => {
      const f = await fixture()
      await expect(
        revokeAssistantWhatsAppGrant(
          db,
          { userId: otherUserId, sessionId: `${marker}-other-session` },
          f.grant(0),
          now,
        ),
      ).rejects.toMatchObject({ code: "UNAVAILABLE" })
      await expect(
        revokeAssistantWhatsAppGrant(
          db,
          { ...actor, sessionId: "forged" },
          f.grant(0),
          now,
        ),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      await db.session.create({
        data: {
          id: `${f.id}-expired-session`,
          userId,
          token: randomUUID(),
          createdAt: now,
          expiresAt: now,
        },
      })
      await expect(
        revokeAssistantWhatsAppGrant(
          db,
          { ...actor, sessionId: `${f.id}-expired-session` },
          f.grant(0),
          now,
        ),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      await db.session.create({
        data: {
          id: `${f.id}-qa-session`,
          userId,
          token: `qas_${randomUUID()}`,
          createdAt: now,
          expiresAt: later,
        },
      })
      await expect(
        listAssistantWhatsAppGrants(
          db,
          { ...actor, sessionId: `${f.id}-qa-session` },
          undefined,
          now,
        ),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      await db.membership.update({
        where: { id: member(0) },
        data: { status: "SUSPENDED" },
      })
      try {
        expect(
          (await listAssistantWhatsAppGrants(db, actor, undefined, now)).find(
            (g) => g.id === f.grant(0),
          ),
        ).toMatchObject({
          businessName: "Synthetic lifecycle",
          storeName: "Synthetic Store",
          consentedAt: now,
        })
        expect(
          await revokeAssistantWhatsAppGrant(db, actor, f.grant(0), now),
        ).toEqual({ revoked: true })
      } finally {
        await db.membership.update({
          where: { id: member(0) },
          data: { status: "ACTIVE" },
        })
      }
      const identity = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
        where: { id: f.id },
      })
      expect(identity).toMatchObject({
        activeBindingId: null,
        generation: 1,
        selectionGeneration: 3,
        controlSequence: 4,
      })
      for (const kind of ["turn", "control"]) {
        for (const state of ["pending", "processing", "completed"]) {
          const row = await db.assistantWhatsAppInbox.findUniqueOrThrow({
            where: { id: `${f.id}-${kind}-${state}` },
          })
          expect(row.content).toBeNull()
          expect(row.state).toBe(
            state === "completed" ? "COMPLETED" : "CANCELLED",
          )
          const out = await db.assistantWhatsAppOutbox.findUniqueOrThrow({
            where: { id: `${row.id}-out` },
          })
          expect(out.content).toBeNull()
          expect(out.state).toBe(
            state === "processing"
              ? "UNKNOWN"
              : state === "completed"
                ? "SENT"
                : "CANCELLED",
          )
        }
        expect(
          await db.assistantWhatsAppAttempt.findUnique({
            where: { id: `${f.id}-${kind}-attempt` },
            select: { state: true, generation: true, owner: true },
          }),
        ).toEqual({ state: "UNKNOWN", generation: 1, owner: marker })
      }
      expect(
        (
          await db.assistantWhatsAppGrant.findUniqueOrThrow({
            where: { id: f.grant(1) },
          })
        ).revokedAt,
      ).toBeNull()
      expect(
        (
          await db.assistantWhatsAppOutbox.findUniqueOrThrow({
            where: { id: `${f.id}-other-business-out` },
          })
        ).content,
      ).toBe("Synthetic private reply")
      expect(
        (
          await db.assistantWhatsAppLink.findUniqueOrThrow({
            where: { id: `${f.id}-link` },
          })
        ).cancelledAt,
      ).not.toBeNull()
      expect(
        (
          await db.assistantConversation.findUniqueOrThrow({
            where: { id: f.chat(0) },
          })
        ).workflowContext,
      ).toEqual({ preserve: "canonical draft" })
      expect(
        await revokeAssistantWhatsAppGrant(db, actor, f.grant(0), now),
      ).toEqual({ revoked: true })
      expect(
        (
          await db.assistantWhatsAppIdentity.findUniqueOrThrow({
            where: { id: f.id },
          })
        ).controlSequence,
      ).toBe(4)
      await expect(
        resolveAssistantWhatsAppGrant(db, f.principal, now),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    }, 180_000)

    test("revoking an unselected business preserves the selected business and sender disconnect clears both; late outcomes remain reconcilable", async () => {
      const f = await fixture(1)
      await revokeAssistantWhatsAppGrant(db, actor, f.grant(0), now)
      expect(
        await db.assistantWhatsAppIdentity.findUnique({
          where: { id: f.id },
          select: { activeBindingId: true, selectionGeneration: true },
        }),
      ).toEqual({ activeBindingId: f.binding(1), selectionGeneration: 2 })
      expect(
        await disconnectAssistantWhatsApp(
          db,
          { phoneNumberId, senderId: f.senderId },
          now,
        ),
      ).toEqual({ disconnected: true })
      const after = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
        where: { id: f.id },
      })
      expect(after).toMatchObject({
        activeBindingId: null,
        generation: 2,
        selectionGeneration: 3,
      })
      expect(
        (
          await db.assistantWhatsAppOutbox.findUniqueOrThrow({
            where: { id: `${f.id}-other-business-out` },
          })
        ).content,
      ).toBeNull()
      expect(
        await db.assistantWhatsAppGrant.count({
          where: { identityId: f.id, revokedAt: null },
        }),
      ).toBe(0)
      await disconnectAssistantWhatsApp(
        db,
        { phoneNumberId, senderId: f.senderId },
        now,
      )
      expect(
        (
          await db.assistantWhatsAppIdentity.findUniqueOrThrow({
            where: { id: f.id },
          })
        ).generation,
      ).toBe(2)
      expect(
        await finishAssistantWhatsAppDelivery(
          db,
          {
            outboxId: `${f.id}-turn-processing-out`,
            attemptId: `${f.id}-turn-attempt`,
            generation: 1,
            owner: marker,
          },
          { kind: "accepted", providerMessageId: `${f.id}-late-accepted` },
          now,
        ),
      ).toEqual({ state: "SENT" })
      expect(
        await finishAssistantWhatsAppDelivery(
          db,
          {
            outboxId: `${f.id}-control-processing-out`,
            attemptId: `${f.id}-control-attempt`,
            generation: 1,
            owner: marker,
          },
          { kind: "rejected" },
          now,
        ),
      ).toEqual({ state: "FAILED" })
      expect(
        (
          await db.assistantWhatsAppOutbox.findUniqueOrThrow({
            where: { id: `${f.id}-control-processing-out` },
          })
        ).nextAttemptAt,
      ).toBeNull()
      expect(
        (
          await db.assistantWhatsAppOutbox.findUniqueOrThrow({
            where: { id: `${f.id}-turn-processing-out` },
          })
        ).content,
      ).toBeNull()
      expect(
        await acceptAssistantWhatsAppStatus(
          db,
          {
            phoneNumberId,
            messageId: `${f.id}-late-accepted`,
            recipientId: f.senderId,
            status: "read",
            timestamp: String(Math.floor(now.getTime() / 1000)),
          },
          now,
        ),
      ).toMatchObject({
        state: "READ",
        outboxId: `${f.id}-turn-processing-out`,
      })
    }, 150_000)

    test("new authorized input alone refreshes idle consent; duplicates, expired and stale generations cannot revive it", async () => {
      const f = await fixture()
      const at = new Date(now.getTime() + 30_000)
      const event = {
        phoneNumberId,
        senderId: f.senderId,
        providerMessageId: `${f.id}-activity`,
        timestamp: String(Math.floor(at.getTime() / 1000)),
        type: "text",
        text: "search rice",
      }
      expect(
        (await acceptAssistantWhatsAppIngress(db, event, [userId], at)).kind,
      ).toBe("accepted")
      const touched = await db.assistantWhatsAppGrant.findUniqueOrThrow({
        where: { id: f.grant(0) },
      })
      expect(touched.lastUsedAt).toEqual(at)
      expect(touched.idleExpiresAt).toEqual(
        new Date(at.getTime() + whatsAppGrantIdleMs),
      )
      expect(
        (
          await acceptAssistantWhatsAppIngress(
            db,
            event,
            [userId],
            new Date(at.getTime() + 60_000),
          )
        ).kind,
      ).toBe("duplicate")
      expect(
        (
          await db.assistantWhatsAppGrant.findUniqueOrThrow({
            where: { id: f.grant(0) },
          })
        ).lastUsedAt,
      ).toEqual(at)
      await expect(
        touchAssistantWhatsAppGrant(
          db,
          { ...f.principal, grantGeneration: 99 },
          at,
        ),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      const absolute = new Date(at.getTime() + 1000)
      await db.assistantWhatsAppGrant.update({
        where: { id: f.grant(0) },
        data: { expiresAt: absolute, idleExpiresAt: absolute },
      })
      await touchAssistantWhatsAppGrant(
        db,
        f.principal,
        new Date(at.getTime() + 500),
      )
      expect(
        (
          await db.assistantWhatsAppGrant.findUniqueOrThrow({
            where: { id: f.grant(0) },
          })
        ).idleExpiresAt,
      ).toEqual(absolute)
      await expect(
        touchAssistantWhatsAppGrant(db, f.principal, absolute),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      const result = await expireAssistantWhatsAppGrants(db, absolute, [
        f.grant(0),
      ])
      expect(result.expired).toBe(1)
      expect(result.cleared).toBeGreaterThan(0)
      expect(
        await expireAssistantWhatsAppGrants(db, absolute, [f.grant(0)]),
      ).toEqual({ expired: 0, cleared: 0 })
      expect(
        (
          await db.assistantWhatsAppGrant.findUniqueOrThrow({
            where: { id: f.grant(1) },
          })
        ).revokedAt,
      ).toBeNull()
      expect(
        (
          await db.assistantWhatsAppOutbox.findUniqueOrThrow({
            where: { id: `${f.id}-control-processing-out` },
          })
        ).state,
      ).toBe("UNKNOWN")
      await db.assistantWhatsAppGrant.update({
        where: { id: f.grant(1) },
        data: { idleExpiresAt: absolute },
      })
      await expect(
        touchAssistantWhatsAppGrant(
          db,
          { ...f.principal, grantId: f.grant(1) },
          absolute,
        ),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      expect(
        (await expireAssistantWhatsAppGrants(db, absolute, [f.grant(1)]))
          .expired,
      ).toBe(1)
    }, 180_000)

    test("new personal controls refresh authorized anchor and acted scope at actor time, never replay or rejected pilot input", async () => {
      const f = await fixture(1)
      const at = new Date(now.getTime() + 45_000)
      const event = {
        phoneNumberId,
        senderId: f.senderId,
        providerMessageId: `${f.id}-help`,
        timestamp: String(Math.floor(at.getTime() / 1000)),
        type: "text",
        text: "Help",
      }
      expect(
        (await acceptAssistantWhatsAppIngress(db, event, [], at)).kind,
      ).toBe("ignored")
      expect(
        (
          await db.assistantWhatsAppGrant.findUniqueOrThrow({
            where: { id: f.grant(0) },
          })
        ).lastUsedAt,
      ).toEqual(now)
      const accepted = await acceptAssistantWhatsAppIngress(
        db,
        event,
        [userId],
        at,
      )
      expect(accepted.kind).toBe("control_accepted")
      if (accepted.kind !== "control_accepted")
        throw Error("Control fixture refused")
      expect(
        (
          await db.assistantWhatsAppGrant.findUniqueOrThrow({
            where: { id: f.grant(0) },
          })
        ).lastUsedAt,
      ).toEqual(at)
      expect(
        (
          await db.assistantWhatsAppGrant.findUniqueOrThrow({
            where: { id: f.grant(1) },
          })
        ).lastUsedAt,
      ).toEqual(now)
      expect(
        (
          await processAssistantWhatsAppControl(
            db,
            accepted.id,
            [userId],
            new Date(at.getTime() + 10_000),
          )
        )?.status,
      ).toBe("completed")
      expect(
        (
          await db.assistantWhatsAppGrant.findUniqueOrThrow({
            where: { id: f.grant(1) },
          })
        ).lastUsedAt,
      ).toEqual(at)
      expect(
        (
          await processAssistantWhatsAppControl(
            db,
            accepted.id,
            [userId],
            new Date(at.getTime() + 20_000),
          )
        )?.status,
      ).toBe("completed")
      expect(
        (
          await db.assistantWhatsAppGrant.findUniqueOrThrow({
            where: { id: f.grant(1) },
          })
        ).lastUsedAt,
      ).toEqual(at)
      expect(
        (
          await acceptAssistantWhatsAppIngress(
            db,
            event,
            [userId],
            new Date(at.getTime() + 60_000),
          )
        ).kind,
      ).toBe("control_duplicate")
      expect(
        (
          await db.assistantWhatsAppGrant.findUniqueOrThrow({
            where: { id: f.grant(0) },
          })
        ).lastUsedAt,
      ).toEqual(at)
    }, 150_000)

    test("fresh relink invalidates old proofs without resetting usage/history and confirmation retry has no second effect", async () => {
      const f = await fixture()
      const webActor = {
        ...actor,
        tenantId: tenant(0),
        storeId: store(0),
        membershipId: member(0),
      }
      await disconnectAssistantWhatsApp(
        db,
        { phoneNumberId, senderId: f.senderId },
        now,
      )
      await db.assistantWhatsAppUsageBucket.create({
        data: {
          userId,
          tenantId: tenant(0),
          windowKind: "MINUTE",
          windowStartedAt: now,
          windowEndsAt: later,
          expiresAt: later,
          ingress: 7,
          deliveryAttempts: 2,
        },
      })
      await db.assistantBudget.create({
        data: {
          scopeKey: budgetKey,
          windowStartedAt: now,
          requests: 9,
          tokens: 12345,
        },
      })
      const link = await createAssistantWhatsAppLink(
        db,
        webActor,
        phoneNumberId,
        now,
      )
      expect(
        await claimAssistantWhatsAppLink(
          db,
          {
            code: link.code,
            phoneNumberId,
            senderId: f.senderId,
            messageId: `${f.id}-relink`,
          },
          now,
        ),
      ).toBe(true)
      const pending = await readAssistantWhatsAppLink(
        db,
        webActor,
        link.id,
        phoneNumberId,
        now,
      )
      const input = {
        linkId: link.id,
        expectedRevision: pending.revision,
        phoneNumberId,
      }
      const confirmed = await confirmAssistantWhatsAppLink(
        db,
        webActor,
        input,
        now,
      )
      expect(confirmed.id).toBe(f.grant(0))
      expect(confirmed.generation).toBe(3)
      const current = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
        where: { id: f.id },
      })
      expect(current.generation).toBe(3)
      expect(current.revokedAt).toBeNull()
      expect(current.activeBindingId).not.toBe(f.binding(0))
      expect(
        await confirmAssistantWhatsAppLink(db, webActor, input, now),
      ).toEqual(confirmed)
      expect(
        (
          await db.assistantWhatsAppIdentity.findUniqueOrThrow({
            where: { id: f.id },
          })
        ).activeBindingId,
      ).toBe(current.activeBindingId)
      await expect(
        resolveAssistantWhatsAppGrant(db, f.principal, now),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      expect(
        (
          await db.assistantWhatsAppUsageBucket.findFirstOrThrow({
            where: { userId, windowStartedAt: now },
          })
        ).ingress,
      ).toBe(7)
      expect(
        (
          await db.assistantConversation.findUniqueOrThrow({
            where: { id: f.chat(0) },
          })
        ).workflowContext,
      ).toEqual({ preserve: "canonical draft" })
      expect(
        await db.assistantBudget.findUnique({
          where: { scopeKey: budgetKey },
          select: { requests: true, tokens: true },
        }),
      ).toEqual({ requests: 9, tokens: 12345 })
      await revokeAssistantWhatsAppGrant(db, actor, f.grant(0), now)
      await expect(
        confirmAssistantWhatsAppLink(db, webActor, input, now),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const replacement = await createAssistantWhatsAppLink(
        db,
        webActor,
        phoneNumberId,
        now,
      )
      expect(
        await claimAssistantWhatsAppLink(
          db,
          {
            code: replacement.code,
            phoneNumberId,
            senderId: f.senderId,
            messageId: `${f.id}-second-relink`,
          },
          now,
        ),
      ).toBe(true)
      const replacementState = await readAssistantWhatsAppLink(
        db,
        webActor,
        replacement.id,
        phoneNumberId,
        now,
      )
      await confirmAssistantWhatsAppLink(
        db,
        webActor,
        {
          linkId: replacement.id,
          expectedRevision: replacementState.revision,
          phoneNumberId,
        },
        now,
      )
      // Exact generation, rather than a timestamp alone, fences two consents in the same millisecond.
      await expect(
        confirmAssistantWhatsAppLink(db, webActor, input, now),
      ).rejects.toMatchObject({ code: "CONFLICT" })
    }, 180_000)

    test("expiry racing with fresh app-confirmed consent cannot revoke the renewed generation", async () => {
      const f = await fixture()
      const webActor = {
        ...actor,
        tenantId: tenant(0),
        storeId: store(0),
        membershipId: member(0),
      }
      await db.assistantWhatsAppGrant.update({
        where: { id: f.grant(0) },
        data: { idleExpiresAt: now },
      })
      const link = await createAssistantWhatsAppLink(
        db,
        webActor,
        phoneNumberId,
        now,
      )
      expect(
        await claimAssistantWhatsAppLink(
          db,
          {
            code: link.code,
            phoneNumberId,
            senderId: f.senderId,
            messageId: `${f.id}-race`,
          },
          now,
        ),
      ).toBe(true)
      const pending = await readAssistantWhatsAppLink(
        db,
        webActor,
        link.id,
        phoneNumberId,
        now,
      )
      const [expired, renewed] = await Promise.all([
        expireAssistantWhatsAppGrants(db, now, [f.grant(0)]),
        confirmAssistantWhatsAppLink(
          db,
          webActor,
          {
            linkId: link.id,
            expectedRevision: pending.revision,
            phoneNumberId,
          },
          now,
        ),
      ])
      expect([0, 1]).toContain(expired.expired)
      const grant = await db.assistantWhatsAppGrant.findUniqueOrThrow({
        where: { id: renewed.id },
      })
      expect(grant.revokedAt).toBeNull()
      expect(grant.idleExpiresAt).toEqual(
        new Date(now.getTime() + whatsAppGrantIdleMs),
      )
      expect(grant.generation).toBe(renewed.generation)
      expect(grant.generation).toBeGreaterThan(1)
      expect(
        (
          await db.assistantWhatsAppOutbox.findUniqueOrThrow({
            where: { id: `${f.id}-turn-pending-out` },
          })
        ).content,
      ).toBeNull()
      await expect(
        resolveAssistantWhatsAppGrant(db, f.principal, now),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    }, 180_000)

    test("simultaneous unrelated identity revocations clear only owned queues without relation-wide retry exhaustion", async () => {
      const a = await fixture()
      const b = await fixture(1)
      expect(
        await Promise.all([
          revokeAssistantWhatsAppGrant(db, actor, a.grant(0), now),
          revokeAssistantWhatsAppGrant(db, actor, b.grant(0), now),
        ]),
      ).toEqual([{ revoked: true }, { revoked: true }])
      for (const f of [a, b]) {
        expect(
          (
            await db.assistantWhatsAppOutbox.findUniqueOrThrow({
              where: { id: `${f.id}-turn-pending-out` },
            })
          ).content,
        ).toBeNull()
        expect(
          (
            await db.assistantWhatsAppOutbox.findUniqueOrThrow({
              where: { id: `${f.id}-other-business-out` },
            })
          ).content,
        ).toBe("Synthetic private reply")
        expect(
          (
            await db.assistantWhatsAppGrant.findUniqueOrThrow({
              where: { id: f.grant(1) },
            })
          ).revokedAt,
        ).toBeNull()
      }
      expect(
        (
          await db.assistantWhatsAppIdentity.findUniqueOrThrow({
            where: { id: b.id },
          })
        ).activeBindingId,
      ).toBe(b.binding(1))
    }, 150_000)
  },
)
