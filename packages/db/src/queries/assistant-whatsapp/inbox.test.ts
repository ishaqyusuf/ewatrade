import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { acceptAssistantWhatsAppIngress } from "./inbox"

const now = new Date("2026-10-15T09:00:00Z")
const base = {
  phoneNumberId: "123456789",
  senderId: "2348000000000",
  providerMessageId: "wamid.synthetic",
  timestamp: String(now.getTime() / 1000),
  type: "text",
  text: "search rice",
}
test("invalid, expired and future ingress is rejected before database access", async () => {
  let transactions = 0
  const db = {
    $transaction: async () => {
      transactions++
      throw Error("must not read database")
    },
  } as unknown as PrismaClient
  expect(
    await acceptAssistantWhatsAppIngress(
      db,
      { ...base, actorUserId: "foreign" },
      ["pilot"],
      now,
    ),
  ).toMatchObject({ kind: "ignored", reason: "invalid" })
  expect(
    await acceptAssistantWhatsAppIngress(
      db,
      { ...base, timestamp: String(now.getTime() / 1000 - 86401) },
      ["pilot"],
      now,
    ),
  ).toMatchObject({ kind: "ignored", reason: "stale" })
  expect(
    await acceptAssistantWhatsAppIngress(
      db,
      { ...base, timestamp: String(now.getTime() / 1000 + 301) },
      ["pilot"],
      now,
    ),
  ).toMatchObject({ kind: "ignored", reason: "stale" })
  expect(transactions).toBe(0)
})
