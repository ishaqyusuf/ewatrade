import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  assistantTelegramPrivacyInventory,
  eraseAssistantTelegramPrivateCleanupInTransaction,
  prepareAssistantTelegramPrivateCleanupInTransaction,
} from "./privacy"

const now = new Date("2026-11-11T10:00:00Z")
const subject = "privacy-subject"

function fixture() {
  const writes: { operation: string; input: unknown }[] = []
  const row = {
    assistantTelegramIdentities: 1,
    assistantTelegramLinks: 1,
    assistantTelegramGrants: 1,
    assistantTelegramBindings: 1,
    assistantTelegramInbox: 1,
    assistantTelegramOutbox: 1,
    assistantTelegramActionReviews: 1,
    mixedOwnership: false,
    inFlight: false,
  }
  const write = (operation: string) => async (input: unknown) => {
    writes.push({ operation, input })
    return { count: 1 }
  }
  const tx = {
    $queryRaw: async (query: TemplateStringsArray) =>
      query[0]?.includes("WITH subject") ? [row] : [{ id: "owned" }],
    assistantTelegramIdentity: {
      updateMany: write("revoke identity"),
      deleteMany: write("erase identity"),
    },
    assistantTelegramGrant: { updateMany: write("revoke grants") },
    assistantTelegramLink: {
      updateMany: write("cancel links"),
      deleteMany: write("erase links"),
    },
    assistantTelegramInbox: { updateMany: write("cancel updates") },
    assistantTelegramOutbox: { updateMany: write("cancel deliveries") },
  } as unknown as Prisma.TransactionClient
  return { tx, writes, row }
}

test("approved Telegram cleanup fences owned work and erases only the subject's records", async () => {
  const { tx, writes } = fixture()
  expect(
    Object.values(await assistantTelegramPrivacyInventory(tx, subject)),
  ).toEqual([1, 1, 1, 1, 1, 1, 1])
  const prepared = await prepareAssistantTelegramPrivateCleanupInTransaction(
    tx,
    subject,
    now,
  )
  expect(writes.map(({ operation }) => operation)).toEqual([
    "revoke identity",
    "revoke grants",
    "cancel links",
    "cancel updates",
    "cancel deliveries",
  ])
  expect(writes[0]?.input).toMatchObject({
    where: { userId: subject, revokedAt: null },
    data: {
      revokedAt: now,
      activeBindingId: null,
      generation: { increment: 1 },
    },
  })
  expect(writes[4]?.input).toMatchObject({ where: { state: "PENDING" } })
  expect(
    await eraseAssistantTelegramPrivateCleanupInTransaction(
      tx,
      subject,
      prepared,
      now,
    ),
  ).toBe(7)
  expect(writes.slice(5)).toEqual([
    {
      operation: "erase identity",
      input: { where: { userId: subject, revokedAt: { not: null } } },
    },
    {
      operation: "erase links",
      input: { where: { userId: subject, cancelledAt: { not: null } } },
    },
  ])
})

test("mixed ownership, a live send, and changed inventory prevent Telegram erasure", async () => {
  const { tx, writes, row } = fixture()
  row.mixedOwnership = true
  await expect(
    prepareAssistantTelegramPrivateCleanupInTransaction(tx, subject, now),
  ).rejects.toMatchObject({ code: "SHARED_SCOPE_REVIEW_REQUIRED" })
  expect(writes).toHaveLength(0)

  row.mixedOwnership = false
  const prepared = await prepareAssistantTelegramPrivateCleanupInTransaction(
    tx,
    subject,
    now,
  )
  row.inFlight = true
  await expect(
    eraseAssistantTelegramPrivateCleanupInTransaction(
      tx,
      subject,
      prepared,
      now,
    ),
  ).rejects.toMatchObject({ code: "PRIVATE_WORK_UNRESOLVED" })
  row.inFlight = false
  row.assistantTelegramLinks += 1
  await expect(
    eraseAssistantTelegramPrivateCleanupInTransaction(
      tx,
      subject,
      prepared,
      now,
    ),
  ).rejects.toMatchObject({ code: "SCOPE_CHANGED" })
  expect(writes).toHaveLength(5)
})
