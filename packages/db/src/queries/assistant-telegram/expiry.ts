import { Prisma } from "../../../generated/prisma/client"
import type { DbClient } from "../types"

/** A crashed delivery may have reached Telegram. Expiry strips bytes without re-sending. */
export async function expireAssistantTelegramWork(
  db: DbClient,
  now = new Date(),
) {
  const inbox = await db.assistantTelegramInbox.findMany({
    where: {
      expiresAt: { lte: now },
      state: { in: ["PENDING", "PROCESSING"] },
    },
    orderBy: { expiresAt: "asc" },
    take: 100,
    select: { id: true },
  })
  const outbox = await db.assistantTelegramOutbox.findMany({
    where: {
      OR: [
        { state: "PENDING", expiresAt: { lte: now } },
        { state: "SENDING", leaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: { expiresAt: "asc" },
    take: 100,
    select: { id: true, state: true },
  })
  if (inbox.length)
    await db.assistantTelegramInbox.updateMany({
      where: {
        id: { in: inbox.map(({ id }) => id) },
        expiresAt: { lte: now },
        state: { in: ["PENDING", "PROCESSING"] },
      },
      data: {
        state: "EXPIRED",
        content: Prisma.DbNull,
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: now,
      },
    })
  const pending = outbox.filter(({ state }) => state === "PENDING")
  const sending = outbox.filter(({ state }) => state === "SENDING")
  if (pending.length)
    await db.assistantTelegramOutbox.updateMany({
      where: {
        id: { in: pending.map(({ id }) => id) },
        state: "PENDING",
        expiresAt: { lte: now },
      },
      data: { state: "EXPIRED", payload: Prisma.DbNull, completedAt: now },
    })
  if (sending.length)
    await db.assistantTelegramOutbox.updateMany({
      where: {
        id: { in: sending.map(({ id }) => id) },
        state: "SENDING",
        leaseExpiresAt: { lte: now },
      },
      data: {
        state: "UNKNOWN",
        payload: Prisma.DbNull,
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: "DELIVERY_LEASE_EXPIRED",
        completedAt: now,
      },
    })
}
