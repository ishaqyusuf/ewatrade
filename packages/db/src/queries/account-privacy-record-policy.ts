import { createHash } from "node:crypto"
import { z } from "zod"

const schema = z
  .object({
    version: z.string().trim().min(1).max(100),
    approvalReference: z.string().trim().min(1).max(300),
    approvedAt: z.string().datetime(),
    reviewAt: z.string().datetime(),
    mode: z.literal("MINIMIZE_AND_RETAIN_APPROVED_RECORDS"),
  })
  .strict()
export function getApprovedAccountPrivacyRecordPolicy(
  environment = process.env,
  now = new Date(),
) {
  const raw = environment.ACCOUNT_PRIVACY_RECORD_POLICY_JSON
  const digest = environment.ACCOUNT_PRIVACY_APPROVED_RECORD_POLICY_SHA256
  if (
    !raw ||
    !digest ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    createHash("sha256").update(raw).digest("hex") !== digest
  )
    return null
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    if (
      !parsed.success ||
      !Number.isFinite(now.getTime()) ||
      parsed.data.version !==
        environment.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim() ||
      new Date(parsed.data.approvedAt) > now ||
      new Date(parsed.data.reviewAt) <= now
    )
      return null
    return { ...parsed.data, digest }
  } catch {
    return null
  }
}
export function addAccountPrivacyCalendarMonths(date: Date, months: number) {
  if (
    !Number.isFinite(date.getTime()) ||
    !Number.isInteger(months) ||
    months < 0 ||
    months > 1200
  )
    throw Error("INVALID_RETENTION_DATE")
  const target = new Date(date)
  const day = target.getUTCDate()
  target.setUTCDate(1)
  target.setUTCMonth(target.getUTCMonth() + months)
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(day, last))
  return target
}
/** Tax clock is six complete years after the assessment year; company records have a creation-based minimum too. */
export function accountPrivacyAccountingExpiry(input: {
  sourceCreatedAt: Date
  assessmentYear: number
  now: Date
}) {
  const created = input.sourceCreatedAt
  if (
    !Number.isFinite(created.getTime()) ||
    !Number.isFinite(input.now.getTime()) ||
    created > input.now ||
    !Number.isInteger(input.assessmentYear) ||
    input.assessmentYear < 1900 ||
    input.assessmentYear > input.now.getUTCFullYear() + 1
  )
    throw Error("ASSESSMENT_YEAR_REQUIRED")
  return new Date(
    Math.max(
      Date.UTC(input.assessmentYear + 7, 0, 1),
      addAccountPrivacyCalendarMonths(created, 72).getTime(),
    ),
  )
}
/** Ordinary closed-case cap, with any shorter approved period preserved. Never infer closure from deletion intake. */
export function accountPrivacySharedExpiry(input: {
  sourceCreatedAt: Date
  closedAt: Date
  now: Date
  earlierExpiresAt?: Date
}) {
  if (
    !Number.isFinite(input.sourceCreatedAt.getTime()) ||
    !Number.isFinite(input.closedAt.getTime()) ||
    !Number.isFinite(input.now.getTime()) ||
    input.closedAt < input.sourceCreatedAt ||
    input.closedAt > input.now ||
    (input.earlierExpiresAt &&
      !Number.isFinite(input.earlierExpiresAt.getTime()))
  )
    throw Error("CLOSURE_EVIDENCE_REQUIRED")
  const cap = addAccountPrivacyCalendarMonths(input.closedAt, 24)
  const expiresAt = input.earlierExpiresAt
    ? new Date(Math.min(cap.getTime(), input.earlierExpiresAt.getTime()))
    : cap
  return {
    expiresAt,
    reviewDueAt: new Date(
      Math.min(
        addAccountPrivacyCalendarMonths(input.closedAt, 12).getTime(),
        expiresAt.getTime(),
      ),
    ),
  }
}
export function accountPrivacyRecordHoldIsActive(
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

/** Canonical binding of reviewed controller scope, immutable clocks and bounded holds. */
export function accountPrivacyRecordDecisionDigest(row: {
  requestId: string
  subjectUserId: string
  tenantId: string
  recordFamily: string
  recordId: string
  actorField: string
  category: string
  policyVersion: string
  policyDigest: string
  controllerEvidenceDigest: string
  sourceEvidenceDigest: string
  sourceCreatedAt: Date
  assessmentYear: number | null
  closedAt: Date | null
  earlierExpiresAt: Date | null
  expiresAt: Date
  reviewDueAt: Date
  operatorUserId: string
  holdReason: string | null
  holdOwnerUserId: string | null
  holdReviewAt: Date | null
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        processor: "account-privacy-record-retention-v1",
        requestId: row.requestId,
        subjectUserId: row.subjectUserId,
        tenantId: row.tenantId,
        recordFamily: row.recordFamily,
        recordId: row.recordId,
        actorField: row.actorField,
        category: row.category,
        policyVersion: row.policyVersion,
        policyDigest: row.policyDigest,
        controllerEvidenceDigest: row.controllerEvidenceDigest,
        sourceEvidenceDigest: row.sourceEvidenceDigest,
        sourceCreatedAt: row.sourceCreatedAt.toISOString(),
        assessmentYear: row.assessmentYear,
        closedAt: row.closedAt?.toISOString() ?? null,
        earlierExpiresAt: row.earlierExpiresAt?.toISOString() ?? null,
        expiresAt: row.expiresAt.toISOString(),
        reviewDueAt: row.reviewDueAt.toISOString(),
        operatorUserId: row.operatorUserId,
        holdReason: row.holdReason,
        holdOwnerUserId: row.holdOwnerUserId,
        holdReviewAt: row.holdReviewAt?.toISOString() ?? null,
      }),
    )
    .digest("hex")
}
