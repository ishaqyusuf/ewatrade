import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "./own-transaction"

export async function persistProductAnalyticsEvent(
  db: PrismaClient,
  input: {
    id: string
    userId: string
    tenantId?: string
    envelope: Prisma.InputJsonValue
  },
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    const request = await tx.accountPrivacyRequest.findUnique({
      where: { requestKey: `account-deletion:${input.userId}` },
      select: { status: true },
    })
    if (request?.status === "PROCESSING" || request?.status === "COMPLETED")
      return null
    return tx.productAnalyticsEvent.upsert({
      where: { id: input.id },
      create: {
        ...input,
        expiresAt: new Date(now.getTime() + 7 * 86400000),
        availableAt: now,
      },
      update: {},
    })
  })
}
export async function claimProductAnalyticsEvent(
  db: PrismaClient,
  id: string,
  now = new Date(),
) {
  const leaseToken = randomUUID()
  const updated = await db.productAnalyticsEvent.updateMany({
    where: {
      id,
      user: {
        accountPrivacyRequests: {
          none: { status: { in: ["PROCESSING", "COMPLETED"] } },
        },
      },
      deliveredAt: null,
      expiresAt: { gt: now },
      availableAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    data: {
      leaseToken,
      leaseUntil: new Date(now.getTime() + 60000),
      attempts: { increment: 1 },
    },
  })
  if (!updated.count) return null
  return db.productAnalyticsEvent.findUnique({
    where: { id, leaseToken },
    include: {
      user: { select: { email: true } },
      tenant: { select: { dataClassification: true, qaPurgeStartedAt: true } },
    },
  })
}
export async function settleProductAnalyticsEvent(
  db: PrismaClient,
  input: {
    id: string
    leaseToken: string
    delivered: boolean
    attempts: number
  },
  now = new Date(),
) {
  return db.productAnalyticsEvent.updateMany({
    where: { id: input.id, leaseToken: input.leaseToken },
    data: {
      leaseToken: null,
      leaseUntil: null,
      ...(input.delivered
        ? { deliveredAt: now }
        : {
            availableAt: new Date(
              now.getTime() +
                Math.min(3600000, 30000 * 2 ** Math.min(input.attempts, 7)),
            ),
          }),
    },
  })
}
export async function pendingProductAnalyticsEvents(
  db: PrismaClient,
  now = new Date(),
) {
  // Also erases delivered envelopes after their bounded retention period.
  await db.productAnalyticsEvent.deleteMany({
    where: { expiresAt: { lte: now } },
  })
  return db.productAnalyticsEvent.findMany({
    where: {
      deliveredAt: null,
      availableAt: { lte: now },
      expiresAt: { gt: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    orderBy: { availableAt: "asc" },
    take: 50,
    select: { id: true },
  })
}
