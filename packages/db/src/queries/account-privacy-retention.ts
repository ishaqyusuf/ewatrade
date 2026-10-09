import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { accountPrivacyPseudonymousEmail } from "./account-privacy-profile-policy"
import {
  accountPrivacyRetentionDeadlines,
  accountPrivacyRetentionHoldIsActive,
  getApprovedAccountPrivacyRetentionPolicy,
} from "./account-privacy-retention-policy"
import { runInOwnSerializableTransaction } from "./own-transaction"

export class AccountPrivacyRetentionError extends Error {
  constructor(
    readonly code:
      | "DISABLED"
      | "OPERATOR_REQUIRED"
      | "NOT_READY"
      | "INVALID_HOLD",
  ) {
    super(code)
    this.name = "AccountPrivacyRetentionError"
  }
}

function assertEnabled() {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_RETENTION_PROCESSING_ENABLED !== "true"
  )
    throw new AccountPrivacyRetentionError("DISABLED")
}

/** Expire only completed-request evidence. Never erase merchant/clinical records or User linkage. */
export async function processAccountPrivacyRetention(
  db: PrismaClient,
  input: { requestId: string; now?: Date },
) {
  assertEnabled()
  const now = input.now ?? new Date()
  const policy = getApprovedAccountPrivacyRetentionPolicy()
  if (!policy) throw new AccountPrivacyRetentionError("NOT_READY")
  if (!Number.isFinite(now.getTime()))
    throw new AccountPrivacyRetentionError("NOT_READY")
  return runInOwnSerializableTransaction(db, async (tx) => {
    const row = await tx.accountPrivacyRetention.findUnique({
      where: { requestId: input.requestId },
      include: {
        request: {
          select: {
            status: true,
            completedAt: true,
            verifiedSubjectUserId: true,
          },
        },
      },
    })
    if (!row)
      return { contactCleared: false, evidenceExpired: false, held: false }
    const deadlines = accountPrivacyRetentionDeadlines(row.completedAt)
    if (
      row.request.status !== "COMPLETED" ||
      row.request.verifiedSubjectUserId !== row.subjectUserId ||
      row.request.completedAt?.getTime() !== row.completedAt.getTime() ||
      row.completedAt > now ||
      row.policyDigest !== policy.digest ||
      row.policyVersion !== policy.version ||
      row.contactExpiresAt.getTime() !== deadlines.contactExpiresAt.getTime() ||
      row.reviewDueAt.getTime() !== deadlines.reviewDueAt.getTime() ||
      row.evidenceExpiresAt.getTime() !== deadlines.evidenceExpiresAt.getTime()
    )
      throw new AccountPrivacyRetentionError("NOT_READY")
    if (accountPrivacyRetentionHoldIsActive(row, now))
      return { contactCleared: false, evidenceExpired: false, held: true }
    let contactCleared = false
    if (!row.contactClearedAt && row.contactExpiresAt <= now) {
      await tx.accountPrivacyRequest.update({
        where: { id: row.requestId },
        data: { contactEmail: null, outcome: Prisma.DbNull },
      })
      await tx.accountPrivacyNoticeAttempt.updateMany({
        where: { requestId: row.requestId },
        data: {
          recipientDigest: "contact-expired",
          providerMessageId: null,
          providerEventId: null,
          failureEventId: null,
        },
      })
      await tx.accountPrivacyRetention.update({
        where: { requestId: row.requestId },
        data: { contactClearedAt: now },
      })
      contactCleared = true
    }
    if (row.evidenceExpiresAt > now)
      return { contactCleared, evidenceExpired: false, held: false }
    // Reappearing account access is an incident, not authority to delete fresh receipts.
    const user = await tx.user.findUnique({
      where: { id: row.subjectUserId },
      select: { email: true },
    })
    const accounts = await tx.account.count({
      where: { userId: row.subjectUserId },
    })
    const sessions = await tx.session.count({
      where: { userId: row.subjectUserId },
    })
    const memberships = await tx.membership.count({
      where: { userId: row.subjectUserId, status: "ACTIVE" },
    })
    if (
      accounts ||
      sessions ||
      memberships ||
      (user &&
        user.email !==
          accountPrivacyPseudonymousEmail(row.requestId, row.subjectUserId))
    )
      throw new AccountPrivacyRetentionError("NOT_READY")
    await tx.legalAcceptance.deleteMany({
      where: {
        userId: row.subjectUserId,
        acceptedAt: { lte: row.completedAt },
      },
    })
    await tx.accountPrivacyNoticeAttempt.deleteMany({
      where: { requestId: row.requestId },
    })
    await tx.accountPrivacyDomainOutcome.deleteMany({
      where: { requestId: row.requestId },
    })
    await tx.accountPrivacyAccessRecoveryEvent.deleteMany({
      where: { requestId: row.requestId },
    })
    await tx.accountPrivacyAccessRevocation.deleteMany({
      where: { requestId: row.requestId },
    })
    await tx.accountPrivacyRequest.delete({ where: { id: row.requestId } })
    return { contactCleared, evidenceExpired: true, held: false }
  })
}

/** Review records never restart the 24-month clock; each hold is limited to 90 days. */
export async function reviewAccountPrivacyRetention(
  db: PrismaClient,
  input: {
    requestId: string
    operatorUserId: string
    hold: { reason: string; reviewAt: Date } | null
    now?: Date
  },
) {
  assertEnabled()
  const now = input.now ?? new Date()
  if (
    input.hold &&
    (!input.hold.reason.trim() ||
      input.hold.reason.length > 1000 ||
      !Number.isFinite(input.hold.reviewAt.getTime()) ||
      input.hold.reviewAt <= now ||
      input.hold.reviewAt.getTime() > now.getTime() + 90 * 86_400_000)
  )
    throw new AccountPrivacyRetentionError("INVALID_HOLD")
  return runInOwnSerializableTransaction(db, async (tx) => {
    const operator = await tx.user.findUnique({
      where: { id: input.operatorUserId },
      select: { isPlatformAdmin: true },
    })
    if (!operator?.isPlatformAdmin)
      throw new AccountPrivacyRetentionError("OPERATOR_REQUIRED")
    const row = await tx.accountPrivacyRetention.findUnique({
      where: { requestId: input.requestId },
      include: { request: { select: { status: true } } },
    })
    if (
      !row ||
      row.request.status !== "COMPLETED" ||
      row.subjectUserId === input.operatorUserId
    )
      throw new AccountPrivacyRetentionError("NOT_READY")
    await tx.accountPrivacyRetention.update({
      where: { requestId: input.requestId },
      data: {
        reviewedAt: now,
        reviewedByUserId: input.operatorUserId,
        holdReason: input.hold?.reason.trim() ?? null,
        holdOwnerUserId: input.hold ? input.operatorUserId : null,
        holdReviewAt: input.hold?.reviewAt ?? null,
      },
    })
    return { reviewed: true, held: Boolean(input.hold) }
  })
}

export function listAccountPrivacyRetentionReviews(
  db: PrismaClient,
  now = new Date(),
) {
  return db.accountPrivacyRetention.findMany({
    where: {
      request: { status: "COMPLETED" },
      OR: [
        { reviewedAt: null, reviewDueAt: { lte: now } },
        { holdReviewAt: { lte: now }, holdReason: { not: null } },
      ],
    },
    select: {
      requestId: true,
      policyVersion: true,
      reviewDueAt: true,
      evidenceExpiresAt: true,
      holdReviewAt: true,
    },
    orderBy: [{ reviewDueAt: "asc" }, { requestId: "asc" }],
    take: 50,
  })
}

export async function runAccountPrivacyRetentionBatch(
  db: PrismaClient,
  now = new Date(),
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_RETENTION_PROCESSING_ENABLED !== "true"
  )
    return { processed: 0, held: 0, failed: 0, reviewsDue: 0 }
  const rows = await db.accountPrivacyRetention.findMany({
    where: {
      request: { status: "COMPLETED" },
      OR: [
        { contactClearedAt: null, contactExpiresAt: { lte: now } },
        { evidenceExpiresAt: { lte: now } },
      ],
      NOT: {
        holdReason: { not: null },
        holdOwnerUserId: { not: null },
        holdReviewAt: { gt: now },
      },
    },
    select: { requestId: true },
    orderBy: [{ contactExpiresAt: "asc" }, { requestId: "asc" }],
    take: 50,
  })
  let processed = 0
  let held = 0
  let failed = 0
  for (const row of rows) {
    try {
      const result = await processAccountPrivacyRetention(db, {
        requestId: row.requestId,
        now,
      })
      if (result.held) held++
      else processed++
    } catch {
      failed++
    }
  }
  return {
    processed,
    held,
    failed,
    reviewsDue: (await listAccountPrivacyRetentionReviews(db, now)).length,
  }
}
