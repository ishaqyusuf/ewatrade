import { afterAll, expect, mock, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"

// Session and scope checks are covered elsewhere; this file is about who owns
// the Telegram identity when a second EwaTrade user confirms (Workshop c-second).
// Module mocks are process-wide in Bun, so the stubs fall through to the real
// functions once this file is done.
let stubbed = true
afterAll(() => {
  stubbed = false
})
const authority = await import("./authority")
const general = await import("../assistant-general")
mock.module("./authority", () => ({
  ...authority,
  requireTelegramSession: (
    ...args: Parameters<typeof authority.requireTelegramSession>
  ) =>
    stubbed ? Promise.resolve() : authority.requireTelegramSession(...args),
  requireTelegramScope: (
    ...args: Parameters<typeof authority.requireTelegramScope>
  ) =>
    stubbed
      ? Promise.resolve(
          {} as Awaited<ReturnType<typeof authority.requireTelegramScope>>,
        )
      : authority.requireTelegramScope(...args),
}))
mock.module("../assistant-general", () => ({
  ...general,
  startGeneralConversation: (
    ...args: Parameters<typeof general.startGeneralConversation>
  ) =>
    stubbed
      ? Promise.resolve({ id: "conversation-b" } as Awaited<
          ReturnType<typeof general.startGeneralConversation>
        >)
      : general.startGeneralConversation(...args),
}))
const { confirmAssistantTelegramLink } = await import("./link")

const now = new Date("2026-11-12T20:00:00.000Z")
const actorB = {
  userId: "user-b",
  sessionId: "session-b",
  tenantId: "tenant-b",
  storeId: "store-b",
  membershipId: "membership-b",
} as Parameters<typeof confirmAssistantTelegramLink>[1]

function fixture(previous: { live: boolean; revokedAt: Date | null }) {
  const calls: { op: string; args: unknown }[] = []
  const record = (op: string, result: unknown) => async (args: unknown) => {
    calls.push({ op, args })
    return result
  }
  const tx = {
    $executeRaw: async () => undefined,
    $queryRaw: async () => [],
    assistantTelegramLink: {
      findFirst: record("link.findFirst", {
        id: "link-b",
        botId: "100",
        userId: "user-b",
        revision: 2,
        claimedTelegramUserId: "200",
        claimedChatId: "200",
        claimMessageId: "41",
        confirmedAt: null,
        cancelledAt: null,
        expiresAt: new Date(now.getTime() + 60_000),
      }),
      updateMany: record("link.updateMany", { count: 1 }),
    },
    assistantTelegramIdentity: {
      findUnique: record("identity.findUnique", {
        id: "identity-a",
        botId: "100",
        telegramUserId: "200",
        chatId: "200",
        userId: "user-a",
        generation: 3,
        selectionGeneration: 4,
        activeBindingId: previous.revokedAt ? null : "binding-a",
        revokedAt: previous.revokedAt,
      }),
      count: record("identity.count", previous.live ? 1 : 0),
      update: record("identity.update", {}),
      create: record("identity.create", {
        id: "identity-b",
        generation: 1,
        selectionGeneration: 0,
        activeBindingId: null,
      }),
    },
    assistantTelegramGrant: {
      updateMany: record("grant.updateMany", { count: 1 }),
      upsert: record("grant.upsert", {
        id: "grant-b",
        generation: 1,
        expiresAt: new Date(now.getTime() + 30 * 86_400_000),
      }),
    },
    assistantTelegramBinding: {
      findFirst: record("binding.findFirst", null),
      create: record("binding.create", { id: "binding-b" }),
    },
    assistantTelegramInbox: {
      updateMany: record("inbox.updateMany", { count: 0 }),
    },
    assistantTelegramOutbox: {
      updateMany: record("outbox.updateMany", { count: 0 }),
    },
  }
  const db = {
    $transaction: (run: (value: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaClient
  const of = (op: string) =>
    calls.filter((call) => call.op === op).map((call) => call.args)
  return { db, of }
}

const input = { linkId: "link-b", revision: 2, botId: "100" }

test("a disconnected Telegram account moves to a second EwaTrade user without deleting history", async () => {
  const disconnectedAt = new Date("2026-11-10T09:00:00.000Z")
  const { db, of } = fixture({ live: false, revokedAt: disconnectedAt })

  const result = await confirmAssistantTelegramLink(db, actorB, input, now)

  expect(result.handedOver).toBe(true)
  expect(result.claimMessage).toEqual({ chatId: "200", messageId: "41" })
  // The previous user's row is re-keyed, not deleted, and keeps its owner.
  expect(of("identity.update")[0]).toEqual({
    where: { id: "identity-a" },
    data: {
      telegramUserId: "detached:identity-a",
      detachedTelegramUserId: "200",
      detachedAt: now,
      revokedAt: disconnectedAt,
      activeBindingId: null,
      generation: { increment: 1 },
      selectionGeneration: { increment: 1 },
    },
  })
  expect(of("grant.updateMany")[0]).toMatchObject({
    where: { identityId: "identity-a", revokedAt: null },
  })
  expect(of("inbox.updateMany")[0]).toMatchObject({
    where: { binding: { identityId: "identity-a" } },
  })
  // The second user gets a fresh identity with the real Telegram ID.
  expect(of("identity.create")[0]).toEqual({
    data: {
      botId: "100",
      telegramUserId: "200",
      userId: "user-b",
      chatId: "200",
    },
  })
  expect(of("grant.upsert")[0]).toMatchObject({
    where: {
      identityId_tenantId: { identityId: "identity-b", tenantId: "tenant-b" },
    },
  })
})

test("an expired but never disconnected identity is retired at hand-over", async () => {
  const { db, of } = fixture({ live: false, revokedAt: null })

  const result = await confirmAssistantTelegramLink(db, actorB, input, now)

  expect(result.handedOver).toBe(true)
  expect(of("identity.update")[0]).toMatchObject({
    data: { revokedAt: now, detachedAt: now },
  })
})

test("a Telegram account still connected to another EwaTrade user is not handed over", async () => {
  const { db, of } = fixture({ live: true, revokedAt: null })

  await expect(
    confirmAssistantTelegramLink(db, actorB, input, now),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(of("identity.count")[0]).toMatchObject({
    where: { id: "identity-a", revokedAt: null },
  })
  expect(of("identity.update")).toEqual([])
  expect(of("identity.create")).toEqual([])
  expect(of("grant.updateMany")).toEqual([])
})
