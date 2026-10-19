import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { WhatsAppScopeSelection } from "@ewatrade/assistant/channels/whatsapp"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import { finishAssistantWhatsAppDelivery } from "./delivery"
import { assistantWhatsAppPrivacyInventory } from "./privacy"
import {
  listAssistantWhatsAppBusinesses,
  listAssistantWhatsAppChats,
  listAssistantWhatsAppStores,
  selectAssistantWhatsAppScope,
} from "./scope-controls"

function item<T>(values: readonly T[], index: number): T {
  const value = values[index]
  if (value === undefined) throw new Error("Missing synthetic fixture item")
  return value
}

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const marker = `wa-picker-${randomUUID()}`
const userId = `${marker}-user`
const otherUserId = `${marker}-other`
const identityId = `${marker}-identity`
const phoneNumberId = "90000000000001"
const tenants = [0, 1, 2].map((i) => `${marker}-tenant-${i}`)
const members = [0, 1, 2].map((i) => `${marker}-member-${i}`)
const stores = [0, 1, 2].map((i) => `${marker}-store-${i}`)
const grantIds = [0, 1].map((i) => `${marker}-grant-${i}`)
const actor = { userId, sessionId: `${marker}-session` }
const now = new Date()
const expiresAt = new Date(now.getTime() + 60 * 60_000)
const previousPilotTenants = process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS
let db: PrismaClient

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
        expiresAt,
        createdAt: now,
      })),
    })
    for (let i = 0; i < 3; i++) {
      const tenantId = item(tenants, i)
      await tx.tenant.create({
        data: {
          id: tenantId,
          slug: tenantId,
          name: `Synthetic business ${i}`,
          type: "MERCHANT",
          dataClassification: "QA",
          qaMarkedAt: now,
          qaSourceDomain: "assistant-whatsapp-picker.test",
        },
      })
      await tx.membership.create({
        data: {
          id: item(members, i),
          userId,
          tenantId,
          role: "OWNER",
          status: "ACTIVE",
        },
      })
      await tx.store.create({
        data: {
          id: item(stores, i),
          tenantId,
          slug: item(stores, i),
          name: `Store ${i}`,
          status: "ACTIVE",
        },
      })
    }
    await tx.store.createMany({
      data: Array.from({ length: 11 }, (_, i) => ({
        id: `${marker}-extra-${String(i).padStart(2, "0")}`,
        slug: `${marker}-extra-${i}`,
        name: `Store extra ${i}`,
        tenantId: item(tenants, 0),
        status: "ACTIVE" as const,
      })),
    })
    await tx.assistantWhatsAppIdentity.create({
      data: {
        id: identityId,
        userId,
        phoneNumberId,
        senderId: `234${Date.now().toString().slice(-10)}`,
      },
    })
    await tx.assistantWhatsAppGrant.createMany({
      data: [0, 1].map((i) => ({
        id: item(grantIds, i),
        identityId,
        tenantId: item(tenants, i),
        storeId: item(stores, i),
        membershipId: item(members, i),
        consentedAt: now,
        lastUsedAt: now,
        expiresAt,
        idleExpiresAt: expiresAt,
      })),
    })
    await tx.assistantConversation.createMany({
      data: [
        {
          id: `${marker}-setup`,
          ownerUserId: userId,
          tenantId: item(tenants, 0),
          storeId: item(stores, 0),
          purpose: "SETUP" as const,
          status: "ACTIVE" as const,
          workflowContext: { synthetic: "unchanged" },
        },
        {
          id: `${marker}-foreign`,
          ownerUserId: otherUserId,
          tenantId: item(tenants, 0),
          storeId: item(stores, 0),
          purpose: "GENERAL" as const,
          status: "ACTIVE" as const,
        },
        {
          id: `${marker}-setup-scoped`,
          ownerUserId: userId,
          tenantId: item(tenants, 0),
          storeId: `${marker}-extra-00`,
          purpose: "SETUP" as const,
          status: "ACTIVE" as const,
        },
        {
          id: `${marker}-archived`,
          ownerUserId: userId,
          tenantId: item(tenants, 0),
          storeId: item(stores, 0),
          purpose: "GENERAL" as const,
          status: "ARCHIVED" as const,
        },
      ],
    })
    await tx.setupDraft.create({
      data: {
        conversationId: `${marker}-setup`,
        tenantId: item(tenants, 0),
        storeId: item(stores, 0),
        revision: 3,
        areas: { sell: "DONE" },
      },
    })
  })
}, 60_000)

afterAll(async () => {
  if (!db) return
  try {
    await db.tenant.deleteMany({
      where: {
        id: { in: tenants },
        qaSourceDomain: "assistant-whatsapp-picker.test",
      },
    })
    await db.user.deleteMany({
      where: {
        id: { in: [userId, otherUserId] },
        email: { endsWith: "@example.test" },
      },
    })
    expect(
      await db.assistantWhatsAppSelection.count({
        where: { identityId: { in: [identityId, `${marker}-peer-identity`] } },
      }),
    ).toBe(0)
  } finally {
    await db.$disconnect()
    if (previousPilotTenants === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_WHATSAPP_PILOT_TENANT_IDS")
    else process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = previousPilotTenants
  }
}, 60_000)

async function selection(grantIndex = 0, storeId = item(stores, grantIndex)) {
  const identity = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
    where: { id: identityId },
  })
  const grant = await db.assistantWhatsAppGrant.findUniqueOrThrow({
    where: { id: item(grantIds, grantIndex) },
  })
  return {
    identityId,
    grantId: grant.id,
    storeId,
    requestId: randomUUID(),
    expectedIdentityGeneration: identity.generation,
    expectedGrantGeneration: grant.generation,
    expectedSelectionGeneration: identity.selectionGeneration,
    action: { kind: "new" },
  } satisfies WhatsAppScopeSelection
}

suite("personal WhatsApp scope controls on guarded local Neon", () => {
  test("bounds choices to consented membership, paginates Stores and enforces exact chat owner, purpose and Store", async () => {
    const businesses = await listAssistantWhatsAppBusinesses(
      db,
      actor,
      phoneNumberId,
      { identityId },
      now,
    )
    expect(businesses.choices.map((c) => c.tenantId).sort()).toEqual(
      tenants.slice(0, 2).sort(),
    )
    expect(JSON.stringify(businesses)).not.toContain("senderId")
    const page1 = await listAssistantWhatsAppStores(
      db,
      actor,
      phoneNumberId,
      { identityId, grantId: item(grantIds, 0) },
      now,
    )
    expect(page1.choices).toHaveLength(10)
    const page2 = await listAssistantWhatsAppStores(
      db,
      actor,
      phoneNumberId,
      { identityId, grantId: item(grantIds, 0), cursor: page1.nextCursor },
      now,
    )
    expect(page2.choices).toHaveLength(2)
    expect(
      new Set([...page1.choices, ...page2.choices].map((s) => s.id)).size,
    ).toBe(12)
    const chats = await listAssistantWhatsAppChats(
      db,
      actor,
      phoneNumberId,
      { identityId, grantId: item(grantIds, 0), storeId: item(stores, 0) },
      now,
    )
    expect(chats.choices.map((c) => c.id)).toEqual([`${marker}-setup`])
    expect(chats.choices[0]?.channelRuntime).toBe("app_review")
    for (const badActor of [
      { ...actor, sessionId: "invented" },
      { userId: otherUserId, sessionId: `${marker}-other-session` },
    ])
      await expect(
        listAssistantWhatsAppBusinesses(
          db,
          badActor,
          phoneNumberId,
          { identityId },
          now,
        ),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      listAssistantWhatsAppStores(
        db,
        actor,
        "other-endpoint",
        { identityId, grantId: item(grantIds, 0) },
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    for (const conversationId of [
      `${marker}-foreign`,
      `${marker}-archived`,
      `${marker}-setup`,
    ]) {
      await expect(
        selectAssistantWhatsAppScope(
          db,
          actor,
          phoneNumberId,
          {
            ...(await selection()),
            action: { kind: "resume", conversationId, purpose: "GENERAL" },
          },
          now,
        ),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    }
    await expect(
      selectAssistantWhatsAppScope(
        db,
        actor,
        phoneNumberId,
        {
          ...(await selection(1)),
          action: {
            kind: "resume",
            conversationId: `${marker}-setup`,
            purpose: "SETUP",
          },
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    const resumed = await selectAssistantWhatsAppScope(
      db,
      actor,
      phoneNumberId,
      {
        ...(await selection()),
        action: {
          kind: "resume",
          conversationId: `${marker}-setup`,
          purpose: "SETUP",
        },
      },
      now,
    )
    expect(resumed.state).toBe("selected")
    expect(
      await db.setupDraft.findUnique({
        where: { conversationId: `${marker}-setup` },
        select: { tenantId: true, storeId: true, revision: true, areas: true },
      }),
    ).toEqual({
      tenantId: item(tenants, 0),
      storeId: item(stores, 0),
      revision: 3,
      areas: { sell: "DONE" },
    })
  }, 120_000)

  test("replays once, never restores superseded selection, and serializes competing scope changes", async () => {
    const input = await selection()
    const first = await selectAssistantWhatsAppScope(
      db,
      actor,
      phoneNumberId,
      input,
      now,
    )
    expect(first).toMatchObject({
      state: "selected",
      replay: false,
      purpose: "GENERAL",
    })
    expect(
      await selectAssistantWhatsAppScope(db, actor, phoneNumberId, input, now),
    ).toEqual({ ...first, replay: true })
    await expect(
      selectAssistantWhatsAppScope(
        db,
        actor,
        phoneNumberId,
        { ...input, storeId: `${marker}-extra-00` },
        now,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    const next = await selectAssistantWhatsAppScope(
      db,
      actor,
      phoneNumberId,
      await selection(1),
      now,
    )
    expect(
      await selectAssistantWhatsAppScope(db, actor, phoneNumberId, input, now),
    ).toEqual({
      state: "superseded",
      replay: true,
      identityId,
      bindingId: first.bindingId,
    })
    expect(
      (
        await db.assistantWhatsAppIdentity.findUniqueOrThrow({
          where: { id: identityId },
        })
      ).activeBindingId,
    ).toBe(next.bindingId)
    const race = await selection()
    const results = await Promise.allSettled([
      selectAssistantWhatsAppScope(db, actor, phoneNumberId, race, now),
      selectAssistantWhatsAppScope(
        db,
        actor,
        phoneNumberId,
        { ...race, requestId: randomUUID() },
        now,
      ),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1)
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    })
    expect(
      (await assistantWhatsAppPrivacyInventory(db, userId))
        .assistantWhatsAppSelections,
    ).toBeGreaterThan(3)
    const duplicateInput = await selection()
    const duplicates = await Promise.all([
      selectAssistantWhatsAppScope(
        db,
        actor,
        phoneNumberId,
        duplicateInput,
        now,
      ),
      selectAssistantWhatsAppScope(
        db,
        actor,
        phoneNumberId,
        duplicateInput,
        now,
      ),
    ])
    expect(new Set(duplicates.map((result) => result.bindingId)).size).toBe(1)
    expect(duplicates.map((result) => result.replay).sort()).toEqual([
      false,
      true,
    ])
    const selected = item(duplicates, 0)
    if (selected.state !== "selected") throw Error("Expected current selection")
    await db.assistantConversation.delete({
      where: { id: selected.conversationId },
    })
    expect(
      await selectAssistantWhatsAppScope(
        db,
        actor,
        phoneNumberId,
        duplicateInput,
        now,
      ),
    ).toEqual({
      state: "superseded",
      replay: true,
      identityId,
      bindingId: selected.bindingId,
    })
  }, 120_000)

  test("cancels old queued content, preserves uncertain send proof and resumes late provider outcomes without resend", async () => {
    const first = await selectAssistantWhatsAppScope(
      db,
      actor,
      phoneNumberId,
      await selection(),
      now,
    )
    const inboxId = `${marker}-inbox`
    const pendingId = `${marker}-pending`
    const sendingIds = [`${marker}-sending-accept`, `${marker}-sending-reject`]
    await db.$transaction(async (tx) => {
      await tx.assistantWhatsAppInbox.create({
        data: {
          id: inboxId,
          phoneNumberId,
          providerMessageId: `${marker}-input`,
          contentDigest: "synthetic",
          bindingId: first.bindingId,
          sequence: 1,
          requestId: randomUUID(),
          userMessageId: randomUUID(),
          providerOccurredAt: now,
          expiresAt,
          content: { text: "Synthetic queued input" },
        },
      })
      for (const [index, id] of [pendingId, ...sendingIds].entries()) {
        await tx.assistantWhatsAppOutbox.create({
          data: {
            id,
            inboxId,
            phoneNumberId,
            chunkIndex: index,
            chunkCount: 3,
            rendererVersion: "synthetic",
            authorityDigest: "synthetic",
            content: "Synthetic private reply",
            contentDigest: "synthetic",
            expiresAt,
            state: index === 0 ? "PENDING" : "SENDING",
            leaseGeneration: index === 0 ? 0 : 1,
            leaseOwner: index === 0 ? null : marker,
            leaseExpiresAt: expiresAt,
            attempts: index === 0 ? 0 : 1,
          },
        })
        if (index)
          await tx.assistantWhatsAppAttempt.create({
            data: {
              id: `${id}-attempt`,
              outboxId: id,
              generation: 1,
              owner: marker,
              callbackDigest: `${id}-callback`,
            },
          })
      }
    })
    const switched = await selectAssistantWhatsAppScope(
      db,
      actor,
      phoneNumberId,
      await selection(1),
      now,
    )
    expect(switched.state).toBe("selected")
    expect(
      await db.assistantWhatsAppInbox.findUnique({
        where: { id: inboxId },
        select: { state: true, content: true },
      }),
    ).toEqual({ state: "CANCELLED", content: null })
    expect(
      await db.assistantWhatsAppOutbox.findUnique({
        where: { id: pendingId },
        select: { state: true, content: true },
      }),
    ).toEqual({ state: "CANCELLED", content: null })
    for (const id of sendingIds) {
      expect(
        await db.assistantWhatsAppOutbox.findUnique({
          where: { id },
          select: { state: true, content: true, leaseGeneration: true },
        }),
      ).toEqual({ state: "UNKNOWN", content: null, leaseGeneration: 1 })
      expect(
        (
          await db.assistantWhatsAppAttempt.findUniqueOrThrow({
            where: { id: `${id}-attempt` },
          })
        ).state,
      ).toBe("UNKNOWN")
    }
    expect(
      await finishAssistantWhatsAppDelivery(
        db,
        {
          outboxId: item(sendingIds, 0),
          attemptId: `${sendingIds[0]}-attempt`,
          generation: 1,
          owner: marker,
        },
        { kind: "accepted", providerMessageId: `${marker}-accepted` },
        now,
      ),
    ).toEqual({ state: "SENT" })
    expect(
      await finishAssistantWhatsAppDelivery(
        db,
        {
          outboxId: item(sendingIds, 1),
          attemptId: `${sendingIds[1]}-attempt`,
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
          where: { id: item(sendingIds, 1) },
        })
      ).nextAttemptAt,
    ).toBeNull()
    expect(
      (
        await db.assistantConversation.findUniqueOrThrow({
          where: { id: `${marker}-setup` },
        })
      ).workflowContext,
    ).toEqual({ synthetic: "unchanged" })
  }, 120_000)

  test("independent linked identities can switch empty queues concurrently", async () => {
    const peerIdentityId = `${marker}-peer-identity`
    const peerGrantId = `${marker}-peer-grant`
    await db.assistantWhatsAppIdentity.create({
      data: {
        id: peerIdentityId,
        userId,
        phoneNumberId,
        senderId: `236${Date.now().toString().slice(-10)}`,
        grants: {
          create: {
            id: peerGrantId,
            tenantId: item(tenants, 0),
            membershipId: item(members, 0),
            storeId: item(stores, 0),
            consentedAt: now,
            lastUsedAt: now,
            expiresAt,
            idleExpiresAt: expiresAt,
          },
        },
      },
    })
    const ownInput = await selection()
    const peerInput: WhatsAppScopeSelection = {
      ...ownInput,
      identityId: peerIdentityId,
      grantId: peerGrantId,
      requestId: randomUUID(),
      expectedIdentityGeneration: 1,
      expectedGrantGeneration: 1,
      expectedSelectionGeneration: 1,
    }
    const both = await Promise.all([
      selectAssistantWhatsAppScope(db, actor, phoneNumberId, ownInput, now),
      selectAssistantWhatsAppScope(db, actor, phoneNumberId, peerInput, now),
    ])
    expect(both.map((result) => result.state)).toEqual(["selected", "selected"])
    expect(new Set(both.map((result) => result.bindingId)).size).toBe(2)
    const ownNext = await selection()
    const peerFirst = item(both, 1)
    if (peerFirst.state !== "selected") throw Error("Expected selected peer")
    const again = await Promise.all([
      selectAssistantWhatsAppScope(db, actor, phoneNumberId, ownNext, now),
      selectAssistantWhatsAppScope(
        db,
        actor,
        phoneNumberId,
        {
          ...peerInput,
          requestId: randomUUID(),
          expectedSelectionGeneration: peerFirst.selectionGeneration,
        },
        now,
      ),
    ])
    expect(again.map((result) => result.state)).toEqual([
      "selected",
      "selected",
    ])
    expect(new Set(again.map((result) => result.bindingId)).size).toBe(2)
  }, 120_000)

  test("recovers remaining Store choices after assignment loss without silently mutating selected scope", async () => {
    await db.membership.update({
      where: { id: item(members, 0) },
      data: { role: "MANAGER", staffAccessMode: "SCOPED" },
    })
    await db.staffStoreAssignment.create({
      data: {
        membershipId: item(members, 0),
        tenantId: item(tenants, 0),
        storeId: `${marker}-extra-00`,
        role: "CASHIER",
        status: "ACTIVE",
        updatedByUserId: userId,
      },
    })
    const before = await db.assistantWhatsAppGrant.findUniqueOrThrow({
      where: { id: item(grantIds, 0) },
    })
    const choices = await listAssistantWhatsAppStores(
      db,
      actor,
      phoneNumberId,
      { identityId, grantId: item(grantIds, 0) },
      now,
    )
    expect(choices.choices).toEqual([
      { id: `${marker}-extra-00`, name: "Store extra 0" },
    ])
    expect(
      (
        await db.assistantWhatsAppGrant.findUniqueOrThrow({
          where: { id: before.id },
        })
      ).storeId,
    ).toBe(before.storeId)
    await expect(
      selectAssistantWhatsAppScope(
        db,
        actor,
        phoneNumberId,
        await selection(),
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    const explicit = await selectAssistantWhatsAppScope(
      db,
      actor,
      phoneNumberId,
      await selection(0, `${marker}-extra-00`),
      now,
    )
    expect(explicit).toMatchObject({
      state: "selected",
      storeId: `${marker}-extra-00`,
      grantGeneration: before.generation + 1,
    })
    expect(
      (
        await listAssistantWhatsAppChats(
          db,
          actor,
          phoneNumberId,
          {
            identityId,
            grantId: item(grantIds, 0),
            storeId: `${marker}-extra-00`,
          },
          now,
        )
      ).choices.every((c) => c.purpose === "GENERAL"),
    ).toBe(true)
    await expect(
      selectAssistantWhatsAppScope(
        db,
        actor,
        phoneNumberId,
        {
          ...(await selection(0, `${marker}-extra-00`)),
          action: {
            kind: "resume",
            conversationId: `${marker}-setup-scoped`,
            purpose: "SETUP",
          },
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await db.membership.update({
      where: { id: item(members, 0) },
      data: { status: "SUSPENDED" },
    })
    expect(
      (
        await listAssistantWhatsAppBusinesses(
          db,
          actor,
          phoneNumberId,
          { identityId },
          now,
        )
      ).choices.map((c) => c.tenantId),
    ).toEqual([item(tenants, 1)])
    await expect(
      selectAssistantWhatsAppScope(
        db,
        actor,
        phoneNumberId,
        await selection(0, `${marker}-extra-00`),
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  }, 120_000)
})
