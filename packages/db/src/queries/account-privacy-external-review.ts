import { z } from "zod"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  accountPrivacyExternalEvidence,
  accountPrivacyExternalReceiptSchema,
  accountPrivacyExternalReviewIsConfirmed,
  getApprovedAccountPrivacyExternalPolicy,
} from "./account-privacy-external-policy"
import { runInOwnSerializableTransaction } from "./own-transaction"

export class AccountPrivacyExternalReviewError extends Error {
  constructor(
    readonly code:
      | "DISABLED"
      | "POLICY_NOT_APPROVED"
      | "OPERATOR_REQUIRED"
      | "NOT_FOUND"
      | "NOT_READY"
      | "PROVIDER_EVIDENCE_REQUIRED"
      | "CLAIM_CONFLICT",
  ) {
    super(code)
    this.name = "AccountPrivacyExternalReviewError"
  }
}
export const recordAccountPrivacyExternalReviewSchema = z
  .object({
    requestId: z.string().min(1),
    confirmationsReviewed: z.literal(true),
    receipts: z.array(accountPrivacyExternalReceiptSchema).min(1).max(30),
  })
  .strict()

/** A human operator must inspect actual subject-bound confirmations; this never invokes or simulates provider erasure. */
export async function recordAccountPrivacyExternalReview(
  db: PrismaClient,
  input: z.infer<typeof recordAccountPrivacyExternalReviewSchema> & {
    operatorUserId: string
    now?: Date
  },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_EXTERNAL_REVIEW_ENABLED !== "true"
  )
    throw new AccountPrivacyExternalReviewError("DISABLED")
  const now = input.now ?? new Date()
  const policy = getApprovedAccountPrivacyExternalPolicy(process.env, now)
  if (!policy)
    throw new AccountPrivacyExternalReviewError("POLICY_NOT_APPROVED")
  const parsed = recordAccountPrivacyExternalReviewSchema.safeParse({
    requestId: input.requestId,
    confirmationsReviewed: input.confirmationsReviewed,
    receipts: input.receipts,
  })
  if (!parsed.success)
    throw new AccountPrivacyExternalReviewError("PROVIDER_EVIDENCE_REQUIRED")
  const receipts = parsed.data.receipts
  if (
    receipts.length !== policy.providers.length ||
    new Set(receipts.map((row) => row.provider)).size !== receipts.length ||
    policy.providers.some(
      (provider) => !receipts.some((row) => row.provider === provider.key),
    )
  )
    throw new AccountPrivacyExternalReviewError("PROVIDER_EVIDENCE_REQUIRED")
  return runInOwnSerializableTransaction(db, async (tx) => {
    const operator = await tx.user.findUnique({
      where: { id: input.operatorUserId },
      select: { isPlatformAdmin: true },
    })
    if (!operator?.isPlatformAdmin)
      throw new AccountPrivacyExternalReviewError("OPERATOR_REQUIRED")
    const request = await tx.accountPrivacyRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        userId: true,
        verifiedSubjectUserId: true,
        requestKey: true,
        verifiedAt: true,
        status: true,
        contactEmail: true,
        outcome: true,
        user: { select: { email: true, emailVerified: true } },
        accessRevocation: { select: { status: true, userId: true } },
      },
    })
    if (!request) throw new AccountPrivacyExternalReviewError("NOT_FOUND")
    const subjectId = request.verifiedSubjectUserId
    if (
      !subjectId ||
      subjectId === input.operatorUserId ||
      request.userId !== subjectId ||
      request.requestKey !== `account-deletion:${subjectId}` ||
      !request.verifiedAt ||
      request.verifiedAt > now ||
      request.status !== "PROCESSING" ||
      !request.user?.emailVerified ||
      !request.contactEmail ||
      request.user.email.trim().toLowerCase() !==
        request.contactEmail.trim().toLowerCase() ||
      request.accessRevocation?.status !== "REVOKED" ||
      request.accessRevocation.userId !== subjectId
    )
      throw new AccountPrivacyExternalReviewError("NOT_READY")
    const verifiedAt = request.verifiedAt
    if (
      receipts.some(
        (row) =>
          !Number.isFinite(row.confirmedAt.getTime()) ||
          row.confirmedAt < verifiedAt ||
          row.confirmedAt > now,
      )
    )
      throw new AccountPrivacyExternalReviewError("PROVIDER_EVIDENCE_REQUIRED")
    const existing = await tx.accountPrivacyDomainOutcome.findUnique({
      where: {
        requestId_domain: {
          requestId: request.id,
          domain: "EXTERNAL_PROCESSORS",
        },
      },
    })
    const retained = policy.providers.filter(
      (provider) => provider.disposition === "RETENTION_APPROVED",
    )
    const disposition = retained.length
      ? ("RETENTION_APPROVED" as const)
      : ("ERASURE_CONFIRMED" as const)
    const nextReviewAt = retained.length
      ? new Date(
          Math.min(
            new Date(policy.reviewAt).getTime(),
            ...retained.map((provider) =>
              new Date(provider.expiresAt ?? "").getTime(),
            ),
          ),
        )
      : null
    const digest = accountPrivacyExternalEvidence({
      requestId: request.id,
      subjectId,
      policy,
      receipts: receipts,
      operatorUserId: input.operatorUserId,
      processedAt: existing?.processedAt ?? now,
    })
    if (existing) {
      if (
        !accountPrivacyExternalReviewIsConfirmed({
          requestId: request.id,
          subjectId,
          verifiedAt,
          outcome: existing,
          recorded:
            request.outcome &&
            typeof request.outcome === "object" &&
            !Array.isArray(request.outcome)
              ? request.outcome.externalProcessorReview
              : null,
          now,
        }) ||
        existing.userId !== subjectId ||
        existing.processor !== "account-privacy-external-review-v1" ||
        existing.policyVersion !== policy.version ||
        existing.evidenceDigest !== digest ||
        existing.disposition !== disposition ||
        existing.nextReviewAt?.getTime() !== nextReviewAt?.getTime()
      )
        throw new AccountPrivacyExternalReviewError("CLAIM_CONFLICT")
      return {
        requestId: request.id,
        providersReviewed: receipts.length,
        retainedProviders: retained.length,
        replay: true,
      }
    }
    const previous =
      request.outcome &&
      typeof request.outcome === "object" &&
      !Array.isArray(request.outcome)
        ? request.outcome
        : {}
    await tx.accountPrivacyRequest.update({
      where: { id: request.id },
      data: {
        outcome: {
          ...previous,
          externalProcessorReview: {
            processor: "account-privacy-external-review-v1",
            policyDigest: policy.digest,
            operatorUserId: input.operatorUserId,
            evidenceDigest: digest,
            providers: policy.providers.map((provider) => ({ ...provider })),
            receipts: [...receipts]
              .sort((a, b) => a.provider.localeCompare(b.provider))
              .map((row) => ({
                ...row,
                confirmedAt: row.confirmedAt.toISOString(),
              })),
          },
        },
      },
    })
    await tx.accountPrivacyDomainOutcome.create({
      data: {
        requestId: request.id,
        userId: subjectId,
        domain: "EXTERNAL_PROCESSORS",
        disposition,
        processor: "account-privacy-external-review-v1",
        policyVersion: policy.version,
        evidenceDigest: digest,
        nextReviewAt,
        processedAt: now,
      },
    })
    return {
      requestId: request.id,
      providersReviewed: receipts.length,
      retainedProviders: retained.length,
      replay: false,
    }
  })
}
