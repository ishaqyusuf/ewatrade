import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { disconnectAssistantWhatsApp } from "./conversations"
import { claimAssistantWhatsAppLink } from "./link"

const now = new Date("2026-10-20T20:00:00.000Z")
const address = { phoneNumberId: "123456789", senderId: "2348000000001" }
const claim = {
  ...address,
  code: "a".repeat(43),
  messageId: "before-stop-delayed",
}
function fixture(createdAt = new Date(now.getTime() - 60_000)) {
  const operations: string[] = []
  const queries: unknown[] = []
  const link = {
    id: "link",
    userId: "owner",
    phoneNumberId: address.phoneNumberId,
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt,
    cancelledAt: null as Date | null,
    confirmedAt: null,
    claimedSenderId: null as string | null,
    claimedMessageId: null as string | null,
    revision: 0,
  }
  const db = {
    $transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(db),
    $executeRaw: async () => {
      operations.push("sender-lock")
      return 1
    },
    $queryRaw: async () => [],
    user: {
      findMany: async (query: unknown) => {
        queries.push(query)
        return [{ id: "owner" }]
      },
    },
    assistantWhatsAppIdentity: { findUnique: async () => null },
    assistantWhatsAppLink: {
      findUnique: async () => {
        operations.push("read-link")
        return structuredClone(link)
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          userId?: { in: string[] }
          claimedSenderId?: string
          createdAt?: { lte: Date }
          revision?: number
        }
        data: {
          cancelledAt?: Date
          claimedSenderId?: string
          claimedMessageId?: string
        }
      }) => {
        queries.push({ where, data })
        if (where.createdAt && link.createdAt > where.createdAt.lte)
          return { count: 0 }
        if (where.userId && !where.userId.in.includes(link.userId))
          return { count: 0 }
        if (
          where.claimedSenderId &&
          link.claimedSenderId !== where.claimedSenderId
        )
          return { count: 0 }
        if (where.revision !== undefined && where.revision !== link.revision)
          return { count: 0 }
        Object.assign(link, data)
        link.revision++
        return { count: 1 }
      },
    },
  }
  return { db: db as unknown as PrismaClient, link, operations, queries }
}

test("STOP before the first sender claim cancels old app links for the exact verified account phone", async () => {
  const f = fixture()
  await disconnectAssistantWhatsApp(f.db, address, now)
  expect(f.link.cancelledAt).toEqual(now)
  expect(await claimAssistantWhatsAppLink(f.db, claim, now)).toBe(false)
  expect(f.operations.at(-2)).toBe("sender-lock")
  expect(f.operations.at(-1)).toBe("read-link")
  expect(f.queries[0]).toEqual({
    where: {
      phone: { in: [address.senderId, `+${address.senderId}`] },
      phoneVerifiedAt: { not: null, lte: now },
    },
    select: { id: true },
  })
})

test("a claim that wins first is cancelled by STOP before automatic confirmation", async () => {
  const f = fixture()
  expect(await claimAssistantWhatsAppLink(f.db, claim, now)).toBe(true)
  expect(f.operations.slice(0, 2)).toEqual(["sender-lock", "read-link"])
  await disconnectAssistantWhatsApp(f.db, address, now)
  expect(f.link.cancelledAt).toEqual(now)
  expect(await claimAssistantWhatsAppLink(f.db, claim, now)).toBe(false)
})

test("STOP does not cancel a newly issued app link created after the stop event", async () => {
  const f = fixture(new Date(now.getTime() + 1_000))
  await disconnectAssistantWhatsApp(f.db, address, now)
  expect(f.link.cancelledAt).toBeNull()
})
