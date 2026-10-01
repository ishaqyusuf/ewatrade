import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { assessAccountPrivacyCompletion } from "./account-privacy-completion"

export type AccountPrivacyNoticeEvent = {
  eventId: string
  messageId: string
  recipient: string
  occurredAt: Date
}

export function accountPrivacyRecipientDigest(email: string, key: string) {
  return createHmac("sha256", key)
    .update(email.trim().toLowerCase())
    .digest("hex")
}

function equalDigest(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right))
    return false
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"))
}

/** A send receipt alone never creates this outcome. */
export async function recordAccountPrivacyNoticeDelivery(
  db: PrismaClient,
  event: AccountPrivacyNoticeEvent,
  config: { policyVersion: string; recipientHmacKey: string; now?: Date },
) {
  const now = config.now ?? new Date()
  if (
    !event.eventId.trim() ||
    !event.messageId.trim() ||
    !event.recipient.trim() ||
    !Number.isFinite(event.occurredAt.getTime()) ||
    event.occurredAt > now ||
    config.recipientHmacKey.length < 32 ||
    !config.policyVersion.trim()
  )
    return { recorded: false, reason: "INVALID_EVENT" as const }

  return db.$transaction(
    async (tx) => {
      const attempt = await tx.accountPrivacyNoticeAttempt.findUnique({
        where: { providerMessageId: event.messageId },
        select: {
          id: true,
          requestId: true,
          userId: true,
          status: true,
          policyVersion: true,
          recipientDigest: true,
          providerEventId: true,
          sentAt: true,
          deliveryEvidenceDigest: true,
        },
      })
      if (!attempt)
        return { recorded: false, reason: "UNKNOWN_MESSAGE" as const }
      const recipientDigest = accountPrivacyRecipientDigest(
        event.recipient,
        config.recipientHmacKey,
      )
      const request = await tx.accountPrivacyRequest.findUnique({
        where: { id: attempt.requestId },
        select: { contactEmail: true, verifiedSubjectUserId: true },
      })
      if (
        !equalDigest(attempt.recipientDigest, recipientDigest) ||
        !request?.contactEmail ||
        !equalDigest(
          accountPrivacyRecipientDigest(
            request.contactEmail,
            config.recipientHmacKey,
          ),
          recipientDigest,
        ) ||
        request.verifiedSubjectUserId !== attempt.userId ||
        attempt.policyVersion !== config.policyVersion ||
        !attempt.sentAt ||
        event.occurredAt < attempt.sentAt
      )
        return { recorded: false, reason: "MISMATCH" as const }
      if (attempt.status === "DELIVERED") {
        return attempt.providerEventId === event.eventId
          ? { recorded: true, replay: true }
          : { recorded: false, reason: "CONFLICT" as const }
      }
      if (attempt.status !== "SENT")
        return { recorded: false, reason: "NOT_SENT" as const }

      const assessment = await assessAccountPrivacyCompletion(
        tx,
        attempt.requestId,
        {
          approvedPolicyVersion: config.policyVersion,
          now,
        },
      )
      if (
        assessment.blockers.length > 0 ||
        assessment.missingDomains.length !== 1 ||
        assessment.missingDomains[0] !== "OUTCOME_NOTICE"
      )
        return { recorded: false, reason: "DOMAINS_NOT_READY" as const }

      const evidenceDigest = createHash("sha256")
        .update(
          JSON.stringify({
            version: 1,
            attemptId: attempt.id,
            requestId: attempt.requestId,
            userId: attempt.userId,
            messageId: event.messageId,
            eventId: event.eventId,
            occurredAt: event.occurredAt.toISOString(),
            recipientDigest,
          }),
        )
        .digest("hex")
      const claim = await tx.accountPrivacyNoticeAttempt.updateMany({
        where: { id: attempt.id, status: "SENT", providerEventId: null },
        data: {
          status: "DELIVERED",
          providerEventId: event.eventId,
          deliveredAt: event.occurredAt,
          deliveryEvidenceDigest: evidenceDigest,
        },
      })
      if (claim.count !== 1)
        return { recorded: false, reason: "CONFLICT" as const }
      await tx.accountPrivacyDomainOutcome.create({
        data: {
          requestId: attempt.requestId,
          userId: attempt.userId,
          domain: "OUTCOME_NOTICE",
          disposition: "NOTICE_DELIVERED",
          processor: "resend-signed-delivery-v1",
          policyVersion: config.policyVersion,
          evidenceDigest,
          processedAt: now,
        },
      })
      return { recorded: true, replay: false }
    },
    { isolationLevel: "Serializable", timeout: 30_000 },
  )
}

/** A later terminal provider failure invalidates delivery without erasing its audit trail. */
export async function recordAccountPrivacyNoticeFailure(
  db: PrismaClient,
  event: AccountPrivacyNoticeEvent & {
    type: "email.bounced" | "email.failed" | "email.complained"
  },
  config: { policyVersion: string; recipientHmacKey: string; now?: Date },
) {
  const now = config.now ?? new Date()
  if (
    !event.eventId.trim() ||
    !event.messageId.trim() ||
    !event.recipient.trim() ||
    !Number.isFinite(event.occurredAt.getTime()) ||
    event.occurredAt > now ||
    config.recipientHmacKey.length < 32 ||
    !config.policyVersion.trim()
  )
    return { recorded: false, reason: "INVALID_EVENT" as const }

  return db.$transaction(
    async (tx) => {
      const attempt = await tx.accountPrivacyNoticeAttempt.findUnique({
        where: { providerMessageId: event.messageId },
        select: {
          id: true,
          requestId: true,
          userId: true,
          status: true,
          policyVersion: true,
          recipientDigest: true,
          sentAt: true,
          deliveredAt: true,
          failureEventId: true,
        },
      })
      if (!attempt)
        return { recorded: false, reason: "UNKNOWN_MESSAGE" as const }
      const request = await tx.accountPrivacyRequest.findUnique({
        where: { id: attempt.requestId },
        select: {
          contactEmail: true,
          verifiedSubjectUserId: true,
          status: true,
        },
      })
      const recipientDigest = accountPrivacyRecipientDigest(
        event.recipient,
        config.recipientHmacKey,
      )
      if (
        !request?.contactEmail ||
        request.verifiedSubjectUserId !== attempt.userId ||
        attempt.policyVersion !== config.policyVersion ||
        !equalDigest(attempt.recipientDigest, recipientDigest) ||
        !equalDigest(
          accountPrivacyRecipientDigest(
            request.contactEmail,
            config.recipientHmacKey,
          ),
          recipientDigest,
        ) ||
        !attempt.sentAt ||
        event.occurredAt < attempt.sentAt
      )
        return { recorded: false, reason: "MISMATCH" as const }
      if (attempt.status === "FAILED")
        return attempt.failureEventId === event.eventId
          ? {
              recorded: true,
              replay: true,
              completedRequest: request.status === "COMPLETED",
            }
          : { recorded: false, reason: "CONFLICT" as const }
      if (attempt.status !== "SENT" && attempt.status !== "DELIVERED")
        return { recorded: false, reason: "NOT_SENT" as const }
      if (attempt.deliveredAt && event.occurredAt < attempt.deliveredAt)
        return { recorded: false, reason: "STALE_EVENT" as const }

      const failureEvidenceDigest = createHash("sha256")
        .update(
          JSON.stringify({
            version: 1,
            type: event.type,
            attemptId: attempt.id,
            requestId: attempt.requestId,
            messageId: event.messageId,
            eventId: event.eventId,
            occurredAt: event.occurredAt.toISOString(),
            recipientDigest,
          }),
        )
        .digest("hex")
      const claim = await tx.accountPrivacyNoticeAttempt.updateMany({
        where: {
          id: attempt.id,
          status: attempt.status,
          failureEventId: null,
        },
        data: {
          status: "FAILED",
          failureEventId: event.eventId,
          failureEvidenceDigest,
          failedAt: event.occurredAt,
        },
      })
      if (claim.count !== 1)
        return { recorded: false, reason: "CONFLICT" as const }
      if (request.status === "COMPLETED") {
        const reopened = await tx.accountPrivacyRequest.updateMany({
          where: { id: attempt.requestId, status: "COMPLETED" },
          data: { status: "FAILED" },
        })
        if (reopened.count !== 1)
          throw new Error(
            "Account privacy completion changed during failure reconciliation",
          )
      }
      return {
        recorded: true,
        replay: false,
        completedRequest: request.status === "COMPLETED",
      }
    },
    { isolationLevel: "Serializable", timeout: 15_000 },
  )
}
