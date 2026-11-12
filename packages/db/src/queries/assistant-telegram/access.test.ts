import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { endAssistantTelegramAccess } from "./access"

const now = new Date("2026-11-12T10:00:00.000Z")
const day = 24 * 60 * 60_000
const sender = { botId: "100", userId: "200", chatId: "200" }
const validGrant = {
  id: "grant",
  tenantId: "tenant",
  storeId: "store",
  membershipId: "membership",
  revokedAt: null as Date | null,
  expiresAt: new Date(now.getTime() + 20 * day),
  idleExpiresAt: new Date(now.getTime() + 3 * day),
  tenant: { name: "Mama Ada Provisions", qaPurgeStartedAt: null },
  store: { name: "Yaba Main" },
}

function fixture(grant: typeof validGrant | null) {
  const effects: string[] = []
  const tx = {
    $executeRaw: async () => undefined,
    $queryRaw: async () => [],
    assistantTelegramIdentity: {
      findFirst: async () => ({
        id: "identity",
        userId: "user",
        activeBindingId: "binding",
      }),
      update: async ({ data }: { data: Record<string, unknown> }) =>
        effects.push(`identity ${JSON.stringify(data)}`),
    },
    assistantTelegramBinding: {
      findFirst: async () => (grant ? { grant } : null),
    },
    assistantTelegramGrant: {
      update: async () => effects.push("revoke grant"),
    },
    assistantTelegramInbox: {
      updateMany: async () => effects.push("cancel inbox"),
    },
    assistantTelegramOutbox: {
      updateMany: async () => effects.push("cancel outbox"),
    },
    assistantTelegramLink: {
      findFirst: async () => ({
        claimedChatId: "200",
        claimMessageId: "41",
        tenant: { name: "Mama Ada Provisions" },
        store: { name: "Yaba Main" },
      }),
    },
  }
  const db = {
    $transaction: (run: (value: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaClient
  return { db, effects }
}
const inScope = { readScope: async () => ({}) as never }
const outOfScope = {
  readScope: async () => null,
  accountBlocked: async () => false,
}
const pinned = {
  chatId: "200",
  messageId: "41",
  businessName: "Mama Ada Provisions",
  storeName: "Yaba Main",
}

test("a-expired: 7 idle days end access once and keep the grant unrevoked", async () => {
  const { db, effects } = fixture({
    ...validGrant,
    idleExpiresAt: new Date(now.getTime() - 1000),
  })
  expect(await endAssistantTelegramAccess(db, sender, now, inScope)).toEqual({
    reason: "idle",
    businessName: "Mama Ada Provisions",
    storeName: "Yaba Main",
    connectedMessage: pinned,
  })
  expect(effects).toEqual([
    'identity {"activeBindingId":null,"selectionGeneration":{"increment":1}}',
    "cancel inbox",
    "cancel outbox",
  ])
})

test("the 30-day grant deadline is told apart from idleness", async () => {
  const ended = new Date(now.getTime() - 1000)
  const { db } = fixture({
    ...validGrant,
    expiresAt: ended,
    idleExpiresAt: ended,
  })
  expect(
    (await endAssistantTelegramAccess(db, sender, now, inScope))?.reason,
  ).toBe("expired")
})

test("a-lost: access removed by the business revokes the grant", async () => {
  const { db, effects } = fixture(validGrant)
  expect(
    (await endAssistantTelegramAccess(db, sender, now, outOfScope))?.reason,
  ).toBe("removed")
  expect(effects).toContain("revoke grant")
  // Removal wins over idleness, so the person is not told to reconnect.
  const idle = fixture({
    ...validGrant,
    idleExpiresAt: new Date(now.getTime() - 1000),
  })
  expect(
    (await endAssistantTelegramAccess(idle.db, sender, now, outOfScope))
      ?.reason,
  ).toBe("removed")
})

test("a-lost: a deleted membership leaves no name and no message to edit", async () => {
  const { db, effects } = fixture(null)
  expect(await endAssistantTelegramAccess(db, sender, now, inScope)).toEqual({
    reason: "removed",
    businessName: null,
    storeName: null,
    connectedMessage: null,
  })
  expect(effects).not.toContain("revoke grant")
})

test("valid access, account-level blocks and other tenants stay untouched", async () => {
  const valid = fixture(validGrant)
  expect(await endAssistantTelegramAccess(valid.db, sender, now, inScope)).toBe(
    null,
  )
  const blocked = fixture(validGrant)
  expect(
    await endAssistantTelegramAccess(blocked.db, sender, now, {
      ...outOfScope,
      accountBlocked: async () => true,
    }),
  ).toBe(null)
  const other = fixture({
    ...validGrant,
    idleExpiresAt: new Date(now.getTime() - 1000),
  })
  expect(
    await endAssistantTelegramAccess(
      other.db,
      { ...sender, allowedTenantIds: new Set(["another-tenant"]) },
      now,
      inScope,
    ),
  ).toBe(null)
  for (const { effects } of [valid, blocked, other]) expect(effects).toEqual([])
})
