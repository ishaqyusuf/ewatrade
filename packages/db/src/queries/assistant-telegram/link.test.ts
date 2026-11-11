import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { disconnectAssistantTelegram } from "./link"

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
    assistantTelegramLink: { updateMany: async () => undefined },
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
  expect(await disconnectAssistantTelegram(first.db, event, now)).toEqual({
    revoked: true,
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
