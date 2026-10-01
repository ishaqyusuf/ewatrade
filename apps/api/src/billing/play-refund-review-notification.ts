import { z } from "zod"

const pendingReviewSchema = z.object({
  eventTimeMillis: z.union([z.string().regex(/^\d{1,16}$/), z.number().int()]),
  pendingRefundReviewNotification: z.object({
    pendingRefundToken: z.string().min(1).max(8192),
    orderId: z.string().min(1).max(256),
    refundReason: z.number().int().nonnegative(),
    obfuscatedAccountId: z.string().min(1).max(256).optional(),
    obfuscatedProfileId: z.string().min(1).max(256).optional(),
  }),
})

export function parsePlayRefundReviewNotification(input: unknown) {
  const event = pendingReviewSchema.parse(input)
  const occurredAt = new Date(Number(event.eventTimeMillis))
  const responseDueAt = new Date(occurredAt.getTime() + 24 * 60 * 60 * 1000)
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() <= 0)
    throw new Error("Play refund review has an invalid event time.")
  if (!Number.isFinite(responseDueAt.getTime()))
    throw new Error("Play refund review has an invalid response deadline.")
  return {
    ...event.pendingRefundReviewNotification,
    occurredAt,
    responseDueAt,
  }
}
