import { createHash } from "node:crypto"

export type AccountPrivacyRetentionPolicy = {
  version: string
  approvalReference: string
  digest: string
}

/** Approval binds the fixed owner-approved 90-day / 12-month / 24-month rules. */
export function getApprovedAccountPrivacyRetentionPolicy(
  environment: NodeJS.ProcessEnv = process.env,
): AccountPrivacyRetentionPolicy | null {
  const source = environment.ACCOUNT_PRIVACY_RETENTION_POLICY_JSON
  const expected = environment.ACCOUNT_PRIVACY_APPROVED_RETENTION_POLICY_SHA256
  if (!source || !expected || !/^[a-f0-9]{64}$/.test(expected)) return null
  const digest = createHash("sha256").update(source).digest("hex")
  if (digest !== expected) return null
  try {
    const value: unknown = JSON.parse(source)
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const policy = value as Record<string, unknown>
    if (
      Object.keys(policy).length !== 2 ||
      typeof policy.version !== "string" ||
      !policy.version.trim() ||
      policy.version !== environment.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION ||
      typeof policy.approvalReference !== "string" ||
      !policy.approvalReference.trim()
    )
      return null
    return {
      version: policy.version,
      approvalReference: policy.approvalReference,
      digest,
    }
  } catch {
    return null
  }
}

function addMonths(date: Date, months: number) {
  const result = new Date(date)
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

export function accountPrivacyRetentionDeadlines(completedAt: Date) {
  if (!Number.isFinite(completedAt.getTime()))
    throw new Error("INVALID_COMPLETION_DATE")
  return {
    contactExpiresAt: new Date(completedAt.getTime() + 90 * 86_400_000),
    reviewDueAt: addMonths(completedAt, 12),
    evidenceExpiresAt: addMonths(completedAt, 24),
  }
}

/** An overdue hold does not silently extend retention indefinitely. */
export function accountPrivacyRetentionHoldIsActive(
  row: {
    holdReason: string | null
    holdOwnerUserId: string | null
    holdReviewAt: Date | null
  },
  now: Date,
) {
  return Boolean(
    row.holdReason?.trim() &&
      row.holdOwnerUserId?.trim() &&
      row.holdReviewAt &&
      row.holdReviewAt > now,
  )
}
