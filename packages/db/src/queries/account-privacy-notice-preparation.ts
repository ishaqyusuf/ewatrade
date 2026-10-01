import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { assessAccountPrivacyCompletion } from "./account-privacy-completion"
import { accountPrivacyRecipientDigest } from "./account-privacy-notice"

export type AccountPrivacyNoticePreparationCode =
  | "DISABLED"
  | "POLICY_NOT_APPROVED"
  | "OPERATOR_REQUIRED"
  | "NOT_FOUND"
  | "NOT_READY"
  | "CLAIM_CONFLICT"

export class AccountPrivacyNoticePreparationError extends Error {
  constructor(readonly code: AccountPrivacyNoticePreparationCode) {
    super(code)
    this.name = "AccountPrivacyNoticePreparationError"
  }
}

export function accountPrivacyNoticeContentDigest(input: {
  from: string
  replyTo: string
  subject: string
  text: string
  html: string
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

/** Reserves a single exact approved message; it does not contact a provider. */
export async function prepareAccountPrivacyNotice(
  db: PrismaClient,
  input: {
    requestId: string
    operatorUserId: string
    contentDigest: string
    now?: Date
  },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED !== "true"
  )
    throw new AccountPrivacyNoticePreparationError("DISABLED")
  const policyVersion =
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
  const approvedContentDigest =
    process.env.ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST?.trim()
  const recipientHmacKey =
    process.env.ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY?.trim()
  if (
    !policyVersion ||
    !approvedContentDigest ||
    !/^[a-f0-9]{64}$/i.test(approvedContentDigest) ||
    approvedContentDigest.toLowerCase() !== input.contentDigest.toLowerCase() ||
    !recipientHmacKey ||
    recipientHmacKey.length < 32
  )
    throw new AccountPrivacyNoticePreparationError("POLICY_NOT_APPROVED")
  const now = input.now ?? new Date()
  return db.$transaction(
    async (tx) => {
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!operator?.isPlatformAdmin)
        throw new AccountPrivacyNoticePreparationError("OPERATOR_REQUIRED")
      const request = await tx.accountPrivacyRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          status: true,
          contactEmail: true,
          verifiedSubjectUserId: true,
          verifiedAt: true,
        },
      })
      if (!request) throw new AccountPrivacyNoticePreparationError("NOT_FOUND")
      if (
        request.status !== "PROCESSING" ||
        !request.verifiedAt ||
        !request.verifiedSubjectUserId ||
        !request.contactEmail ||
        request.verifiedSubjectUserId === input.operatorUserId
      )
        throw new AccountPrivacyNoticePreparationError("NOT_READY")
      const recipientDigest = accountPrivacyRecipientDigest(
        request.contactEmail,
        recipientHmacKey,
      )
      const assessment = await assessAccountPrivacyCompletion(tx, request.id, {
        approvedPolicyVersion: policyVersion,
        now,
      })
      if (
        assessment.blockers.length !== 0 ||
        assessment.missingDomains.length !== 1 ||
        assessment.missingDomains[0] !== "OUTCOME_NOTICE"
      )
        throw new AccountPrivacyNoticePreparationError("NOT_READY")
      const existing = await tx.accountPrivacyNoticeAttempt.findMany({
        where: { requestId: request.id },
        orderBy: { attemptNumber: "asc" },
        select: {
          id: true,
          status: true,
          policyVersion: true,
          contentDigest: true,
          recipientDigest: true,
          idempotencyKey: true,
        },
      })
      if (existing.length > 0) {
        const first = existing[0]
        if (
          existing.length === 1 &&
          first?.status === "PREPARED" &&
          first.policyVersion === policyVersion &&
          first.contentDigest === approvedContentDigest.toLowerCase() &&
          first.recipientDigest === recipientDigest
        )
          return {
            attemptId: first.id,
            idempotencyKey: first.idempotencyKey,
            replay: true,
          }
        throw new AccountPrivacyNoticePreparationError("CLAIM_CONFLICT")
      }
      const idempotencyKey = createHash("sha256")
        .update(
          `account-privacy-notice-v1:${request.id}:${policyVersion}:${approvedContentDigest.toLowerCase()}:${recipientDigest}`,
        )
        .digest("hex")
      const created = await tx.accountPrivacyNoticeAttempt.create({
        data: {
          requestId: request.id,
          userId: request.verifiedSubjectUserId,
          attemptNumber: 1,
          policyVersion,
          contentDigest: approvedContentDigest.toLowerCase(),
          recipientDigest,
          idempotencyKey,
          preparedAt: now,
        },
        select: { id: true, idempotencyKey: true },
      })
      return {
        attemptId: created.id,
        idempotencyKey: created.idempotencyKey,
        replay: false,
      }
    },
    { isolationLevel: "Serializable", timeout: 30_000 },
  )
}

/** Claims a prepared attempt once; an unknown provider outcome is never auto-retried. */
export async function claimAccountPrivacyNoticeSend(
  db: PrismaClient,
  input: {
    attemptId: string
    operatorUserId: string
    contentDigest: string
    now?: Date
  },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED !== "true"
  )
    throw new AccountPrivacyNoticePreparationError("DISABLED")
  const policyVersion =
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
  const approvedContentDigest =
    process.env.ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST?.trim()
  const recipientHmacKey =
    process.env.ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY?.trim()
  if (
    !policyVersion ||
    !approvedContentDigest ||
    !/^[a-f0-9]{64}$/i.test(approvedContentDigest) ||
    approvedContentDigest.toLowerCase() !== input.contentDigest.toLowerCase() ||
    !recipientHmacKey ||
    recipientHmacKey.length < 32
  )
    throw new AccountPrivacyNoticePreparationError("POLICY_NOT_APPROVED")
  const now = input.now ?? new Date()
  return db.$transaction(
    async (tx) => {
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!operator?.isPlatformAdmin)
        throw new AccountPrivacyNoticePreparationError("OPERATOR_REQUIRED")
      const attempt = await tx.accountPrivacyNoticeAttempt.findUnique({
        where: { id: input.attemptId },
        select: {
          id: true,
          requestId: true,
          userId: true,
          status: true,
          policyVersion: true,
          contentDigest: true,
          recipientDigest: true,
          idempotencyKey: true,
        },
      })
      if (!attempt) throw new AccountPrivacyNoticePreparationError("NOT_FOUND")
      if (
        attempt.status !== "PREPARED" ||
        attempt.policyVersion !== policyVersion ||
        attempt.contentDigest !== approvedContentDigest.toLowerCase()
      )
        throw new AccountPrivacyNoticePreparationError("CLAIM_CONFLICT")
      const request = await tx.accountPrivacyRequest.findUnique({
        where: { id: attempt.requestId },
        select: {
          status: true,
          contactEmail: true,
          verifiedSubjectUserId: true,
          verifiedAt: true,
        },
      })
      if (
        request?.status !== "PROCESSING" ||
        !request.contactEmail ||
        !request.verifiedAt ||
        request.verifiedSubjectUserId !== attempt.userId ||
        request.verifiedSubjectUserId === input.operatorUserId ||
        accountPrivacyRecipientDigest(
          request.contactEmail,
          recipientHmacKey,
        ) !== attempt.recipientDigest
      )
        throw new AccountPrivacyNoticePreparationError("NOT_READY")
      const assessment = await assessAccountPrivacyCompletion(
        tx,
        attempt.requestId,
        { approvedPolicyVersion: policyVersion, now },
      )
      if (
        assessment.blockers.length !== 0 ||
        assessment.missingDomains.length !== 1 ||
        assessment.missingDomains[0] !== "OUTCOME_NOTICE"
      )
        throw new AccountPrivacyNoticePreparationError("NOT_READY")
      const claim = await tx.accountPrivacyNoticeAttempt.updateMany({
        where: { id: attempt.id, status: "PREPARED" },
        data: { status: "SENDING" },
      })
      if (claim.count !== 1)
        throw new AccountPrivacyNoticePreparationError("CLAIM_CONFLICT")
      return {
        attemptId: attempt.id,
        recipient: request.contactEmail,
        idempotencyKey: attempt.idempotencyKey,
      }
    },
    { isolationLevel: "Serializable", timeout: 30_000 },
  )
}

export async function recordAccountPrivacyNoticeSendReceipt(
  db: PrismaClient,
  input: { attemptId: string; providerMessageId: string; now?: Date },
) {
  if (!input.providerMessageId.trim())
    throw new AccountPrivacyNoticePreparationError("NOT_READY")
  const claim = await db.accountPrivacyNoticeAttempt.updateMany({
    where: { id: input.attemptId, status: "SENDING", providerMessageId: null },
    data: {
      status: "SENT",
      providerMessageId: input.providerMessageId,
      sentAt: input.now ?? new Date(),
    },
  })
  if (claim.count !== 1) {
    const existing = await db.accountPrivacyNoticeAttempt.findUnique({
      where: { id: input.attemptId },
      select: { status: true, providerMessageId: true },
    })
    if (
      existing?.providerMessageId === input.providerMessageId &&
      (existing.status === "SENT" ||
        existing.status === "DELIVERED" ||
        existing.status === "FAILED")
    )
      return { attemptId: input.attemptId, status: existing.status }
    throw new AccountPrivacyNoticePreparationError("CLAIM_CONFLICT")
  }
  return { attemptId: input.attemptId, status: "SENT" as const }
}

export async function markAccountPrivacyNoticeSendUncertain(
  db: PrismaClient,
  attemptId: string,
) {
  const result = await db.accountPrivacyNoticeAttempt.updateMany({
    where: { id: attemptId, status: "SENDING" },
    data: { status: "UNCERTAIN" },
  })
  return { attemptId, marked: result.count === 1 }
}

/** Bind only a signed provider event carrying the opaque, one-use attempt tag. */
export async function bindAccountPrivacyNoticeProviderEvent(
  db: PrismaClient,
  input: {
    attemptId: string
    providerMessageId: string
    recipient: string
    providerCreatedAt: Date
    occurredAt: Date
    policyVersion: string
    recipientHmacKey: string
  },
) {
  if (
    !input.attemptId.trim() ||
    !input.providerMessageId.trim() ||
    !input.recipient.trim() ||
    !input.policyVersion.trim() ||
    input.recipientHmacKey.length < 32 ||
    !Number.isFinite(input.providerCreatedAt.getTime()) ||
    !Number.isFinite(input.occurredAt.getTime()) ||
    input.providerCreatedAt > input.occurredAt
  )
    return { bound: false, reason: "INVALID_EVENT" as const }
  return db.$transaction(
    async (tx) => {
      const attempt = await tx.accountPrivacyNoticeAttempt.findUnique({
        where: { id: input.attemptId },
        select: {
          id: true,
          requestId: true,
          userId: true,
          status: true,
          policyVersion: true,
          recipientDigest: true,
          providerMessageId: true,
          preparedAt: true,
        },
      })
      if (!attempt) return { bound: false, reason: "UNKNOWN_ATTEMPT" as const }
      if (attempt.providerMessageId)
        return attempt.providerMessageId === input.providerMessageId
          ? { bound: true, replay: true }
          : { bound: false, reason: "MESSAGE_CONFLICT" as const }
      const request = await tx.accountPrivacyRequest.findUnique({
        where: { id: attempt.requestId },
        select: { contactEmail: true, verifiedSubjectUserId: true },
      })
      const eventRecipientDigest = accountPrivacyRecipientDigest(
        input.recipient,
        input.recipientHmacKey,
      )
      if (
        attempt.policyVersion !== input.policyVersion ||
        attempt.userId !== request?.verifiedSubjectUserId ||
        !request.contactEmail ||
        eventRecipientDigest !== attempt.recipientDigest ||
        accountPrivacyRecipientDigest(
          request.contactEmail,
          input.recipientHmacKey,
        ) !== eventRecipientDigest ||
        input.providerCreatedAt.getTime() <
          attempt.preparedAt.getTime() - 5 * 60_000 ||
        (attempt.status !== "SENDING" && attempt.status !== "UNCERTAIN")
      )
        return { bound: false, reason: "MISMATCH" as const }
      const claim = await tx.accountPrivacyNoticeAttempt.updateMany({
        where: {
          id: attempt.id,
          status: attempt.status,
          providerMessageId: null,
        },
        data: {
          status: "SENT",
          providerMessageId: input.providerMessageId,
          sentAt: input.providerCreatedAt,
        },
      })
      return claim.count === 1
        ? { bound: true, replay: false }
        : { bound: false, reason: "CLAIM_CONFLICT" as const }
    },
    { isolationLevel: "Serializable", timeout: 15_000 },
  )
}
