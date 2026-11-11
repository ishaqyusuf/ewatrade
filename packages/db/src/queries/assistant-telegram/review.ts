import { randomBytes } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import {
  AssistantTelegramError,
  type TelegramInboxLease,
  assistantTelegramAuthorityDigest,
  resolveAssistantTelegramConversation,
  telegramInboxLeaseWhere,
  telegramPrincipal,
} from "./authority"
import { stageAssistantTelegramOutbox } from "./outbox"

type ReviewDecision = "confirm" | "cancel" | "edit"

async function currentReviewAuthority(
  tx: Prisma.TransactionClient,
  lease: TelegramInboxLease,
  now: Date,
  providerMessageId?: string,
) {
  const inbox = await tx.assistantTelegramInbox.findFirst({
    where: {
      ...telegramInboxLeaseWhere(lease, now),
      messageId: providerMessageId,
    },
    include: { binding: { include: { identity: true } } },
  })
  if (!inbox) return null
  try {
    const resolved = await resolveAssistantTelegramConversation(
      tx,
      telegramPrincipal(inbox.binding),
      lease,
      now,
    )
    return (
      inbox.executionAuthorityDigest ??
      (await assistantTelegramAuthorityDigest(tx, resolved))
    )
  } catch (error) {
    if (error instanceof AssistantTelegramError) return null
    throw error
  }
}

export async function stageAssistantTelegramActionReview(
  tx: Prisma.TransactionClient,
  lease: TelegramInboxLease,
  input: {
    proposalId: string
    revision: number
    payloadHash: string
    reviewDigest: string
    expiresAt: Date
    text: string
  },
  now = new Date(),
) {
  const inbox = await tx.assistantTelegramInbox.findFirst({
    where: telegramInboxLeaseWhere(lease, now),
    select: { expiresAt: true, binding: { select: { conversationId: true } } },
  })
  if (!inbox) throw new AssistantTelegramError("CONFLICT")
  const proposal = await tx.assistantActionProposal.findFirst({
    where: {
      id: input.proposalId,
      conversationId: inbox.binding.conversationId,
      revision: input.revision,
      payloadHash: input.payloadHash,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    select: { expiresAt: true },
  })
  if (!proposal) throw new AssistantTelegramError("CONFLICT")
  const expiresAt = new Date(
    Math.min(
      inbox.expiresAt.getTime(),
      proposal.expiresAt.getTime(),
      input.expiresAt.getTime(),
    ),
  )
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now)
    throw new AssistantTelegramError("EXPIRED")
  const reviewId = randomBytes(18).toString("base64url")
  const outbox = await stageAssistantTelegramOutbox(
    tx,
    lease,
    {
      text: input.text,
      expiresAt,
      buttons: [
        [
          { text: "Confirm", data: `confirm:${reviewId}` },
          { text: "Edit", data: `edit:${reviewId}` },
          { text: "Cancel", data: `cancel:${reviewId}` },
        ],
      ],
    },
    now,
  )
  await tx.assistantTelegramActionReview.create({
    data: {
      id: reviewId,
      bindingId: lease.bindingId,
      outboxId: outbox.id,
      proposalId: input.proposalId,
      revision: input.revision,
      payloadHash: input.payloadHash,
      reviewDigest: input.reviewDigest,
      expiresAt,
    },
  })
  return outbox
}

export async function readAssistantTelegramActionReview(
  tx: Prisma.TransactionClient,
  lease: TelegramInboxLease,
  input: { reviewId: string; providerMessageId: string },
  now = new Date(),
) {
  if (!/^[A-Za-z0-9_-]{24}$/.test(input.reviewId)) return null
  await tx.$queryRaw`SELECT id FROM "AssistantTelegramActionReview" WHERE id=${input.reviewId} AND "bindingId"=${lease.bindingId} FOR UPDATE`
  const review = await tx.assistantTelegramActionReview.findFirst({
    where: {
      id: input.reviewId,
      bindingId: lease.bindingId,
      expiresAt: { gt: now },
      outbox: { state: "SENT", providerMessageId: input.providerMessageId },
    },
    include: { outbox: { select: { authorityDigest: true } } },
  })
  if (!review) return null
  const authorityDigest = await currentReviewAuthority(
    tx,
    lease,
    now,
    input.providerMessageId,
  )
  return authorityDigest && authorityDigest === review.outbox.authorityDigest
    ? review
    : null
}

export async function finishAssistantTelegramActionReview(
  tx: Prisma.TransactionClient,
  reviewId: string,
  input: { decision: ReviewDecision; resultRef?: Prisma.InputJsonValue },
  now = new Date(),
) {
  const changed = await tx.assistantTelegramActionReview.updateMany({
    where: { id: reviewId, decision: null, expiresAt: { gt: now } },
    data: {
      decision: input.decision,
      resultRef: input.resultRef,
      completedAt: now,
    },
  })
  if (changed.count !== 1) throw new AssistantTelegramError("CONFLICT")
}

export async function readAssistantTelegramPendingEdit(
  db: Prisma.TransactionClient,
  lease: TelegramInboxLease,
  now = new Date(),
) {
  const latest = await db.assistantTelegramActionReview.findFirst({
    where: {
      bindingId: lease.bindingId,
      decision: "edit",
      editUsedAt: null,
      expiresAt: { gt: now },
      proposal: { status: "PENDING", expiresAt: { gt: now } },
      outbox: { state: "SENT" },
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      proposalId: true,
      revision: true,
      payloadHash: true,
      outbox: { select: { authorityDigest: true } },
      proposal: { select: { revision: true, payloadHash: true } },
    },
  })
  if (
    !latest ||
    latest.proposal.revision !== latest.revision ||
    latest.proposal.payloadHash !== latest.payloadHash
  )
    return null
  const authorityDigest = await currentReviewAuthority(db, lease, now)
  if (!authorityDigest || authorityDigest !== latest.outbox.authorityDigest)
    return null
  const { proposal: _, outbox: __, ...intent } = latest
  return intent
}

export async function finishAssistantTelegramPendingEdit(
  tx: Prisma.TransactionClient,
  reviewId: string,
  now = new Date(),
) {
  const changed = await tx.assistantTelegramActionReview.updateMany({
    where: {
      id: reviewId,
      decision: "edit",
      editUsedAt: null,
      expiresAt: { gt: now },
    },
    data: { editUsedAt: now },
  })
  if (changed.count !== 1) throw new AssistantTelegramError("CONFLICT")
}
