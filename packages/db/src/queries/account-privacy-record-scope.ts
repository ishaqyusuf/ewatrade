import type { PrismaClient } from "../../generated/prisma/client"
import {
  accountPrivacyRecordDecisionDigest,
  getApprovedAccountPrivacyRecordPolicy,
} from "./account-privacy-record-policy"
import {
  type AccountPrivacyRecordFamily,
  listAccountPrivacySubjectRecordSnapshots,
} from "./account-privacy-record-sources"

/** Necessary remaining-record coverage check. A receipt/ledger cannot override live subject scope, policy, review or expiry. */
export async function assessAccountPrivacyRetainedRecordScope(
  db: Pick<PrismaClient, "$queryRaw" | "accountPrivacyRecordRetention">,
  input: {
    requestId: string
    subjectId: string
    families: readonly AccountPrivacyRecordFamily[]
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  const policy = getApprovedAccountPrivacyRecordPolicy(process.env, now)
  if (
    process.env.ACCOUNT_PRIVACY_RECORD_PROCESSING_ENABLED !== "true" ||
    !policy
  )
    return {
      valid: false,
      records: null,
      nextReviewAt: null,
      digests: [] as string[],
    }
  const records = await listAccountPrivacySubjectRecordSnapshots(
    db,
    input.subjectId,
    input.families,
  )
  if (!records.length)
    return {
      valid: true,
      records: 0,
      nextReviewAt: null,
      digests: [] as string[],
    }
  const plans = await db.accountPrivacyRecordRetention.findMany({
    where: {
      requestId: input.requestId,
      subjectUserId: input.subjectId,
      recordFamily: { in: [...input.families] },
    },
  })
  const digests: string[] = []
  const reviewTimes: number[] = []
  for (const record of records) {
    const plan = plans.find(
      (row) =>
        row.recordFamily === record.family &&
        row.recordId === record.recordId &&
        row.actorField === record.actorField,
    )
    if (
      !plan ||
      plan.policyVersion !== policy.version ||
      plan.policyDigest !== policy.digest ||
      plan.operatorUserId === input.subjectId ||
      plan.tenantId !== record.tenantId ||
      plan.sourceEvidenceDigest !== record.sourceEvidenceDigest ||
      plan.sourceCreatedAt.getTime() !== record.sourceCreatedAt.getTime() ||
      plan.category !== record.category ||
      plan.expiresAt <= now ||
      plan.reviewDueAt <= now ||
      plan.decisionDigest !== accountPrivacyRecordDecisionDigest(plan) ||
      !/^[a-f0-9]{64}$/.test(plan.controllerEvidenceDigest)
    )
      return {
        valid: false,
        records: records.length,
        nextReviewAt: null,
        digests: [] as string[],
      }
    if (plan.holdReason && (!plan.holdReviewAt || plan.holdReviewAt <= now))
      return {
        valid: false,
        records: records.length,
        nextReviewAt: null,
        digests: [] as string[],
      }
    digests.push(plan.decisionDigest)
    reviewTimes.push(
      plan.reviewDueAt.getTime(),
      plan.expiresAt.getTime(),
      ...(plan.holdReviewAt ? [plan.holdReviewAt.getTime()] : []),
    )
  }
  return {
    valid: true,
    records: records.length,
    nextReviewAt: new Date(Math.min(...reviewTimes)),
    digests: digests.sort(),
  }
}

/** Private/unhandled attribution must be empty. Closed legacy/automation records may remain only with a current, exact controller plan. */
export async function accountPrivacyAdditionalScopeIsResolved(
  db: Pick<PrismaClient, "$queryRaw" | "accountPrivacyRecordRetention">,
  input: {
    requestId: string
    subjectId: string
    inventory: Record<string, number>
    now?: Date
  },
) {
  if (
    Object.entries(input.inventory).some(
      ([key, count]) =>
        count > 0 &&
        ![
          "legacyMessages",
          "automationEvents",
          "customerMessageTemplates",
        ].includes(key),
    )
  )
    return false
  if (
    !input.inventory.legacyMessages &&
    !input.inventory.automationEvents &&
    !input.inventory.customerMessageTemplates
  )
    return true
  const scope = await assessAccountPrivacyRetainedRecordScope(db, {
    ...input,
    families: ["legacyMessage", "automationEvent", "customerMessageTemplate"],
  })
  return (
    scope.valid &&
    scope.records ===
      (input.inventory.legacyMessages ?? 0) +
        (input.inventory.automationEvents ?? 0) +
        (input.inventory.customerMessageTemplates ?? 0)
  )
}
