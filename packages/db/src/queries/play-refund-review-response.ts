import type { PrismaClient } from "../../generated/prisma/client"
import {
  PlayRefundReviewPreference,
  PlayRefundReviewResponseStatus,
} from "../../generated/prisma/enums"
import { isPlayRefundReviewSubmissionEnabled } from "./play-refund-review-submission-gate"

export class PlayRefundReviewResponseError extends Error {
  constructor(
    readonly code:
      | "OPERATOR_REQUIRED"
      | "CASE_NOT_READY"
      | "RESPONSE_CONFLICT"
      | "SUBMISSION_DISABLED",
  ) {
    super(code.replaceAll("_", " ").toLowerCase())
    this.name = "PlayRefundReviewResponseError"
  }
}

function validPolicyVersion(value: string | null | undefined): value is string {
  return (
    typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value)
  )
}

function validDecisionEvidenceDigest(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

export async function preparePlayRefundReviewResponse(
  db: PrismaClient,
  input: {
    caseId: string
    actorUserId: string
    preference: PlayRefundReviewPreference
    sampleContentProvided: boolean
    policyVersion: string
    decisionEvidenceDigest: string
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  if (
    !Number.isFinite(now.getTime()) ||
    !Object.values(PlayRefundReviewPreference).includes(input.preference) ||
    typeof input.sampleContentProvided !== "boolean" ||
    !validPolicyVersion(input.policyVersion) ||
    !validDecisionEvidenceDigest(input.decisionEvidenceDigest)
  )
    throw new PlayRefundReviewResponseError("CASE_NOT_READY")
  return db.$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: input.actorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!actor?.isPlatformAdmin)
        throw new PlayRefundReviewResponseError("OPERATOR_REQUIRED")
      const review = await tx.playRefundReviewCase.findUnique({
        where: { id: input.caseId },
        select: {
          tenantId: true,
          encryptedPendingToken: true,
          encryptedOrderId: true,
          encryptionKeyId: true,
          tokenDigest: true,
          orderDigest: true,
          responseDueAt: true,
        },
      })
      if (
        !review?.tenantId ||
        !review.encryptedPendingToken ||
        !review.encryptedOrderId ||
        !review.encryptionKeyId ||
        !review.tokenDigest ||
        !review.orderDigest ||
        review.responseDueAt <= now
      )
        throw new PlayRefundReviewResponseError("CASE_NOT_READY")
      const response = await tx.playRefundReviewResponse.upsert({
        where: { caseId: input.caseId },
        create: {
          caseId: input.caseId,
          actorUserId: input.actorUserId,
          preference: input.preference,
          sampleContentProvided: input.sampleContentProvided,
          policyVersion: input.policyVersion,
          decisionEvidenceDigest: input.decisionEvidenceDigest,
          preparedAt: now,
        },
        update: {},
        select: {
          id: true,
          caseId: true,
          actorUserId: true,
          preference: true,
          sampleContentProvided: true,
          policyVersion: true,
          decisionEvidenceDigest: true,
          status: true,
          preparedAt: true,
        },
      })
      if (
        response.actorUserId !== input.actorUserId ||
        response.preference !== input.preference ||
        response.sampleContentProvided !== input.sampleContentProvided ||
        response.policyVersion !== input.policyVersion ||
        response.decisionEvidenceDigest !== input.decisionEvidenceDigest ||
        response.status !== PlayRefundReviewResponseStatus.PREPARED
      )
        throw new PlayRefundReviewResponseError("RESPONSE_CONFLICT")
      return {
        id: response.id,
        caseId: response.caseId,
        preference: response.preference,
        sampleContentProvided: response.sampleContentProvided,
        policyVersion: response.policyVersion,
        status: response.status,
        preparedAt: response.preparedAt,
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
}

export async function claimPlayRefundReviewResponse(
  db: PrismaClient,
  input: {
    responseId: string
    now?: Date
    env?: NodeJS.ProcessEnv
    expected?: Awaited<
      ReturnType<typeof inspectPlayRefundReviewResponseCustody>
    >
  },
) {
  const env = input.env ?? process.env
  if (!isPlayRefundReviewSubmissionEnabled(env))
    throw new PlayRefundReviewResponseError("SUBMISSION_DISABLED")
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime()))
    throw new PlayRefundReviewResponseError("CASE_NOT_READY")
  return db.$transaction(
    async (tx) => {
      const response = await tx.playRefundReviewResponse.findUnique({
        where: { id: input.responseId },
        select: {
          id: true,
          status: true,
          preference: true,
          sampleContentProvided: true,
          policyVersion: true,
          decisionEvidenceDigest: true,
          case: {
            select: {
              tenantId: true,
              responseDueAt: true,
              encryptedPendingToken: true,
              encryptedOrderId: true,
              encryptionKeyId: true,
              tokenDigest: true,
              orderDigest: true,
            },
          },
        },
      })
      if (
        !response ||
        response.status !== PlayRefundReviewResponseStatus.PREPARED ||
        !validPolicyVersion(response.policyVersion) ||
        response.policyVersion !==
          env.PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION ||
        !validDecisionEvidenceDigest(response.decisionEvidenceDigest) ||
        !response.case.tenantId ||
        response.case.responseDueAt <= now ||
        !response.case.encryptedPendingToken ||
        !response.case.encryptedOrderId ||
        !response.case.encryptionKeyId ||
        !response.case.tokenDigest ||
        !response.case.orderDigest
      )
        throw new PlayRefundReviewResponseError("CASE_NOT_READY")
      if (
        input.expected &&
        (response.id !== input.expected.responseId ||
          response.preference !== input.expected.preference ||
          response.sampleContentProvided !==
            input.expected.sampleContentProvided ||
          response.policyVersion !== input.expected.policyVersion ||
          response.decisionEvidenceDigest !==
            input.expected.decisionEvidenceDigest ||
          response.case.encryptedPendingToken !==
            input.expected.encryptedPendingToken ||
          response.case.encryptedOrderId !== input.expected.encryptedOrderId ||
          response.case.encryptionKeyId !== input.expected.encryptionKeyId ||
          response.case.tokenDigest !== input.expected.tokenDigest ||
          response.case.orderDigest !== input.expected.orderDigest)
      )
        throw new PlayRefundReviewResponseError("RESPONSE_CONFLICT")
      const claimed = await tx.playRefundReviewResponse.updateMany({
        where: {
          id: response.id,
          status: PlayRefundReviewResponseStatus.PREPARED,
        },
        data: {
          status: PlayRefundReviewResponseStatus.CLAIMED,
          claimedAt: now,
        },
      })
      if (claimed.count !== 1)
        throw new PlayRefundReviewResponseError("RESPONSE_CONFLICT")
      return {
        responseId: response.id,
        preference: response.preference,
        sampleContentProvided: response.sampleContentProvided,
        policyVersion: response.policyVersion,
        decisionEvidenceDigest: response.decisionEvidenceDigest,
        encryptedPendingToken: response.case.encryptedPendingToken,
        encryptedOrderId: response.case.encryptedOrderId,
        encryptionKeyId: response.case.encryptionKeyId,
        tokenDigest: response.case.tokenDigest,
        orderDigest: response.case.orderDigest,
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
}

/** Internal read-only custody check before consuming the one-time claim. */
export async function inspectPlayRefundReviewResponseCustody(
  db: PrismaClient,
  input: { responseId: string; now?: Date },
) {
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime()))
    throw new PlayRefundReviewResponseError("CASE_NOT_READY")
  const response = await db.playRefundReviewResponse.findUnique({
    where: { id: input.responseId },
    select: {
      id: true,
      status: true,
      preference: true,
      sampleContentProvided: true,
      policyVersion: true,
      decisionEvidenceDigest: true,
      case: {
        select: {
          tenantId: true,
          responseDueAt: true,
          encryptedPendingToken: true,
          encryptedOrderId: true,
          encryptionKeyId: true,
          tokenDigest: true,
          orderDigest: true,
        },
      },
    },
  })
  if (
    !response ||
    response.status !== PlayRefundReviewResponseStatus.PREPARED ||
    !validPolicyVersion(response.policyVersion) ||
    !validDecisionEvidenceDigest(response.decisionEvidenceDigest) ||
    !response.case.tenantId ||
    response.case.responseDueAt <= now ||
    !response.case.encryptedPendingToken ||
    !response.case.encryptedOrderId ||
    !response.case.encryptionKeyId ||
    !response.case.tokenDigest ||
    !response.case.orderDigest
  )
    throw new PlayRefundReviewResponseError("CASE_NOT_READY")
  return {
    responseId: response.id,
    preference: response.preference,
    sampleContentProvided: response.sampleContentProvided,
    policyVersion: response.policyVersion,
    decisionEvidenceDigest: response.decisionEvidenceDigest,
    encryptedPendingToken: response.case.encryptedPendingToken,
    encryptedOrderId: response.case.encryptedOrderId,
    encryptionKeyId: response.case.encryptionKeyId,
    tokenDigest: response.case.tokenDigest,
    orderDigest: response.case.orderDigest,
  }
}

export async function recordPlayRefundReviewResponseOutcome(
  db: PrismaClient,
  input: {
    responseId: string
    outcome: "CONFIRMED" | "UNCERTAIN"
    now?: Date
  },
) {
  if (input.outcome !== "CONFIRMED" && input.outcome !== "UNCERTAIN")
    throw new PlayRefundReviewResponseError("RESPONSE_CONFLICT")
  const status =
    input.outcome === "CONFIRMED"
      ? PlayRefundReviewResponseStatus.CONFIRMED
      : PlayRefundReviewResponseStatus.UNCERTAIN
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime()))
    throw new PlayRefundReviewResponseError("RESPONSE_CONFLICT")
  const changed = await db.playRefundReviewResponse.updateMany({
    where: {
      id: input.responseId,
      status: PlayRefundReviewResponseStatus.CLAIMED,
    },
    data: {
      status,
      confirmedAt: status === "CONFIRMED" ? now : null,
      uncertainAt: status === "UNCERTAIN" ? now : null,
    },
  })
  if (changed.count !== 1)
    throw new PlayRefundReviewResponseError("RESPONSE_CONFLICT")
  return { responseId: input.responseId, status }
}
