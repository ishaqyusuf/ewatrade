import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "./own-transaction"

export class AccountPrivacyActivityError extends Error {
  constructor(
    readonly code:
      | "DISABLED"
      | "POLICY_NOT_APPROVED"
      | "OPERATOR_REQUIRED"
      | "NOT_FOUND"
      | "NOT_READY"
      | "ACTIVITY_PROVIDER_RECONCILIATION_REQUIRED",
  ) {
    super(code)
    this.name = "AccountPrivacyActivityError"
  }
}

export function getApprovedAccountPrivacyActivityPolicy(
  environment = process.env,
  now = new Date(),
) {
  const raw = environment.ACCOUNT_PRIVACY_ACTIVITY_POLICY_JSON
  const digest = environment.ACCOUNT_PRIVACY_APPROVED_ACTIVITY_POLICY_SHA256
  if (
    !raw ||
    !digest ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    createHash("sha256").update(raw).digest("hex") !== digest
  )
    return null
  try {
    const policy: unknown = JSON.parse(raw)
    if (!policy || typeof policy !== "object" || Array.isArray(policy))
      return null
    const values = policy as Record<string, unknown>
    const keys = [
      "version",
      "approvalReference",
      "approvedAt",
      "reviewAt",
      "mode",
    ]
    if (
      Object.keys(values).length !== keys.length ||
      keys.some((key) => typeof values[key] !== "string")
    )
      return null
    if (
      values.version !==
        environment.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim() ||
      !String(values.version).trim() ||
      !String(values.approvalReference).trim() ||
      values.mode !== "ERASE_PRODUCT_ANALYTICS"
    )
      return null
    const approvedAt = new Date(String(values.approvedAt))
    const reviewAt = new Date(String(values.reviewAt))
    if (
      !Number.isFinite(now.getTime()) ||
      !Number.isFinite(approvedAt.getTime()) ||
      approvedAt > now ||
      !Number.isFinite(reviewAt.getTime()) ||
      reviewAt <= now
    )
      return null
    return { version: String(values.version), digest }
  } catch {
    return null
  }
}

/** Erases first-party user-attributed analytics only; provider copies remain a separate domain. */
export async function processAccountPrivacyActivity(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_ACTIVITY_PROCESSING_ENABLED !== "true"
  )
    throw new AccountPrivacyActivityError("DISABLED")
  const now = input.now ?? new Date()
  const policy = getApprovedAccountPrivacyActivityPolicy(process.env, now)
  if (!policy) throw new AccountPrivacyActivityError("POLICY_NOT_APPROVED")
  return runInOwnSerializableTransaction(db, async (tx) => {
    const operator = await tx.user.findUnique({
      where: { id: input.operatorUserId },
      select: { isPlatformAdmin: true },
    })
    if (!operator?.isPlatformAdmin)
      throw new AccountPrivacyActivityError("OPERATOR_REQUIRED")
    const request = await tx.accountPrivacyRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        requestKey: true,
        userId: true,
        verifiedSubjectUserId: true,
        verifiedAt: true,
        contactEmail: true,
        status: true,
        outcome: true,
        user: { select: { email: true, emailVerified: true } },
        accessRevocation: { select: { status: true, userId: true } },
      },
    })
    if (!request) throw new AccountPrivacyActivityError("NOT_FOUND")
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
      throw new AccountPrivacyActivityError("NOT_READY")
    if (
      await tx.productAnalyticsEvent.count({
        where: { userId: subjectId, leaseToken: { not: null } },
      })
    )
      throw new AccountPrivacyActivityError(
        "ACTIVITY_PROVIDER_RECONCILIATION_REQUIRED",
      )
    const result = await tx.productAnalyticsEvent.deleteMany({
      where: { userId: subjectId },
    })
    if (await tx.productAnalyticsEvent.count({ where: { userId: subjectId } }))
      throw new AccountPrivacyActivityError("NOT_READY")
    if (result.count) {
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
            activityCleanup: {
              processor: "account-privacy-activity-v1",
              policyVersion: policy.version,
              policyDigest: policy.digest,
              operatorUserId: input.operatorUserId,
              removed: result.count,
              processedAt: now.toISOString(),
            },
          },
        },
      })
    }
    return {
      requestId: request.id,
      analyticsRemoved: result.count,
      replay: result.count === 0,
    }
  })
}
