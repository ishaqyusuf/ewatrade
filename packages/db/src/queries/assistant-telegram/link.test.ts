import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import {
  claimAssistantTelegramLink,
  disconnectAssistantTelegram,
  recordAssistantTelegramClaimMessage,
} from "./link"

const now = new Date("2026-11-11T19:30:02.250Z")
const event = {
  botId: "100",
  userId: "200",
  chatId: "200",
  updateId: "300",
  messageId: "400",
  occurredAt: new Date("2026-11-11T19:30:01.000Z"),
}

function disconnectFixture(bindingCreatedAt: Date, alreadyProcessed = false) {
  const effects: string[] = []
  const tx = {
    $executeRaw: async () => undefined,
    $queryRaw: async () => [],
    assistantTelegramInbox: {
      findUnique: async () => (alreadyProcessed ? { id: "prior-inbox" } : null),
      create: async () => effects.push("receipt"),
      updateMany: async () => effects.push("cancel-inbox"),
    },
    assistantTelegramLink: {
      updateMany: async () => undefined,
      findFirst: async () => ({
        claimedChatId: "200",
        claimMessageId: "41",
        tenant: { name: "Mama Ada Provisions" },
        store: { name: "Yaba Main" },
      }),
    },
    assistantTelegramIdentity: {
      findFirst: async () => ({ id: "identity" }),
      update: async () => effects.push("revoke-identity"),
    },
    assistantTelegramBinding: {
      findFirst: async () => ({ id: "binding", createdAt: bindingCreatedAt }),
      update: async () => ({ inboundSequence: 1 }),
    },
    assistantTelegramGrant: {
      updateMany: async () => effects.push("revoke-grants"),
    },
    assistantTelegramOutbox: {
      updateMany: async () => effects.push("cancel-outbox"),
    },
  }
  const db = {
    $transaction: (run: (value: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaClient
  return { db, effects }
}

test("a Telegram disconnect predating the current binding cannot revoke it", async () => {
  const { db, effects } = disconnectFixture(
    new Date("2026-11-11T19:30:01.100Z"),
  )
  expect(await disconnectAssistantTelegram(db, event, now)).toEqual({
    revoked: false,
  })
  expect(effects).toEqual([])
})

test("a current Telegram disconnect records its update and replay leaves a later grant alone", async () => {
  const createdAt = new Date("2026-11-11T19:30:00.500Z")
  const first = disconnectFixture(createdAt)
  const revoked: unknown = await disconnectAssistantTelegram(
    first.db,
    event,
    now,
  )
  expect(revoked).toEqual({
    revoked: true,
    connectedMessage: {
      chatId: "200",
      messageId: "41",
      businessName: "Mama Ada Provisions",
      storeName: "Yaba Main",
    },
  })
  expect(first.effects).toEqual([
    "receipt",
    "revoke-identity",
    "revoke-grants",
    "cancel-inbox",
    "cancel-outbox",
  ])

  const replay = disconnectFixture(createdAt, true)
  expect(await disconnectAssistantTelegram(replay.db, event, now)).toEqual({
    revoked: false,
  })
  expect(replay.effects).toEqual([])
})

function claimFixture(
  link: Record<string, unknown> | null,
  heldBy: string | null = null,
) {
  const writes: Record<string, unknown>[] = []
  const tx = {
    $executeRaw: async () => undefined,
    $queryRaw: async () => [],
    assistantTelegramIdentity: {
      findFirst: async ({ where }: { where: { userId: { not: string } } }) =>
        heldBy && heldBy !== where.userId.not ? { id: "identity" } : null,
    },
    assistantTelegramLink: {
      findUnique: async () => link,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data)
        return { count: 1 }
      },
    },
  }
  const db = {
    $transaction: (run: (value: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaClient
  return { db, writes }
}

const openLink = {
  id: "link-1",
  botId: "100",
  userId: "user-b",
  revision: 1,
  claimedTelegramUserId: null,
  claimedChatId: null,
  claimedUpdateId: null,
  cancelledAt: null,
  confirmedAt: null,
  createdAt: new Date("2026-11-11T19:28:00.000Z"),
  expiresAt: new Date("2026-11-11T19:33:00.000Z"),
  tenant: { name: "Mama Ada Provisions" },
  store: { name: "Yaba Main" },
}
const claim = {
  botId: "100",
  userId: "200",
  chatId: "200",
  updateId: "301",
  code: "q7XfR2mLp9TzV4bKc8WnJ3sHd6YgA1eQu5oNi0rMxPw",
  occurredAt: event.occurredAt,
}

test("a claim keeps a bounded Telegram label and returns the scope names", async () => {
  const { db, writes } = claimFixture(openLink)
  expect(
    await claimAssistantTelegramLink(
      db,
      { ...claim, name: "  Ada\u200b  Okafor\n", username: "ada_provisions" },
      now,
    ),
  ).toEqual({
    linkId: "link-1",
    businessName: "Mama Ada Provisions",
    storeName: "Yaba Main",
  })
  expect(writes[0]).toMatchObject({
    claimedName: "Ada Okafor",
    claimedUsername: "ada_provisions",
  })
  const invalid = claimFixture(openLink)
  await claimAssistantTelegramLink(
    invalid.db,
    { ...claim, name: "", username: "no spaces allowed" },
    now,
  )
  expect(invalid.writes[0]).toMatchObject({
    claimedName: null,
    claimedUsername: null,
  })
})

test("c-second: a Telegram account held by another EwaTrade user claims as busy", async () => {
  const busy = claimFixture(openLink, "user-a")
  expect(await claimAssistantTelegramLink(busy.db, claim, now)).toEqual({
    linkId: "link-1",
    businessName: "Mama Ada Provisions",
    storeName: "Yaba Main",
    busy: true,
  })
  // The same EwaTrade user reconnecting is not busy.
  expect(
    await claimAssistantTelegramLink(
      claimFixture(openLink, "user-b").db,
      claim,
      now,
    ),
  ).toEqual({
    linkId: "link-1",
    businessName: "Mama Ada Provisions",
    storeName: "Yaba Main",
  })
})

test("expired, used and unknown links are refused alike", async () => {
  for (const link of [
    { ...openLink, expiresAt: new Date("2026-11-11T19:30:00.000Z") },
    { ...openLink, confirmedAt: now },
    null,
  ])
    expect(
      await claimAssistantTelegramLink(claimFixture(link).db, claim, now),
    ).toBe(false)
})

test("the claim message is recorded once, only for the claiming chat", async () => {
  const where: Record<string, unknown>[] = []
  const db = {
    assistantTelegramLink: {
      updateMany: async (input: { where: Record<string, unknown> }) => {
        where.push(input.where)
        return { count: 1 }
      },
    },
  } as unknown as PrismaClient
  expect(
    await recordAssistantTelegramClaimMessage(db, {
      botId: "100",
      userId: "200",
      chatId: "200",
      linkId: "link-1",
      messageId: "41",
    }),
  ).toBe(true)
  expect(where[0]).toEqual({
    id: "link-1",
    botId: "100",
    claimedTelegramUserId: "200",
    claimedChatId: "200",
    claimMessageId: null,
  })
  expect(
    await recordAssistantTelegramClaimMessage(db, {
      botId: "100",
      userId: "200",
      chatId: "200",
      linkId: "link-1",
      messageId: "not-a-number",
    }),
  ).toBe(false)
})
