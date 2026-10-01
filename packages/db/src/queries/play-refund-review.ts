import { createHash } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  BillingProvider,
  PlayRefundReviewResponseStatus,
} from "../../generated/prisma/enums"
import { storeOrderDigest } from "./store-subscriptions"

function digest(kind: string, value: string) {
  return createHash("sha256").update(`${kind}:${value}`).digest("hex")
}

export async function recordPlayRefundReviewCase(
  db: PrismaClient,
  input: {
    pendingRefundToken: string
    encryptedPendingToken: string
    encryptedOrderId: string
    encryptionKeyId: string
    orderId: string
    obfuscatedAccountId?: string
    refundReason: number
    occurredAt: Date
    responseDueAt: Date
  },
) {
  const tokenDigest = digest("play-pending-refund", input.pendingRefundToken)
  const orderDigest = storeOrderDigest(input.orderId)
  const accountDigest = input.obfuscatedAccountId
    ? digest("play-review-account", input.obfuscatedAccountId)
    : null
  return db.$transaction(
    async (tx) => {
      const account = input.obfuscatedAccountId
        ? await tx.storeBillingAccount.findUnique({
            where: { id: input.obfuscatedAccountId },
            select: { tenantId: true },
          })
        : null
      const paidOrder = account
        ? await tx.storeSubscriptionPurchase.findFirst({
            where: {
              provider: BillingProvider.PLAY_STORE,
              tenantId: account.tenantId,
              latestOrderDigest: orderDigest,
            },
            select: { tenantId: true },
          })
        : null
      const review = await tx.playRefundReviewCase.upsert({
        where: { tokenDigest },
        create: {
          tokenDigest,
          encryptedPendingToken: input.encryptedPendingToken,
          encryptedOrderId: input.encryptedOrderId,
          encryptionKeyId: input.encryptionKeyId,
          orderDigest,
          accountDigest,
          tenantId: paidOrder?.tenantId ?? null,
          refundReason: input.refundReason,
          occurredAt: input.occurredAt,
          responseDueAt: input.responseDueAt,
        },
        update: {},
        select: {
          id: true,
          tenantId: true,
          tokenDigest: true,
          orderDigest: true,
          accountDigest: true,
          refundReason: true,
          occurredAt: true,
          responseDueAt: true,
          encryptedOrderId: true,
        },
      })
      if (
        review.tokenDigest !== tokenDigest ||
        review.orderDigest !== orderDigest ||
        review.accountDigest !== accountDigest ||
        review.refundReason !== input.refundReason ||
        review.occurredAt.getTime() !== input.occurredAt.getTime() ||
        review.responseDueAt.getTime() !== input.responseDueAt.getTime()
      )
        throw new Error("Play refund-review identity changed on replay.")
      if (!review.encryptedOrderId) {
        await tx.playRefundReviewCase.update({
          where: { id: review.id },
          // A replay may arrive after key rotation. Keep both envelopes under
          // the same key identifier instead of mixing old and new custody.
          data: {
            encryptedPendingToken: input.encryptedPendingToken,
            encryptedOrderId: input.encryptedOrderId,
            encryptionKeyId: input.encryptionKeyId,
          },
        })
      }
      return {
        id: review.id,
        tenantId: review.tenantId,
        responseDueAt: review.responseDueAt,
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
}

export async function getPlayRefundReviewQueue(
  db: PrismaClient,
  now = new Date(),
) {
  const unresolvedWhere = {
    OR: [
      { response: { is: null } },
      {
        response: {
          is: {
            status: { not: PlayRefundReviewResponseStatus.CONFIRMED },
          },
        },
      },
    ],
  } satisfies Prisma.PlayRefundReviewCaseWhereInput
  const [cases, total, overdue] = await Promise.all([
    db.playRefundReviewCase.findMany({
      where: unresolvedWhere,
      orderBy: [{ responseDueAt: "asc" }, { id: "asc" }],
      take: 100,
      select: {
        id: true,
        tenantId: true,
        refundReason: true,
        occurredAt: true,
        responseDueAt: true,
        receivedAt: true,
        response: { select: { status: true } },
      },
    }),
    db.playRefundReviewCase.count({ where: unresolvedWhere }),
    db.playRefundReviewCase.count({
      where: { AND: [unresolvedWhere, { responseDueAt: { lte: now } }] },
    }),
  ])
  return {
    cases: cases.map(({ response, ...review }) => ({
      ...review,
      responseStatus: response?.status ?? null,
    })),
    total,
    overdue,
  }
}
