import { createHash } from "node:crypto"
import { z } from "zod"

const sha = z.string().regex(/^[a-f0-9]{64}$/)
const schema = z
  .object({
    version: z.string().min(1),
    approvalReference: z.string().min(1),
    approvedAt: z.string().datetime(),
    ownerApprovalDigest: sha,
    operatorUserId: z.string().min(1),
    requestId: z.string().min(1),
    subjectUserId: z.string().min(1),
    contentDigest: sha,
    recipientDigest: sha,
    provider: z.literal("resend"),
    retentionDays: z.literal(30),
    sendBy: z.string().datetime(),
    retentionUntil: z.string().datetime(),
    reviewAt: z.string().datetime(),
  })
  .strict()
export type NoticeRetentionPolicy = z.infer<typeof schema> & { digest: string }

/** New notice copies have their own approval; the original provider review is immutable. */
export function getApprovedNoticeRetentionPolicy(
  env = process.env,
  now = new Date(),
): NoticeRetentionPolicy | null {
  const raw = env.ACCOUNT_PRIVACY_NOTICE_RETENTION_POLICY_JSON
  const expected = env.ACCOUNT_PRIVACY_APPROVED_NOTICE_RETENTION_POLICY_SHA256
  if (
    !raw ||
    !expected ||
    !/^[a-f0-9]{64}$/.test(expected) ||
    !Number.isFinite(now.getTime())
  )
    return null
  const digest = createHash("sha256").update(raw).digest("hex")
  if (digest !== expected) return null
  try {
    const result = schema.safeParse(JSON.parse(raw))
    if (!result.success) return null
    const p = result.data
    for (const value of [
      p.approvedAt,
      p.sendBy,
      p.retentionUntil,
      p.reviewAt,
    ]) {
      const date = new Date(value)
      if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
        return null
    }
    if (
      p.version !== env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION ||
      p.operatorUserId === p.subjectUserId ||
      new Date(p.approvedAt) > now ||
      new Date(p.reviewAt) <= now ||
      new Date(p.sendBy) < new Date(p.approvedAt) ||
      new Date(p.retentionUntil).getTime() !==
        new Date(p.sendBy).getTime() + p.retentionDays * 86_400_000
    )
      return null
    return { ...p, digest }
  } catch {
    return null
  }
}

export type NoticeRetentionBinding = {
  requestId: string
  subjectUserId: string
  attemptId: string
  contentDigest: string
  recipientDigest: string
  originalExternalEvidenceDigest: string
  originalExternalPolicyDigest: string
  profileEvidenceDigest: string
  profilePolicyDigest: string
  operatorUserId: string
  preparedAt: string
}
const bindingSchema = z
  .object({
    requestId: z.string().min(1),
    subjectUserId: z.string().min(1),
    attemptId: z.string().min(1),
    contentDigest: sha,
    recipientDigest: sha,
    originalExternalEvidenceDigest: sha,
    originalExternalPolicyDigest: sha,
    profileEvidenceDigest: sha,
    profilePolicyDigest: sha,
    operatorUserId: z.string().min(1),
    preparedAt: z.string().datetime(),
  })
  .strict()
function policyMatches(p: NoticeRetentionPolicy, b: NoticeRetentionBinding) {
  return (
    p.requestId === b.requestId &&
    p.subjectUserId === b.subjectUserId &&
    p.contentDigest === b.contentDigest &&
    p.recipientDigest === b.recipientDigest &&
    p.operatorUserId === b.operatorUserId &&
    b.operatorUserId !== b.subjectUserId &&
    new Date(b.preparedAt) >= new Date(p.approvedAt) &&
    new Date(b.preparedAt) <= new Date(p.sendBy)
  )
}
export function noticeRetentionEvidence(
  policy: NoticeRetentionPolicy,
  binding: NoticeRetentionBinding,
) {
  const parsed = bindingSchema.parse(binding)
  if (!policyMatches(policy, parsed))
    throw Error("NOTICE_RETENTION_SCOPE_MISMATCH")
  const record = {
    processor: "account-privacy-notice-retention-v1",
    policyDigest: policy.digest,
    ...parsed,
  }
  return {
    ...record,
    evidenceDigest: createHash("sha256")
      .update(JSON.stringify(record))
      .digest("hex"),
  }
}

export function noticeRetentionIsConfirmed(input: {
  policy: NoticeRetentionPolicy
  binding: Omit<NoticeRetentionBinding, "operatorUserId">
  recorded: unknown
  now: Date
  sentAt?: Date | null
}) {
  try {
    if (
      !Number.isFinite(input.now.getTime()) ||
      !input.recorded ||
      typeof input.recorded !== "object" ||
      Array.isArray(input.recorded)
    )
      return false
    const r = input.recorded as Record<string, unknown>
    if (typeof r.operatorUserId !== "string") return false
    const binding = { ...input.binding, operatorUserId: r.operatorUserId }
    const expected = noticeRetentionEvidence(input.policy, binding)
    if (
      Object.keys(r).length !== Object.keys(expected).length ||
      Object.entries(expected).some(([k, v]) => r[k] !== v) ||
      new Date(binding.preparedAt) > input.now
    )
      return false
    if (
      input.sentAt &&
      (!Number.isFinite(input.sentAt.getTime()) ||
        input.sentAt > input.now ||
        input.sentAt > new Date(input.policy.sendBy) ||
        noticeProviderRetentionDeadline(input.sentAt).getTime() >
          new Date(input.policy.retentionUntil).getTime())
    )
      return false
    return true
  } catch {
    return false
  }
}

export function originalExternalReviewDigest(outcome: unknown): string | null {
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome))
    return null
  const review = (outcome as Record<string, unknown>).externalProcessorReview
  if (!review || typeof review !== "object" || Array.isArray(review))
    return null
  const r = review as Record<string, unknown>
  return r.processor === "account-privacy-external-review-v1" &&
    typeof r.evidenceDigest === "string" &&
    /^[a-f0-9]{64}$/.test(r.evidenceDigest)
    ? r.evidenceDigest
    : null
}

export function originalExternalPolicyDigest(outcome: unknown): string | null {
  if (!originalExternalReviewDigest(outcome)) return null
  const r = (outcome as { externalProcessorReview: { policyDigest?: unknown } })
    .externalProcessorReview
  return typeof r.policyDigest === "string" &&
    /^[a-f0-9]{64}$/.test(r.policyDigest)
    ? r.policyDigest
    : null
}
/** Actual record retention is exactly 30 days from authenticated send time, never the upper bound. */
export function noticeProviderRetentionDeadline(sentAt: Date) {
  if (!Number.isFinite(sentAt.getTime())) throw Error("INVALID_SEND_TIME")
  return new Date(sentAt.getTime() + 30 * 86_400_000)
}
