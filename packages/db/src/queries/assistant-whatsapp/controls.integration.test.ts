import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  WHATSAPP_CONTROL_LIFETIME_MS,
  whatsAppControlContentSchema,
} from "@ewatrade/assistant/channels/controls"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import { processAssistantWhatsAppControl } from "./controls"
import {
  acceptAssistantWhatsAppStatus,
  beginAssistantWhatsAppDelivery,
  finishAssistantWhatsAppDelivery,
} from "./delivery"
import { acceptAssistantWhatsAppIngress } from "./inbox"
import { expireAssistantWhatsAppOutbox } from "./outbox"
import { assistantWhatsAppPrivacyInventory } from "./privacy"
import {
  claimAssistantWhatsAppInbox,
  expireAssistantWhatsAppInbox,
  listAssistantWhatsAppInboxRecovery,
} from "./processing"
import { selectAssistantWhatsAppScope } from "./scope-controls"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const marker = `wa-controls-${randomUUID()}`
const userId = `${marker}-user`
const otherUserId = `${marker}-other`
const identityId = `${marker}-identity`
const otherIdentityId = `${marker}-other-identity`
const tenantA = `${marker}-a`
const tenantB = `${marker}-b`
const memberA = `${marker}-member-a`
const memberB = `${marker}-member-b`
const grantA = `${marker}-grant-a`
const grantB = `${marker}-grant-b`
const storeA = `${marker}-a-store-0`
const storeB = `${marker}-b-store-0`
const storeB2 = `${marker}-b-store-1`
const phoneNumberId = "90000000000001"
const senderId = `237${Date.now().toString().slice(-10)}`
const otherSender = `238${Date.now().toString().slice(-10)}`
const previousPilotTenants = process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS
let db: PrismaClient
let providerSequence = 0
const options = {
  phoneNumberId,
  permittedUserIds: [userId, otherUserId],
  providerMode: "test" as const,
}
beforeAll(async () => {
  if (!enabled) return
  assertQaAccessAcceptanceDatabase()
  process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = [tenantA, tenantB].join(",")
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
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 60 * 60_000)
  await db.$transaction(async (tx) => {
    await tx.user.createMany({
      data: [userId, otherUserId].map((id) => ({
        id,
        email: `${id}@example.test`,
        ageBand: "ADULT" as const,
      })),
    })
    await tx.session.create({
      data: { id: marker, userId, token: randomUUID(), expiresAt },
    })
    await tx.tenant.createMany({
      data: [tenantA, tenantB].map((id, i) => ({
        id,
        slug: id,
        name: i === 0 ? "Synthetic business A" : "Synthetic business B",
        type: "MERCHANT" as const,
        dataClassification: "QA" as const,
        qaMarkedAt: now,
        qaSourceDomain: "assistant-whatsapp-controls.test",
      })),
    })
    await tx.membership.createMany({
      data: [
        {
          id: memberA,
          userId,
          tenantId: tenantA,
          role: "OWNER",
          status: "ACTIVE",
        },
        {
          id: memberB,
          userId,
          tenantId: tenantB,
          role: "OWNER",
          status: "ACTIVE",
        },
        {
          id: `${marker}-other-member`,
          userId: otherUserId,
          tenantId: tenantA,
          role: "CASHIER",
          status: "ACTIVE",
        },
      ],
    })
    await tx.store.createMany({
      data: [
        {
          id: storeA,
          slug: storeA,
          tenantId: tenantA,
          name: "Store A",
          status: "ACTIVE",
        },
        {
          id: storeB,
          slug: storeB,
          tenantId: tenantB,
          name: "Store B",
          status: "ACTIVE",
        },
        {
          id: storeB2,
          slug: storeB2,
          tenantId: tenantB,
          name: "Store B2",
          status: "ACTIVE",
        },
        ...Array.from({ length: 4 }, (_, i) => ({
          id: `${marker}-a-store-${i + 1}`,
          slug: `${marker}-a-store-${i + 1}`,
          tenantId: tenantA,
          name: `Store A${i + 1}`,
          status: "ACTIVE" as const,
        })),
      ],
    })
    await tx.assistantWhatsAppIdentity.createMany({
      data: [
        { id: identityId, userId, phoneNumberId, senderId },
        {
          id: otherIdentityId,
          userId: otherUserId,
          phoneNumberId,
          senderId: otherSender,
        },
      ],
    })
    const consent = {
      consentedAt: new Date(now.getTime() - 60_000),
      lastUsedAt: now,
      expiresAt,
      idleExpiresAt: expiresAt,
    }
    await tx.assistantWhatsAppGrant.createMany({
      data: [
        {
          ...consent,
          id: grantA,
          identityId,
          tenantId: tenantA,
          membershipId: memberA,
          storeId: storeA,
        },
        {
          ...consent,
          id: grantB,
          identityId,
          tenantId: tenantB,
          membershipId: memberB,
          storeId: storeB,
        },
        {
          ...consent,
          id: `${marker}-other-grant`,
          identityId: otherIdentityId,
          tenantId: tenantA,
          membershipId: `${marker}-other-member`,
          storeId: storeA,
        },
      ],
    })
  })
}, 60_000)
afterAll(async () => {
  if (!db) return
  try {
    await db.tenant.deleteMany({
      where: {
        id: { in: [tenantA, tenantB] },
        qaSourceDomain: "assistant-whatsapp-controls.test",
      },
    })
    await db.user.deleteMany({
      where: {
        id: { in: [userId, otherUserId] },
        email: { endsWith: "@example.test" },
      },
    })
    expect(
      await db.assistantWhatsAppInbox.count({
        where: { id: { startsWith: `${marker}-` } },
      }),
    ).toBe(0)
    expect(
      await db.assistantWhatsAppInbox.count({
        where: { identityId: { in: [identityId, otherIdentityId] } },
      }),
    ).toBe(0)
  } finally {
    await db.$disconnect()
    if (previousPilotTenants === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_WHATSAPP_PILOT_TENANT_IDS")
    else process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = previousPilotTenants
  }
}, 60_000)
async function admit(
  text: string,
  replyToMessageId?: string,
  sender = senderId,
  id = `${marker}-input-${randomUUID()}`,
) {
  const event = {
    phoneNumberId,
    senderId: sender,
    providerMessageId: id,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text" as const,
    text,
    ...(replyToMessageId ? { replyToMessageId } : {}),
  }
  const receipt = await acceptAssistantWhatsAppIngress(
    db,
    event,
    options.permittedUserIds,
  )
  if (receipt.kind === "ignored")
    throw Error(`Control refused: ${receipt.reason}`)
  return { receipt, event }
}
async function run(id: string) {
  const result = await processAssistantWhatsAppControl(
    db,
    id,
    options.permittedUserIds,
  )
  expect(result?.status).toBe("completed")
  const row = await db.assistantWhatsAppInbox.findUniqueOrThrow({
    where: { id },
  })
  const content = whatsAppControlContentSchema.parse(row.content)
  if (!content.menu) throw Error("Menu missing")
  const output = await db.assistantWhatsAppOutbox.findUniqueOrThrow({
    where: {
      inboxId_responseRevision_chunkIndex: {
        inboxId: id,
        responseRevision: 1,
        chunkIndex: 0,
      },
    },
  })
  return { row, content, menu: content.menu, output }
}
async function deliver(outboxId: string) {
  const begin = await beginAssistantWhatsAppDelivery(db, outboxId, options)
  if (begin.kind !== "started") {
    const row = await db.assistantWhatsAppOutbox.findUnique({
      where: { id: outboxId },
      select: { errorCode: true },
    })
    throw Error(`Control delivery refused: ${begin.kind}/${row?.errorCode}`)
  }
  const messageId = `${marker}-provider-${++providerSequence}`
  expect(
    await finishAssistantWhatsAppDelivery(db, begin.proof, {
      kind: "accepted",
      providerMessageId: messageId,
    }),
  ).toEqual({ state: "SENT" })
  return { messageId, begin }
}
async function talk(text: string, replyTo?: string, sender = senderId) {
  const input = await admit(text, replyTo, sender)
  const result = await run(input.receipt.id)
  return { ...input, ...result, ...(await deliver(result.output.id)) }
}
function choice(menu: Awaited<ReturnType<typeof run>>["menu"], label: string) {
  const index = menu.choices.findIndex((c) => c.label === label)
  if (index < 0) throw Error(`Choice missing: ${label}`)
  return `Choose ${index + 1}`
}

suite("native deterministic controls on guarded local Neon", () => {
  test("an unbound linked identity navigates businesses and Stores, starts and resumes canonical chats without a model run", async () => {
    expect(
      (
        await db.assistantWhatsAppIdentity.findUniqueOrThrow({
          where: { id: identityId },
        })
      ).activeBindingId,
    ).toBeNull()
    const help = await talk("Help")
    expect(help.output.runId).toBeNull()
    expect(help.output.messageId).toBeNull()
    expect(help.row.bindingId).toBeNull()
    expect(help.row.identityId).toBe(identityId)
    expect(help.begin.body).toContain("Send Business")
    const business = await talk("Business")
    expect(business.menu.choices.map((c) => c.label)).toEqual([
      "Synthetic business A",
      "Synthetic business B",
    ])
    const stores = await talk(
      choice(business.menu, "Synthetic business B"),
      business.messageId,
    )
    expect(stores.menu.choices.map((c) => c.label)).toEqual([
      "Store B",
      "Store B2",
    ])
    const selected = await talk(
      choice(stores.menu, "Store B2"),
      stores.messageId,
    )
    expect(selected.begin.body).toContain("New chat started")
    const active = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
      where: { id: identityId },
    })
    if (!active.activeBindingId) throw Error("No selected binding")
    const initial = await db.assistantWhatsAppBinding.findUniqueOrThrow({
      where: { id: active.activeBindingId },
      include: { conversation: true },
    })
    expect(initial.conversation).toMatchObject({
      tenantId: tenantB,
      storeId: storeB2,
      purpose: "GENERAL",
      ownerUserId: userId,
    })
    const next = await talk("New chat")
    expect(next.begin.body).toContain("New chat started")
    const chats = await talk("Continue chat")
    expect(chats.menu.choices).toHaveLength(2)
    const saved = chats.menu.choices.find(
      (c) =>
        c.action.kind === "resume" &&
        c.action.conversationId === initial.conversationId,
    )
    if (!saved) throw Error("Original chat not listed")
    const resumed = await talk(choice(chats.menu, saved.label), chats.messageId)
    expect(resumed.begin.body).toContain("Saved chat selected")
    const current = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
      where: { id: identityId },
    })
    expect(
      (
        await db.assistantWhatsAppBinding.findUniqueOrThrow({
          where: { id: current.activeBindingId ?? "missing" },
        })
      ).conversationId,
    ).toBe(initial.conversationId)
    const count = await db.assistantWhatsAppOutbox.count({
      where: { inbox: { identityId } },
    })
    expect(
      (
        await acceptAssistantWhatsAppIngress(
          db,
          resumed.event,
          options.permittedUserIds,
        )
      ).kind,
    ).toBe("control_duplicate")
    expect(
      (
        await processAssistantWhatsAppControl(
          db,
          resumed.receipt.id,
          options.permittedUserIds,
        )
      )?.status,
    ).toBe("completed")
    expect(
      await db.assistantWhatsAppOutbox.count({
        where: { inbox: { identityId } },
      }),
    ).toBe(count)
    expect(
      await db.assistantRun.count({ where: { actorUserId: userId } }),
    ).toBe(0)
    expect(
      await db.assistantBudget.count({
        where: {
          OR: [tenantA, tenantB].map((id) => ({
            scopeKey: { startsWith: `assistant:${id}:` },
          })),
        },
      }),
    ).toBe(0)
    const inventory = await assistantWhatsAppPrivacyInventory(db, userId)
    expect(inventory.assistantWhatsAppInbox).toBeGreaterThan(0)
    expect(inventory.assistantWhatsAppOutbox).toBe(count)
    expect(
      (
        await db.assistantWhatsAppGrant.findUniqueOrThrow({
          where: { id: grantB },
        })
      ).storeId,
    ).toBe(storeB2)
  }, 300_000)

  test("quoted menus bind sender, generation and one consumption; pagination is exact and never treats an amount as a choice", async () => {
    const businesses = await talk("Business")
    const foreign = await talk("Choose 1", businesses.messageId, otherSender)
    expect(foreign.begin.body).toContain("That menu changed")
    expect(foreign.begin.body).not.toContain("Synthetic business B")
    const stores = await talk(
      choice(businesses.menu, "Synthetic business A"),
      businesses.messageId,
    )
    expect(stores.menu.choices).toHaveLength(5)
    expect(stores.menu.choices[4]?.label).toBe("More Stores")
    const more = await talk("Choose 5", stores.messageId)
    expect(more.menu.choices.map((c) => c.label)).toEqual(["Store A4"])
    const select = await talk("Choose 1", more.messageId)
    expect(select.begin.body).toContain("New chat started")
    const before = await db.assistantConversation.count({
      where: { ownerUserId: userId },
    })
    const replay = await talk("Choose 1", more.messageId)
    expect(replay.begin.body).toContain("That menu changed")
    expect(
      await db.assistantConversation.count({ where: { ownerUserId: userId } }),
    ).toBe(before)
    const unquoted = await talk("Choose 1")
    expect(unquoted.begin.body).toContain("was not quoted")
    const amount = await admit("1")
    expect(amount.receipt.kind).toBe("accepted")
    expect(
      await processAssistantWhatsAppControl(
        db,
        amount.receipt.id,
        options.permittedUserIds,
      ),
    ).toBeNull()
    await db.assistantWhatsAppInbox.update({
      where: { id: amount.receipt.id },
      data: { state: "CANCELLED" },
    })
    const collision = await acceptAssistantWhatsAppIngress(
      db,
      { ...businesses.event, text: "ordinary message" },
      options.permittedUserIds,
    )
    expect(collision).toMatchObject({ kind: "ignored", reason: "collision" })
  }, 300_000)

  test("fresh send authority covers displayed businesses and controls recover an inaccessible selected Store", async () => {
    const input = await admit("Business")
    const pending = await run(input.receipt.id)
    await db.membership.update({
      where: { id: memberB },
      data: { status: "SUSPENDED" },
    })
    expect(
      await beginAssistantWhatsAppDelivery(db, pending.output.id, options),
    ).toEqual({ kind: "cancelled" })
    expect(
      (
        await db.assistantWhatsAppOutbox.findUniqueOrThrow({
          where: { id: pending.output.id },
        })
      ).content,
    ).toBeNull()
    const fresh = await talk("Business")
    expect(fresh.menu.choices.map((c) => c.label)).toEqual([
      "Synthetic business A",
    ])
    await db.membership.update({
      where: { id: memberB },
      data: { status: "ACTIVE" },
    })
    const identity = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
      where: { id: identityId },
    })
    const grant = await db.assistantWhatsAppGrant.findUniqueOrThrow({
      where: { id: grantB },
    })
    await selectAssistantWhatsAppScope(
      db,
      { userId, sessionId: marker },
      phoneNumberId,
      {
        identityId,
        grantId: grantB,
        storeId: storeB,
        requestId: randomUUID(),
        expectedIdentityGeneration: identity.generation,
        expectedGrantGeneration: grant.generation,
        expectedSelectionGeneration: identity.selectionGeneration,
        action: { kind: "new" },
      },
    )
    await db.membership.update({
      where: { id: memberB },
      data: { role: "MANAGER", staffAccessMode: "SCOPED" },
    })
    await db.staffStoreAssignment.create({
      data: {
        membershipId: memberB,
        tenantId: tenantB,
        storeId: storeB2,
        role: "CASHIER",
        status: "ACTIVE",
        updatedByUserId: userId,
      },
    })
    const businesses = await talk("Store")
    expect(businesses.menu.title).toBe("Choose a business")
    const stores = await talk(
      choice(businesses.menu, "Synthetic business B"),
      businesses.messageId,
    )
    expect(stores.menu.choices.map((c) => c.label)).toEqual(["Store B2"])
    expect(
      (
        await db.assistantWhatsAppGrant.findUniqueOrThrow({
          where: { id: grantB },
        })
      ).storeId,
    ).toBe(storeB)
    const chosen = await talk("Choose 1", stores.messageId)
    expect(chosen.begin.body).toContain("Store B2")
    expect(
      (
        await db.assistantWhatsAppGrant.findUniqueOrThrow({
          where: { id: grantB },
        })
      ).storeId,
    ).toBe(storeB2)
  }, 300_000)

  test("control outcomes reconcile through existing receipts, expire safely, and cannot masquerade as a canonical turn", async () => {
    const help = await talk("Help")
    expect(
      await acceptAssistantWhatsAppStatus(db, {
        phoneNumberId,
        messageId: help.messageId,
        recipientId: senderId,
        callbackData: help.begin.callbackData,
        status: "read",
        timestamp: String(Math.floor(Date.now() / 1000)),
      }),
    ).toMatchObject({ outboxId: help.output.id, state: "READ" })
    expect(
      await beginAssistantWhatsAppDelivery(db, help.output.id, options),
    ).toEqual({ kind: "idle" })
    const uncertainInput = await admit("Help")
    const uncertain = await run(uncertainInput.receipt.id)
    const intent = await beginAssistantWhatsAppDelivery(
      db,
      uncertain.output.id,
      options,
    )
    if (intent.kind !== "started") throw Error("Missing control send intent")
    expect(
      await finishAssistantWhatsAppDelivery(db, intent.proof, {
        kind: "unknown",
      }),
    ).toEqual({ state: "UNKNOWN" })
    const newer = await talk("Help")
    expect(newer.begin.body).toContain("Send Business")
    expect(
      await beginAssistantWhatsAppDelivery(db, uncertain.output.id, options),
    ).toEqual({ kind: "unknown" })
    expect(
      await acceptAssistantWhatsAppStatus(db, {
        phoneNumberId,
        messageId: `${marker}-late-control`,
        recipientId: senderId,
        callbackData: intent.callbackData,
        status: "read",
        timestamp: String(Math.floor(Date.now() / 1000)),
      }),
    ).toMatchObject({ outboxId: uncertain.output.id, state: "READ" })
    const expiry = await admit("Help")
    const staged = await run(expiry.receipt.id)
    const later = new Date(Date.now() + WHATSAPP_CONTROL_LIFETIME_MS + 1000)
    await expireAssistantWhatsAppInbox(db, later, [staged.row.id])
    await expireAssistantWhatsAppOutbox(db, later, [staged.output.id])
    expect(
      (
        await db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: staged.row.id },
        })
      ).content,
    ).toBeNull()
    expect(
      (
        await db.assistantWhatsAppOutbox.findUniqueOrThrow({
          where: { id: staged.output.id },
        })
      ).content,
    ).toBeNull()
    expect(
      await beginAssistantWhatsAppDelivery(
        db,
        staged.output.id,
        options,
        later,
      ),
    ).toEqual({ kind: "idle" })
    const invalid = await admit("Help")
    const current = await db.assistantWhatsAppIdentity.findUniqueOrThrow({
      where: { id: identityId },
    })
    await db.assistantWhatsAppInbox.update({
      where: { id: invalid.receipt.id },
      data: { bindingId: current.activeBindingId },
    })
    expect(
      (
        await claimAssistantWhatsAppInbox(
          db,
          invalid.receipt.id,
          options.permittedUserIds,
        )
      ).kind,
    ).toBe("idle")
    expect(
      (
        await processAssistantWhatsAppControl(
          db,
          invalid.receipt.id,
          options.permittedUserIds,
        )
      )?.status,
    ).toBe("cancelled")
    const recover = await admit("Help")
    expect(
      (await listAssistantWhatsAppInboxRecovery(db)).some(
        (row) => row.id === recover.receipt.id,
      ),
    ).toBe(true)
    await run(recover.receipt.id)
    const unlinked = await acceptAssistantWhatsAppIngress(
      db,
      {
        ...recover.event,
        senderId: "2340000000001",
        providerMessageId: `${marker}-unlinked`,
      },
      options.permittedUserIds,
    )
    expect(unlinked).toMatchObject({ kind: "ignored", reason: "unlinked" })
  }, 240_000)
  test("a LIVE quota anchor cannot send displayed QA business facts through the live provider", async () => {
    await db.tenant.update({
      where: { id: tenantA },
      data: { dataClassification: "LIVE" },
    })
    try {
      const input = await admit("Business")
      const menu = await run(input.receipt.id)
      expect(menu.menu.choices.map((choice) => choice.label)).toContain(
        "Synthetic business B",
      )
      expect(
        await beginAssistantWhatsAppDelivery(db, menu.output.id, {
          ...options,
          providerMode: "live",
        }),
      ).toEqual({ kind: "cancelled" })
      expect(
        (
          await db.assistantWhatsAppOutbox.findUniqueOrThrow({
            where: { id: menu.output.id },
          })
        ).errorCode,
      ).toBe("QA_PROVIDER_BLOCKED")
      expect(
        await db.assistantWhatsAppAttempt.count({
          where: { outboxId: menu.output.id },
        }),
      ).toBe(0)
    } finally {
      await db.tenant.update({
        where: { id: tenantA },
        data: { dataClassification: "QA" },
      })
    }
  }, 90_000)
})
