import { z } from "zod"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  accountPrivacyAccountingExpiry,
  accountPrivacyRecordDecisionDigest,
  accountPrivacyRecordHoldIsActive,
  accountPrivacySharedExpiry,
  addAccountPrivacyCalendarMonths,
  getApprovedAccountPrivacyRecordPolicy,
} from "./account-privacy-record-policy"
import {
  ACCOUNT_PRIVACY_RECORD_FAMILIES,
  type AccountPrivacyRecordFamily,
  accountPrivacyRecordSnapshot,
  accountPrivacyRecordSources,
  expireAccountPrivacyRecordSource,
} from "./account-privacy-record-sources"
import { runInOwnSerializableTransaction } from "./own-transaction"

export class AccountPrivacyRecordRetentionError extends Error {
  constructor(
    readonly code:
      | "DISABLED"
      | "POLICY_NOT_APPROVED"
      | "OPERATOR_REQUIRED"
      | "NOT_READY"
      | "SOURCE_CHANGED"
      | "CONTROLLER_EVIDENCE_REQUIRED"
      | "ASSESSMENT_YEAR_REQUIRED"
      | "CLOSURE_EVIDENCE_REQUIRED"
      | "JURISDICTION_REVIEW_REQUIRED"
      | "INVALID_HOLD"
      | "HOLD_REVIEW_REQUIRED"
      | "CLAIM_CONFLICT",
  ) {
    super(code)
    this.name = "AccountPrivacyRecordRetentionError"
  }
}
export const accountPrivacyRecordInspectionSchema = z
  .object({
    requestId: z.string().min(1),
    recordFamily: z.enum(ACCOUNT_PRIVACY_RECORD_FAMILIES),
    recordId: z.string().min(1),
  })
  .strict()
export const accountPrivacyRecordHoldSchema = z
  .object({
    reason: z.enum(["LEGAL_HOLD", "UNRESOLVED_DISPUTE"]),
    reviewAt: z.coerce.date(),
  })
  .strict()
  .nullable()
export const retainAccountPrivacyRecordSchema =
  accountPrivacyRecordInspectionSchema
    .extend({
      expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
      controllerEvidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
      controllerInstructionsReviewed: z.literal(true),
      minimumNecessaryRetentionReviewed: z.literal(true),
      shorterPoliciesReviewed: z.literal(true),
      holdsReviewed: z.literal(true),
      hold: accountPrivacyRecordHoldSchema,
      confirmedAt: z.coerce.date(),
      assessmentYear: z.number().int().min(1900).max(9999).optional(),
      closedAt: z.coerce.date().optional(),
      earlierExpiresAt: z.coerce.date().optional(),
    })
    .strict()
function enabled() {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_RECORD_PROCESSING_ENABLED !== "true"
  )
    throw new AccountPrivacyRecordRetentionError("DISABLED")
}
async function administrator(
  tx: Prisma.TransactionClient,
  operatorUserId: string,
) {
  const operator = await tx.user.findUnique({
    where: { id: operatorUserId },
    select: { isPlatformAdmin: true },
  })
  if (!operator?.isPlatformAdmin)
    throw new AccountPrivacyRecordRetentionError("OPERATOR_REQUIRED")
}
export async function accountPrivacyRecordProcessingContext(
  tx: Prisma.TransactionClient,
  input: { requestId: string; operatorUserId: string },
  now: Date,
) {
  await administrator(tx, input.operatorUserId)
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
  const subjectId = request?.verifiedSubjectUserId
  if (
    !request ||
    !subjectId ||
    subjectId === input.operatorUserId ||
    request.userId !== subjectId ||
    request.requestKey !== `account-deletion:${subjectId}` ||
    !request.verifiedAt ||
    request.verifiedAt > now ||
    request.status !== "PROCESSING" ||
    !request.contactEmail ||
    !request.user?.emailVerified ||
    request.user.email.trim().toLowerCase() !==
      request.contactEmail.trim().toLowerCase() ||
    request.accessRevocation?.status !== "REVOKED" ||
    request.accessRevocation.userId !== subjectId
  )
    throw new AccountPrivacyRecordRetentionError("NOT_READY")
  if (
    await tx.membership.count({
      where: { userId: subjectId, status: { not: "REMOVED" } },
    })
  )
    throw new AccountPrivacyRecordRetentionError("NOT_READY")
  return { request, subjectId }
}
/** Restricted case projection: row identifiers and hashes, never record bodies/contact or subject credentials. */
export async function inspectAccountPrivacyRetentionRecord(
  db: PrismaClient,
  input: z.infer<typeof accountPrivacyRecordInspectionSchema> & {
    operatorUserId: string
  },
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    const { subjectId } = await accountPrivacyRecordProcessingContext(
      tx,
      input,
      new Date(),
    )
    const records = await accountPrivacyRecordSnapshot(tx, {
      family: input.recordFamily,
      recordId: input.recordId,
      subjectId,
    })
    if (!records.length)
      throw new AccountPrivacyRecordRetentionError("NOT_READY")
    return records.map(({ subjectId: _, ...record }) => record)
  })
}
/** Human controller evidence is mandatory; this is not a generic domain-outcome or arbitrary-record writer. */
export async function retainAccountPrivacyRecord(
  db: PrismaClient,
  input: z.infer<typeof retainAccountPrivacyRecordSchema> & {
    operatorUserId: string
    now?: Date
  },
) {
  enabled()
  const now = input.now ?? new Date()
  const policy = getApprovedAccountPrivacyRecordPolicy(process.env, now)
  if (!policy)
    throw new AccountPrivacyRecordRetentionError("POLICY_NOT_APPROVED")
  const parsed = retainAccountPrivacyRecordSchema.safeParse({
    requestId: input.requestId,
    recordFamily: input.recordFamily,
    recordId: input.recordId,
    expectedSourceDigest: input.expectedSourceDigest,
    controllerEvidenceDigest: input.controllerEvidenceDigest,
    controllerInstructionsReviewed: input.controllerInstructionsReviewed,
    minimumNecessaryRetentionReviewed: input.minimumNecessaryRetentionReviewed,
    shorterPoliciesReviewed: input.shorterPoliciesReviewed,
    holdsReviewed: input.holdsReviewed,
    hold: input.hold,
    confirmedAt: input.confirmedAt,
    assessmentYear: input.assessmentYear,
    closedAt: input.closedAt,
    earlierExpiresAt: input.earlierExpiresAt,
  })
  if (!parsed.success)
    throw new AccountPrivacyRecordRetentionError("CONTROLLER_EVIDENCE_REQUIRED")
  if (
    input.hold &&
    (!Number.isFinite(input.hold.reviewAt.getTime()) ||
      input.hold.reviewAt <= now ||
      input.hold.reviewAt.getTime() > now.getTime() + 90 * 86400000)
  )
    throw new AccountPrivacyRecordRetentionError("INVALID_HOLD")
  return runInOwnSerializableTransaction(db, async (tx) => {
    const { request, subjectId } = await accountPrivacyRecordProcessingContext(
      tx,
      input,
      now,
    )
    if (input.confirmedAt < request.verifiedAt || input.confirmedAt > now)
      throw new AccountPrivacyRecordRetentionError(
        "CONTROLLER_EVIDENCE_REQUIRED",
      )
    const records = await accountPrivacyRecordSnapshot(tx, {
      family: input.recordFamily,
      recordId: input.recordId,
      subjectId,
    })
    if (!records.length)
      throw new AccountPrivacyRecordRetentionError("NOT_READY")
    let retained = 0
    let expired = 0
    let replayed = 0
    for (const record of records) {
      if (record.sourceEvidenceDigest !== input.expectedSourceDigest)
        throw new AccountPrivacyRecordRetentionError("SOURCE_CHANGED")
      let expiresAt: Date
      let reviewDueAt: Date
      if (record.category === "ACCOUNTING") {
        const tenant = await tx.tenant.findUnique({
          where: { id: record.tenantId },
          select: { countryCode: true },
        })
        if (tenant?.countryCode?.toUpperCase() !== "NG")
          throw new AccountPrivacyRecordRetentionError(
            "JURISDICTION_REVIEW_REQUIRED",
          )
        if (input.assessmentYear === undefined)
          throw new AccountPrivacyRecordRetentionError(
            "ASSESSMENT_YEAR_REQUIRED",
          )
        expiresAt = accountPrivacyAccountingExpiry({
          sourceCreatedAt: record.sourceCreatedAt,
          assessmentYear: input.assessmentYear,
          now,
        })
        reviewDueAt = new Date(
          Math.min(
            addAccountPrivacyCalendarMonths(now, 12).getTime(),
            expiresAt.getTime(),
          ),
        )
      } else {
        if (!input.closedAt)
          throw new AccountPrivacyRecordRetentionError(
            "CLOSURE_EVIDENCE_REQUIRED",
          )
        if (record.family === "legacyMessage") {
          const message = await tx.message.findUnique({
            where: { id: record.recordId },
            select: { conversation: { select: { status: true } } },
          })
          if (
            !message ||
            !["RESOLVED", "ARCHIVED"].includes(message.conversation.status)
          )
            throw new AccountPrivacyRecordRetentionError(
              "CLOSURE_EVIDENCE_REQUIRED",
            )
        } else if (record.family === "automationEvent") {
          const event = await tx.automationEvent.findUnique({
            where: { id: record.recordId },
            select: { status: true, processedAt: true },
          })
          if (
            !event ||
            !["COMPLETED", "FAILED"].includes(event.status) ||
            !event.processedAt ||
            input.closedAt < event.processedAt
          )
            throw new AccountPrivacyRecordRetentionError(
              "CLOSURE_EVIDENCE_REQUIRED",
            )
        }
        const dates = accountPrivacySharedExpiry({
          sourceCreatedAt: record.sourceCreatedAt,
          closedAt: input.closedAt,
          now,
          earlierExpiresAt: input.earlierExpiresAt,
        })
        expiresAt = dates.expiresAt
        reviewDueAt = dates.reviewDueAt
      }
      const key = {
        subjectUserId: subjectId,
        recordFamily: record.family,
        recordId: record.recordId,
        actorField: record.actorField,
      }
      const existing = await tx.accountPrivacyRecordRetention.findUnique({
        where: { subjectUserId_recordFamily_recordId_actorField: key },
      })
      if (existing) {
        if (
          existing.decisionDigest !==
            accountPrivacyRecordDecisionDigest(existing) ||
          existing.requestId !== request.id ||
          existing.policyDigest !== policy.digest ||
          existing.controllerEvidenceDigest !==
            input.controllerEvidenceDigest ||
          existing.sourceEvidenceDigest !== record.sourceEvidenceDigest ||
          existing.expiresAt.getTime() !== expiresAt.getTime() ||
          existing.assessmentYear !==
            (record.category === "ACCOUNTING"
              ? (input.assessmentYear ?? null)
              : null) ||
          existing.closedAt?.getTime() !==
            (record.category === "SHARED"
              ? input.closedAt?.getTime()
              : undefined) ||
          existing.earlierExpiresAt?.getTime() !==
            (record.category === "SHARED"
              ? input.earlierExpiresAt?.getTime()
              : undefined) ||
          existing.holdReason !== (input.hold?.reason ?? null) ||
          existing.holdReviewAt?.getTime() !== input.hold?.reviewAt.getTime()
        )
          throw new AccountPrivacyRecordRetentionError("CLAIM_CONFLICT")
        replayed++
        continue
      }
      if (expiresAt <= now && !input.hold) {
        expired += await expireAccountPrivacyRecordSource(tx, {
          recordFamily: record.family,
          recordId: record.recordId,
          actorField: record.actorField,
          subjectUserId: subjectId,
          tenantId: record.tenantId,
        })
        continue
      }
      const data = {
        ...key,
        requestId: request.id,
        tenantId: record.tenantId,
        category: record.category,
        policyVersion: policy.version,
        policyDigest: policy.digest,
        controllerEvidenceDigest: input.controllerEvidenceDigest,
        sourceEvidenceDigest: record.sourceEvidenceDigest,
        sourceCreatedAt: record.sourceCreatedAt,
        assessmentYear:
          record.category === "ACCOUNTING"
            ? (input.assessmentYear ?? null)
            : null,
        closedAt:
          record.category === "SHARED" ? (input.closedAt ?? null) : null,
        earlierExpiresAt:
          record.category === "SHARED"
            ? (input.earlierExpiresAt ?? null)
            : null,
        expiresAt,
        reviewDueAt,
        operatorUserId: input.operatorUserId,

        holdReason: input.hold?.reason ?? null,
        holdOwnerUserId: input.hold ? input.operatorUserId : null,
        holdReviewAt: input.hold?.reviewAt ?? null,
      }
      await tx.accountPrivacyRecordRetention.create({
        data: {
          ...data,
          decisionDigest: accountPrivacyRecordDecisionDigest(data),
        },
      })
      retained++
    }
    return { requestId: request.id, retained, expired, replayed }
  })
}

/** Expiry acts only on the record's original subject attribution; no User, transaction, amount or other-party row is deleted. */
export async function expireAccountPrivacyRetainedRecord(
  db: PrismaClient,
  input: { retentionId: string; now?: Date },
) {
  enabled()
  const now = input.now ?? new Date()
  const policy = getApprovedAccountPrivacyRecordPolicy(process.env, now)
  if (!policy)
    throw new AccountPrivacyRecordRetentionError("POLICY_NOT_APPROVED")
  return runInOwnSerializableTransaction(db, async (tx) => {
    const row = await tx.accountPrivacyRecordRetention.findUnique({
      where: { id: input.retentionId },
    })
    if (!row) return { expired: false, held: false, replay: true }
    const family = ACCOUNT_PRIVACY_RECORD_FAMILIES.find(
      (value) => value === row.recordFamily,
    )
    if (
      !family ||
      accountPrivacyRecordSources[family].category !== row.category ||
      row.decisionDigest !== accountPrivacyRecordDecisionDigest(row)
    )
      throw new AccountPrivacyRecordRetentionError("NOT_READY")
    if (
      row.policyDigest !== policy.digest ||
      row.policyVersion !== policy.version ||
      row.operatorUserId === row.subjectUserId ||
      !/^[a-f0-9]{64}$/.test(row.controllerEvidenceDigest)
    )
      throw new AccountPrivacyRecordRetentionError("NOT_READY")
    if (row.category === "ACCOUNTING") {
      if (
        row.assessmentYear === null ||
        row.expiresAt.getTime() !==
          accountPrivacyAccountingExpiry({
            sourceCreatedAt: row.sourceCreatedAt,
            assessmentYear: row.assessmentYear,
            now,
          }).getTime()
      )
        throw new AccountPrivacyRecordRetentionError("NOT_READY")
    } else if (
      row.category !== "SHARED" ||
      !row.closedAt ||
      row.expiresAt.getTime() !==
        accountPrivacySharedExpiry({
          sourceCreatedAt: row.sourceCreatedAt,
          closedAt: row.closedAt,
          now,
          earlierExpiresAt: row.earlierExpiresAt ?? undefined,
        }).expiresAt.getTime()
    )
      throw new AccountPrivacyRecordRetentionError("NOT_READY")
    if (accountPrivacyRecordHoldIsActive(row, now))
      return { expired: false, held: true, replay: false }
    if (row.holdReason)
      throw new AccountPrivacyRecordRetentionError("HOLD_REVIEW_REQUIRED")
    if (row.expiresAt > now)
      return { expired: false, held: false, replay: false }
    if (
      (await tx.session.count({ where: { userId: row.subjectUserId } })) ||
      (await tx.membership.count({
        where: { userId: row.subjectUserId, status: "ACTIVE" },
      }))
    )
      throw new AccountPrivacyRecordRetentionError("NOT_READY")
    const current = await accountPrivacyRecordSnapshot(tx, {
      family,
      recordId: row.recordId,
      subjectId: row.subjectUserId,
    })
    if (
      current.some(
        (item) =>
          item.sourceCreatedAt.getTime() !== row.sourceCreatedAt.getTime() ||
          item.tenantId !== row.tenantId ||
          (row.category === "SHARED" &&
            item.sourceEvidenceDigest !== row.sourceEvidenceDigest),
      )
    )
      throw new AccountPrivacyRecordRetentionError("SOURCE_CHANGED")
    await expireAccountPrivacyRecordSource(tx, row)
    await tx.accountPrivacyRecordRetention.delete({ where: { id: row.id } })
    return { expired: true, held: false, replay: false }
  })
}

export const reviewAccountPrivacyRetainedRecordSchema = z
  .object({
    retentionId: z.string().min(1),
    expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    sourceReviewed: z.literal(true),
    controllerEvidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    controllerInstructionsReviewed: z.literal(true),
    hold: z
      .object({
        reason: z.enum(["LEGAL_HOLD", "UNRESOLVED_DISPUTE"]),
        reviewAt: z.coerce.date(),
      })
      .strict()
      .nullable(),
  })
  .strict()
/** Reviews never move the original expiry. A stale hold is escalated, never silently renewed or treated as proof a legal dispute ended. */
export async function reviewAccountPrivacyRetainedRecord(
  db: PrismaClient,
  input: z.infer<typeof reviewAccountPrivacyRetainedRecordSchema> & {
    operatorUserId: string
    now?: Date
  },
) {
  enabled()
  const now = input.now ?? new Date()
  const policy = getApprovedAccountPrivacyRecordPolicy(process.env, now)
  if (!policy)
    throw new AccountPrivacyRecordRetentionError("POLICY_NOT_APPROVED")
  if (
    input.hold &&
    (!Number.isFinite(input.hold.reviewAt.getTime()) ||
      input.hold.reviewAt <= now ||
      input.hold.reviewAt.getTime() > now.getTime() + 90 * 86400000)
  )
    throw new AccountPrivacyRecordRetentionError("INVALID_HOLD")
  return runInOwnSerializableTransaction(db, async (tx) => {
    await administrator(tx, input.operatorUserId)
    const row = await tx.accountPrivacyRecordRetention.findUnique({
      where: { id: input.retentionId },
    })
    if (
      !row ||
      row.subjectUserId === input.operatorUserId ||
      !reviewAccountPrivacyRetainedRecordSchema.safeParse({
        retentionId: input.retentionId,
        expectedSourceDigest: input.expectedSourceDigest,
        sourceReviewed: input.sourceReviewed,
        controllerEvidenceDigest: input.controllerEvidenceDigest,
        controllerInstructionsReviewed: input.controllerInstructionsReviewed,
        hold: input.hold,
      }).success
    )
      throw new AccountPrivacyRecordRetentionError("NOT_READY")
    if (row.decisionDigest !== accountPrivacyRecordDecisionDigest(row))
      throw new AccountPrivacyRecordRetentionError("CLAIM_CONFLICT")
    const family = ACCOUNT_PRIVACY_RECORD_FAMILIES.find(
      (value) => value === row.recordFamily,
    )
    if (!family) throw new AccountPrivacyRecordRetentionError("NOT_READY")
    const records = await accountPrivacyRecordSnapshot(tx, {
      family,
      recordId: row.recordId,
      subjectId: row.subjectUserId,
    })
    const current = records.find(
      (record) => record.actorField === row.actorField,
    )
    if (
      !current ||
      current.tenantId !== row.tenantId ||
      current.sourceCreatedAt.getTime() !== row.sourceCreatedAt.getTime() ||
      current.sourceEvidenceDigest !== input.expectedSourceDigest
    )
      throw new AccountPrivacyRecordRetentionError("SOURCE_CHANGED")
    const changes = {
      sourceEvidenceDigest: current.sourceEvidenceDigest,
      policyVersion: policy.version,
      policyDigest: policy.digest,
      controllerEvidenceDigest: input.controllerEvidenceDigest,
      reviewedAt: now,
      reviewDueAt: new Date(
        Math.min(
          addAccountPrivacyCalendarMonths(now, 12).getTime(),
          row.expiresAt.getTime(),
        ),
      ),
      holdReason: input.hold?.reason ?? null,
      holdOwnerUserId: input.hold ? input.operatorUserId : null,
      holdReviewAt: input.hold?.reviewAt ?? null,
    }
    await tx.accountPrivacyRecordRetention.update({
      where: { id: row.id },
      data: {
        ...changes,
        decisionDigest: accountPrivacyRecordDecisionDigest({
          ...row,
          ...changes,
        }),
      },
    })
    return {
      reviewed: true,
      held: Boolean(input.hold),
      expiresAt: row.expiresAt,
    }
  })
}
export async function listAccountPrivacyRetainedRecordReviews(
  db: PrismaClient,
  input: { operatorUserId: string; now?: Date },
) {
  await administrator(db, input.operatorUserId)
  const now = input.now ?? new Date()
  return db.accountPrivacyRecordRetention.findMany({
    where: {
      OR: [
        { reviewDueAt: { lte: now } },
        { holdReviewAt: { lte: now }, holdReason: { not: null } },
      ],
    },
    select: {
      id: true,
      requestId: true,
      recordFamily: true,
      category: true,
      reviewDueAt: true,
      expiresAt: true,
      holdReviewAt: true,
    },
    take: 50,
    orderBy: [{ reviewDueAt: "asc" }, { id: "asc" }],
  })
}
export async function runAccountPrivacyRecordRetentionBatch(
  db: PrismaClient,
  now = new Date(),
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_RECORD_PROCESSING_ENABLED !== "true"
  )
    return { processed: 0, held: 0, failed: 0, reviewsDue: 0 }
  const due = await db.accountPrivacyRecordRetention.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    take: 50,
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
  })
  let processed = 0
  let held = 0
  let failed = 0
  for (const row of due) {
    try {
      const result = await expireAccountPrivacyRetainedRecord(db, {
        retentionId: row.id,
        now,
      })
      if (result.held) held++
      else if (result.expired) processed++
    } catch {
      failed++
    }
  }
  const reviewsDue = await db.accountPrivacyRecordRetention.count({
    where: {
      OR: [
        { reviewDueAt: { lte: now } },
        { holdReviewAt: { lte: now }, holdReason: { not: null } },
      ],
    },
  })
  return { processed, held, failed, reviewsDue }
}

/** Independent operator projection for future record reviews after the account profile is minimized. */
export async function inspectAccountPrivacyRetainedRecord(
  db: PrismaClient,
  input: { retentionId: string; operatorUserId: string },
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    await administrator(tx, input.operatorUserId)
    const row = await tx.accountPrivacyRecordRetention.findUnique({
      where: { id: input.retentionId },
    })
    const family =
      row &&
      ACCOUNT_PRIVACY_RECORD_FAMILIES.find(
        (value) => value === row.recordFamily,
      )
    if (
      !row ||
      !family ||
      row.subjectUserId === input.operatorUserId ||
      row.decisionDigest !== accountPrivacyRecordDecisionDigest(row)
    )
      throw new AccountPrivacyRecordRetentionError("NOT_READY")
    return (
      await accountPrivacyRecordSnapshot(tx, {
        family,
        recordId: row.recordId,
        subjectId: row.subjectUserId,
      })
    ).map(({ subjectId: _, ...record }) => ({
      ...record,
      retentionId: row.id,
      expiresAt: row.expiresAt,
    }))
  })
}
