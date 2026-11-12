import type { Prisma } from "../../../generated/prisma/client"
import { AssistantTelegramError, type TelegramInboxLease } from "./authority"
import { currentReviewAuthority } from "./review"

/**
 * Telegram-native phase 4: a review tapped after it expired. Expired reviews are
 * only marked when tapped (no timer job), and a marked review can be renewed once.
 * Decisions: null → "expired" (tapped late) → "renewed" (Review it again).
 */
const reviewIdPattern = /^[A-Za-z0-9_-]{24}$/

export async function readAssistantTelegramExpiredReview(
  tx: Prisma.TransactionClient,
  lease: TelegramInboxLease,
  input: {
    reviewId: string
    /** The review message itself; omitted for the Review it again notice. */
    providerMessageId?: string
    decision: "expired" | "expired-or-open"
  },
  now = new Date(),
) {
  if (!reviewIdPattern.test(input.reviewId)) return null
  await tx.$queryRaw`SELECT id FROM "AssistantTelegramActionReview" WHERE id=${input.reviewId} AND "bindingId"=${lease.bindingId} FOR UPDATE`
  const review = await tx.assistantTelegramActionReview.findFirst({
    where: {
      id: input.reviewId,
      bindingId: lease.bindingId,
      expiresAt: { lte: now },
      ...(input.decision === "expired"
        ? { decision: "expired" }
        : { OR: [{ decision: null }, { decision: "expired" }] }),
      outbox: {
        state: "SENT",
        ...(input.providerMessageId
          ? { providerMessageId: input.providerMessageId }
          : {}),
      },
    },
    include: {
      outbox: { select: { authorityDigest: true, providerMessageId: true } },
    },
  })
  if (!review) return null
  const authorityDigest = await currentReviewAuthority(tx, lease, now)
  return authorityDigest && authorityDigest === review.outbox.authorityDigest
    ? review
    : null
}

/** Records that a late tap was answered; repeated late taps stay harmless. */
export async function markAssistantTelegramReviewExpired(
  tx: Prisma.TransactionClient,
  reviewId: string,
  now = new Date(),
) {
  await tx.assistantTelegramActionReview.updateMany({
    where: { id: reviewId, decision: null, expiresAt: { lte: now } },
    data: { decision: "expired", completedAt: now },
  })
}

/** One fresh review per expired review. */
export async function finishAssistantTelegramReviewRenewal(
  tx: Prisma.TransactionClient,
  reviewId: string,
  now = new Date(),
) {
  const changed = await tx.assistantTelegramActionReview.updateMany({
    where: { id: reviewId, decision: "expired", expiresAt: { lte: now } },
    data: { decision: "renewed", completedAt: now },
  })
  if (changed.count !== 1) throw new AssistantTelegramError("CONFLICT")
}
